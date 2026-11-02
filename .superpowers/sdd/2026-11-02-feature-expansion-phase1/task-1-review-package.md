### Review Package — Task 1
BASE: 69719fa4232d38db6d039b95906fd3a5ed001d01
HEAD: 61f7fe5d
---
61f7fe5d fix: add missing resolveDesktopDataPath import and remove duplicate join in DocumentWorkspace
---
 packages/app/src/components/editor/DocumentWorkspace.tsx | 10 ++++------
 1 file changed, 4 insertions(+), 6 deletions(-)
---
diff --git a/packages/app/src/components/editor/DocumentWorkspace.tsx b/packages/app/src/components/editor/DocumentWorkspace.tsx
index 51cc1bb6..4d978409 100644
--- a/packages/app/src/components/editor/DocumentWorkspace.tsx
+++ b/packages/app/src/components/editor/DocumentWorkspace.tsx
@@ -1,12 +1,12 @@
 import { MarkdownEditor } from "@/components/ui/markdown-editor";
-import { getDesktopLibraryRoot } from "@/lib/storage/desktop-library-root";
+import { getDesktopLibraryRoot, resolveDesktopDataPath } from "@/lib/storage/desktop-library-root";
 import { MdToEpubConverter } from "@readany/core/utils/md-to-epub";
 import { useLibraryStore } from "@/stores/library-store";
 import { Save } from "lucide-react";
 import { useCallback, useEffect, useRef, useState } from "react";
 import { useTranslation } from "react-i18next";
 import { toast } from "sonner";
 
 interface DocumentWorkspaceProps {
   bookId: string;
 }
@@ -48,23 +48,23 @@ export function DocumentWorkspace({ bookId }: DocumentWorkspaceProps) {
           if (!cancelled) {
             setMarkdown(`# ${book?.meta.title || "Untitled"}
 
 > This book was imported as EPUB. Edit as Markdown, save to re-generate EPUB.
 
 `);
             setIsLoading(false);
           }
         } catch {
           if (!cancelled) {
-            setMarkdown("# New Document
+            setMarkdown(`# New Document
 
-Start writing...");
+Start writing...`);
             setIsLoading(false);
           }
         }
       }
     })();
     return () => { cancelled = true; };
   }, [bookId]);
 
   const handleSave = useCallback(async () => {
     if (!markdown.trim()) return;
@@ -81,23 +81,21 @@ Start writing...");
       // Write EPUB and source MD
       const { writeFile, mkdir } = await import("@tauri-apps/plugin-fs");
       const { join } = await import("@tauri-apps/api/path");
       const root = await getDesktopLibraryRoot();
       await mkdir(join(root, "books"), { recursive: true });
 
       const epubPath = await resolveDesktopDataPath(`books/${bookId}.epub`);
       await writeFile(epubPath, result.epubBytes);
 
       const encoder = new TextEncoder();
-      const { join } = await import("@tauri-apps/api/path");
-        const root = await getDesktopLibraryRoot();
-        const mdPath = await join(root, `books/${bookId}.md`);
+      const mdPath = await join(root, `books/${bookId}.md`);
       await writeFile(mdPath, encoder.encode(markdown));
 
       toast.success(t("editor.saved", "Document saved"));
     } catch (err) {
       console.error("[DocumentWorkspace] Save failed:", err);
       toast.error(t("editor.saveFailed", "Failed to save document"));
     } finally {
       setIsSaving(false);
     }
   }, [markdown, bookId, book, updateBook, t]);
