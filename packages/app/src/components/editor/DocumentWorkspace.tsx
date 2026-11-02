import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { getDesktopLibraryRoot, resolveDesktopDataPath } from "@/lib/storage/desktop-library-root";
import { MdToEpubConverter } from "@readany/core/utils/md-to-epub";
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
  const updateBook = useLibraryStore((s) => s.updateBook);
  const [markdown, setMarkdown] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const book = books.find((b) => b.id === bookId);

  // Load markdown source file
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let join, root;
      try {
        const { readFile } = await import("@tauri-apps/plugin-fs");
        const pathMod = await import("@tauri-apps/api/path");
        join = pathMod.join;
        root = await getDesktopLibraryRoot();
        const mdPath = await join(root, `books/${bookId}.md`);
        const bytes = await readFile(mdPath);
        const decoder = new TextDecoder();
        if (!cancelled) {
          setMarkdown(decoder.decode(bytes));
          setIsLoading(false);
        }
      } catch {
        // If no .md source exists, try reading the book file directly
        try {
          const { readFile } = await import("@tauri-apps/plugin-fs");
          const epubPath = await join(root, `books/${bookId}.epub`);
          const bytes = await readFile(epubPath);
          if (!cancelled) {
            setMarkdown(`# ${book?.meta.title || "Untitled"}

> This book was imported as EPUB. Edit as Markdown, save to re-generate EPUB.

`);
            setIsLoading(false);
          }
        } catch {
          if (!cancelled) {
            setMarkdown(`# New Document

Start writing...`);
            setIsLoading(false);
          }
        }
      }
    })();
    return () => { cancelled = true; };
  }, [bookId]);

  const handleSave = useCallback(async () => {
    if (!markdown.trim()) return;
    setIsSaving(true);
    try {
      const converter = new MdToEpubConverter();
      const result = converter.convertToBytes({ markdown });

      // Update book title if derived
      if (book && result.bookTitle !== book.meta.title) {
        await updateBook(book.id, { meta: { ...book.meta, title: result.bookTitle } });
      }

      // Write EPUB and source MD
      const { writeFile, mkdir } = await import("@tauri-apps/plugin-fs");
      const { join } = await import("@tauri-apps/api/path");
      const root = await getDesktopLibraryRoot();
      await mkdir(join(root, "books"), { recursive: true });

      const epubPath = await resolveDesktopDataPath(`books/${bookId}.epub`);
      await writeFile(epubPath, result.epubBytes);

      const encoder = new TextEncoder();
      const mdPath = await join(root, `books/${bookId}.md`);
      await writeFile(mdPath, encoder.encode(markdown));

      toast.success(t("editor.saved", "Document saved"));
    } catch (err) {
      console.error("[DocumentWorkspace] Save failed:", err);
      toast.error(t("editor.saveFailed", "Failed to save document"));
    } finally {
      setIsSaving(false);
    }
  }, [markdown, bookId, book, updateBook, t]);

  // Auto-save with debounce
  const debouncedSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      handleSave();
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
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {t("editor.save", "Save")}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <MarkdownEditor
          value={markdown}
          onChange={handleChange}
          placeholder={t("editor.placeholder", "Start writing Markdown...")}
          className="h-full"
        />
      </div>
    </div>
  );
}
