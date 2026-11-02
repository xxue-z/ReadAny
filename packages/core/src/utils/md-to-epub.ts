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
  /**
   * Embed the raw Markdown source as `OEBPS/source.md` inside the EPUB.
   *
   * This is what lets the document survive a device hop: the generated EPUB is
   * the only file the sync engine moves, so the editor can recover its source
   * (and images) from the EPUB instead of showing a destructive placeholder.
   * Defaults to true.
   */
  embedSource?: boolean;
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
 * Rewrite `<img src>` references to packaged assets.
 *
 * Assets keep their document-relative path inside `OEBPS/` (`assets/a.png` →
 * `OEBPS/assets/a.png`) so that (a) chapter links and manifest hrefs agree and
 * (b) unpacking the EPUB yields exactly the files the Markdown source refers to.
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
    if (!bytes || !normalized) return match;

    let asset = packaged.get(normalized);
    if (!asset) {
      asset = {
        zipPath: `OEBPS/${normalized}`,
        mediaType: mediaTypeForAssetFile(normalized),
        data: bytes,
      };
      packaged.set(normalized, asset);
    }

    const newAttrs = attrs.replace(srcMatch[0], `src="${normalized}"`);
    return `<img${newAttrs} />`;
  });
}

// ---------- chapter splitting ----------

