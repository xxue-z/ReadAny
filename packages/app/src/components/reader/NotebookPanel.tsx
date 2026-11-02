import { ExportDropdown } from "@/components/notes/ExportDropdown";
import { Button } from "@/components/ui/button";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import type { BookFormat } from "@/lib/reader/document-loader";
import { useAnnotationStore } from "@/stores/annotation-store";
import { useLibraryStore } from "@/stores/library-store";
import { useNotebookStore } from "@/stores/notebook-store";
import { type ExportFormat, annotationExporter } from "@readany/core/export";
import { createSelectionNoteMutation } from "@readany/core/reader";
import type { Highlight, Note } from "@readany/core/types";
import { HIGHLIGHT_COLOR_HEX } from "@readany/core/types";
import { cn, generateId } from "@readany/core/utils";
import {
  ChevronDown,
  ChevronRight,
  Edit3,
  FileText,
  Highlighter,
  NotebookPen,
  Save,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
/**
 * NotebookPanel — left sidebar for viewing and editing notes/highlights
 * Format-aware: shows highlights + text excerpts for EPUB/PDF, standalone page notes for CBZ.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface NotebookPanelProps {
  bookId: string;
  onClose: () => void;
  onGoToCfi?: (cfi: string) => void;
  onAddAnnotation?: (cfi: string, color: string, note?: string) => void;
  onDeleteAnnotation?: (cfi: string) => void;
  /** Book format — enables format-specific rendering (e.g. CBZ page notes) */
  bookFormat?: BookFormat;
}

