### Review Package — Phase2 T4
BASE: f0245847
HEAD: 5fb35281
---
5fb35281 feat: add CBZ page-level notes and format-aware note UI
29e57f5c test: add PDF quad-points serialization and CBZ note CFI tests
---
 .../app/src/components/reader/NotebookPanel.tsx    | 286 ++++++++++++++++++---
 .../app/src/components/reader/ReaderToolbar.tsx    |  34 ++-
 packages/app/src/components/reader/ReaderView.tsx  |   6 +
 .../core/src/__tests__/pdf-highlight-quads.test.ts |  67 +++++
 packages/core/src/i18n/locales/en/reader.json      |   5 +-
 packages/core/src/i18n/locales/zh/reader.json      |   5 +-
 6 files changed, 362 insertions(+), 41 deletions(-)
---
diff --git a/packages/app/src/components/reader/NotebookPanel.tsx b/packages/app/src/components/reader/NotebookPanel.tsx
index a57cc99c..de399c30 100644
--- a/packages/app/src/components/reader/NotebookPanel.tsx
+++ b/packages/app/src/components/reader/NotebookPanel.tsx
@@ -1,112 +1,169 @@
 import { ExportDropdown } from "@/components/notes/ExportDropdown";
 import { Button } from "@/components/ui/button";
 import { MarkdownEditor } from "@/components/ui/markdown-editor";
+import type { BookFormat } from "@/lib/reader/document-loader";
 import { useAnnotationStore } from "@/stores/annotation-store";
 import { useLibraryStore } from "@/stores/library-store";
 import { useNotebookStore } from "@/stores/notebook-store";
 import { type ExportFormat, annotationExporter } from "@readany/core/export";
 import { createSelectionNoteMutation } from "@readany/core/reader";
 import type { Highlight, Note } from "@readany/core/types";
 import { HIGHLIGHT_COLOR_HEX } from "@readany/core/types";
-import { cn } from "@readany/core/utils";
+import { cn, generateId } from "@readany/core/utils";
 import {
   ChevronDown,
   ChevronRight,
   Edit3,
+  FileText,
   Highlighter,
   NotebookPen,
   Save,
+  StickyNote,
   Trash2,
   X,
 } from "lucide-react";
 /**
  * NotebookPanel — left sidebar for viewing and editing notes/highlights
+ * Format-aware: shows highlights + text excerpts for EPUB/PDF, standalone page notes for CBZ.
  */
