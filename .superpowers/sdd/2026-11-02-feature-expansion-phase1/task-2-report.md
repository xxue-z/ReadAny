# Task 2 Report: Add `saveDocument` store action and use in DocumentWorkspace

## Status: DONE

## Commits
- `58e59e1d` — feat: add saveDocument store action and use in DocumentWorkspace

## Tests
- `pnpm tsc --noEmit` in `packages/app`: no new errors introduced. 6 pre-existing errors remain (4 from `createDocument`'s `format: "md"` type narrowing, 1 from `DesktopImportActions.tsx` duplicate import, 1 from `DocumentWorkspace.tsx` possibly-undefined variable in catch block). None related to this change.

## Concerns
- None. The implementation follows the brief exactly. One minor deviation from the brief's code: the brief omitted `await` on `join(root, "books")` inside `mkdir`, but `@tauri-apps/api/path`'s `join` returns `Promise<string>`, so the correct call is `await mkdir(await join(root, "books"), ...)`. This matches the existing pattern in `createDocument` on line 1427.

## Self-review
- Verified `saveDocument` added to `LibraryState` interface (line 386), after `createDocument`
- Verified `saveDocument` implementation at end of store (lines 1449-1468), structurally matching `createDocument` but accepting `bookId` + `markdown` instead of creating a new book
- Verified `DocumentWorkspace.tsx` refactored: removed `MdToEpubConverter` and `resolveDesktopDataPath` imports; retained `getDesktopLibraryRoot` (used in load path); `handleSave` simplified to call `saveDocument(bookId, markdown)` with loading/error toast wrappers
- Verified removed unused `updateBook` selector
- Verified `getDesktopLibraryRoot` import preserved (still used in `useEffect` loader)
- Verified commit contains only the 2 intended files