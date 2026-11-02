/**
 * Refresh an open reader after its book file was rewritten on disk.
 *
 * Two things go stale after `saveDocument()` regenerates the EPUB:
 *  1. the blob cache keyed by the relative book path, and
 *  2. any already-mounted `<ReaderView>` (it loaded the file once on mount).
 *
 * Evicting the cache and bumping the tab's reload nonce makes AppLayout remount
 * the reader, which re-reads the file from disk.
 */
import { useAppStore } from "@/stores/app-store";
import { evictBlobCache } from "./blob-cache";

export function refreshReaderForBook(bookId: string, filePath?: string): void {
  if (filePath) {
    evictBlobCache(filePath);
  }

  const { tabs, bumpTabReloadNonce } = useAppStore.getState();
  for (const tab of tabs) {
    if (tab.type === "reader" && tab.bookId === bookId) {
      bumpTabReloadNonce(tab.id);
    }
  }
}
