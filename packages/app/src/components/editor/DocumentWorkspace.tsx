import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { getDesktopLibraryRoot } from "@/lib/storage/desktop-library-root";
import { useAppStore } from "@/stores/app-store";
import { useLibraryStore } from "@/stores/library-store";
import { BookOpen, Save } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

interface DocumentWorkspaceProps {
  bookId: string;
}

export function DocumentWorkspace({ bookId }: DocumentWorkspaceProps) {
  const { t } = useTranslation();
  const books = useLibraryStore((s) => s.books);
  const saveDocument = useLibraryStore((s) => s.saveDocument);
  const addTab = useAppStore((s) => s.addTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const [markdown, setMarkdown] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const book = books.find((b) => b.id === bookId);

  // Load markdown source file
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { exists, readFile } = await import("@tauri-apps/plugin-fs");
      const { join } = await import("@tauri-apps/api/path");
      const root = await getDesktopLibraryRoot();
      const mdPath = await join(root, `books/${bookId}.md`);

      try {
        const bytes = await readFile(mdPath);
        if (!cancelled) {
          setMarkdown(new TextDecoder().decode(bytes));
          setIsLoading(false);
        }
      } catch {
        // The source .md is missing. Warn instead of silently presenting an
        // empty document, because saving would overwrite the existing book.
        const title =
          useLibraryStore.getState().books.find((b) => b.id === bookId)?.meta.title || "Untitled";
        const epubPath = await join(root, `books/${bookId}.epub`);
        const hasDerivedEpub = await exists(epubPath).catch(() => false);
        if (!cancelled) {
          setMarkdown(
            hasDerivedEpub
              ? `# ${title}\n\n> 源 Markdown 文件缺失，以下是占位内容。直接保存会覆盖原文档。\n\n`
              : `# ${title}\n\nStart writing...`,
          );
          setIsLoading(false);
        }
      }
    })().catch((err) => {
      console.error("[DocumentWorkspace] Failed to load document:", err);
      if (!cancelled) {
        setMarkdown("# New Document\n\nStart writing...");
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const handleSave = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!markdown.trim()) {
        // Explicit saves must say why nothing happened; autosave stays quiet so
        // clearing the editor temporarily does not spam toasts.
        if (!options?.silent) {
          toast.error(t("editor.emptyNotSaved", "Document is empty — nothing was saved."));
        }
        return;
      }
      setIsSaving(true);
      try {
        await saveDocument(bookId, markdown);
        toast.success(t("editor.saved", "Document saved"));
      } catch (err) {
        console.error("[DocumentWorkspace] Save failed:", err);
        toast.error(t("editor.saveFailed", "Failed to save document"));
      } finally {
        setIsSaving(false);
      }
    },
    [markdown, bookId, saveDocument, t],
  );

  // Auto-save with debounce
  const debouncedSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void handleSave({ silent: true });
    }, 3000);
  }, [handleSave]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const handleChange = useCallback(
    (value: string) => {
      setMarkdown(value);
      debouncedSave();
    },
    [debouncedSave],
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">{t("common.loading", "Loading...")}</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h2 className="text-sm font-medium text-foreground">
          {book?.meta.title || t("editor.untitled", "Untitled Document")}
        </h2>
        <div className="flex items-center gap-2">
          {isSaving && (
            <span className="text-xs text-muted-foreground">{t("editor.saving", "Saving...")}</span>
          )}
          <button
            type="button"
            onClick={async () => {
              // Flush pending edits first: the reader loads the EPUB from disk,
              // and a debounced save would still be 3s away.
              if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
              }
              if (markdown.trim()) {
                await handleSave();
              }
              const tabId = `reader-${bookId}`;
              addTab({ id: tabId, type: "reader", title: book?.meta.title ?? "", bookId });
              setActiveTab(tabId);
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            <BookOpen className="h-3.5 w-3.5" />
            {t("editor.read", "阅读")}
          </button>
          <button
            type="button"
            onClick={() => {
              void handleSave();
            }}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {t("editor.save", "Save")}
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <MarkdownEditor
          value={markdown}
          onChange={handleChange}
          placeholder={t("editor.placeholder", "Start writing Markdown...")}
          className="h-full rounded-none border-0"
          fillHeight
        />
      </div>
    </div>
  );
}
