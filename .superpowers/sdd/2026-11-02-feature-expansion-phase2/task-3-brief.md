# Task 3: Store and restore PDF highlights with quad points

## Files
- Modify: `packages/app/src/components/reader/FoliateViewer.tsx` — highlight creation + overlay rendering
- Modify: `packages/app/src/components/reader/ReaderView.tsx` — pass quadPoints through annotation sync

## Context

Task 2 already added PDF text selection producing `{ text, page, quads }`. Task 1 already added `quadPoints?: number[]` to the Highlight type. This task connects the two: stores quadPoints when creating a PDF highlight, and renders stored quadPoints as colored overlays on page re-open.

## Steps

- [ ] **Step 1: Store quadPoints on highlight creation for PDF books**

In the highlight creation flow (where `addHighlight` is called), when `format === "PDF"` and we have quads from Task 2's selection:
```ts
const highlight: Highlight = {
  ...existingFields,
  cfi: `page:${pageNumber}`,
  quadPoints: quads, // from Task 2 selection result
};
```
Then insert via the store's highlight creation method.

- [ ] **Step 2: Read and render PDF highlight overlays**

In `FoliateViewer.tsx`, in the `doc.load` handler (where per-page setup happens at line ~2070), after the PDF theme filter:
1. Read highlights for current book from store
2. Filter by `h.quadPoints != null` (PDF highlights only)
3. Filter by cfi matching current page: `h.cfi === "page:{n}"` or `h.cfi?.startsWith("page:")`
4. For each matching highlight, render an absolutely-positioned `<div>` overlay on the PDF page:
   - Position: use quadPoints bounding rect (min X, min Y, max X, max Y)
   - Size: width = maxX - minX, height = maxY - minY
   - Color: semi-transparent from highlight.color
   - zIndex: above canvas, below text layer
   - onClick: open associated note in NotebookPanel

- [ ] **Step 3: Convert stored quadPoints to viewport coordinates**

QuadPoints are stored in PDF page coordinate space (bottom-left origin). When rendering on screen, convert to CSS pixel coordinates using the current viewport scale factor. Use `pdfPage.getViewport({ scale: currentScale })` to get the transform.

- [ ] **Step 4: Wire click-to-navigate from overlay**

Clicking a PDF highlight overlay should open the `NotebookPanel` and scroll to that highlight's note. Use the existing `onAnnotationClick` or `setActiveAnnotation` callback.

- [ ] **Step 5: Clean up overlays on page change**

When the page changes (new `doc.load` event), remove all highlight overlays from the previous page before adding new ones.

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/components/reader/FoliateViewer.tsx packages/app/src/components/reader/ReaderView.tsx
git commit -m "feat: store and render PDF highlights with quad-point overlays"
```