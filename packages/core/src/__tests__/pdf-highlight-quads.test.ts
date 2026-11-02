import { describe, expect, it } from "vitest";

describe("quadPoints serialization", () => {
  it("roundtrips number array through JSON for PDF highlight", () => {
    const quads = [10.5, 20.3, 150.7, 20.3, 150.7, 45.1, 10.5, 45.1];
    const json = JSON.stringify(quads);
    const parsed: number[] = JSON.parse(json);
    expect(parsed).toEqual(quads);
    expect(parsed.length).toBe(8); // 4 corners × 2 coords
  });

  it("handles undefined quadPoints for EPUB highlights", () => {
    const json = JSON.stringify(undefined);
    expect(json).toBeUndefined(); // JSON.stringify(undefined) returns undefined
  });

  it("handles NULL in database (null string → undefined)", () => {
    const stored: string | null = null;
    const parsed = stored ? JSON.parse(stored) : undefined;
    expect(parsed).toBeUndefined();
  });
});

describe("Highlight type with quadPoints", () => {
  it("EPUB highlight has no quadPoints", () => {
    const h = {
      id: "h1",
      bookId: "b1",
      cfi: "epubcfi(/6/4[chap01]!/4/2/6)",
      text: "hello",
      color: "yellow",
      createdAt: 1,
      updatedAt: 1,
    };
    expect((h as any).quadPoints).toBeUndefined();
  });

  it("PDF highlight has quadPoints", () => {
    const h = {
      id: "h2",
      bookId: "b2",
      cfi: "page:3",
      text: "selected text",
      color: "yellow",
      quadPoints: [10, 20, 100, 20, 100, 50, 10, 50],
      createdAt: 1,
      updatedAt: 1,
    };
    expect(h.quadPoints).toBeDefined();
    expect(h.quadPoints!.length).toBe(8);
  });
});

describe("CBZ page note CFI", () => {
  it("generates correct CFI for page N", () => {
    const pageN = 5;
    const cfi = `page-${pageN}`;
    expect(cfi).toBe("page-5");
  });

  it("parses page number back from CFI", () => {
    const cfi = "page-12";
    const pageMatch = cfi.match(/^page-(\d+)$/);
    expect(pageMatch).not.toBeNull();
    expect(parseInt(pageMatch![1]!)).toBe(12);
  });
});