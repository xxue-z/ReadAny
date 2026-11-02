/**
 * PDF highlight geometry helpers.
 *
 * PDF highlights are stored as quad points in PDF page coordinates
 * (`[x1,y1,x2,y2,x3,y3,x4,y4, ...]`, four corners per selected line box).
 * The helpers here convert on-screen rectangles into that space and answer the
 * "is this the same highlight?" question used by the reader.
 */

export interface RectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface QuadBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Convert iframe/CSS-pixel rectangles into PDF-space quads.
 *
 * `scale` is the pdf.js scale factor (`--total-scale-factor`): the viewport
 * transform maps PDF coordinates to CSS pixels via `view = pdf * scale`, so the
 * inverse is a division. Offsets default to 0 (foliate renders pages at the
 * origin); pass `offsetX/offsetY` for translated viewports.
 */
export function cssRectsToPdfQuads(
  rects: RectLike[],
  scale: number,
  offsetX = 0,
  offsetY = 0,
): number[] {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const quads: number[] = [];
  for (const rect of rects) {
    const left = (rect.left - offsetX) / safeScale;
    const top = (rect.top - offsetY) / safeScale;
    const right = (rect.right - offsetX) / safeScale;
    const bottom = (rect.bottom - offsetY) / safeScale;
    if (!Number.isFinite(left) || !Number.isFinite(top)) continue;
    if (!Number.isFinite(right) || !Number.isFinite(bottom)) continue;
    // top-left, top-right, bottom-right, bottom-left
    quads.push(left, top, right, top, right, bottom, left, bottom);
  }
  return quads;
}

/** Axis-aligned bounding box of a quad array (PDF coordinates). */
export function quadsBounds(quads: number[]): QuadBounds | null {
  if (!Array.isArray(quads) || quads.length < 8) return null;
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  for (let i = 0; i + 1 < quads.length; i += 2) {
    const x = quads[i];
    const y = quads[i + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }

  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
  if (!Number.isFinite(right) || !Number.isFinite(bottom)) return null;
  return { left, top, right, bottom };
}

/**
 * Intersection-over-union of the bounding boxes of two quad arrays.
 * Returns 0 when either array is unusable.
 */
export function quadsOverlapRatio(a: number[], b: number[]): number {
  const boxA = quadsBounds(a);
  const boxB = quadsBounds(b);
  if (!boxA || !boxB) return 0;

  const overlapWidth = Math.min(boxA.right, boxB.right) - Math.max(boxA.left, boxB.left);
  const overlapHeight = Math.min(boxA.bottom, boxB.bottom) - Math.max(boxA.top, boxB.top);
  if (overlapWidth <= 0 || overlapHeight <= 0) return 0;

  const overlap = overlapWidth * overlapHeight;
  const areaA = (boxA.right - boxA.left) * (boxA.bottom - boxA.top);
  const areaB = (boxB.right - boxB.left) * (boxB.bottom - boxB.top);
  const union = areaA + areaB - overlap;
  return union > 0 ? overlap / union : 0;
}

export interface PdfHighlightLike {
  quadPoints?: number[];
}

/**
 * Find the highlight on `page` that visually overlaps `quads`.
 *
 * PDF highlights no longer use the CFI alone as identity (every selection on a
 * page shares the same fake page CFI), so callers must match on geometry.
 */
export function findOverlappingPdfHighlight<T extends PdfHighlightLike>(
  highlights: T[],
  page: number,
  quads: number[],
  pageOf: (highlight: T) => number | undefined,
  threshold = 0.3,
): T | undefined {
  if (!quads || quads.length < 8) return undefined;
  for (const highlight of highlights) {
    if (!highlight.quadPoints) continue;
    if (pageOf(highlight) !== page) continue;
    if (quadsOverlapRatio(highlight.quadPoints, quads) >= threshold) return highlight;
  }
  return undefined;
}
