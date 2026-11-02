/**
 * Markdown to EPUB converter.
 *
 * Pipeline: Markdown text → marked (GFM) → split by #/## headings →
 * EPUB 2.0 store-only ZIP.
 * Follows the same store-only build pattern as UmdToEpubConverter.
 */

import { marked } from "marked";
import { type ZipEntry, buildStoreOnlyZip } from "./store-only-zip";

export interface Md2EpubOptions {
  /** Raw markdown source text. */
  markdown: string;
  /** Optional book title override (otherwise derived from first H1 or "Untitled"). */
  title?: string;
  /**
   * Local images referenced by the markdown, keyed by the (relative) src used in
   * the document — e.g. `{ "./images/a.png": bytes }`. Matching images are
   * embedded in the EPUB and rewritten to point at the packaged copy; missing
   * ones are left untouched (so the user can see the breakage instead of
   * silently losing the image).
   */
  assets?: Record<string, Uint8Array>;
}

export interface MdBytesConversionResult {
  epubBytes: Uint8Array;
  bookTitle: string;
  chapterCount: number;
  language: string;
  /** Number of local images embedded in the EPUB (0 when none could be found). */
  embeddedImageCount: number;
}

interface MdChapter {
  title: string;
  html: string;
}

interface PackagedAsset {
  zipPath: string;
  mediaType: string;
  data: Uint8Array;
}

const escapeXml = (str: string): string => {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

// ---------------------------------------------------------------------------
// XHTML normalisation
// ---------------------------------------------------------------------------

/**
 * Void elements must be self-closed: chapters are parsed as XML
 * (`application/xhtml+xml`), so `<br>` makes the whole chapter invalid.
 */
const VOID_ELEMENT_PATTERN =
  /<(br|hr|img|input|col|area|base|embed|param|source|track|wbr|meta|link)((?:\s[^<>]*?)?)\s*\/?>/gi;

export function toXhtmlVoidElements(html: string): string {
  return html.replace(VOID_ELEMENT_PATTERN, (_match, tag: string, attrs: string) => {
    const cleanedAttrs = (attrs ?? "").replace(/\s*\/\s*$/, "");
    return `<${tag}${cleanedAttrs} />`;
  });
}

/** Remove constructs that would execute or break the XHTML document. */
export function sanitizeMarkdownHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "")
    .replace(/<(iframe|object|embed|frame|frameset)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
}

// ---------------------------------------------------------------------------
// Local image packaging
// ---------------------------------------------------------------------------

const IMAGE_MEDIA_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  avif: "image/avif",
};

function mediaTypeForAssetFile(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_MEDIA_TYPES[ext] ?? "application/octet-stream";
}

/** Normalise a markdown/HTML image src for matching against the asset map. */
export function normalizeAssetKey(src: string): string {
  let key = src.trim();
  if (key.startsWith("file://")) key = key.slice("file://".length);
  try {
    key = decodeURIComponent(key);
  } catch {
    // keep raw value
  }
  return key
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^(\.\.\/)+/, "")
    .replace(/^\/+/, "");
}

function assetFileName(key: string, index: number): string {
  const base = key.split("/").pop() || `image-${index}`;
  const safe = base.replace(/[^\w.\-]+/g, "_") || `image-${index}`;
  return `${index}-${safe}`;
}

function findAssetBytes(
  assets: Record<string, Uint8Array>,
  src: string,
  normalized: string,
): Uint8Array | undefined {
  if (assets[src]) return assets[src];
  if (assets[normalized]) return assets[normalized];

  // Fall back to a suffix match (e.g. markdown says `../img/a.png` while the
  // caller registered `img/a.png`).
  const suffix = normalized.split("/").slice(-2).join("/");
  for (const [candidate, bytes] of Object.entries(assets)) {
    const normalizedCandidate = normalizeAssetKey(candidate);
    if (
      normalizedCandidate === normalized ||
      normalizedCandidate.endsWith(`/${suffix}`) ||
      normalizedCandidate.endsWith(`/${normalized}`)
    ) {
      return bytes;
    }
  }
  return undefined;
}

/**
 * Rewrite `<img src>` references to packaged assets under `OEBPS/assets/`.
 * Images without a matching asset are left untouched.
 */
