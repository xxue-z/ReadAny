# Task 4: Add CBZ page-level notes and format-aware NotebookPanel

## Files
- Modify: `packages/app/src/components/reader/FoliateViewer.tsx` — add CBZ note button
- Modify: `packages/app/src/components/reader/NotebookPanel.tsx` — format-aware display
- Modify: `packages/app/src/components/reader/ReaderView.tsx` — pass `format` to NotebookPanel

## Context

CBZ books have no text layer (`comic-book.js` is image-only, no `createDocument`). They are `isFixedLayout = true`. The current CFI scheme for CBZ uses `epubcfi(/6/N)` fake CFI internally. CBZ pages are indexed 0-based with `page-{n}` in the CFI.

For CBZ, we can only do page-level notes (stored in `notes` table), not text highlights. TXT/MD books inherit EPUB note capabilities through the existing conversion pipeline — no work needed for them.

## Steps

- [ ] **Step 1: Read NotebookPanel to understand current note display**

Read `packages/app/src/components/reader/NotebookPanel.tsx`. Find how notes and highlights are rendered. Note the props interface and how `bookId` is passed.

- [ ] **Step 2: Add "Add Page Note" button in FoliateViewer for CBZ**

In the reader toolbar or as a floating button in FoliateViewer, when `format === "cbz"` (check `bookFormat` or `isCbz`), show an "Add Page Note" button. On click:
1. Get current page number from the relocate handler (already in state)
2. Create a `Note` with `cfi = "page-${pageNumber}"`, `chapterTitle = "Page ${pageNumber}"`
3. Open the `NoteEditor` for editing

- [ ] **Step 3: Make NotebookPanel format-aware**

Pass `bookFormat` to NotebookPanel. For each note/highlight/annotation entry:
- **EPUB**: Show highlighted text excerpt (from `highlight.text`) + CFI navigation link. Most code here already exists.
- **PDF**: Show "Page N" (from cfi) + highlighted text excerpt. QuadPoints highlights are shown with text preview.
- **CBZ**: Show "Page N Note" label. No text excerpt. Show first line of `content` as preview. Clicking navigates to that page via CFI.

- [ ] **Step 4: Navigate to CBZ page from note click**

When a CBZ note is clicked in NotebookPanel, call `view.goTo(cfi)` with `cfi = "page-{n}"`. The existing FoliateViewer navigation should already handle this.

- [ ] **Step 5: Handle CBZ note without highlight linkage**

CBZ notes are standalone (no `highlightId`). The `NoteEditor` should work without a highlight context. Ensure the existing `NoteEditor` component handles `highlightId: undefined` correctly.

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/components/reader/FoliateViewer.tsx packages/app/src/components/reader/NotebookPanel.tsx packages/app/src/components/reader/ReaderView.tsx
git commit -m "feat: add CBZ page-level notes and format-aware note UI"
```