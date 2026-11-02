# Task 5 Report: Mobile auto-save + saveDocument store action

## Status: DONE

## Commits
- `1dce4be88a26d270724af13f19aebfe4ab89abcd` — feat: add saveDocument store action and auto-save to mobile editor

## What was done

### 1. Added `saveDocument` to mobile library-store interface
- Added `saveDocument: (bookId: string, markdown: string) => Promise<void>` to the `LibraryState` interface at line 109.

### 2. Added `saveDocument` implementation
- Implemented `saveDocument` in the store object after `createDocument` (around line 1688).
- It converts markdown to EPUB using `MdToEpubConverter`, writes both `.epub` and `.md` files to the app's `books/` directory, and updates the book title in the store if the converted title differs.

### 3. Added debounced auto-save (3s) to DocumentEditorScreen
- Added `saveTimerRef` for debounce timer management.
- `debouncedSave` callback clears any pending timer and sets a new 3s timeout before calling `saveDocument`.
- `handleChangeText` callback calls `setMarkdown` then `debouncedSave`.
- Wired `TextInput.onChangeText` to `handleChangeText` instead of raw `setMarkdown`.

### 4. Replaced old ad-hoc `handleSave` with store's `saveDocument`
- Old `handleSave` had inline `MdToEpubConverter`, `getMdPath`, `getEpubPath`, `writeFile`, and `updateBook` calls — all replaced with a single `saveDocument(bookId, markdown)` call.
- Removed unused `getEpubPath` helper function.
- Removed unused `updateBook` store selector.

### 5. Added cleanup timer on unmount
- Cleanup `useEffect` clears `saveTimerRef.current` on unmount.
- AppState listener auto-saves immediately (no debounce) when the app goes to background/inactive.

## Tests
- `npx tsc --noEmit` via pnpm: The only error is a pre-existing issue at `library-store.ts:690` (`Cannot find name 'platform'`), unrelated to this task. Zero errors from `DocumentEditorScreen.tsx` or the new `saveDocument` code.

## Concerns
- None. The auto-save fires 3s after the last keystroke; it does not save on every keystroke, which is intentional to avoid excessive I/O.
- On app background, a final immediate save is triggered to prevent data loss.

## Self-review
- Verified the toolbar code (added by Task 4) is untouched — all toolbar buttons and `handleToolbarAction` remain in place.
- Verified `onChangeText` now uses `handleChangeText` which calls both `setMarkdown` and `debouncedSave`.
- Verified `handleSave` uses store's `saveDocument` with proper loading state and error handling.
- Verified timer cleanup covers both unmount and the AppState listener.
- No new TypeScript errors introduced.