function packageChapterImages(
  html: string,
  assets: Record<string, Uint8Array> | undefined,
  packaged: Map<string, PackagedAsset>,
): string {
  if (!assets || Object.keys(assets).length === 0) return html;

  return html.replace(/<img\b([^>]*?)\/?>/gi, (match, rawAttrs: string) => {
    const attrs = rawAttrs ?? "";
    const srcMatch = attrs.match(/\bsrc\s*=\s*"([^"]*)"/i) ?? attrs.match(/\bsrc\s*=\s*'([^']*)'/i);
    if (!srcMatch) return match;

    const src = srcMatch[1];
    const normalized = normalizeAssetKey(src);
    const bytes = findAssetBytes(assets, src, normalized);
    if (!bytes) return match;

    let asset = packaged.get(normalized);
    if (!asset) {
      const fileName = assetFileName(normalized, packaged.size + 1);
      asset = {
        zipPath: `OEBPS/assets/${fileName}`,
        mediaType: mediaTypeForAssetFile(fileName),
        data: bytes,
      };
      packaged.set(normalized, asset);
    }

    const newAttrs = attrs.replace(srcMatch[0], `src="${asset.zipPath.replace(/^OEBPS\//, "")}"`);
    return `<img${newAttrs} />`;
  });
}

// ---------- chapter splitting ----------

/** Split markdown source into chapters on # / ## boundaries. */
function splitChapters(markdown: string): MdChapter[] {
  const trimmed = markdown.trim();
  if (!trimmed) {
    return [{ title: "Untitled", html: "" }];
  }

  const lines = trimmed.split(/\r?\n/);
  const chapters: MdChapter[] = [];
  let currentTitle = "";
  let currentLines: string[] = [];
  let hasAnyHeading = false;

  for (const line of lines) {
    const h1Match = line.match(/^#\s+(.+)/);
    const h2Match = line.match(/^##\s+(.+)/);

    if (h1Match || h2Match) {
      hasAnyHeading = true;
      // Save previous chapter
      if (currentLines.length > 0 || currentTitle) {
        chapters.push({
          title: currentTitle || "Untitled",
          html: marked.parse(currentLines.join("\n"), { gfm: true }) as string,
        });
      }
      currentTitle = (h1Match?.[1] ?? h2Match?.[1] ?? "").trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  // Last chapter
  const lastHtml = currentLines.join("\n").trim();
  if (lastHtml || currentTitle) {
    chapters.push({
      title: currentTitle || "Untitled",
      html: marked.parse(lastHtml, { gfm: true }) as string,
    });
  }

  // No headings at all: treat as single chapter
  if (!hasAnyHeading) {
    return [{ title: "Untitled", html: marked.parse(trimmed, { gfm: true }) as string }];
  }

  return chapters.length > 0 ? chapters : [{ title: "Untitled", html: "" }];
}

/** Detect language from text sample. */
function detectLanguage(text: string): string {
  const sample = text.slice(0, 2000);
  let cjkCount = 0;
  let latinCount = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0xf900 && code <= 0xfaff)
    ) {
      cjkCount++;
    } else if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) {
      latinCount++;
    }
  }
  return cjkCount > latinCount * 0.5 ? "zh" : "en";
}

/** Derive book title: explicit override > first H1 > "Untitled". */
function deriveBookTitle(markdown: string, explicit?: string): string {
  if (explicit?.trim()) return explicit.trim();
  const match = markdown.match(/^#\s+(.+)/m);
  if (match?.[1]) return match[1].trim();
  return "Untitled";
}

// ---------- EPUB builders (mirrors umd-to-epub pattern) ----------

function buildChapterXhtml(chapter: MdChapter, lang: string): string {
  const title = escapeXml(chapter.title);
  // Chapter html is already rendered by marked; wrap with XHTML doc
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">\n` +
    `<html xmlns="http://www.w3.org/1999/xhtml" lang="${escapeXml(lang)}" xml:lang="${escapeXml(lang)}">\n` +
    `<head>\n  <title>${title}</title>\n  <link rel="stylesheet" type="text/css" href="../style.css"/>\n</head>\n` +
    `<body><h2>${title}</h2>\n${chapter.html}\n</body>\n` +
    `</html>`
  );
}

function buildContainerXml(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">\n` +
    `  <rootfiles>\n    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>\n  </rootfiles>\n` +
    `</container>`
  );
}

function buildTocNcx(bookTitle: string, chapters: MdChapter[], _lang: string): string {
  const navPoints = chapters
    .map((c, i) => {
      const id = `chapter${i + 1}`;
      return (
        `<navPoint id="navPoint-${id}" playOrder="${i + 1}">\n` +
        `  <navLabel><text>${escapeXml(c.title)}</text></navLabel>\n` +
        `  <content src="./OEBPS/${id}.xhtml"/>\n` +
        `</navPoint>`
      );
    })
    .join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">\n` +
    `<head>\n  <meta name="dtb:uid" content="book-id"/>\n  <meta name="dtb:depth" content="1"/>\n  <meta name="dtb:totalPageCount" content="0"/>\n  <meta name="dtb:maxPageNumber" content="0"/>\n</head>\n` +
    `<docTitle><text>${escapeXml(bookTitle)}</text></docTitle>\n` +
    `<navMap>\n${navPoints}\n</navMap>\n` +
    `</ncx>`
  );
}

