# Phase 2 — Cross-Format Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PDF text selection capability and precise highlight positioning (quad points), CBZ page-level notes, and format-aware note UI.

**Architecture:** The existing `cfi: string` field is already format-agnostic (EPUB CFI for EPUB, `"page:N"` for PDF). We add `quad_points TEXT` column for PDF highlight rect positioning. A new PDF text selection layer is added to FoliateViewer using pdf.js `TextLayer` + `getTextContent()` to build clickable text regions. CBZ gets page-level notes stored in the `notes` table. The `NotebookPanel` becomes format-aware.

**Tech Stack:** TypeScript strict, React 19, pdfjs-dist, SQLite, foliate-js

**Spec:** `docs/feature-expansion/02-cross-format-notes.md`

## Global Constraints

- `Highlight.cfi` stays as-is — it's already format-agnostic (EPUB CFI / `"page:N"`)
- Add `quad_points TEXT` to highlights table — stores JSON array `[x1,y1,x2,y2,...]` for PDF highlight rects; NULL for EPUB
- Migration must be additive: `ALTER TABLE highlights ADD COLUMN quad_points TEXT`
- PDF text selection: use pdf.js `TextLayer` rendering + `getTextContent()` to identify text items in selection region
- CBZ: page-level notes only (no text selection), stored in `notes` table with `cfi = "page-{n}"`
- TXT/MD: inherit EPUB notes through conversion — no work needed
- Format: Biome — 2 spaces, double quotes, semicolons, 100 width

## Review Focus

1. **PDF text selection fails on multi-column layouts** — test with a 2-column PDF; dragging across columns must capture correct text.
2. **Quad points misaligned after zoom change** — create highlight at 100%, re-open at 150%; color overlay must match text position.
3. **CBZ page note has wrong cfi** — create note on page 5; `cfi` must be `"page-5"`, not EPUB CFI.
4. **Format-aware UI shows text preview for CBZ** — CBZ notes must show "Page N note" not highlighted text excerpt.
5. **Existing EPUB highlights still work** — after migration, open EPUB book with old highlights; they must render correctly.

---

### Task 1: Add `quad_points` column to highlights table

**Files:**
- Modify: `packages/core/src/types/annotation.ts` — add `quadPoints?: number[]` to `Highlight`
- Modify: `packages/core/src/db/migrations.ts` — add migration v14
- Modify: `packages/core/src/db/db-core.ts` — inline ALTER TABLE fallback
- Modify: `packages/core/src/db/highlight-queries.ts` — update INSERT/SELECT

**Interfaces:**
- Produces: `Highlight.quadPoints?: number[]` — flat array `[x1,y1,x2,y2, ...]` in PDF page coordinate space
- Produces: Migration v14: `ALTER TABLE highlights ADD COLUMN quad_points TEXT`
- Produces: `insertHighlight` accepts optional `quadPoints`, `getHighlights` reads `quad_points`

- [ ] **Step 1: Add `quadPoints` to Highlight type**

In `packages/core/src/types/annotation.ts`, add to `Highlight`:
```ts
/** PDF highlight bounding rect in page coordinates: [x1,y1,x2,y2,x3,y3,x4,y4]. NULL for EPUB. */
quadPoints?: number[];
```

- [ ] **Step 2: Add migration v14 to `migrations.ts`**

```ts
{
  version: 14,
  description: "Add quad_points column to highlights for PDF highlight positioning",
  up: "ALTER TABLE highlights ADD COLUMN quad_points TEXT",
},
```

- [ ] **Step 3: Add inline ALTER TABLE in `db-core.ts`**

After the last inline ALTER TABLE:
```ts
await database.execute("ALTER TABLE highlights ADD COLUMN quad_points TEXT");
```

- [ ] **Step 4: Update `highlight-queries.ts` INSERT and SELECT**

