/**
 * Helpers for making local images referenced by a Markdown document portable.
 *
 * `MdToEpubConverter` can embed images, but it needs the bytes. Imported
 * documents keep their images next to the original `.md`; edited documents keep
 * them under the library `books/` folder. These helpers read those files and,
 * for imports, copy them into the library so later saves still find them.
 */

const IMAGE_SRC_PATTERNS = [
  /!\[[^\]]*\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g,
  /<img[^>]+src=["']([^"']+)["'][^>]*>/gi,
];

/** Extract unique, local image sources from Markdown/HTML. */
export function extractMarkdownImageSources(markdown: string): string[] {
  const sources = new Set<string>();
  for (const pattern of IMAGE_SRC_PATTERNS) {
    for (const match of markdown.matchAll(pattern)) {
      const src = match[1]?.trim();
      if (src) sources.add(src);
    }
  }
  return [...sources];
}

export function isLocalImageSource(src: string): boolean {
  if (!src) return false;
  if (/^(https?:|data:|file:|blob:|asset:)/i.test(src)) return false;
  const normalized = src.replace(/\\/g, "/");
  if (normalized.startsWith("/")) return false;
  // Keep reads inside the library: no parent-directory traversal.
  return !normalized.split("/").includes("..");
}

export interface CollectMarkdownAssetsOptions {
  markdown: string;
  /** Read a path relative to the document. Rejections mean "image not found". */
  readAsset: (relativePath: string) => Promise<Uint8Array>;
  /**
   * Optional: persist the image inside the library and return the new src.
   * When omitted the original src is kept as the asset key (no copy).
   */
  persistAsset?: (fileName: string, bytes: Uint8Array) => Promise<string>;
  /** Prefix for generated file names (usually the book id). */
  assetPrefix?: string;
}

export interface CollectMarkdownAssetsResult {
  markdown: string;
  assets: Record<string, Uint8Array>;
}

function sanitizeFileName(src: string): string {
  const base = src.split("/").pop() || "image";
  return base.replace(/[^\w.\-]+/g, "_") || "image";
}

/**
 * Read every local image referenced by the document.
 *
 * When `persistAsset` is provided the document is rewritten to point at the
 * library copy, which keeps the EPUB self-contained across later edits.
 */
export async function collectMarkdownAssets(
  options: CollectMarkdownAssetsOptions,
): Promise<CollectMarkdownAssetsResult> {
  const { markdown, readAsset, persistAsset, assetPrefix } = options;
  const assets: Record<string, Uint8Array> = {};
  let rewritten = markdown;

  for (const src of extractMarkdownImageSources(markdown)) {
    if (!isLocalImageSource(src)) continue;

    let bytes: Uint8Array;
    try {
      bytes = await readAsset(src.replace(/^\.\//, ""));
    } catch (err) {
      // Missing image: keep the reference so the breakage stays visible.
      console.warn("[MD assets] Failed to read image:", src, err);
      continue;
    }

    if (!persistAsset) {
      assets[src] = bytes;
      continue;
    }

    const fileName = `${assetPrefix ? `${assetPrefix}-` : ""}${Date.now().toString(36)}-${sanitizeFileName(src)}`;
    try {
      const newSrc = await persistAsset(fileName, bytes);
      assets[newSrc] = bytes;
      if (newSrc !== src) {
        rewritten = rewritten.split(src).join(newSrc);
      }
    } catch (err) {
      console.warn("[MD assets] Failed to persist image:", src, err);
      assets[src] = bytes;
    }
  }

  return { markdown: rewritten, assets };
}