function buildContentOpf(
  bookTitle: string,
  identifier: string,
  chapters: MdChapter[],
  lang: string,
  assets: PackagedAsset[],
): string {
  const chapterManifest = chapters
    .map(
      (_, i) =>
        `<item id="chap${i + 1}" href="OEBPS/chapter${i + 1}.xhtml" media-type="application/xhtml+xml"/>`,
    )
    .join("\n      ");
  const assetManifest = assets
    .map(
      (asset, i) =>
        `<item id="asset${i + 1}" href="${asset.zipPath}" media-type="${asset.mediaType}"/>`,
    )
    .join("\n      ");
  const chapterSpine = chapters.map((_, i) => `<itemref idref="chap${i + 1}"/>`).join("\n      ");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id" version="2.0">\n` +
    `  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n` +
    `    <dc:title>${escapeXml(bookTitle)}</dc:title>\n` +
    `    <dc:language>${escapeXml(lang)}</dc:language>\n` +
    `    <dc:identifier id="book-id">${escapeXml(identifier)}</dc:identifier>\n` +
    `  </metadata>\n` +
    `  <manifest>\n      ${chapterManifest}\n${assetManifest ? `      ${assetManifest}\n` : ""}      <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>\n      <item id="css" href="style.css" media-type="text/css"/>\n  </manifest>\n` +
    `  <spine toc="ncx">\n      ${chapterSpine}\n  </spine>\n` +
    `</package>`
  );
}

// ---------- main converter ----------

function simpleIdentifier(markdown: string): string {
  return `md-${markdown.length}-${Date.now().toString(36)}`;
}

function buildEpubBytes(options: Md2EpubOptions): MdBytesConversionResult {
  const markdown = options.markdown;
  const bookTitle = deriveBookTitle(markdown, options.title);
  const lang = detectLanguage(markdown);
  const identifier = simpleIdentifier(markdown);
  const chapters = splitChapters(markdown);
  const packagedAssets = new Map<string, PackagedAsset>();

  // Normalise chapter HTML: valid XHTML, no executable markup, local images
  // copied into the EPUB.
  for (const chapter of chapters) {
    chapter.html = packageChapterImages(
      toXhtmlVoidElements(sanitizeMarkdownHtml(chapter.html)),
      options.assets,
      packagedAssets,
    );
  }

  const encoder = new TextEncoder();
  const entries: ZipEntry[] = [];

  // mimetype first, store-only — required by EPUB spec
  entries.push({ name: "mimetype", data: encoder.encode("application/epub+zip") });
  entries.push({ name: "META-INF/container.xml", data: encoder.encode(buildContainerXml()) });

  const css =
    `body { line-height: 1.6; font-size: 1em; font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; text-align: justify; }\n` +
    `p { text-indent: 2em; margin: 0 0 0.4em 0; }\n` +
    `h2 { text-align: center; margin: 1em 0 0.6em 0; }`;
  entries.push({ name: "style.css", data: encoder.encode(css) });

  entries.push({ name: "toc.ncx", data: encoder.encode(buildTocNcx(bookTitle, chapters, lang)) });

  for (let i = 0; i < chapters.length; i++) {
    entries.push({
      name: `OEBPS/chapter${i + 1}.xhtml`,
      data: encoder.encode(buildChapterXhtml(chapters[i]!, lang)),
    });
  }

  for (const asset of packagedAssets.values()) {
    entries.push({ name: asset.zipPath, data: asset.data });
  }

  entries.push({
    name: "content.opf",
    data: encoder.encode(
      buildContentOpf(bookTitle, identifier, chapters, lang, [...packagedAssets.values()]),
    ),
  });

  const epubBytes = buildStoreOnlyZip(entries);
  return {
    epubBytes,
    bookTitle,
    chapterCount: chapters.length,
    language: lang,
    embeddedImageCount: packagedAssets.size,
  };
}

export class MdToEpubConverter {
  /**
   * Convert Markdown text to EPUB bytes synchronously (marked is sync).
   */
  public convertToBytes(options: Md2EpubOptions): MdBytesConversionResult {
    return buildEpubBytes(options);
  }
}
