/**
 * Book blob cache — the parsed book file is fetched from disk once per path.
 *
 * It lives in its own module so non-React code (e.g. the document editor) can
 * invalidate an entry after rewriting a book file without importing the whole
 * reader component.
 */
import { resolveDesktopDataPath } from "@/lib/storage/desktop-library-root";

const MAX_CACHE_SIZE = 5;
const fileBlobCache = new Map<string, Blob>();

async function loadFileAsBlob(filePath: string): Promise<Blob> {
  // Resolve managed relative paths (e.g., "books/{id}.epub") to the active desktop library root.
  const resolvedPath = await resolveDesktopDataPath(filePath);

  try {
    const { convertFileSrc } = await import("@tauri-apps/api/core");
    const assetUrl =
      resolvedPath.startsWith("asset://") || resolvedPath.startsWith("http")
        ? resolvedPath
        : convertFileSrc(resolvedPath);
    const response = await fetch(assetUrl);
    if (!response.ok) throw new Error(`fetch failed: ${response.status}`);
    return await response.blob();
  } catch {
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const fileBytes = await readFile(resolvedPath);
    return new Blob([fileBytes]);
  }
}

/** Remove a specific file from the blob cache (tab close / hibernate / rewrite). */
export function evictBlobCache(filePath: string): void {
  fileBlobCache.delete(filePath);
}

/** Clear all entries from the blob cache. */
export function clearBlobCache(): void {
  fileBlobCache.clear();
}

export async function getCachedBlob(filePath: string): Promise<Blob> {
  const cached = fileBlobCache.get(filePath);
  if (cached) return cached;

  const blob = await loadFileAsBlob(filePath);

  if (fileBlobCache.size >= MAX_CACHE_SIZE) {
    const firstKey = fileBlobCache.keys().next().value;
    if (firstKey) fileBlobCache.delete(firstKey);
  }
  fileBlobCache.set(filePath, blob);
  return blob;
}