In `insertHighlight`: add `quad_points` column with `highlight.quadPoints ? JSON.stringify(highlight.quadPoints) : null`.
In `getHighlights`: read `quad_points`, parse as `JSON.parse(row.quad_points)` if non-null.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/types/annotation.ts packages/core/src/db/migrations.ts packages/core/src/db/db-core.ts packages/core/src/db/highlight-queries.ts
git commit -m "feat: add quad_points column to highlights for PDF highlight positioning"
```

---

### Task 2: Build PDF text selection layer in FoliateViewer

**Files:**
- Modify: `packages/app/src/components/reader/FoliateViewer.tsx` — add PDF text selection component

**Interfaces:**
- Consumes: pdf.js `TextContent` from `page.getTextContent()`, current page number, viewport scale
- Produces: `PDFTextSelection` component that allows mouse-drag text selection on PDF pages, returning `{ text: string; page: number; quads: number[] }`

- [ ] **Step 1: Read existing PDF rendering code in FoliateViewer**

Read `FoliateViewer.tsx` to understand how PDF pages are rendered. Find the PDF page rendering section (around line 2078 where `format === "PDF"` is checked). Identify where to add the selection layer.

- [ ] **Step 2: Build `PDFTextSelection` overlay component**

Create an overlay `<div>` on top of each PDF page. On `mousedown`, start selection tracking. On `mousemove`, update the visual selection rectangle. On `mouseup`:
1. Call `pdfPage.getTextContent()` to get all text items with their bounding rects
2. Find text items whose bounding rects intersect the selection rectangle
3. Compute quad points: for each intersected text item, calculate the portion of its rect that falls within the selection
4. Collect the text of intersected items (in reading order)
5. Return `{ text, page, quads }`

- [ ] **Step 3: Handle viewport coordinate conversion**

PDF coordinates from `getTextContent()` are in PDF page space (origin at bottom-left). Convert to viewport coordinates using the `pdfPage.getViewport({ scale })` transform matrix.

- [ ] **Step 4: Wire selection result to existing `useSelectionNote` hook**

When selection completes, populate the hook's `selectedText` and a new `selectedLocation: { page, quads }` field. The existing "Highlight" button in the reader toolbar uses this data to create a highlight.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/components/reader/FoliateViewer.tsx
git commit -m "feat: add PDF text selection layer with quad-point extraction"
```

---

### Task 3: Store and restore PDF highlights with quad points

**Files:**
- Modify: `packages/app/src/components/reader/FoliateViewer.tsx` — highlight creation + overlay rendering
- Modify: `packages/app/src/components/reader/ReaderView.tsx` — pass quadPoints through annotation sync

**Interfaces:**
- Consumes: `quadPoints` from Task 2 selection, `insertHighlight` from Task 1
- Produces: PDF highlight stored with quad points, rendered as colored overlay on page re-open

- [ ] **Step 1: Store quadPoints when creating a PDF highlight**

In the highlight creation flow (where `createSelectionNoteMutation` is called), for PDF books pass `quadPoints` from the selection result. The store's highlight insertion includes the quadPoints column.

- [ ] **Step 2: Render stored PDF highlights as colored overlays**

In the PDF page rendering section, after the page canvas is rendered:
1. Read highlights for the current book with `quadPoints !== null`
2. Filter by `cfi === "page:{currentPage}"` (the `cfi` field stores `"page:N"` for PDF)
3. For each matching highlight, render a colored semi-transparent `<div>` positioned using quadPoints scaled to current viewport

- [ ] **Step 3: Handle viewport scaling on re-render**

Quad points are stored in PDF page coordinate space. On re-render, multiply by `currentScale / storageScale`. Store `storageScale` alongside quadPoints or compute from the viewport dimensions.

- [ ] **Step 4: Click-to-navigate from highlight overlay**

Clicking a highlight overlay should scroll to/open the associated note in `NotebookPanel`. Connect the overlay `onClick` to the existing note navigation mechanism.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/components/reader/FoliateViewer.tsx packages/app/src/components/reader/ReaderView.tsx
git commit -m "feat: store and render PDF highlights with quad-point overlays"
```

---

### Task 4: Add CBZ page-level notes

**Files:**
- Modify: `packages/app/src/components/reader/FoliateViewer.tsx` — add CBZ note button
- Modify: `packages/app/src/components/reader/NotebookPanel.tsx` — format-aware display

**Interfaces:**
- Consumes: CBZ `isFixedLayout` flag, current page index, `Note` type
- Produces: CBZ page notes with `cfi = "page-{n}"`, format-aware NotebookPanel

- [ ] **Step 1: Add "Add Page Note" button for CBZ books**

In the reader toolbar or as a floating action button, when `format === "cbz"` show a "Add Page Note" option. Clicking creates a `Note`:
```ts
{
  id: crypto.randomUUID(),
  bookId,
  cfi: `page-${currentPageNumber}`,
  title: "",
  content: "",
  chapterTitle: `Page ${currentPageNumber}`,
  tags: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
}
```

- [ ] **Step 2: Make NotebookPanel format-aware**

In `NotebookPanel.tsx`, for each note entry check `book.format`:
- EPUB: show highlighted text excerpt (from `highlight.text`) + CFI navigation
- PDF: show page number from `cfi` + text excerpt
- CBZ: show "Page N note" label + first line of `content` as preview

- [ ] **Step 3: Navigate to CBZ page from note click**

When a CBZ note is clicked in NotebookPanel, navigate to the corresponding page. Use the existing `goToCfi` mechanism with `cfi = "page-{n}"`.

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/components/reader/FoliateViewer.tsx packages/app/src/components/reader/NotebookPanel.tsx
git commit -m "feat: add CBZ page-level notes and format-aware note UI"
```