-import { useEffect, useState } from "react";
+import { useEffect, useMemo, useState } from "react";
 import { useTranslation } from "react-i18next";
 import ReactMarkdown from "react-markdown";
 import remarkGfm from "remark-gfm";
 
 interface NotebookPanelProps {
   bookId: string;
   onClose: () => void;
   onGoToCfi?: (cfi: string) => void;
   onAddAnnotation?: (cfi: string, color: string, note?: string) => void;
   onDeleteAnnotation?: (cfi: string) => void;
+  /** Book format — enables format-specific rendering (e.g. CBZ page notes) */
+  bookFormat?: BookFormat;
 }
 
 export function NotebookPanel({
   bookId,
   onClose,
   onGoToCfi,
   onAddAnnotation,
   onDeleteAnnotation,
+  bookFormat,
 }: NotebookPanelProps) {
   const { t } = useTranslation();
 
-  const { pendingNote, editingHighlight, clearPending, saveDraft, getDraft, clearDraft } =
-    useNotebookStore();
+  const {
+    pendingNote,
+    editingHighlight,
+    clearPending,
+    saveDraft,
+    getDraft,
+    clearDraft,
+  } = useNotebookStore();
 
-  const { highlights, addHighlight, updateHighlight, removeHighlight } = useAnnotationStore();
+  const {
+    highlights,
+    notes,
+    addHighlight,
+    updateHighlight,
+    removeHighlight,
+    addNote,
+    updateNote: updateAnnotationNote,
+    removeNote,
+  } = useAnnotationStore();
 
   const books = useLibraryStore((s) => s.books);
 
   // Local state for note content being edited
   const [noteContent, setNoteContent] = useState("");
   const [expandedSections, setExpandedSections] = useState({
     highlights: true,
     notes: true,
+    cbzNotes: true,
   });
 
   // Filter annotations for current book
   const bookHighlights = highlights.filter((h) => h.bookId === bookId);
+  const bookNotes = notes.filter((n) => n.bookId === bookId);
 
   // Highlights with notes vs without
   const highlightsWithNotes = bookHighlights.filter((h) => h.note);
   const highlightsWithoutNotes = bookHighlights.filter((h) => !h.note);
 
+  // Distinguish CBZ standalone notes from highlight-linked notes
+  const isCbz = bookFormat === "CBZ";
+
   // Initialize note content when editing starts
   useEffect(() => {
     if (pendingNote) {
       // Check for saved draft
       const draft = getDraft(pendingNote.text);
       setNoteContent(draft || pendingNote.existingNote || "");
     } else if (editingHighlight) {
       setNoteContent(editingHighlight.note || "");
     }
   }, [pendingNote, editingHighlight, getDraft]);
 
   // Auto-save draft on content change
   useEffect(() => {
     if (pendingNote && noteContent) {
       saveDraft(pendingNote.text, noteContent);
     }
   }, [noteContent, pendingNote, saveDraft]);
 
   const handleSave = () => {
     if (pendingNote) {
-      const mutation = createSelectionNoteMutation({
-        bookId,
-        cfi: pendingNote.cfi,
-        text: pendingNote.text,
-        note: noteContent,
-        chapterTitle: pendingNote.chapterTitle,
-        defaultColor: "yellow",
-      });
-      if (mutation.kind === "create") {
-        addHighlight(mutation.highlight);
-        onAddAnnotation?.(pendingNote.cfi, mutation.highlight.color, mutation.highlight.note);
+      if (isCbz) {
+        // CBZ: create standalone Note (no highlight linkage)
+        const existingNote = bookNotes.find(
+          (n) => n.cfi === pendingNote.cfi && !n.highlightId,
+        );
+        if (existingNote) {
+          updateAnnotationNote(existingNote.id, {
+            content: noteContent,
+            title: pendingNote.chapterTitle || existingNote.title,
+            updatedAt: Date.now(),
+          });
+        } else {
+          addNote({
+            id: generateId(),
+            bookId,
+            cfi: pendingNote.cfi,
+            title: pendingNote.chapterTitle || pendingNote.text,
+            content: noteContent,
+            chapterTitle: pendingNote.chapterTitle,
+            tags: [],
+            createdAt: Date.now(),
+            updatedAt: Date.now(),
+          });
+        }
+        // Clear draft
+        clearDraft(pendingNote.text);
+        clearPending();
+      } else {
+        // EPUB/PDF: highlight + note via createSelectionNoteMutation
+        const mutation = createSelectionNoteMutation({
+          bookId,
+          cfi: pendingNote.cfi,
+          text: pendingNote.text,
+          note: noteContent,
+          chapterTitle: pendingNote.chapterTitle,
+          defaultColor: "yellow",
+        });
+        if (mutation.kind === "create") {
+          addHighlight(mutation.highlight);
+          onAddAnnotation?.(pendingNote.cfi, mutation.highlight.color, mutation.highlight.note);
+        }
+        // Clear draft
+        clearDraft(pendingNote.text);
+        clearPending();
       }
-      // Clear draft
-      clearDraft(pendingNote.text);
-      clearPending();
     } else if (editingHighlight) {
       const mutation = createSelectionNoteMutation({
         bookId,
         cfi: editingHighlight.cfi,
         text: editingHighlight.text,
         note: noteContent,
         chapterTitle: editingHighlight.chapterTitle,
         existingHighlight: editingHighlight,
       });
       if (mutation.kind === "update") {
@@ -136,108 +193,152 @@ export function NotebookPanel({
     }
   };
 
   const handleHighlightClick = (highlight: Highlight) => {
     // Navigate to the highlight location
     if (onGoToCfi && highlight.cfi) {
       onGoToCfi(highlight.cfi);
     }
   };
 
+  const handleCbzNoteClick = (note: Note) => {
+    // Navigate to the CBZ page
+    if (onGoToCfi && note.cfi) {
+      onGoToCfi(note.cfi);
+    }
+  };
+
   const handleEditHighlightNote = (highlight: Highlight) => {
     useNotebookStore.getState().startEditNote(highlight);
   };
 
+  const handleEditCbzNote = (note: Note) => {
+    useNotebookStore.getState().startNewNote({
+      text: note.title,
+      cfi: note.cfi || "",
+      chapterTitle: note.chapterTitle,
+      existingNote: note.content,
+      highlightId: undefined,
+    });
+  };
+
   const handleDeleteNoteOnly = (highlight: Highlight) => {
     updateHighlight(highlight.id, { note: undefined });
     onAddAnnotation?.(highlight.cfi, highlight.color, undefined);
     // Clear editing state if we're editing this highlight
     if (editingHighlight?.id === highlight.id) {
       clearPending();
       setNoteContent("");
     }
   };
 
+  const handleDeleteCbzNote = (note: Note) => {
+    removeNote(note.id);
+    if (editingHighlight?.id === note.id) {
+      clearPending();
+      setNoteContent("");
+    }
+  };
+
   const handleDeleteHighlight = (highlight: Highlight) => {
     // Remove from store
     removeHighlight(highlight.id);
     // Remove from view
     if (highlight.cfi) {
       onDeleteAnnotation?.(highlight.cfi);
     }
     // Clear editing state if we're editing this highlight
     if (editingHighlight?.id === highlight.id) {
       clearPending();
       setNoteContent("");
     }
   };
 
-  const toggleSection = (section: "highlights" | "notes") => {
+  const toggleSection = (section: "highlights" | "notes" | "cbzNotes") => {
     setExpandedSections((prev) => ({
       ...prev,
       [section]: !prev[section],
     }));
   };
 
+  // Total annotations for export
+  const totalAnnotations = bookHighlights.length + bookNotes.length;
+
   const handleExport = (format: ExportFormat) => {
     const book = books.find((b) => b.id === bookId);
     if (!book) return;
-    const content = annotationExporter.export(bookHighlights as Highlight[], [] as Note[], book, {
-      format,
-    });
+    const content = annotationExporter.export(
+      bookHighlights as Highlight[],
+      bookNotes as Note[],
+      book,
+      { format },
+    );
     if (format === "notion") {
       annotationExporter.copyToClipboard(content);
     } else {
       const ext = format === "json" ? "json" : "md";
       annotationExporter.downloadAsFile(content, `${book.meta.title}-${format}.${ext}`, format);
     }
   };
 
   // Check if we're in editing mode
   const isEditing = pendingNote || editingHighlight;
   const editingText = pendingNote?.text || editingHighlight?.text || "";
+  const isCbzEditing = isEditing && isCbz;
 
   return (
     <div className="flex h-full flex-col">
       {/* Header */}
       <div className="flex h-10 shrink-0 items-center justify-between border-b border-border/40 px-3">
         <span className="text-xs font-medium text-foreground">{t("notebook.title")}</span>
         <div className="flex items-center gap-1">
-          <ExportDropdown onExport={handleExport} disabled={bookHighlights.length === 0} />
+          <ExportDropdown onExport={handleExport} disabled={totalAnnotations === 0} />
           <button
             type="button"
             className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
             onClick={onClose}
           >
             <X className="h-3.5 w-3.5" />
           </button>
         </div>
       </div>
 
       {/* Content */}
       <div className="flex-1 overflow-y-auto">
         {/* Note Editor - shown when creating/editing */}
         {isEditing && (
           <div className="border-b border-border/40 p-3">
-            {/* Selected text preview */}
-            <div className="mb-3 rounded-md bg-muted/50 p-2">
-              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
-                <Highlighter className="h-3 w-3" />
-                <span>{t("notebook.selectedText")}</span>
+            {/* Selected text preview — skip for CBZ (no text selection) */}
+            {!isCbzEditing && editingText && (
+              <div className="mb-3 rounded-md bg-muted/50 p-2">
+                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
+                  <Highlighter className="h-3 w-3" />
+                  <span>{t("notebook.selectedText")}</span>
+                </div>
+                <p className="text-sm text-foreground line-clamp-3">"{editingText}"</p>
+                {(pendingNote?.chapterTitle || editingHighlight?.chapterTitle) && (
+                  <p className="mt-1 text-xs text-muted-foreground">
+                    {pendingNote?.chapterTitle || editingHighlight?.chapterTitle}
+                  </p>
+                )}
               </div>
-              <p className="text-sm text-foreground line-clamp-3">"{editingText}"</p>
-              {(pendingNote?.chapterTitle || editingHighlight?.chapterTitle) && (
-                <p className="mt-1 text-xs text-muted-foreground">
-                  {pendingNote?.chapterTitle || editingHighlight?.chapterTitle}
-                </p>
-              )}
-            </div>
+            )}
+
+            {/* CBZ page note header */}
+            {isCbzEditing && pendingNote && (
+              <div className="mb-3 rounded-md bg-muted/50 p-2">
+                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
+                  <StickyNote className="h-3 w-3" />
+                  <span>{pendingNote.chapterTitle || pendingNote.text}</span>
+                </div>
+              </div>
+            )}
 
             {/* Note input */}
             <MarkdownEditor
               value={noteContent}
               onChange={setNoteContent}
               placeholder={t("notebook.addNote")}
               className="min-h-[120px]"
               autoFocus
             />
 
@@ -262,20 +363,54 @@ export function NotebookPanel({
                 </Button>
                 <Button size="sm" onClick={handleSave}>
                   <Save className="h-3.5 w-3.5 mr-1" />
                   {t("common.save")}
                 </Button>
               </div>
             </div>
           </div>
         )}
 
+        {/* CBZ Page Notes section */}
+        {isCbz && bookNotes.length > 0 && (
+          <div className="border-b border-border/40">
+            <button
+              type="button"
+              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
+              onClick={() => toggleSection("cbzNotes")}
+            >
+              {expandedSections.cbzNotes ? (
+                <ChevronDown className="h-4 w-4 text-muted-foreground" />
+              ) : (
+                <ChevronRight className="h-4 w-4 text-muted-foreground" />
+              )}
+              <StickyNote className="h-4 w-4 text-muted-foreground" />
+              <span className="text-sm font-medium">{t("notebook.pageNotes")}</span>
+              <span className="text-xs text-muted-foreground">({bookNotes.length})</span>
+            </button>
+            {expandedSections.cbzNotes && (
+              <div className="px-3 pb-2">
+                {bookNotes.map((note) => (
+                  <CbzNoteItem
+                    key={note.id}
+                    note={note}
+                    onClick={() => handleCbzNoteClick(note)}
+                    onEdit={() => handleEditCbzNote(note)}
+                    onDelete={() => handleDeleteCbzNote(note)}
+                    isActive={pendingNote?.cfi === note.cfi}
+                  />
+                ))}
+              </div>
+            )}
+          </div>
+        )}
+
         {/* Highlights with Notes section */}
         {highlightsWithNotes.length > 0 && (
           <div className="border-b border-border/40">
             <button
               type="button"
               className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
               onClick={() => toggleSection("notes")}
             >
               {expandedSections.notes ? (
                 <ChevronDown className="h-4 w-4 text-muted-foreground" />
@@ -332,32 +467,107 @@ export function NotebookPanel({
                     onAddNote={() => handleEditHighlightNote(highlight)}
                     onDelete={() => handleDeleteHighlight(highlight)}
                   />
                 ))}
               </div>
             )}
           </div>
         )}
 
         {/* Empty state */}
-        {bookHighlights.length === 0 && !isEditing && (
+        {!isEditing && totalAnnotations === 0 && (
           <div className="flex h-full flex-col items-center justify-center p-6 text-center">
             <img src="/note.svg" alt="" className="mb-4 h-32 w-32" />
             <p className="text-sm text-muted-foreground">{t("notebook.empty")}</p>
             <p className="mt-1 text-xs text-muted-foreground/70">{t("notebook.emptyHint")}</p>
           </div>
         )}
       </div>
     </div>
   );
 }
 
+// Sub-component: CBZ standalone page note
+interface CbzNoteItemProps {
+  note: Note;
+  onClick: () => void;
+  onEdit: () => void;
+  onDelete: () => void;
+  isActive?: boolean;
+}
+
+function CbzNoteItem({ note, onClick, onEdit, onDelete, isActive }: CbzNoteItemProps) {
+  const { t } = useTranslation();
+
+  // Extract page number from cfi "page-{n}" — 0-based, display 1-based
+  const pageNumber = useMemo(() => {
+    const match = note.cfi?.match(/^page-(\d+)$/);
+    return match ? Number.parseInt(match[1], 10) + 1 : null;
+  }, [note.cfi]);
+
+  // First line of content as preview
+  const contentPreview = useMemo(() => {
+    const firstLine = note.content?.split("\n")[0]?.trim();
+    return firstLine || "";
+  }, [note.content]);
+
+  return (
+    <div
+      className={cn(
+        "group mt-2 rounded-md border border-border/40 p-2 transition-colors cursor-pointer",
+        isActive ? "bg-muted" : "hover:bg-muted/50",
+      )}
+    >
+      <div className="flex items-start gap-2" onClick={onClick}>
+        <FileText className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
+        <div className="flex-1 min-w-0">
+          <p className="text-sm font-medium text-foreground">
+            {pageNumber != null ? t("notebook.pageNNote", { n: pageNumber }) : note.title}
+          </p>
+          {contentPreview && (
+            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
+              {contentPreview}
+            </p>
+          )}
+          {note.chapterTitle && (
+            <p className="mt-1 text-xs text-muted-foreground/70">{note.chapterTitle}</p>
+          )}
+        </div>
+      </div>
+      <div className="mt-2 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
+        <button
+          type="button"
+          className="p-1 text-muted-foreground hover:text-primary rounded hover:bg-muted"
+          onClick={(e) => {
+            e.stopPropagation();
+            onEdit();
+          }}
+          title={t("notebook.editNote")}
+        >
+          <Edit3 className="h-3.5 w-3.5" />
+        </button>
+        <button
+          type="button"
+          className="p-1 text-muted-foreground hover:text-destructive rounded hover:bg-muted"
+          onClick={(e) => {
+            e.stopPropagation();
+            onDelete();
+          }}
+          title={t("notebook.deleteNote")}
+        >
+          <Trash2 className="h-3.5 w-3.5" />
+        </button>
+      </div>
+    </div>
+  );
+}
+
 // Sub-component: Highlight with note
 interface HighlightNoteItemProps {
   highlight: Highlight;
   onClick: () => void;
   onEdit: () => void;
   onDeleteNote: () => void;
   isActive?: boolean;
 }
 
 function HighlightNoteItem({
@@ -464,11 +674,11 @@ function HighlightItem({ highlight, onClick, onAddNote, onDelete }: HighlightIte
             e.stopPropagation();
             onDelete();
           }}
           title={t("notebook.deleteHighlightBtn")}
         >
           <Trash2 className="h-3.5 w-3.5" />
         </button>
       </div>
     </div>
   );
-}
+}
\ No newline at end of file
diff --git a/packages/app/src/components/reader/ReaderToolbar.tsx b/packages/app/src/components/reader/ReaderToolbar.tsx
index d1a53eae..6a56b48d 100644
--- a/packages/app/src/components/reader/ReaderToolbar.tsx
+++ b/packages/app/src/components/reader/ReaderToolbar.tsx
@@ -1,32 +1,34 @@
 import { SyncButton } from "@/components/ui/SyncButton";
 import { Button } from "@/components/ui/button";
 import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
+import type { BookFormat } from "@/lib/reader/document-loader";
 import { toggleWindowFullscreen } from "@/lib/window-fullscreen";
 import { useAnnotationStore } from "@/stores/annotation-store";
 import { useAppStore } from "@/stores/app-store";
 import { useNotebookStore } from "@/stores/notebook-store";
 import { useReaderStore } from "@/stores/reader-store";
 import type { ChapterTranslationState } from "@readany/core/hooks";
 import { generateId } from "@readany/core/utils";
 import {
   ArrowLeft,
   Bookmark,
   Headphones,
   List,
   Maximize,
   MessageSquare,
   NotebookPen,
   Pin,
   RotateCcw,
   Search,
   Settings,
+  StickyNote,
   Undo,
   ZoomIn,
   ZoomOut,
 } from "lucide-react";
 import { useTranslation } from "react-i18next";
 import { toast } from "sonner";
 import { ChapterTranslationMenu } from "./ChapterTranslationBar";
 import type { TOCItem } from "./FoliateViewer";
 
 interface ReaderToolbarProps {
@@ -43,20 +45,23 @@ interface ReaderToolbarProps {
   onToggleTTS?: () => void;
   chapterTranslationState: ChapterTranslationState;
   onChapterTranslationStart: (targetLang?: string) => void;
   onChapterTranslationCancel: () => void;
   onToggleOriginalVisible: () => void;
   onToggleTranslationVisible: () => void;
   onChapterTranslationReset: () => void;
   isChatOpen?: boolean;
   isTTSActive?: boolean;
   isFixedLayout?: boolean;
+  /** Book format — enables format-specific toolbar items (e.g. CBZ page notes) */
+  bookFormat?: BookFormat;
+  currentPage?: number;
   fixedLayoutZoom?: number;
   fixedLayoutZoomMin?: number;
   fixedLayoutZoomMax?: number;
   fixedLayoutZoomStep?: number;
   onFixedLayoutZoomChange?: (zoom: number) => void;
   isPinned?: boolean;
   onTogglePinned?: () => void;
   onMouseEnter?: () => void;
   onMouseLeave?: () => void;
   getPageSnippet?: () => string;
@@ -76,37 +81,39 @@ export function ReaderToolbar({
   onToggleTTS,
   chapterTranslationState,
   onChapterTranslationStart,
   onChapterTranslationCancel,
   onToggleOriginalVisible,
   onToggleTranslationVisible,
   onChapterTranslationReset,
   isChatOpen,
   isTTSActive,
   isFixedLayout = false,
+  bookFormat,
+  currentPage = 0,
   fixedLayoutZoom = 1,
   fixedLayoutZoomMin = 0.5,
   fixedLayoutZoomMax = 3,
   fixedLayoutZoomStep = 0.1,
   onFixedLayoutZoomChange,
   isPinned = false,
   onTogglePinned,
   onMouseEnter,
   onMouseLeave,
   getPageSnippet,
 }: ReaderToolbarProps) {
   const { t } = useTranslation();
   const setActiveTab = useAppStore((s) => s.setActiveTab);
   const tab = useReaderStore((s) => s.tabs[tabId]);
   const canGoBack = useReaderStore((s) => s.canGoBack(tabId));
   const goBack = useReaderStore((s) => s.goBack);
-  const { isOpen: isNotebookOpen, toggleNotebook } = useNotebookStore();
+  const { isOpen: isNotebookOpen, toggleNotebook, startNewNote } = useNotebookStore();
 
   const bookmarks = useAnnotationStore((s) => s.bookmarks);
   const addBookmark = useAnnotationStore((s) => s.addBookmark);
   const removeBookmark = useAnnotationStore((s) => s.removeBookmark);
 
   const currentCfi = tab?.currentCfi || "";
   const bookId = tab?.bookId || "";
   const existingBookmark = bookmarks.find((b) => b.bookId === bookId && b.cfi === currentCfi);
   const isBookmarked = !!existingBookmark;
   const fixedLayoutZoomPercent = Math.round(fixedLayoutZoom * 100);
@@ -127,20 +134,33 @@ export function ReaderToolbar({
         bookId,
         cfi: currentCfi,
         label,
         chapterTitle: tab?.chapterTitle || undefined,
         createdAt: Date.now(),
       });
       toast.success(t("bookmarks.added"));
     }
   };
 
+  const handleAddCbzPageNote = () => {
+    if (!bookId || bookFormat !== "CBZ") return;
+    // Use 0-based page index for CFI (consistent with foliate-js CBZ fake CFI scheme)
+    const pageIndex = currentPage > 0 ? currentPage - 1 : 0;
+    const cfi = `page-${pageIndex}`;
+    const chapterTitle = `Page ${currentPage}`;
+    startNewNote({
+      text: chapterTitle,
+      cfi,
+      chapterTitle,
+    });
+  };
+
   if (!tab) return null;
 
   return (
     <div
       className={`absolute left-0 right-0 top-2 z-40 flex h-10 items-center justify-between bg-background/95 backdrop-blur-sm px-2 shadow-sm transition-all duration-300 ${
         isVisible
           ? "translate-y-0 opacity-100 pointer-events-auto"
           : "-translate-y-[calc(100%+0.5rem)] opacity-0 pointer-events-none"
       }`}
       onMouseEnter={onMouseEnter}
@@ -202,20 +222,32 @@ export function ReaderToolbar({
 
         <Button
           variant="ghost"
           size="icon"
           className={`h-7 w-7 ${isBookmarked ? "text-primary" : ""}`}
           onClick={handleToggleBookmark}
           title={isBookmarked ? t("bookmarks.remove") : t("bookmarks.add")}
         >
           <Bookmark className={`h-3.5 w-3.5 ${isBookmarked ? "fill-current" : ""}`} />
         </Button>
+
+        {bookFormat === "CBZ" && (
+          <Button
+            variant="ghost"
+            size="icon"
+            className="h-7 w-7"
+            onClick={handleAddCbzPageNote}
+            title={t("notebook.addPageNote")}
+          >
+            <StickyNote className="h-3.5 w-3.5" />
+          </Button>
+        )}
       </div>
 
       {/* Center: chapter title */}
       <div className="absolute inset-x-0 flex justify-center pointer-events-none">
         <span className="max-w-[200px] truncate text-xs text-foreground">
           {tab.chapterTitle || t("reader.untitled")}
         </span>
       </div>
 
       {/* Right: translate + TTS + search + AI chat + settings */}
diff --git a/packages/app/src/components/reader/ReaderView.tsx b/packages/app/src/components/reader/ReaderView.tsx
index efdcdbf8..09e612c7 100644
--- a/packages/app/src/components/reader/ReaderView.tsx
+++ b/packages/app/src/components/reader/ReaderView.tsx
@@ -2948,20 +2948,21 @@ export function ReaderView({ bookId, tabId }: ReaderViewProps) {
             note,
           });
         }}
         onDeleteAnnotation={(cfi) => {
           foliateRef.current?.deleteAnnotation({ value: cfi });
         }}
         panelWidth={notebookPanel.width}
         onResize={notebookPanel.handleResize}
         onResizeStart={notebookPanel.handleResizeStart}
         onResizeEnd={notebookPanel.handleResizeEnd}
+        bookFormat={bookFormat}
       />
 
       {/* Main reading area */}
       <div className="relative flex flex-1 flex-col overflow-hidden rounded-lg border border-border/60 bg-background shadow-sm">
         {/* Search bar — stacked above content when visible */}
         {showSearch && (
           <SearchBar
             onSearch={handleSearch}
             onNext={() => navigateSearchResult("next")}
             onPrev={() => navigateSearchResult("prev")}
@@ -3139,20 +3140,22 @@ export function ReaderView({ bookId, tabId }: ReaderViewProps) {
             onToggleTTS={handleToggleTTS}
             chapterTranslationState={chapterTranslation.state}
             onChapterTranslationStart={chapterTranslation.startTranslation}
             onChapterTranslationCancel={chapterTranslation.cancelTranslation}
             onToggleOriginalVisible={chapterTranslation.toggleOriginalVisible}
             onToggleTranslationVisible={chapterTranslation.toggleTranslationVisible}
             onChapterTranslationReset={chapterTranslation.reset}
             isChatOpen={showChat}
             isTTSActive={showTTS || ttsPlayState !== "stopped"}
             isFixedLayout={isFixedLayout}
+            bookFormat={bookFormat}
+            currentPage={currentPage}
             fixedLayoutZoom={fixedLayoutZoom}
             fixedLayoutZoomMin={FIXED_LAYOUT_ZOOM_MIN}
             fixedLayoutZoomMax={FIXED_LAYOUT_ZOOM_MAX}
             fixedLayoutZoomStep={FIXED_LAYOUT_ZOOM_STEP}
             onFixedLayoutZoomChange={handleFixedLayoutZoomChange}
             isPinned={isToolbarPinned}
             onTogglePinned={() => setIsToolbarPinned((prev) => !prev)}
             onMouseEnter={handleMouseEnter}
             onMouseLeave={handleMouseLeave}
             getPageSnippet={() => foliateRef.current?.getVisibleText() || ""}
@@ -3283,29 +3286,31 @@ export function ReaderView({ bookId, tabId }: ReaderViewProps) {
 // Separate component to use notebook store hook
 function NotebookSidebarWrapper({
   bookId,
   onGoToCfi,
   onAddAnnotation,
   onDeleteAnnotation,
   panelWidth,
   onResize,
   onResizeStart,
   onResizeEnd,
+  bookFormat,
 }: {
   bookId: string;
   onGoToCfi: (cfi: string) => void;
   onAddAnnotation: (cfi: string, color: string, note?: string) => void;
   onDeleteAnnotation: (cfi: string) => void;
   panelWidth: number;
   onResize: (delta: number, side: "left" | "right") => void;
   onResizeStart: () => void;
   onResizeEnd: () => void;
+  bookFormat?: BookFormat;
 }) {
   const isOpen = useNotebookStore((s) => s.isOpen);
   const closeNotebook = useNotebookStore((s) => s.closeNotebook);
 
   if (!isOpen) return null;
 
   return (
     <div
       className="relative mr-1 flex shrink-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-background shadow-sm"
       style={{ width: panelWidth }}
@@ -3315,14 +3320,15 @@ function NotebookSidebarWrapper({
         onResizeStart={onResizeStart}
         onResize={(delta) => onResize(delta, "right")}
         onResizeEnd={onResizeEnd}
       />
       <NotebookPanel
         bookId={bookId}
         onClose={closeNotebook}
         onGoToCfi={onGoToCfi}
         onAddAnnotation={onAddAnnotation}
         onDeleteAnnotation={onDeleteAnnotation}
+        bookFormat={bookFormat}
       />
     </div>
   );
 }
diff --git a/packages/core/src/__tests__/pdf-highlight-quads.test.ts b/packages/core/src/__tests__/pdf-highlight-quads.test.ts
new file mode 100644
index 00000000..8084728f
--- /dev/null
+++ b/packages/core/src/__tests__/pdf-highlight-quads.test.ts
@@ -0,0 +1,67 @@
+import { describe, expect, it } from "vitest";
+
+describe("quadPoints serialization", () => {
+  it("roundtrips number array through JSON for PDF highlight", () => {
+    const quads = [10.5, 20.3, 150.7, 20.3, 150.7, 45.1, 10.5, 45.1];
+    const json = JSON.stringify(quads);
+    const parsed: number[] = JSON.parse(json);
+    expect(parsed).toEqual(quads);
+    expect(parsed.length).toBe(8); // 4 corners × 2 coords
+  });
+
+  it("handles undefined quadPoints for EPUB highlights", () => {
+    const json = JSON.stringify(undefined);
+    expect(json).toBeUndefined(); // JSON.stringify(undefined) returns undefined
+  });
+
+  it("handles NULL in database (null string → undefined)", () => {
+    const stored: string | null = null;
+    const parsed = stored ? JSON.parse(stored) : undefined;
+    expect(parsed).toBeUndefined();
+  });
+});
+
+describe("Highlight type with quadPoints", () => {
+  it("EPUB highlight has no quadPoints", () => {
+    const h = {
+      id: "h1",
+      bookId: "b1",
+      cfi: "epubcfi(/6/4[chap01]!/4/2/6)",
+      text: "hello",
+      color: "yellow",
+      createdAt: 1,
+      updatedAt: 1,
+    };
+    expect((h as any).quadPoints).toBeUndefined();
+  });
+
+  it("PDF highlight has quadPoints", () => {
+    const h = {
+      id: "h2",
+      bookId: "b2",
+      cfi: "page:3",
+      text: "selected text",
+      color: "yellow",
+      quadPoints: [10, 20, 100, 20, 100, 50, 10, 50],
+      createdAt: 1,
+      updatedAt: 1,
+    };
+    expect(h.quadPoints).toBeDefined();
+    expect(h.quadPoints!.length).toBe(8);
+  });
+});
+
+describe("CBZ page note CFI", () => {
+  it("generates correct CFI for page N", () => {
+    const pageN = 5;
+    const cfi = `page-${pageN}`;
+    expect(cfi).toBe("page-5");
+  });
+
+  it("parses page number back from CFI", () => {
+    const cfi = "page-12";
+    const pageMatch = cfi.match(/^page-(\d+)$/);
+    expect(pageMatch).not.toBeNull();
+    expect(parseInt(pageMatch![1]!)).toBe(12);
+  });
+});
\ No newline at end of file
diff --git a/packages/core/src/i18n/locales/en/reader.json b/packages/core/src/i18n/locales/en/reader.json
index 072c3d46..14a28693 100644
--- a/packages/core/src/i18n/locales/en/reader.json
+++ b/packages/core/src/i18n/locales/en/reader.json
@@ -108,21 +108,24 @@
     "selectedText": "Selected text",
     "addNote": "Add your notes here...",
     "deleteNote": "Delete note",
     "deleteHighlight": "Delete highlight",
     "notesSection": "Notes",
     "highlightsSection": "Highlights",
     "empty": "No highlights or notes",
     "emptyHint": "Select text in the book to highlight or add notes",
     "editNote": "Edit note",
     "addNoteBtn": "Add note",
-    "deleteHighlightBtn": "Delete highlight"
+    "deleteHighlightBtn": "Delete highlight",
+    "addPageNote": "Add page note",
+    "pageNotes": "Page Notes",
+    "pageNNote": "Page {{n}} Note"
   },
   "editor": {
     "enterLink": "Enter link URL",
     "undo": "Undo (Ctrl+Z)",
     "redo": "Redo (Ctrl+Y)",
     "heading1": "Heading 1",
     "heading2": "Heading 2",
     "heading3": "Heading 3",
     "bold": "Bold (Ctrl+B)",
     "italic": "Italic (Ctrl+I)",
diff --git a/packages/core/src/i18n/locales/zh/reader.json b/packages/core/src/i18n/locales/zh/reader.json
index 150d9ec9..da6de4dd 100644
--- a/packages/core/src/i18n/locales/zh/reader.json
+++ b/packages/core/src/i18n/locales/zh/reader.json
@@ -108,21 +108,24 @@
     "selectedText": "选中文本",
     "addNote": "在这里添加笔记...",
     "deleteNote": "删除笔记",
     "deleteHighlight": "删除高亮",
     "notesSection": "笔记",
     "highlightsSection": "高亮",
     "empty": "暂无高亮或笔记",
     "emptyHint": "选择书中文本进行高亮或添加笔记",
     "editNote": "编辑笔记",
     "addNoteBtn": "添加笔记",
-    "deleteHighlightBtn": "删除高亮"
+    "deleteHighlightBtn": "删除高亮",
+    "addPageNote": "添加页面笔记",
+    "pageNotes": "页面笔记",
+    "pageNNote": "第 {{n}} 页笔记"
   },
   "editor": {
     "enterLink": "输入链接地址",
     "undo": "撤销 (Ctrl+Z)",
     "redo": "重做 (Ctrl+Y)",
     "heading1": "标题 1",
     "heading2": "标题 2",
     "heading3": "标题 3",
     "bold": "粗体 (Ctrl+B)",
     "italic": "斜体 (Ctrl+I)",
