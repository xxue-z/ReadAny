# Task 2 Review: PDF text selection layer in FoliateViewer

## Verdict: ✅ APPROVED

All 6 checklist items pass. No blocking issues found.

---

## Checklist Results

### 1. ✅ PDF text selection layer created that tracks mouse events on textLayer

`createPdfTextSelector` (line 293) creates a `readany-pdf-selection-layer` overlay div positioned absolutely over the `.textLayer`. It handles:
- `mousedown`: Records start position, skips clicks on annotationLayer links
- `mousemove`: Updates selection rectangle (semi-transparent blue, `rgba(59, 130, 246, 0.2)`)
- `mouseup`: Computes intersection, extracts text + quadPoints
- Touch events (`touchstart`/`touchmove`/`touchend`) for mobile support
- Minimum selection size guard (3px) to avoid accidental taps
- Appended via `requestAnimationFrame` to ensure textLayer is positioned

Cleanup correctly removes all listeners and the overlay element.

### 2. ✅ QuadPoints extracted from intersecting textLayer span elements

The implementation queries `textLayer.querySelectorAll("span:not(.endOfContent):not([role='img'])")` (line 397) — this is a pragmatic deviation from the brief's suggestion of `getTextContent()`. The span-based approach works because pdf.js's TextLayer renders precisely-positioned spans. Each span's `getBoundingClientRect()` gives accurate viewport coordinates.

Intersection is computed in textLayer-relative coordinates (lines 416-439), and quadPoints are calculated as `[left, top, right, top, right, bottom, left, bottom]` for each matched span (lines 458-468).

Reading order sorting: `centerY` then `left` (line 445), which handles multi-column PDFs correctly — spans in the same visual line have similar `centerY` values, then are sorted left-to-right.

### 3. ✅ Coordinate conversion from viewport to PDF page space

The viewport → PDF conversion (lines 470-480) correctly inverts the pdf.js transform:
- Viewport transform is `[scaleX, skewY, skewX, scaleY, translateX, translateY]`
- Inverse: `(vx - translateX) / scaleX` and `(vy - translateY) / scaleY`
- This assumes no skew (skewY=skewX=0), which is valid for the standard scale+translate transform used by pdf.js

The viewport is constructed from the iframe's `--total-scale-factor` CSS variable (line 2501), and the transform is `[scale, 0, 0, scale, 0, 0]` (line 2509), which correctly models the standard pdf.js viewport.

### 4. ✅ Query result type correctly defined ({ text, page, quads, rect })

```typescript
export interface PdfSelectionResult {
  text: string;
  page: number;       // 0-based page index
  quads: number[];    // [x1,y1,x2,y2,x3,y3,x4,y4, ...] in PDF coordinates
  rect: DOMRect;      // selection bounding rect in viewport coordinates
}
```

The `BookSelection` interface (line 1023) was extended with two optional fields:
- `quads?: number[]` — PDF quad points for highlight storage
- `pdfPageIndex?: number` — 0-based page index

Both are typed correctly and used consistently throughout the codebase.

### 5. ✅ Wired to existing selection flow (BookSelection)

**In FoliateViewer** (line 2516-2560):
- Created in `docLoadHandlerImpl` for `format === "PDF"`
- EPUB's `attachSelectionListener` skipped for PDF (line 2476)
- Builds a fake CFI: `epubcfi(/6/{(pageIndex+1)*2})`
- Converts rects to main-window coordinates via iframe scaling
- Calls `onSelectionRef.current(bookSelection)` with `quads` and `pdfPageIndex`

**In ReaderView**:
- `handleHighlight` (line 1624): Detects PDF via `selection.quads` presence, stores `quadPoints` in the highlight, calls `drawPdfHighlight`/`removePdfHighlight`
- `handleRemoveHighlight` (line 1744): Correctly calls `removePdfHighlight` for PDF
- `handleSectionLoad` (line 1417): Re-renders PDF highlights via `drawPdfHighlight`
- `renderedHighlightsRef` extended with `isPdf` and `pdfPageIndex` fields
- Highlight sync `useEffect` (line 720): Handles both EPUB and PDF highlight paths

**PDF highlight rendering** (line 2293):
- `drawPdfHighlight`: Renders SVG `<rect>` elements directly on the iframe's textLayer
- Converts quadPoints from PDF → viewport coordinates via scale factor
- Maps color names to RGBA, matches `drawAnnotationHandler` colors
- Tracks elements in `pdfHighlightElementsRef` Map for efficient removal
- `removePdfHighlight`: Removes SVG via tracking map, falls back to DOM query

Architecture note: foliate-js `FixedLayout` renderer does not support `Overlayer`, so direct SVG overlays are the correct approach.

### 6. ✅ No TS errors

TypeScript compilation output (from running `npx tsc --noEmit`):
```
src/components/editor/DocumentWorkspace.tsx     — 4 errors (pre-existing)
src/components/home/DesktopImportActions.tsx    — 2 errors (pre-existing)
src/stores/library-store.ts                     — 2 errors (pre-existing)
```
**Zero new errors in FoliateViewer.tsx or ReaderView.tsx.** All errors are in unrelated files.

---

## Minor Observations (Non-Blocking)

### O1. CFI parsing is duplicated
The CFI-to-pageIndex parsing (`match = h.cfi.match(/\/6\/(\d+)/)`) appears in 3 places:
- ReaderView.tsx line 746 (highlight sync useEffect)
- ReaderView.tsx line 1441 (handleSectionLoad)
- ReaderView.tsx line 1466 (handleSectionLoad, same function)

Could be extracted to a small helper, e.g. `parsePdfCfiToPageIndex(cfi: string): number | undefined`.

### O2. HandleShowAnnotation for existing PDF highlights
The `show-annotation` event from foliate-js relies on DOM `Range` objects created by browser selection. When a user clicks on an SVG-based PDF highlight, there is no browser range, so the existing `handleShowAnnotation` callback in ReaderView (line 1766) would not fire for PDF highlights. This means clicking on existing PDF highlights may not show the annotation popover (copy/delete/color toolbar). This is outside Task 2's scope (which covers selection, not annotation click), but should be tracked as a follow-up.

### O3. Text joining uses simple space concatenation
Line 448: `matchedItems.map((item) => item.text).join(" ")` joins all matched spans with spaces, then collapses whitespace. This works for most cases but may insert spaces where none exist (e.g., within words split across spans in some PDFs). The `textContent` property on each span already contains proper text, so the concatenation is reasonable.

---

## Summary

| Criterion | Status |
|-----------|--------|
| PDF selection layer with mouse tracking | ✅ |
| QuadPoints from textLayer spans | ✅ |
| Viewport → PDF coordinate conversion | ✅ |
| Correct result type definition | ✅ |
| Wired to BookSelection flow | ✅ |
| No new TS errors | ✅ |

The implementation is complete, well-structured, and correctly handles the edge cases (minimum selection size, annotation layer clicks, touch events, cleanup on unmount, highlight re-rendering on section change). The deviation from `getTextContent()` to DOM span querying is a pragmatic and correct choice given that pdf.js's TextLayer API is internal.