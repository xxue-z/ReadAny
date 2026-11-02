### Review Package — Task 3
BASE: 58e59e1d
HEAD: 54fdbe7a
---
54fdbe7a feat: route MD books to DocumentWorkspace editor on desktop
---
 packages/app/src/lib/library/open-book.ts | 14 ++++++++++++++
 1 file changed, 14 insertions(+)
---
diff --git a/packages/app/src/lib/library/open-book.ts b/packages/app/src/lib/library/open-book.ts
index c59c349e..62c69aba 100644
--- a/packages/app/src/lib/library/open-book.ts
+++ b/packages/app/src/lib/library/open-book.ts
@@ -152,20 +152,34 @@ export async function openDesktopBook({
       await setBookSyncStatus(book.id, "remote");
       await loadBooks();
       toast.error(t("library.downloadFailed", "下载失败，请重试"));
       return false;
     } finally {
       pendingDownloads.delete(book.id);
       clearProgress(book.id);
     }
   }
 
+  // MD documents open in the editor, not the reader
+  if (book.format === "md" && book.filePath) {
+    const { addTab, setActiveTab } = useAppStore.getState();
+    const tabId = `document-${book.id}`;
+    addTab({
+      id: tabId,
+      type: "document",
+      title: book.meta.title,
+      bookId: book.id,
+    });
+    setActiveTab(tabId);
+    return true;
+  }
+
   const platform = getPlatformService();
 
   // A soft-deleted book is no longer in the live store — even if its file
   // still exists on disk we must re-import it first so it rejoins the store.
   const isSoftDeleted = !!book.deletedAt;
 
   // Check whether the local book file is accessible
   let fileAccessible = false;
   if (!isSoftDeleted && book.filePath) {
     const targetPath = await resolveDesktopDataPath(book.filePath);
