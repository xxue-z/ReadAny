# Task 2: Add `saveDocument` store action (shared save logic) — desktop

## Files

- Modify: `packages/app/src/stores/library-store.ts` (add `saveDocument` to State interface and implementation)
- Modify: `packages/app/src/components/editor/DocumentWorkspace.tsx` (use `saveDocument` from store instead of ad-hoc save)

## Steps

- [ ] **Step 1: Add `saveDocument` to the library store interface**

In the `LibraryState` interface (around line 385, near `createDocument`), add:
```ts
saveDocument: (bookId: string, markdown: string) => Promise<void>;
```

- [ ] **Step 2: Add `saveDocument` implementation in the store**

In the store implementation object (after `createDocument` implementation, around line 1446), add:
```ts
saveDocument: async (bookId, markdown) => {
  const { MdToEpubConverter } = await import("@readany/core/utils/md-to-epub");
  const converter = new MdToEpubConverter();
  const result = converter.convertToBytes({ markdown });
  const encoder = new TextEncoder();
  const { writeFile, mkdir } = await import("@tauri-apps/plugin-fs");
  const { join } = await import("@tauri-apps/api/path");
  const { getDesktopLibraryRoot } = await import("@/lib/storage/desktop-library-root");
  const { resolveDesktopDataPath } = await import("@/lib/storage/desktop-library-root");
  const root = await getDesktopLibraryRoot();
  await mkdir(join(root, "books"), { recursive: true });
  const epubPath = await resolveDesktopDataPath(`books/${bookId}.epub`);
  const mdPath = await resolveDesktopDataPath(`books/${bookId}.md`);
  await writeFile(epubPath, result.epubBytes);
  await writeFile(mdPath, encoder.encode(markdown));
  const book = get().books.find((b) => b.id === bookId);
  if (book && result.bookTitle !== book.meta.title) {
    await get().updateBook(bookId, { meta: { ...book.meta, title: result.bookTitle } });
  }
},
```

Note: The existing `resolveAppPath` utility in the store already wraps `resolveDesktopDataPath` — but for clarity and to avoid top-level import issues, use dynamic imports for `getDesktopLibraryRoot` and `resolveDesktopDataPath`, matching the existing pattern in `createDocument` which already dynamically imports from `@/lib/storage/desktop-library-root`.

- [ ] **Step 3: Refactor `DocumentWorkspace.handleSave` to use `saveDocument`**

In `DocumentWorkspace.tsx`, import `saveDocument` from the store:
```ts
const saveDocument = useLibraryStore((s) => s.saveDocument);
```

Then replace the entire `handleSave` function body with a call to `saveDocument(bookId, markdown)`, keeping the loading state management and toast notifications. The new `handleSave` should be:
```ts
const handleSave = useCallback(async () => {
  if (!markdown.trim()) return;
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
}, [markdown, bookId, saveDocument, t]);
```

Also remove the now-unused imports: `MdToEpubConverter`, `getDesktopLibraryRoot`, any Tauri FS/path imports that were only used in the old `handleSave`.

- [ ] **Step 4: Verify compiles**

Run: `cd packages/app && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/stores/library-store.ts packages/app/src/components/editor/DocumentWorkspace.tsx
git commit -m "feat: add saveDocument store action and use in DocumentWorkspace"
```