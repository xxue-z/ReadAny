# Task 5: Add mobile auto-save + `saveDocument` store action (Expo)

## Files

- Modify: `packages/app-expo/src/stores/library-store.ts` (add `saveDocument`)
- Modify: `packages/app-expo/src/screens/DocumentEditorScreen.tsx` (use `saveDocument` + debounced auto-save)

## Steps

- [ ] **Step 1: Add `saveDocument` to mobile library-store interface**

In the `LibraryState` interface, near `createDocument` (around line 108), add:
```ts
saveDocument: (bookId: string, markdown: string) => Promise<void>;
```

- [ ] **Step 2: Add `saveDocument` implementation**

In the store implementation object (after `createDocument`, around line 1686), add:
```ts
saveDocument: async (bookId, markdown) => {
  const { MdToEpubConverter } = await import("@readany/core/utils/md-to-epub");
  const converter = new MdToEpubConverter();
  const result = converter.convertToBytes({ markdown });
  const platform = getPlatformService();
  await ensureAppSubDir("books");
  const relativeEpub = `books/${bookId}.epub`;
  const relativeMd = `books/${bookId}.md`;
  const epubPath = await resolveAppPath(relativeEpub);
  const mdPath = await resolveAppPath(relativeMd);
  const encoder = new TextEncoder();
  await platform.writeFile(epubPath, result.epubBytes);
  await platform.writeFile(mdPath, encoder.encode(markdown));
  const book = get().books.find((b) => b.id === bookId);
  if (book && result.bookTitle !== book.meta.title) {
    await get().updateBook(bookId, {
      meta: { ...book.meta, title: result.bookTitle },
      updatedAt: Date.now(),
    });
  }
},
```

- [ ] **Step 3: Add debounced auto-save to DocumentEditorScreen**

Read the current file first: `packages/app-expo/src/screens/DocumentEditorScreen.tsx`

Add a `saveTimerRef`:
```ts
const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

Get `saveDocument` from store:
```ts
const saveDocument = useLibraryStore((s) => s.saveDocument);
```

Add a debounced auto-save that fires 3 seconds after the last edit:
```ts
const debouncedSave = useCallback(() => {
  if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  saveTimerRef.current = setTimeout(() => {
    saveDocument(bookId, markdown).catch((err) => {
      console.warn("[DocumentEditor] Auto-save failed:", err);
    });
  }, 3000);
}, [bookId, markdown, saveDocument]);
```

Wire `onChangeText` to trigger `debouncedSave`:
```ts
const handleChangeText = useCallback((text: string) => {
  setMarkdown(text);
  debouncedSave();
}, [debouncedSave]);
```

- [ ] **Step 4: Replace old `handleSave` with `saveDocument` from store**

Replace the existing ad-hoc `handleSave` implementation with:
```ts
const handleSave = useCallback(async () => {
  if (isSaving) return;
  setIsSaving(true);
  try {
    await saveDocument(bookId, markdown);
    Alert.alert("", t("library.editor.saved", "已保存"));
  } catch (err) {
    console.error("[DocumentEditor] Save failed:", err);
    Alert.alert(t("library.editor.saveError", "保存失败"), String(err));
  } finally {
    setIsSaving(false);
  }
}, [bookId, markdown, saveDocument, isSaving, t]);
```

Remove the now-unused `MdToEpubConverter` import and `getMdPath`/`getEpubPath` if they're only used in the old handleSave.

- [ ] **Step 5: Cleanup timer on unmount**

In the existing `useEffect` cleanup section, add:
```ts
if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
```

- [ ] **Step 6: Verify Expo compiles**

Run: `cd packages/app-expo && npx tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
git add packages/app-expo/src/stores/library-store.ts packages/app-expo/src/screens/DocumentEditorScreen.tsx
git commit -m "feat: add saveDocument store action and auto-save to mobile editor"
```