# Task 6: Add MD duplicate import detection

## Files

- Modify: `packages/app/src/stores/library-store.ts` (desktop import)
- Modify: `packages/app-expo/src/stores/library-store.ts` (mobile import)

## Steps

- [ ] **Step 1: Add MD file hash check in desktop import pipeline**

In `packages/app/src/stores/library-store.ts`, find the `importBooks` action. In the MD import branch (where `MdToEpubConverter` is used, around line 1014), after computing the `fileHash` value and before creating the book entry, check if any existing book has the same `fileHash`:

```ts
// Check for duplicate by file hash
const existingBooks = get().books;
const duplicate = existingBooks.find((b) => b.fileHash === fileHash && b.format === "md");
if (duplicate) {
  return { success: false, skipped: true, reason: "duplicate" };
}
```

The `importBooks` return type likely has a `skipped` counter or similar — integrate into whatever skip/tracking mechanism it uses for duplicates. Check the existing pattern for how TXT/UMD handle duplicates (or if they don't, add a `toast.info` instead).

- [ ] **Step 2: Add MD file hash check in mobile import pipeline**

Same pattern in `packages/app-expo/src/stores/library-store.ts`, `importBooks` action, MD branch (around line 1210). Same file-hash-based dedup check.

- [ ] **Step 3: Verify both compile**

Run: `cd packages/app && npx tsc --noEmit && cd ../app-expo && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/stores/library-store.ts packages/app-expo/src/stores/library-store.ts
git commit -m "feat: detect and skip duplicate MD imports by file hash"
```