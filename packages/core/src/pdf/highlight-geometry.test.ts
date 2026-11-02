import { describe, expect, it } from "vitest";
import {
  cssRectsToPdfQuads,
  findOverlappingPdfHighlight,
  quadsBounds,
  quadsOverlapRatio,
} from "./highlight-geometry";

describe("cssRectsToPdfQuads", () => {
  it("converts CSS pixels to PDF coordinates using the scale factor", () => {
    const quads = cssRectsToPdfQuads([{ left: 10, top: 20, right: 110, bottom: 40 }], 2);
    expect(quads).toEqual([5, 10, 55, 10, 55, 20, 5, 20]);
  });

  it("keeps one quad per selected line", () => {
    const quads = cssRectsToPdfQuads(
      [
        { left: 0, top: 0, right: 100, bottom: 10 },
        { left: 0, top: 12, right: 80, bottom: 22 },
      ],
      1,
    );
    expect(quads).toHaveLength(16);
  });

  it("falls back to scale 1 for invalid scales", () => {
    const rect = { left: 4, top: 6, right: 8, bottom: 10 };
    expect(cssRectsToPdfQuads([rect], 0)).toEqual([4, 6, 8, 6, 8, 10, 4, 10]);
    expect(cssRectsToPdfQuads([rect], Number.NaN)).toEqual([4, 6, 8, 6, 8, 10, 4, 10]);
  });

  it("skips non-finite rectangles instead of emitting Infinity", () => {
    const quads = cssRectsToPdfQuads([{ left: Number.NaN, top: 0, right: 10, bottom: 10 }], 1);
    expect(quads).toEqual([]);
  });
});

describe("quadsBounds", () => {
  it("returns the bounding box of multiple quads", () => {
    const bounds = quadsBounds([0, 0, 10, 0, 10, 10, 0, 10, 20, 30, 40, 30, 40, 50, 20, 50]);
    expect(bounds).toEqual({ left: 0, top: 0, right: 40, bottom: 50 });
  });

  it("returns null for unusable input", () => {
    expect(quadsBounds([])).toBeNull();
    expect(quadsBounds([1, 2, 3])).toBeNull();
  });
});

describe("quadsOverlapRatio", () => {
  const base = [0, 0, 10, 0, 10, 10, 0, 10];

  it("is 1 for identical quads", () => {
    expect(quadsOverlapRatio(base, base)).toBeCloseTo(1);
  });

  it("is 0 for disjoint quads", () => {
    expect(quadsOverlapRatio(base, [20, 20, 30, 20, 30, 30, 20, 30])).toBe(0);
  });

  it("is between 0 and 1 for partial overlap", () => {
    const ratio = quadsOverlapRatio(base, [5, 5, 15, 5, 15, 15, 5, 15]);
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThan(1);
  });
});

describe("findOverlappingPdfHighlight", () => {
  const pageOf = (h: { quadPoints?: number[]; page?: number }) => h.page;
  const highlights = [
    { id: "a", page: 0, quadPoints: [0, 0, 10, 0, 10, 10, 0, 10] },
    { id: "b", page: 1, quadPoints: [0, 0, 10, 0, 10, 10, 0, 10] },
  ];

  it("matches a highlight on the same page and position", () => {
    const found = findOverlappingPdfHighlight(highlights, 0, [0, 0, 10, 0, 10, 10, 0, 10], pageOf);
    expect(found?.id).toBe("a");
  });

  it("does not match a highlight on another page", () => {
    const found = findOverlappingPdfHighlight(highlights, 2, [0, 0, 10, 0, 10, 10, 0, 10], pageOf);
    expect(found).toBeUndefined();
  });

  it("does not match a distant selection on the same page", () => {
    const found = findOverlappingPdfHighlight(
      highlights,
      0,
      [100, 100, 110, 100, 110, 110, 100, 110],
      pageOf,
    );
    expect(found).toBeUndefined();
  });
});
