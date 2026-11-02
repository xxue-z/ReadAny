# Task 3: Route MD books to editor on desktop (openDesktopBook)

## Files

- Modify: `packages/app/src/lib/library/open-book.ts`

## Steps

- [ ] **Step 1: Modify `openDesktopBook` to route MD books to editor**

In `openDesktopBook` (line 80), add an MD-format check that routes to DocumentWorkspace instead of ReaderView.

The check must go AFTER the remote-book download block (lines 92-159, which handles `syncStatus === "remote"`) but BEFORE the `resolveDesktopDataPath` existence check (line 171). This is because MD books always have a local `.md` + `.epub` pair created at import time — file existence is guaranteed and the existence check reads `book.filePath` which already points to the `.epub`.

Insert this block at approximately line 161 (after the remote download `}` closes and before `const platform = getPlatformService()`):

```ts
// MD documents open in the editor, not the reader
if (book.format === "md" && book.filePath) {
  const { addTab, setActiveTab } = useAppStore.getState();
  const tabId = `document-${book.id}`;
  addTab({
    id: tabId,
    type: "document",
    title: book.meta.title,
    bookId: book.id,
  });
  setActiveTab(tabId);
  return true;
}
```

- [ ] **Step 2: Verify compiles**

Run: `cd packages/app && npx tsc --noEmit`

Make sure `useAppStore` is already imported in `open-book.ts`. If not, add:
```ts
import { useAppStore } from "@/stores/app-store";
```
Check the existing imports first — it may already have it.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/lib/library/open-book.ts
git commit -m "feat: route MD books to DocumentWorkspace editor on desktop"
```