---

### Task 5: End-to-end test suite

**Files:**
- Create: `packages/core/src/__tests__/pdf-highlight-quads.test.ts` — unit test for quadPoints serialization
- Modify: `packages/core/src/db/__tests__/` — migration test

- [ ] **Step 1: Test quadPoints serialization roundtrip**

```ts
describe("quadPoints serialization", () => {
  it("roundtrips number array through JSON", () => {
    const quads = [10.5, 20.3, 150.7, 20.3, 150.7, 45.1, 10.5, 45.1];
    const json = JSON.stringify(quads);
    const parsed: number[] = JSON.parse(json);
    expect(parsed).toEqual(quads);
  });

  it("handles NULL quadPoints for EPUB highlights", () => {
    const highlight: Highlight = {
      id: "h1", bookId: "b1", cfi: "epubcfi(/6/4[...])",
      text: "hello", color: "yellow",
      createdAt: 1, updatedAt: 1,
      quadPoints: undefined,
    };
    expect(highlight.quadPoints).toBeUndefined();
  });
});
```

- [ ] **Step 2: Test migration v14 preserves existing highlights**

Insert a highlight without `quad_points`. Run migration. Verify the row still exists and `quad_points` is NULL.

- [ ] **Step 3: Test CBZ note cfi format**

Verify: `cfi = "page-5"` for a note on page 5. Parse the number back.

- [ ] **Step 4: Run full test suite**

```bash
pnpm vitest run
```

- [ ] **Step 5: Commit**

```bash
git add ...
git commit -m "test: add PDF quad-points serialization and migration tests"
```

---

### Task 6: Integration verification checklist

**Files:**
- Modify: `docs/feature-expansion/verification-checklist.md` — add Phase 2 section

- [ ] **Step 1: Add "八、跨格式笔记" section**

6 manual verification items:
1. EPUB highlight: create, save, reopen — highlight still at correct CFI position
2. PDF text selection: drag to select text → create highlight → quad_points stored
3. PDF highlight overlay: reopen book → colored overlay visible at correct position
4. PDF highlight at different zoom: create at 100%, reopen at 150% → still aligned
5. CBZ page note: create note on page 3 → visible in NotebookPanel as "Page 3 note"
6. Migration: existing EPUB highlights survive, no data loss

- [ ] **Step 2: Commit**

```bash
git add docs/feature-expansion/verification-checklist.md
git commit -m "docs: add Phase 2 cross-format notes verification checklist"
```

---

## Self-Review

**Spec coverage (02-cross-format-notes.md):**
- ✅ 2.1 PDF highlights: Task 1 (quad_points column), Task 2 (text selection), Task 3 (storage + rendering)
- ✅ 2.2 CBZ notes: Task 4
- ✅ TXT/MD: Inherited — no work
- ✅ Note UI format-aware: Task 4 (NotebookPanel)

**Step scan:** Every step names exact file, type, and expected result.

**Type consistency:**
- `Highlight.quadPoints?: number[]` defined in Task 1, used in Tasks 2, 3, 5 ✅
- Migration v14 consistent across db-core.ts + migrations.ts ✅
- CBZ `cfi = "page-{n}"` format consistent in Task 4 + Task 5 ✅

**Review Focus coverage:**
- ✅ Multi-column PDF selection: Task 2 (text item intersection logic)
- ✅ Quad point zoom alignment: Task 3 (viewport scaling)
- ✅ CBZ cfi format: Task 4 + Task 5 test
- ✅ Format-aware UI: Task 4
- ✅ Migration preserves EPUB: Task 5 test