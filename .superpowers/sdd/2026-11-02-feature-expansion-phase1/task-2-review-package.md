### Review Package — Task 2
BASE: 61f7fe5d
HEAD: 58e59e1d
---
58e59e1d feat: add saveDocument store action and use in DocumentWorkspace
---
 .../src/components/editor/DocumentWorkspace.tsx    | 29 +++-------------------
 packages/app/src/stores/library-store.ts           | 22 ++++++++++++++++
 2 files changed, 26 insertions(+), 25 deletions(-)
---
diff --git a/packages/app/src/components/editor/DocumentWorkspace.tsx b/packages/app/src/components/editor/DocumentWorkspace.tsx
index 4d978409..9b7583b8 100644
--- a/packages/app/src/components/editor/DocumentWorkspace.tsx
+++ b/packages/app/src/components/editor/DocumentWorkspace.tsx
@@ -1,27 +1,26 @@
 import { MarkdownEditor } from "@/components/ui/markdown-editor";
-import { getDesktopLibraryRoot, resolveDesktopDataPath } from "@/lib/storage/desktop-library-root";
-import { MdToEpubConverter } from "@readany/core/utils/md-to-epub";
+import { getDesktopLibraryRoot } from "@/lib/storage/desktop-library-root";
 import { useLibraryStore } from "@/stores/library-store";
 import { Save } from "lucide-react";
 import { useCallback, useEffect, useRef, useState } from "react";
 import { useTranslation } from "react-i18next";
 import { toast } from "sonner";
 
 interface DocumentWorkspaceProps {
   bookId: string;
 }
 
 export function DocumentWorkspace({ bookId }: DocumentWorkspaceProps) {
   const { t } = useTranslation();
   const books = useLibraryStore((s) => s.books);
-  const updateBook = useLibraryStore((s) => s.updateBook);
+  const saveDocument = useLibraryStore((s) => s.saveDocument);
   const [markdown, setMarkdown] = useState("");
   const [isLoading, setIsLoading] = useState(true);
   const [isSaving, setIsSaving] = useState(false);
   const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
 
   const book = books.find((b) => b.id === bookId);
 
   // Load markdown source file
   useEffect(() => {
     let cancelled = false;
@@ -63,49 +62,29 @@ Start writing...`);
         }
       }
     })();
     return () => { cancelled = true; };
   }, [bookId]);
 
   const handleSave = useCallback(async () => {
     if (!markdown.trim()) return;
     setIsSaving(true);
     try {
-      const converter = new MdToEpubConverter();
-      const result = converter.convertToBytes({ markdown });
-
-      // Update book title if derived
-      if (book && result.bookTitle !== book.meta.title) {
-        await updateBook(book.id, { meta: { ...book.meta, title: result.bookTitle } });
-      }
-
-      // Write EPUB and source MD
-      const { writeFile, mkdir } = await import("@tauri-apps/plugin-fs");
-      const { join } = await import("@tauri-apps/api/path");
-      const root = await getDesktopLibraryRoot();
-      await mkdir(join(root, "books"), { recursive: true });
-
-      const epubPath = await resolveDesktopDataPath(`books/${bookId}.epub`);
-      await writeFile(epubPath, result.epubBytes);
-
-      const encoder = new TextEncoder();
-      const mdPath = await join(root, `books/${bookId}.md`);
-      await writeFile(mdPath, encoder.encode(markdown));
-
+      await saveDocument(bookId, markdown);
       toast.success(t("editor.saved", "Document saved"));
     } catch (err) {
       console.error("[DocumentWorkspace] Save failed:", err);
       toast.error(t("editor.saveFailed", "Failed to save document"));
     } finally {
       setIsSaving(false);
     }
-  }, [markdown, bookId, book, updateBook, t]);
+  }, [markdown, bookId, saveDocument, t]);
 
   // Auto-save with debounce
   const debouncedSave = useCallback(() => {
     if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
     saveTimerRef.current = setTimeout(() => {
       handleSave();
     }, 3000);
   }, [handleSave]);
 
   useEffect(() => {
diff --git a/packages/app/src/stores/library-store.ts b/packages/app/src/stores/library-store.ts
index 8874d0bc..f5b31505 100644
--- a/packages/app/src/stores/library-store.ts
+++ b/packages/app/src/stores/library-store.ts
@@ -376,20 +376,21 @@ export interface LibraryState {
   renameTag: (oldName: string, newName: string) => void;
   addGroup: (name: string) => Promise<BookGroup | null>;
   renameGroup: (groupId: string, name: string) => void;
   removeGroup: (groupId: string) => Promise<void>;
   moveBookToGroup: (bookId: string, groupId?: string) => void;
   moveBooksToGroup: (bookIds: string[], groupId?: string) => void;
   removeBookFromGroup: (bookId: string) => void;
   addTagToBook: (bookId: string, tag: string) => void;
   removeTagFromBook: (bookId: string, tag: string) => void;
   createDocument: (title?: string) => Promise<Book | null>;
+  saveDocument: (bookId: string, markdown: string) => Promise<void>;
 }
 
 async function restoreDeletedDesktopBook(bookId: string, filePath: string): Promise<Book | null> {
   await db.initDatabase();
   const originalBook = await db.getBook(bookId, { includeDeleted: true });
   if (!originalBook) return null;
 
   const fileName = decodeURIComponent(filePath.replace(/\\/g, "/").split("/").pop() || "book");
   const ext = filePath.split(".").pop()?.toLowerCase() || "epub";
   const formatMap: Record<string, Book["format"]> = {
@@ -1438,11 +1439,32 @@ export const useLibraryStore = create<LibraryState>((set, get) => ({
       progress: 0,
       isVectorized: false,
       vectorizeProgress: 0,
       tags: [],
       syncStatus: "local",
     };
     get().addBook(book);
     return book;
   },
 
+  saveDocument: async (bookId, markdown) => {
+    const { MdToEpubConverter } = await import("@readany/core/utils/md-to-epub");
+    const converter = new MdToEpubConverter();
+    const result = converter.convertToBytes({ markdown });
+    const encoder = new TextEncoder();
+    const { writeFile, mkdir } = await import("@tauri-apps/plugin-fs");
+    const { join } = await import("@tauri-apps/api/path");
+    const { getDesktopLibraryRoot } = await import("@/lib/storage/desktop-library-root");
+    const { resolveDesktopDataPath } = await import("@/lib/storage/desktop-library-root");
+    const root = await getDesktopLibraryRoot();
+    await mkdir(await join(root, "books"), { recursive: true });
+    const epubPath = await resolveDesktopDataPath(`books/${bookId}.epub`);
+    const mdPath = await resolveDesktopDataPath(`books/${bookId}.md`);
+    await writeFile(epubPath, result.epubBytes);
+    await writeFile(mdPath, encoder.encode(markdown));
+    const book = get().books.find((b) => b.id === bookId);
+    if (book && result.bookTitle !== book.meta.title) {
+      await get().updateBook(bookId, { meta: { ...book.meta, title: result.bookTitle } });
+    }
+  },
+
 }));
\ No newline at end of file
