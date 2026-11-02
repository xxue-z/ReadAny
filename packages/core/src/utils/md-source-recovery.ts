/**
 * Recover the Markdown source of a document from its generated EPUB.
 *
 * MD documents live as two files (`books/{id}.md` + `books/{id}.epub`), but the
 * sync engine only moves the EPUB. Every EPUB we generate therefore embeds the
 * source as `OEBPS/source.md` plus its images, which lets another device (or a
 * user who deleted the `.md`) restore the editable source instead of showing a
 * placeholder that would overwrite the book on the next save.
 */
import {
  TextWriter,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipReader,
  configure,
} from "@zip.js/zip.js";
import { SOURCE_ENTRY } from "./md-to-epub";

/** Minimal structural view of a ZIP entry (directories have no `getData`). */
interface ReadableZipEntry {
  filename: string;
  getData?: (writer: unknown) => Promise<unknown>;
}

/** Path of the embedded Markdown source inside the EPUB. */
export const EMBEDDED_MARKDOWN_ENTRY = `OEBPS/${SOURCE_ENTRY}`;

/** File extensions we restore next to the `.md` file. */
const RESTORABLE_ASSET_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "avif",
]);

export interface RecoveredMarkdownAsset {
  /** Path relative to the library `books/` folder (same as the Markdown src). */
  path: string;
  bytes: Uint8Array;
}

export interface RecoveredMarkdownSource {
  markdown: string;
  assets: RecoveredMarkdownAsset[];
}

function isRestorableAsset(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return RESTORABLE_ASSET_EXTENSIONS.has(ext);
}

/**
 * Unpack the Markdown source (and its images) from a generated EPUB.
 * Returns `null` when the EPUB has no embedded source (e.g. files produced
 * before this format existed, or imported EPUBs).
 */
export async function recoverMarkdownSourceFromEpub(
  epubBytes: Uint8Array,
): Promise<RecoveredMarkdownSource | null> {
  // Cheap sanity check: a ZIP starts with "PK". Avoids noisy parser errors for
  // callers that hand us a missing/truncated file.
  if (!epubBytes || epubBytes.length < 4 || epubBytes[0] !== 0x50 || epubBytes[1] !== 0x4b) {
    return null;
  }

  configure({ useWebWorkers: false });

  let reader: ZipReader<Uint8Array> | null = null;
  try {
    reader = new ZipReader(new Uint8ArrayReader(epubBytes));
    const entries = (await reader.getEntries()) as unknown as ReadableZipEntry[];

    const sourceEntry = entries.find(
      (entry) => entry.filename === EMBEDDED_MARKDOWN_ENTRY || entry.filename === "source.md",
    );
    if (!sourceEntry?.getData) return null;

    const markdown = (await sourceEntry.getData(new TextWriter("utf-8"))) as string;
    if (!markdown.trim()) return null;

    const assets: RecoveredMarkdownAsset[] = [];
    for (const entry of entries) {
      if (!entry.filename.startsWith("OEBPS/") || !entry.getData) continue;
      const relativePath = entry.filename.slice("OEBPS/".length);
      if (!relativePath || relativePath === "source.md") continue;
      if (!isRestorableAsset(relativePath)) continue;

      const bytes = (await entry.getData(new Uint8ArrayWriter())) as Uint8Array;
      assets.push({ path: relativePath, bytes });
    }

    return { markdown, assets };
  } catch (err) {
    console.warn("[MD recovery] Failed to read embedded Markdown source:", err);
    return null;
  } finally {
    await reader?.close().catch(() => {});
  }
}
