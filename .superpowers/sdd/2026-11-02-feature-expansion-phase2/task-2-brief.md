# Task 2: Build PDF text selection layer in FoliateViewer

## Files
- Modify: `packages/app/src/components/reader/FoliateViewer.tsx`

## Context

FoliateViewer.tsx (~3922 lines) renders PDF pages via foliate-js. The PDF viewer uses pdf.js internally: each page gets a `<canvas>` for the image, a `<div class="textLayer">` for text selection (rendered by pdf.js `TextLayer`), and an `<div class="annotationLayer">` for PDF annotations.

The text layer is already rendered with hidden text spans positioned over the canvas using absolute positioning + CSS transforms. Each span represents a text run from pdf.js `getTextContent()`.

Currently, text selection is handled by the browser's native selection on the text layer. However, it doesn't produce quadPoints needed for highlight storage.

## Steps

- [ ] **Step 1: Read the existing PDF rendering and annotation code**

Read FoliateViewer.tsx lines:
- 2070-2115: `doc.load` handler — where per-page setup happens
- 2273-2347: `drawAnnotationHandler` — how highlights are rendered
- 710-761 in ReaderView.tsx — how highlights sync to FoliateViewer

- [ ] **Step 2: Add a `PDFSelectionLayer` component or hook**

Inside FoliateViewer (but outside the main component's return), add a helper that:
1. Attaches to the PDF page's `textLayer` div after `doc.load` fires
2. On `mousedown`: records the start position
3. On `mousemove`: shows a semi-transparent blue selection rectangle
4. On `mouseup`:
   - Gets `ctx.getTextContent()` for the current page
   - Finds text items whose bounding rects intersect the selection rect
   - Computes quadPoints: for each intersected item, the portion of its rect that falls within the selection
   - Collects the text of intersected items in reading order
   - Calls `onSelect({ text, page, quads, rect })` callback

This should be a function `createPdfTextSelector(doc: Document, pageIndex: number, viewport: any, onSelect: (result: PdfSelectionResult) => void)`.

- [ ] **Step 3: Wire the selection to the existing selection flow**

The FoliateViewer already has a `selectionRef` and a `setSelection` callback via ReaderView. For PDF mode, when `onSelect` fires:
1. Set `selectedText` to the extracted text
2. Store `quads` and `page` in a ref for later highlight creation
3. Show the existing highlight color picker toolbar (same as EPUB selection)

- [ ] **Step 4: Handle coordinate conversion**

pdf.js `getTextContent()` returns items with `transform` array (6 numbers). The transform maps from PDF coordinate space to viewport coordinate space. Use the `viewport.transform` from `pdfPage.getViewport({ scale })` to convert quadPoints to PDF page coordinates for storage.

- [ ] **Step 5: Handle multi-column PDFs**

For multi-column PDFs, text items from different columns have non-overlapping X ranges. When intersecting with the selection rectangle, ensure items are sorted by reading order (Y descending within each column, then columns left-to-right).

- [ ] **Step 6: Run tsc and commit**

Verify no new TS errors:
```bash
cd packages/app && npx tsc --noEmit 2>&1 | Select-Object -Last 5
```

```bash
git add packages/app/src/components/reader/FoliateViewer.tsx
git commit -m "feat: add PDF text selection layer with quad-point extraction"
```

## Diagram

```
PDF Page DOM:
┌──────────────────────────────┐
│ <canvas>  (pdf.js rendered)  │
├──────────────────────────────┤
│ <div.textLayer>              │
│   <span style="left:X;top:Y;  │  ← each span = one text run
│     transform:scaleX(...)">  │
│     Hello                     │
│   </span>                     │
│   ...                         │
│ </div>                        │
├──────────────────────────────┤
│ <div class="selectionLayer"> │  ← NEW: our selection overlay
│   (mouse tracking +          │
│    selection rectangle)       │
│ </div>                        │
└──────────────────────────────┘
```