/**
 * Split markdown source into chapters on `#` / `##` boundaries.
 *
 * Headings are detected line-wise *before* rendering, so regions where a `#` is
 * not a heading must be tracked explicitly: fenced code blocks (```` ``` ```` /
 * `~~~`), HTML comments and a leading YAML front-matter block. Otherwise a shell
 * comment such as `# install deps` inside a code fence would split the document
 * and shred the code block.
 */
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

  // YAML front matter: drop it from the rendered body (still kept in source.md).
  // Require at least one `key: value` line so a document that merely starts with
  // a `---` thematic break is not swallowed as metadata.
  let frontMatterEnd = -1;
  if (/^---\s*$/.test(lines[0] ?? "")) {
    const end = lines.findIndex(
      (line, index) => index > 0 && /^(---|\.\.\.)\s*$/.test(line.trimEnd()),
    );
    if (end > 0) {
      const looksLikeYaml = lines.slice(1, end).some((line) => /^\s*[\w.-]+\s*:(\s|$)/.test(line));
      if (looksLikeYaml) frontMatterEnd = end;
    }
  }

  let fence: { marker: string; length: number } | null = null;
  let inComment = false;

  const renderChapter = (chapterLines: string[]): string =>
    marked.parse(chapterLines.join("\n"), { gfm: true }) as string;

  for (const [index, line] of lines.entries()) {
    if (index <= frontMatterEnd) continue;

    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);

    if (fence) {
      currentLines.push(line);
      const closes =
        fenceMatch &&
        fenceMatch[1]?.[0] === fence.marker &&
        (fenceMatch[1]?.length ?? 0) >= fence.length;
      if (closes) fence = null;
      continue;
    }

    if (inComment) {
      currentLines.push(line);
      if (line.includes("-->")) inComment = false;
      continue;
    }

    if (fenceMatch?.[1]) {
      fence = { marker: fenceMatch[1][0] as string, length: fenceMatch[1].length };
      currentLines.push(line);
      continue;
    }

    if (/^\s{0,3}<!--/.test(line) && !line.includes("-->")) {
      inComment = true;
      currentLines.push(line);
      continue;
    }

    const h1Match = line.match(/^#\s+(.+)/);
    const h2Match = line.match(/^##\s+(.+)/);

    if (h1Match || h2Match) {
      hasAnyHeading = true;
      // Save previous chapter. Heading-only stubs (e.g. "# Title" directly
      // followed by "## Part") are dropped: they would render as an empty page.
      if (currentLines.length > 0 || currentTitle) {
        const html = renderChapter(currentLines);
        if (html.trim()) {
          chapters.push({ title: currentTitle || "Untitled", html });
        }
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
    const html = renderChapter(currentLines);
    // Keep a title-only document as a single (empty) chapter.
    if (html.trim() || chapters.length === 0) {
      chapters.push({ title: currentTitle || "Untitled", html });
    }
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
  const language = escapeXml(lang);
  // Chapter html is already rendered by marked; wrap with XHTML doc
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="${language}" xml:lang="${language}">
<head>
  <title>${title}</title>
  <link rel="stylesheet" type="text/css" href="../style.css"/>
</head>
<body><h2>${title}</h2>
${chapter.html}
</body>
</html>`;
}

function buildContainerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
}

function buildTocNcx(bookTitle: string, chapters: MdChapter[], _lang: string): string {
  const navPoints = chapters
    .map((c, i) => {
      const id = `chapter${i + 1}`;
      return `<navPoint id="navPoint-${id}" playOrder="${i + 1}">
  <navLabel><text>${escapeXml(c.title)}</text></navLabel>
  <content src="./OEBPS/${id}.xhtml"/>
</navPoint>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head>
  <meta name="dtb:uid" content="book-id"/>
  <meta name="dtb:depth" content="1"/>
  <meta name="dtb:totalPageCount" content="0"/>
  <meta name="dtb:maxPageNumber" content="0"/>
</head>
<docTitle><text>${escapeXml(bookTitle)}</text></docTitle>
<navMap>
${navPoints}
</navMap>
</ncx>`;
}

function buildContentOpf(
  bookTitle: string,
  identifier: string,
  chapters: MdChapter[],
  lang: string,
  assets: PackagedAsset[],
  sourceEmbedded: boolean,
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
  const sourceItem = sourceEmbedded
    ? `<item id="source" href="OEBPS/${SOURCE_ENTRY}" media-type="text/markdown"/>`
    : "";
  const chapterSpine = chapters.map((_, i) => `<itemref idref="chap${i + 1}"/>`).join("\n      ");
  const assetSection = assetManifest ? `      ${assetManifest}\n` : "";
  const sourceSection = sourceItem ? `      ${sourceItem}\n` : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${escapeXml(bookTitle)}</dc:title>
    <dc:language>${escapeXml(lang)}</dc:language>
    <dc:identifier id="book-id">${escapeXml(identifier)}</dc:identifier>
  </metadata>
  <manifest>
      ${chapterManifest}
${assetSection}${sourceSection}      <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
      <item id="css" href="style.css" media-type="text/css"/>
  </manifest>
  <spine toc="ncx">
      ${chapterSpine}
  </spine>
</package>`;
}

// ---------- main converter ----------

/** Path of the embedded Markdown source inside the EPUB. */
export const SOURCE_ENTRY = "source.md";

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
  const sourceEmbedded = options.embedSource !== false;

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

  const css = `body { line-height: 1.6; font-size: 1em; font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; text-align: justify; }
p { text-indent: 2em; margin: 0 0 0.4em 0; }
h2 { text-align: center; margin: 1em 0 0.6em 0; }`;
  entries.push({ name: "style.css", data: encoder.encode(css) });

  entries.push({ name: "toc.ncx", data: encoder.encode(buildTocNcx(bookTitle, chapters, lang)) });

  for (const [index, chapter] of chapters.entries()) {
    entries.push({
      name: `OEBPS/chapter${index + 1}.xhtml`,
      data: encoder.encode(buildChapterXhtml(chapter, lang)),
    });
  }

  for (const asset of packagedAssets.values()) {
    entries.push({ name: asset.zipPath, data: asset.data });
  }

  if (sourceEmbedded) {
    entries.push({ name: `OEBPS/${SOURCE_ENTRY}`, data: encoder.encode(markdown) });
  }

  entries.push({
    name: "content.opf",
    data: encoder.encode(
      buildContentOpf(
        bookTitle,
        identifier,
        chapters,
        lang,
        [...packagedAssets.values()],
        sourceEmbedded,
      ),
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
