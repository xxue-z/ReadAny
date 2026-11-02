# Task 4 Report: CBZ page-level notes and format-aware NotebookPanel

## Status: ✅ Complete

## Changes Summary

### 1. ReaderToolbar — "Add Page Note" button for CBZ
**File:** `packages/app/src/components/reader/ReaderToolbar.tsx`

- Added `bookFormat?: BookFormat` and `currentPage?: number` props
- Added `StickyNote` icon button visible only when `bookFormat === "CBZ"`
- On click, creates a pending note via `startNewNote()` with:
  - `cfi = "page-{n}"` (0-based page index, consistent with foliate-js CBZ fake CFI scheme)
  - `chapterTitle = "Page {N}"` (1-based for display)
- Opens the NotebookPanel editor

### 2. ReaderView — Pass format through
**File:** `packages/app/src/components/reader/ReaderView.tsx`

- Added `bookFormat` and `currentPage` props to `<ReaderToolbar>`
- Added `bookFormat` prop to `<NotebookSidebarWrapper>` → `<NotebookPanel>`
- `BookFormat` was already imported from `@/lib/reader/document-loader`

### 3. NotebookPanel — Format-aware display
**File:** `packages/app/src/components/reader/NotebookPanel.tsx`

- Added `bookFormat?: BookFormat` prop
- **CBZ mode:** When `isCbz` is true:
  - Displays standalone `Note` objects from `useAnnotationStore().notes` in a "Page Notes" section
  - Shows "Page N Note" label with first-line content preview
  - Click navigates to page via `onGoToCfi(cfi)` using `page-{n}` CFI
  - Edit/delete actions work on `Note` objects directly
  - Saving creates/updates `Note` objects (no highlight linkage)
  - Editor header shows page label instead of text excerpt
- Non-CBZ mode: existing highlight-based note flows unchanged
- Added `CbzNoteItem` sub-component for rendering standalone page notes

### 4. i18n — New translation keys
**Files:** `packages/core/src/i18n/locales/en/reader.json`, `zh/reader.json`

Added three keys under `notebook`:
- `addPageNote`: "Add page note" / "添加页面笔记"
- `pageNotes`: "Page Notes" / "页面笔记"
- `pageNNote`: "Page {{n}} Note" / "第 {{n}} 页笔记"

## Verification

- `tsc --noEmit` passes: no new type errors in modified files
- Pre-existing errors in unrelated files (DocumentWorkspace.tsx, DesktopImportActions.tsx, library-store.ts) are unchanged
- CBZ notes are standalone `Note` objects without `highlightId` linkage
- Existing EPUB/PDF highlight + note flows are unchanged
- The `page-{n}` CFI scheme matches foliate-js navigation for fixed-layout books

## Commit
```
feat: add CBZ page-level notes and format-aware note UI
5 files changed, 295 insertions(+), 41 deletions(-)
```