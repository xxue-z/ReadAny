import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { getDesktopLibraryRoot } from "@/lib/storage/desktop-library-root";
import { useAppStore } from "@/stores/app-store";
import { useLibraryStore } from "@/stores/library-store";
import { analyzeMarkdownFidelity, recoverMarkdownSourceFromEpub } from "@readany/core/utils";
import type { MarkdownFidelityIssue } from "@readany/core/utils";
import { BookOpen, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

interface DocumentWorkspaceProps {
  bookId: string;
  tabId?: string;
}

const AUTOSAVE_DELAY_MS = 3000;

/** Editor surface. Source mode is the lossless fallback for rich content. */
type EditorMode = "rich" | "source";

const FIDELITY_ISSUE_KEYS: Record<MarkdownFidelityIssue, string> = {
  table: "editor.fidelityTable",
  image: "editor.fidelityImage",
  "task-list": "editor.fidelityTaskList",
};

export function DocumentWorkspace({ bookId, tabId }: DocumentWorkspaceProps) {
  const { t } = useTranslation();
  const books = useLibraryStore((s) => s.books);
  const saveDocument = useLibraryStore((s) => s.saveDocument);
  const addTab = useAppStore((s) => s.addTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const updateTabTitle = useAppStore((s) => s.updateTabTitle);
  const [markdown, setMarkdown] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  /** Missing `.md` that could not be recovered from the EPUB: never save. */
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("rich");
  const [restoredNotice, setRestoredNotice] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markdownRef = useRef("");
  const lastSavedRef = useRef<string | null>(null);
  const readOnlyRef = useRef(false);
  const saveRef = useRef(saveDocument);

  const book = books.find((b) => b.id === bookId);
  const docTabId = tabId ?? `document-${bookId}`;

  const fidelity = useMemo(() => analyzeMarkdownFidelity(markdown), [markdown]);
  const fidelityLabels = fidelity.issues.map((issue) => t(FIDELITY_ISSUE_KEYS[issue], issue));

  useEffect(() => {
    saveRef.current = saveDocument;
  }, [saveDocument]);

  useEffect(() => {
    markdownRef.current = markdown;
  }, [markdown]);

  useEffect(() => {
    readOnlyRef.current = isReadOnly;
  }, [isReadOnly]);

  // -------------------------------------------------------------------
  // Load the Markdown source (recovering it from the EPUB when needed)
  // -------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { readFile, writeFile, mkdir } = await import("@tauri-apps/plugin-fs");
      const { join, dirname } = await import("@tauri-apps/api/path");
      const root = await getDesktopLibraryRoot();
      const booksDir = await join(root, "books");
      const mdPath = await join(booksDir, `${bookId}.md`);
      const epubPath = await join(booksDir, `${bookId}.epub`);

      const apply = (text: string, options?: { restored?: boolean }) => {
        if (cancelled) return;
        setMarkdown(text);
        markdownRef.current = text;
        lastSavedRef.current = text;
        setEditorMode(analyzeMarkdownFidelity(text).lossy ? "source" : "rich");
        if (options?.restored) setRestoredNotice(true);
        setIsLoading(false);
      };

      try {
        const bytes = await readFile(mdPath);
        apply(new TextDecoder().decode(bytes));
        return;
      } catch {
        // The `.md` is missing. It may exist inside the synced EPUB (every EPUB
        // we generate embeds the source), so try to restore it before giving up.
      }

      try {
        const epubBytes = await readFile(epubPath);
        const recovered = await recoverMarkdownSourceFromEpub(epubBytes);
        if (recovered) {
          for (const asset of recovered.assets) {
            const dest = await join(booksDir, asset.path);
            await mkdir(await dirname(dest), { recursive: true });
            await writeFile(dest, asset.bytes);
          }
          await writeFile(mdPath, new TextEncoder().encode(recovered.markdown));
          apply(recovered.markdown, { restored: true });
          return;
        }
      } catch (err) {
        console.warn("[DocumentWorkspace] EPUB source recovery failed:", err);
      }

      // Nothing to edit: refuse to invent content. Writing a placeholder here
      // would overwrite the real book on the next save.
      if (!cancelled) {
        setMarkdown("");
        markdownRef.current = "";
        lastSavedRef.current = null;
        setIsReadOnly(true);
        setIsLoading(false);
      }
    };

    load().catch((err) => {
      console.error("[DocumentWorkspace] Failed to load document:", err);
      if (!cancelled) {
        setIsReadOnly(true);
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [bookId]);

  useEffect(() => {
    if (restoredNotice) {
      toast.success(
        t("editor.restoredFromEpub", "Markdown source restored from this document's EPUB"),
      );
      setRestoredNotice(false);
    }
  }, [restoredNotice, t]);

  // -------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------

  const persist = useCallback(
    async (value: string, options?: { silent?: boolean }): Promise<boolean> => {
      if (readOnlyRef.current) return false;
      if (!value.trim()) {
        // Explicit saves must say why nothing happened; autosave stays quiet so
        // clearing the editor temporarily does not spam toasts.
        if (!options?.silent) {
          toast.error(t("editor.emptyNotSaved", "Document is empty — nothing was saved."));
        }
        return false;
      }

      setIsSaving(true);
      try {
        await saveDocument(bookId, value);
        lastSavedRef.current = value;
        const savedBook = useLibraryStore.getState().books.find((b) => b.id === bookId);
        if (savedBook?.meta.title) {
          updateTabTitle(docTabId, savedBook.meta.title);
        }
        if (!options?.silent) {
          toast.success(t("editor.saved", "Document saved"));
        }
        return true;
      } catch (err) {
        console.error("[DocumentWorkspace] Save failed:", err);
        toast.error(t("editor.saveFailed", "Failed to save document"));
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [bookId, saveDocument, t, updateTabTitle, docTabId],
  );

  // Debounced auto-save driven by the value itself, so the timer always writes
  // the latest text.
  useEffect(() => {
    if (isLoading || isReadOnly) return;
    if (lastSavedRef.current === markdown) return;
    if (!markdown.trim()) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void persist(markdown, { silent: true });
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [markdown, isLoading, isReadOnly, persist]);

  // Flush pending edits when the tab closes / the window goes away. The store
  // action is called directly because component state is already unmounting.
  useEffect(() => {
    const flush = () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const value = markdownRef.current;
      if (readOnlyRef.current) return;
      if (!value.trim() || lastSavedRef.current === value) return;
      lastSavedRef.current = value;
      void saveRef.current(bookId, value).catch((err) => {
        console.warn("[DocumentWorkspace] Flush on close failed:", err);
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      flush();
    };
  }, [bookId]);

  // -------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------

  const handleChange = useCallback((value: string) => {
    setMarkdown(value);
  }, []);

  const handleSaveClick = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    void persist(markdown);
  }, [markdown, persist]);

  const handleRead = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (markdown.trim()) {
      await persist(markdown);
    }
    const readerTabId = `reader-${bookId}`;
    addTab({ id: readerTabId, type: "reader", title: book?.meta.title ?? "", bookId });
    setActiveTab(readerTabId);
  }, [addTab, setActiveTab, bookId, book?.meta.title, markdown, persist]);

  const switchMode = useCallback(() => {
    if (editorMode === "source") {
      if (fidelity.lossy) {
        const confirmed = window.confirm(
          t(
            "editor.lossyConfirm",
            "This document contains {{features}}. Rich-text editing will drop them, and saving will keep the loss. Continue?",
            { features: fidelityLabels.join(", ") },
          ),
        );
        if (!confirmed) return;
      }
      setEditorMode("rich");
      return;
    }
    setEditorMode("source");
  }, [editorMode, fidelity.lossy, fidelityLabels, t]);

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

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
        <h2 className="truncate text-sm font-medium text-foreground">
          {book?.meta.title || t("editor.untitled", "Untitled Document")}
        </h2>
        <div className="flex items-center gap-2">
          {isSaving && (
            <span className="text-xs text-muted-foreground">{t("editor.saving", "Saving...")}</span>
          )}
          {!isReadOnly && (
            <button
              type="button"
              onClick={switchMode}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              {editorMode === "source"
                ? t("editor.richMode", "所见即所得")
                : t("editor.sourceMode", "源码模式")}
            </button>
          )}
          <button
            type="button"
            onClick={handleRead}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            <BookOpen className="h-3.5 w-3.5" />
            {t("editor.read", "阅读")}
          </button>
          <button
            type="button"
            onClick={handleSaveClick}
            disabled={isSaving || isReadOnly}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {t("editor.save", "Save")}
          </button>
        </div>
      </div>

      {isReadOnly && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {t(
            "editor.sourceMissing",
            "源 Markdown 文件缺失，且无法从 EPUB 中恢复。为避免覆盖原书，此文档已切换为只读；请在导入该文档的设备上重新同步。",
          )}
        </div>
      )}

      {!isReadOnly && fidelity.lossy && editorMode === "source" && (
        <div className="border-b border-sky-200 bg-sky-50 px-4 py-2 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
          {t(
            "editor.lossyNotice",
            "该文档包含 {{features}}，所见即所得编辑会丢失这些内容，已切换为源码模式。",
            { features: fidelityLabels.join(", ") },
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        {editorMode === "source" ? (
          <textarea
            value={markdown}
            onChange={(event) => handleChange(event.target.value)}
            readOnly={isReadOnly}
            spellCheck={false}
            placeholder={t("editor.placeholder", "Start writing Markdown...")}
            className="h-full w-full resize-none bg-background p-4 font-mono text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
          />
        ) : (
          <MarkdownEditor
            value={markdown}
            onChange={handleChange}
            placeholder={t("editor.placeholder", "Start writing Markdown...")}
            className="h-full rounded-none border-0"
            fillHeight
          />
        )}
      </div>
    </div>
  );
}