export function NotebookPanel({
  bookId,
  onClose,
  onGoToCfi,
  onAddAnnotation,
  onDeleteAnnotation,
  bookFormat,
}: NotebookPanelProps) {
  const { t } = useTranslation();

  const { pendingNote, editingHighlight, clearPending, saveDraft, getDraft, clearDraft } =
    useNotebookStore();

  const {
    highlights,
    notes,
    addHighlight,
    updateHighlight,
    removeHighlight,
    addNote,
    updateNote: updateAnnotationNote,
    removeNote,
  } = useAnnotationStore();

  const books = useLibraryStore((s) => s.books);

  // Local state for note content being edited
  const [noteContent, setNoteContent] = useState("");
  const [expandedSections, setExpandedSections] = useState({
    highlights: true,
    notes: true,
    cbzNotes: true,
  });

  // Filter annotations for current book
  const bookHighlights = highlights.filter((h) => h.bookId === bookId);
  const bookNotes = notes.filter((n) => n.bookId === bookId);

  // Highlights with notes vs without
  const highlightsWithNotes = bookHighlights.filter((h) => h.note);
  const highlightsWithoutNotes = bookHighlights.filter((h) => !h.note);

  // Distinguish CBZ standalone notes from highlight-linked notes
  const isCbz = bookFormat === "CBZ";

  // Drafts are scoped per book: CBZ page notes all use "Page N" as their text,
  // so a text-only key would leak the draft between books.
  const draftKey = pendingNote ? `${bookId}:${pendingNote.cfi}` : "";

  // Initialize note content when editing starts
  useEffect(() => {
    if (pendingNote) {
      // Check for saved draft
      const draft = getDraft(draftKey);
      setNoteContent(draft || pendingNote.existingNote || "");
    } else if (editingHighlight) {
      setNoteContent(editingHighlight.note || "");
    }
  }, [pendingNote, editingHighlight, getDraft, draftKey]);

  // Auto-save draft on content change
  useEffect(() => {
    if (pendingNote && noteContent && draftKey) {
      saveDraft(draftKey, noteContent);
    }
  }, [noteContent, pendingNote, saveDraft, draftKey]);

  const handleSave = () => {
    if (pendingNote) {
      if (isCbz) {
        // CBZ: create standalone Note (no highlight linkage)
        const existingNote = bookNotes.find((n) => n.cfi === pendingNote.cfi && !n.highlightId);
        if (existingNote) {
          updateAnnotationNote(existingNote.id, {
            content: noteContent,
            title: pendingNote.chapterTitle || existingNote.title,
            updatedAt: Date.now(),
          });
        } else {
          addNote({
            id: generateId(),
            bookId,
            cfi: pendingNote.cfi,
            title: pendingNote.chapterTitle || pendingNote.text,
            content: noteContent,
            chapterTitle: pendingNote.chapterTitle,
            tags: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
        // Clear draft
        clearDraft(draftKey);
        clearPending();
      } else {
        // EPUB/PDF: highlight + note via createSelectionNoteMutation
        const mutation = createSelectionNoteMutation({
          bookId,
          cfi: pendingNote.cfi,
          text: pendingNote.text,
          note: noteContent,
          chapterTitle: pendingNote.chapterTitle,
          defaultColor: "yellow",
          // PDF notes must carry the quads, otherwise the highlight cannot be
          // painted on the page and would only exist in the notebook list.
          quads: pendingNote.quads,
        });
        if (mutation.kind === "create") {
          addHighlight(mutation.highlight);
          if (!pendingNote.quads) {
            onAddAnnotation?.(pendingNote.cfi, mutation.highlight.color, mutation.highlight.note);
          }
        }
        // Clear draft
        clearDraft(draftKey);
        clearPending();
      }
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
        updateHighlight(mutation.id, mutation.updates);
        onAddAnnotation?.(editingHighlight.cfi, editingHighlight.color, mutation.updates.note);
      }
      clearPending();
    }
    setNoteContent("");
  };

  const handleCancel = () => {
    clearPending();
    setNoteContent("");
  };

  const handleDeleteNote = () => {
    if (editingHighlight) {
      updateHighlight(editingHighlight.id, { note: undefined });
      onAddAnnotation?.(editingHighlight.cfi, editingHighlight.color, undefined);
      clearPending();
      setNoteContent("");
    }
  };

  const handleHighlightClick = (highlight: Highlight) => {
    // Navigate to the highlight location
    if (onGoToCfi && highlight.cfi) {
      onGoToCfi(highlight.cfi);
    }
  };

  const handleCbzNoteClick = (note: Note) => {
    // Navigate to the CBZ page
    if (onGoToCfi && note.cfi) {
      onGoToCfi(note.cfi);
    }
  };

  const handleEditHighlightNote = (highlight: Highlight) => {
    useNotebookStore.getState().startEditNote(highlight);
  };

  const handleEditCbzNote = (note: Note) => {
    useNotebookStore.getState().startNewNote({
      text: note.title,
      cfi: note.cfi || "",
      chapterTitle: note.chapterTitle,
      existingNote: note.content,
      highlightId: undefined,
    });
  };

  const handleDeleteNoteOnly = (highlight: Highlight) => {
    updateHighlight(highlight.id, { note: undefined });
    onAddAnnotation?.(highlight.cfi, highlight.color, undefined);
    // Clear editing state if we're editing this highlight
    if (editingHighlight?.id === highlight.id) {
      clearPending();
      setNoteContent("");
    }
  };

  const handleDeleteCbzNote = (note: Note) => {
    removeNote(note.id);
    if (editingHighlight?.id === note.id) {
      clearPending();
      setNoteContent("");
    }
  };

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

  const toggleSection = (section: "highlights" | "notes" | "cbzNotes") => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Total annotations for export
  const totalAnnotations = bookHighlights.length + bookNotes.length;

  const handleExport = (format: ExportFormat) => {
    const book = books.find((b) => b.id === bookId);
    if (!book) return;
    const content = annotationExporter.export(
      bookHighlights as Highlight[],
      bookNotes as Note[],
      book,
      { format },
    );
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
  const isCbzEditing = isEditing && isCbz;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border/40 px-3">
        <span className="text-xs font-medium text-foreground">{t("notebook.title")}</span>
        <div className="flex items-center gap-1">
          <ExportDropdown onExport={handleExport} disabled={totalAnnotations === 0} />
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
            {/* Selected text preview — skip for CBZ (no text selection) */}
            {!isCbzEditing && editingText && (
              <div className="mb-3 rounded-md bg-muted/50 p-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <Highlighter className="h-3 w-3" />
                  <span>{t("notebook.selectedText")}</span>
                </div>
                <p className="text-sm text-foreground line-clamp-3">"{editingText}"</p>
                {(pendingNote?.chapterTitle || editingHighlight?.chapterTitle) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {pendingNote?.chapterTitle || editingHighlight?.chapterTitle}
                  </p>
                )}
              </div>
            )}

            {/* CBZ page note header */}
            {isCbzEditing && pendingNote && (
              <div className="mb-3 rounded-md bg-muted/50 p-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <StickyNote className="h-3 w-3" />
                  <span>{pendingNote.chapterTitle || pendingNote.text}</span>
                </div>
              </div>
            )}

            {/* Note input */}
            <MarkdownEditor
              value={noteContent}
              onChange={setNoteContent}
              placeholder={t("notebook.addNote")}
              className="min-h-[120px]"
              autoFocus
            />

            {/* Actions */}
            <div className="mt-3 flex items-center justify-between">
              <div>
                {editingHighlight?.note && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={handleDeleteNote}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    {t("notebook.deleteNote")}
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleCancel}>
                  {t("common.cancel")}
                </Button>
                <Button size="sm" onClick={handleSave}>
                  <Save className="h-3.5 w-3.5 mr-1" />
                  {t("common.save")}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* CBZ Page Notes section */}
        {isCbz && bookNotes.length > 0 && (
          <div className="border-b border-border/40">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
              onClick={() => toggleSection("cbzNotes")}
            >
              {expandedSections.cbzNotes ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <StickyNote className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t("notebook.pageNotes")}</span>
              <span className="text-xs text-muted-foreground">({bookNotes.length})</span>
            </button>
            {expandedSections.cbzNotes && (
              <div className="px-3 pb-2">
                {bookNotes.map((note) => (
                  <CbzNoteItem
                    key={note.id}
                    note={note}
                    onClick={() => handleCbzNoteClick(note)}
                    onEdit={() => handleEditCbzNote(note)}
                    onDelete={() => handleDeleteCbzNote(note)}
                    isActive={pendingNote?.cfi === note.cfi}
                  />
                ))}
              </div>
            )}
          </div>
        )}

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
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <NotebookPen className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t("notebook.notesSection")}</span>
              <span className="text-xs text-muted-foreground">({highlightsWithNotes.length})</span>
            </button>
            {expandedSections.notes && (
              <div className="px-3 pb-2">
                {highlightsWithNotes.map((highlight) => (
                  <HighlightNoteItem
                    key={highlight.id}
                    highlight={highlight}
                    onClick={() => handleHighlightClick(highlight)}
                    onEdit={() => handleEditHighlightNote(highlight)}
                    onDeleteNote={() => handleDeleteNoteOnly(highlight)}
                    isActive={editingHighlight?.id === highlight.id}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Highlights without Notes section */}
        {highlightsWithoutNotes.length > 0 && (
          <div className="border-b border-border/40">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
              onClick={() => toggleSection("highlights")}
            >
              {expandedSections.highlights ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <Highlighter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t("notebook.highlightsSection")}</span>
              <span className="text-xs text-muted-foreground">
                ({highlightsWithoutNotes.length})
              </span>
            </button>
            {expandedSections.highlights && (
              <div className="px-3 pb-2">
                {highlightsWithoutNotes.map((highlight) => (
                  <HighlightItem
                    key={highlight.id}
                    highlight={highlight}
                    onClick={() => handleHighlightClick(highlight)}
                    onAddNote={() => handleEditHighlightNote(highlight)}
                    onDelete={() => handleDeleteHighlight(highlight)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!isEditing && totalAnnotations === 0 && (
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

// Sub-component: CBZ standalone page note
interface CbzNoteItemProps {
  note: Note;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isActive?: boolean;
}

function CbzNoteItem({ note, onClick, onEdit, onDelete, isActive }: CbzNoteItemProps) {
  const { t } = useTranslation();

  // Extract the page number from the CFI.
  // - `page:N` is 1-based (current format, shared with reader navigation)
  // - `page-N` is 0-based (legacy notes created before the format change)
  const pageNumber = useMemo(() => {
    const current = note.cfi?.match(/^page:(\d+)$/);
    if (current) return Number.parseInt(current[1], 10);
    const legacy = note.cfi?.match(/^page-(\d+)$/);
    return legacy ? Number.parseInt(legacy[1], 10) + 1 : null;
  }, [note.cfi]);

  // First line of content as preview
  const contentPreview = useMemo(() => {
    const firstLine = note.content?.split("\n")[0]?.trim();
    return firstLine || "";
  }, [note.content]);

  return (
    <div
      className={cn(
        "group mt-2 rounded-md border border-border/40 p-2 transition-colors cursor-pointer",
        isActive ? "bg-muted" : "hover:bg-muted/50",
      )}
    >
      <div className="flex items-start gap-2" onClick={onClick}>
        <FileText className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            {pageNumber != null ? t("notebook.pageNNote", { n: pageNumber }) : note.title}
          </p>
          {contentPreview && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{contentPreview}</p>
          )}
          {note.chapterTitle && (
            <p className="mt-1 text-xs text-muted-foreground/70">{note.chapterTitle}</p>
          )}
        </div>
      </div>
      <div className="mt-2 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          className="p-1 text-muted-foreground hover:text-primary rounded hover:bg-muted"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          title={t("notebook.editNote")}
        >
          <Edit3 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="p-1 text-muted-foreground hover:text-destructive rounded hover:bg-muted"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title={t("notebook.deleteNote")}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// Sub-component: Highlight with note
interface HighlightNoteItemProps {
  highlight: Highlight;
  onClick: () => void;
  onEdit: () => void;
  onDeleteNote: () => void;
  isActive?: boolean;
}

function HighlightNoteItem({
  highlight,
  onClick,
  onEdit,
  onDeleteNote,
  isActive,
}: HighlightNoteItemProps) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "group mt-2 rounded-md border border-border/40 p-2 transition-colors cursor-pointer",
        isActive ? "bg-muted" : "hover:bg-muted/50",
      )}
    >
      <div className="flex items-start gap-2" onClick={onClick}>
        <div
          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: HIGHLIGHT_COLOR_HEX[highlight.color] }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground line-clamp-2">"{highlight.text}"</p>
          {highlight.note && (
            <div className="mt-1.5 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1.5 prose prose-xs dark:prose-invert max-w-none break-words overflow-hidden [overflow-wrap:anywhere]">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{highlight.note}</ReactMarkdown>
            </div>
          )}
          {highlight.chapterTitle && (
            <p className="mt-1 text-xs text-muted-foreground/70">{highlight.chapterTitle}</p>
          )}
        </div>
      </div>
      <div className="mt-2 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          className="p-1 text-muted-foreground hover:text-primary rounded hover:bg-muted"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          title={t("notebook.editNote")}
        >
          <Edit3 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="p-1 text-muted-foreground hover:text-destructive rounded hover:bg-muted"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteNote();
          }}
          title={t("notebook.deleteNote")}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// Sub-component: Highlight without note
interface HighlightItemProps {
  highlight: Highlight;
  onClick: () => void;
  onAddNote: () => void;
  onDelete: () => void;
}

function HighlightItem({ highlight, onClick, onAddNote, onDelete }: HighlightItemProps) {
  const { t } = useTranslation();
  return (
    <div
      className="group mt-2 flex items-start gap-2 rounded-md p-2 transition-colors cursor-pointer hover:bg-muted/50"
      onClick={onClick}
    >
      <div
        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: HIGHLIGHT_COLOR_HEX[highlight.color] }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground line-clamp-2">"{highlight.text}"</p>
        {highlight.chapterTitle && (
          <p className="mt-1 text-xs text-muted-foreground/70">{highlight.chapterTitle}</p>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          className="p-1 text-muted-foreground hover:text-primary rounded hover:bg-muted"
          onClick={(e) => {
            e.stopPropagation();
            onAddNote();
          }}
          title={t("notebook.addNoteBtn")}
        >
          <NotebookPen className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="p-1 text-muted-foreground hover:text-destructive rounded hover:bg-muted"
          onClick={(e) => {
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
}
