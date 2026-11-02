# Task 2 Report: PDF text selection layer in FoliateViewer

## Summary

Implemented `createPdfTextSelector` function and wired it into the existing selection flow for PDF format in FoliateViewer.

## Changes

### 1. `createPdfTextSelector` function (FoliateViewer.tsx)

Added a new function (~230 lines) that:
- Creates a transparent overlay `div` on each PDF page's `.textLayer`
- Tracks `mousedown`/`mousemove`/`mouseup` for drawing a semi-transparent blue selection rectangle
- On mouseup: iterates all `<span>` elements in the textLayer (excluding `.endOfContent` and `[role="img"]`)
- Finds spans whose bounding rects intersect the selection rectangle
- Computes `quadPoints`: intersection rects between each span and the selection, converted from viewport coordinates to PDF page coordinates using the scale factor from `--total-scale-factor` CSS variable
- Calls `onSelect({ text, page, quads, rect })` callback
- Supports both mouse and touch events
- Returns a cleanup function to remove the overlay

### 2. `BookSelection` extension (FoliateViewer.tsx)

Added two optional fields:
- `quads?: number[]` — quad points in PDF page coordinates for highlight storage
- `pdfPageIndex?: number` — 0-based page index

### 3. PDF-specific `addAnnotation` alternative (FoliateViewer.tsx)

Since the foliate-js fixed-layout renderer does not implement overlayer (`create-overlayer` event is not fired), we cannot use `view.addAnnotation()` for PDF highlights. Instead:

- Added `drawPdfHighlight(highlightId, pageIndex, quads, color)` method to `FoliateViewerHandle`
  - Renders SVG `<rect>` elements directly on the iframe's textLayer
  - Converts quadPoints from PDF coordinates to viewport coordinates using scale factor
  - Maps color names to RGBA values (matching `drawAnnotationHandler`)
  - Tracks elements in a Map for efficient removal

- Added `removePdfHighlight(highlightId, pageIndex)` method to `FoliateViewerHandle`
  - Removes SVG element from the DOM using the tracking map
  - Falls back to DOM query if not found in map

### 4. Wired into doc.load handler (FoliateViewer.tsx)

In `docLoadHandlerImpl`, when `format === "PDF"`:
- Skips the EPUB `attachSelectionListener` (to avoid interference with native browser selection)
- Retrieves scale factor from `--total-scale-factor` CSS variable
- Creates the PDF text selector with a viewport derived from the textLayer dimensions
- On selection, builds a fake CFI (`epubcfi(/6/{(pageIndex+1)*2})`), converts rects to main window coordinates, and calls `onSelection` with a `BookSelection` containing `quads` and `pdfPageIndex`
- Cleans up previous selection handler for the same document

### 5. ReaderView.tsx updates

- `handleHighlight`: Detects PDF selections via `selection.quads` presence, stores `quadPoints` in the highlight, and uses `drawPdfHighlight`/`removePdfHighlight` instead of `addAnnotation`/`deleteAnnotation`
- `handleRemoveHighlight`: Uses `removePdfHighlight` for PDF highlights
- `handleSectionLoad`: Re-renders PDF highlights using `drawPdfHighlight` on section reload
- Highlight sync `useEffect`: Handles both EPUB (CFI-based) and PDF (quad-based) highlights
- Extended `renderedHighlightsRef` type to track `isPdf` and `pdfPageIndex`

### Coordinate Conversion

pdf.js renders text layer with a scale factor (`--total-scale-factor`). The textLayer spans are positioned in viewport (CSS pixel) coordinates. The conversion:
- **Selection → viewport**: span `getBoundingClientRect()` gives viewport coords directly
- **Viewport → PDF**: divide by scale factor (extracted from CSS variable)
- **quadPoints format**: flat array `[x1,y1,x2,y2,x3,y3,x4,y4, ...]` — four corners per quad, in PDF page coordinate space

### TypeScript

No new TS errors. All pre-existing errors are in other files (DocumentWorkspace.tsx, DesktopImportActions.tsx, library-store.ts).

## Architecture Notes

- The foliate-js `FixedLayout` renderer does not support `Overlayer` (no `create-overlayer` event, `getContents()` returns objects without `overlayer`). PDF highlights must be rendered as direct SVG overlays.
- The CFI format for PDF pages is `epubcfi(/6/{(pageIndex+1)*2})` (defined by `CFI.fake.fromIndex` in foliate-js).
- Selection for PDF is entirely custom (not browser native selection) — the `attachSelectionListener` is skipped for PDF format.