import { isVectorizeAbortError } from "@readany/core/rag";
import type { ChapterData } from "@readany/core/rag";
import type { Book } from "@readany/core/types";

export type AutoVectorizeCallback = (
  bookId: string,
  progress: { status: string; progress: number },
) => void;

interface ExtractorRef {
  extractChapters: (base64BookData: string, mimeType?: string) => Promise<ChapterData[]>;
}

interface QueueItem {
  book: Book;
  base64Data: string;
  mimeType: string;
  generation: number;
  onStatus?: (progress: { status: string; progress: number }) => void;
}

let extractorRef: ExtractorRef | null = null;
let callback: AutoVectorizeCallback | null = null;
let queue: QueueItem[] = [];
let processing = false;
let currentItem: QueueItem | null = null;
let activeController: AbortController | null = null;
const generations = new Map<string, number>();

export function setExtractorRef(ref: ExtractorRef | null) {
  extractorRef = ref;
}

export function setCallback(cb: AutoVectorizeCallback | null) {
  callback = cb;
}

export function isProcessing() {
  return processing;
}

export function getQueueLength() {
  return queue.length;
}

export function hasBookVectorization(bookId: string): boolean {
  return currentItem?.book.id === bookId || queue.some((item) => item.book.id === bookId);
}

export function cancelBookVectorization(bookId: string): void {
  generations.set(bookId, (generations.get(bookId) ?? 0) + 1);
  queue = queue.filter((item) => item.book.id !== bookId);
  if (currentItem?.book.id === bookId) activeController?.abort();
}

export async function queueBook(
  book: Book,
  base64Data: string,
  mimeType: string,
  options?: { onStatus?: (progress: { status: string; progress: number }) => void },
) {
  const generation = (generations.get(book.id) ?? 0) + 1;
  generations.set(book.id, generation);

  // A document save supersedes an import-time index for the same book. Abort
  // the in-flight run and replace queued work instead of waiting for it.
  if (currentItem?.book.id === book.id) activeController?.abort();
  queue = queue.filter((item) => item.book.id !== book.id);
  queue.push({ book, base64Data, mimeType, generation, onStatus: options?.onStatus });
  if (!processing) void processQueue();
}

async function processQueue() {
  if (processing) return;
  processing = true;

  try {
    const { triggerVectorizeBook } = await import("./vectorize-trigger");

    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;

      const { book, base64Data, mimeType, generation } = item;
      const controller = new AbortController();
      currentItem = item;
      activeController = controller;
      const isCurrent = () => generations.get(book.id) === generation;
      const report = (status: string, progress: number) => {
        if (!isCurrent()) return;
        item.onStatus?.({ status, progress });
        callback?.(book.id, { status, progress });
      };

      try {
        report("extracting", 0);

        if (!extractorRef) {
          console.warn("[AutoVectorize] Extractor not ready, skipping");
          continue;
        }

        const chapters = await extractorRef.extractChapters(base64Data, mimeType);
        if (!isCurrent() || controller.signal.aborted) continue;
        if (!chapters || chapters.length === 0) {
          console.warn(`[AutoVectorize] No chapters for ${book.meta.title}`);
          continue;
        }

        report("vectorizing", 0);

        await triggerVectorizeBook(
          book.id,
          book.filePath,
          chapters,
          (progress) => {
            if (!isCurrent()) return;
            const pct =
              progress.totalChunks > 0 ? progress.processedChunks / progress.totalChunks : 0;
            report("vectorizing", pct);
          },
          { signal: controller.signal, shouldUpdate: isCurrent },
        );

        report("completed", 1);
      } catch (err) {
        if (isVectorizeAbortError(err) || !isCurrent()) continue;
        console.error(`[AutoVectorize] Failed for ${book.meta.title}:`, err);
        report("error", 0);
      } finally {
        if (currentItem === item) {
          currentItem = null;
          activeController = null;
        }
      }
    }
  } finally {
    processing = false;
    if (queue.length > 0) void processQueue();
  }
}
