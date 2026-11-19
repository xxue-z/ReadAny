export interface ReindexRunContext {
  signal: AbortSignal;
  generation: number;
  isCurrent: () => boolean;
}

export type ReindexRun = (context: ReindexRunContext) => Promise<void>;

interface ReindexEntry {
  controller: AbortController;
  generation: number;
}

/**
 * Keeps at most one live re-index task per book. A newer schedule aborts the
 * previous task and starts immediately; stale task callbacks must use
 * `context.isCurrent()` before writing UI state.
 */
export class PerBookReindexCoordinator {
  private readonly entries = new Map<string, ReindexEntry>();

  schedule(bookId: string, run: ReindexRun): Promise<void> {
    const previous = this.entries.get(bookId);
    previous?.controller.abort();

    const controller = new AbortController();
    const generation = (previous?.generation ?? 0) + 1;
    const entry: ReindexEntry = { controller, generation };
    this.entries.set(bookId, entry);

    const isCurrent = () => this.entries.get(bookId) === entry && !controller.signal.aborted;
    return Promise.resolve()
      .then(() => run({ signal: controller.signal, generation, isCurrent }))
      .finally(() => {
        if (this.entries.get(bookId) === entry) this.entries.delete(bookId);
      });
  }

  cancel(bookId: string): void {
    const entry = this.entries.get(bookId);
    if (!entry) return;
    entry.controller.abort();
    this.entries.delete(bookId);
  }

  isRunning(bookId: string): boolean {
    return this.entries.has(bookId);
  }
}
