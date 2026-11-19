export type DocumentFlush = () => Promise<boolean>;

const flushers = new Map<string, DocumentFlush>();

/** Register an open document's latest-value flush for app-close handling. */
export function registerDocumentFlush(tabId: string, flush: DocumentFlush): () => void {
  flushers.set(tabId, flush);
  return () => {
    if (flushers.get(tabId) === flush) flushers.delete(tabId);
  };
}

export async function flushOpenDocuments(): Promise<string[]> {
  const failed: string[] = [];
  for (const [tabId, flush] of flushers) {
    try {
      if (!(await flush())) failed.push(tabId);
    } catch (err) {
      console.warn(`[DocumentSave] Flush failed for ${tabId}:`, err);
      failed.push(tabId);
    }
  }
  return failed;
}
