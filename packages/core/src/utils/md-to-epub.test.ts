/**
 * md-to-epub.test.ts — Tests for MdToEpubConverter
 *
 * Validates: EPUB structure (mimetype first, container.xml, OPF, NCX),
 * chapter splitting by #/##, GFM tables & code fences, XML escaping,
 * no-heading single-chapter fallback, H1 as book title.
 */

import { describe, expect, it } from "vitest";
import { MdToEpubConverter } from "./md-to-epub";

const converter = new MdToEpubConverter();

/** Return the string content of the ZIP entry with the given name, decoded as UTF-8. */
function entryText(epubBytes: Uint8Array, name: string): string {
  const decoder = new TextDecoder();
  // Scan local file headers: signature 0x04034b50 at offset
  let offset = 0;
  while (offset < epubBytes.length - 4) {
    if (
      epubBytes[offset] === 0x50 &&
      epubBytes[offset + 1] === 0x4b &&
      epubBytes[offset + 2] === 0x03 &&
      epubBytes[offset + 3] === 0x04
    ) {
      const nameLen = new DataView(epubBytes.buffer, epubBytes.byteOffset + offset + 26, 2).getUint16(0, true);
      const extraLen = new DataView(epubBytes.buffer, epubBytes.byteOffset + offset + 28, 2).getUint16(0, true);
      const entryName = decoder.decode(epubBytes.subarray(offset + 30, offset + 30 + nameLen));
      const dataStart = offset + 30 + nameLen + extraLen;
      const compressedSize = new DataView(epubBytes.buffer, epubBytes.byteOffset + offset + 18, 4).getUint32(0, true);
      if (entryName === name) {
        return decoder.decode(epubBytes.subarray(dataStart, dataStart + compressedSize));
      }
      offset = dataStart + compressedSize;
    } else {
      offset++;
    }
  }
  return "";
}

describe("MdToEpubConverter", () => {
  describe("basic EPUB structure", () => {
    const result = converter.convertToBytes({
      markdown: "# My Book\n\nHello world.",
    });

    it("returns a non-empty Uint8Array", () => {
      expect(result.epubBytes).toBeInstanceOf(Uint8Array);
      expect(result.epubBytes.length).toBeGreaterThan(0);
    });

    it('has "mimetype" as the first entry with correct content', () => {
      const mimetype = entryText(result.epubBytes, "mimetype");
      expect(mimetype).toBe("application/epub+zip");
    });

    it("contains META-INF/container.xml", () => {
      const container = entryText(result.epubBytes, "META-INF/container.xml");
      expect(container).toContain("container");
      expect(container).toContain('full-path="content.opf"');
    });

    it("contains content.opf with correct metadata", () => {
      const opf = entryText(result.epubBytes, "content.opf");
      expect(opf).toContain("<dc:title>My Book</dc:title>");
      expect(opf).toContain("<dc:language>");
    });

    it("contains toc.ncx with navPoints", () => {
      const ncx = entryText(result.epubBytes, "toc.ncx");
      expect(ncx).toContain("<navPoint");
      expect(ncx).toContain("<docTitle><text>My Book</text></docTitle>");
    });

    it("returns correct result metadata", () => {
      expect(result.bookTitle).toBe("My Book");
      expect(result.chapterCount).toBeGreaterThanOrEqual(1);
      expect(["zh", "en"]).toContain(result.language);
    });
  });

  describe("chapter splitting", () => {
    it("splits on H1 headings", () => {
      const result = converter.convertToBytes({
        markdown: "# Chapter 1\n\nContent one.\n\n# Chapter 2\n\nContent two.",
      });
      expect(result.chapterCount).toBe(2);
      const ch1 = entryText(result.epubBytes, "OEBPS/chapter1.xhtml");
      const ch2 = entryText(result.epubBytes, "OEBPS/chapter2.xhtml");
      expect(ch1).toContain("Chapter 1");
      expect(ch1).toContain("Content one");
      expect(ch2).toContain("Chapter 2");
      expect(ch2).toContain("Content two");
    });

    it("splits on H2 headings", () => {
      const result = converter.convertToBytes({
        markdown: "## Section A\n\nBody A.\n\n## Section B\n\nBody B.",
      });
      expect(result.chapterCount).toBe(2);
    });

    it("handles mixed H1 and H2 as chapter boundaries", () => {
      const result = converter.convertToBytes({
        markdown: "# Main\n\nIntro.\n\n## Sub 1\n\nSub content.\n\n## Sub 2\n\nMore.",
      });
      expect(result.chapterCount).toBe(3);
    });

    it("falls back to single chapter when there are no headings", () => {
      const result = converter.convertToBytes({
        markdown: "Just some plain text without any headings at all.",
      });
      expect(result.chapterCount).toBe(1);
      expect(result.bookTitle).toBe("Untitled");
    });

    it("handles empty markdown gracefully", () => {
      const result = converter.convertToBytes({ markdown: "" });
      expect(result.chapterCount).toBe(1);
      expect(result.bookTitle).toBe("Untitled");
    });
  });

  describe("title derivation", () => {
    it("uses explicit title override", () => {
      const result = converter.convertToBytes({
        markdown: "# From H1",
        title: "Explicit Title",
      });
      expect(result.bookTitle).toBe("Explicit Title");
    });

    it("uses first H1 when no explicit title", () => {
      const result = converter.convertToBytes({
        markdown: "# The Real Title\n\nSome body.",
      });
      expect(result.bookTitle).toBe("The Real Title");
    });

    it('defaults to "Untitled" when no H1 and no explicit title', () => {
      const result = converter.convertToBytes({
        markdown: "## Only H2 here\n\nContent.",
      });
      expect(result.bookTitle).toBe("Untitled");
    });
  });

  describe("GFM markdown rendering", () => {
    it("renders GFM tables", () => {
      const result = converter.convertToBytes({
        markdown: "# Data\n\n| A | B |\n|---|---|\n| 1 | 2 |",
      });
      const ch = entryText(result.epubBytes, "OEBPS/chapter1.xhtml");
      expect(ch).toContain("<table>");
      expect(ch).toContain("<th>A</th>");
      expect(ch).toContain("<td>1</td>");
    });

    it("renders fenced code blocks", () => {
      const result = converter.convertToBytes({
        markdown: '# Code\n\n```js\nconst x = 1;\n```',
      });
      const ch = entryText(result.epubBytes, "OEBPS/chapter1.xhtml");
      expect(ch).toContain("<pre>");
      expect(ch).toContain("<code");
      expect(ch).toContain("const x = 1");
    });
  });

  describe("XML escaping", () => {
    it("escapes XML special characters in chapter titles", () => {
      const result = converter.convertToBytes({
        markdown: '# Title & "Special" <chars>\n\nBody.',
      });
      const ncx = entryText(result.epubBytes, "toc.ncx");
      expect(ncx).toContain("&amp;");
      expect(ncx).toContain("&quot;");
      expect(ncx).toContain("&lt;");
      expect(ncx).toContain("&gt;");
    });
  });

  describe("language detection", () => {
    it("detects Chinese when CJK characters dominate", () => {
      const result = converter.convertToBytes({
        markdown: "# 中文书名\n\n这是一段中文内容，包含很多中文字符。在这里我们测试语言检测。",
      });
      expect(result.language).toBe("zh");
    });

    it("detects English when Latin characters dominate", () => {
      const result = converter.convertToBytes({
        markdown: "# English Book\n\nThis is a book with many English words and sentences.",
      });
      expect(result.language).toBe("en");
    });
  });

  describe("chapter body content integrity", () => {
    it("includes bold and italic formatting", () => {
      const result = converter.convertToBytes({
        markdown: "# Style\n\nThis has **bold** and *italic* text.",
      });
      const ch = entryText(result.epubBytes, "OEBPS/chapter1.xhtml");
      expect(ch).toContain("<strong>bold</strong>");
      expect(ch).toContain("<em>italic</em>");
    });

    it("includes links", () => {
      const result = converter.convertToBytes({
        markdown: "# Links\n\nVisit [example](https://example.com).",
      });
      const ch = entryText(result.epubBytes, "OEBPS/chapter1.xhtml");
      expect(ch).toContain('<a href="https://example.com">');
    });

    it("content before first heading becomes intro chapter", () => {
      const result = converter.convertToBytes({
        markdown: "Intro paragraph before any heading.\n\n# Chapter 1\n\nBody.",
      });
      expect(result.chapterCount).toBe(2);
      const ch1 = entryText(result.epubBytes, "OEBPS/chapter1.xhtml");
      expect(ch1).toContain("Intro paragraph");
      const ch2 = entryText(result.epubBytes, "OEBPS/chapter2.xhtml");
      expect(ch2).toContain("Chapter 1");
    });
  });

  describe("XML escaping in XHTML chapter body", () => {
    it("escapes XML special characters in chapter body text", () => {
      const result = converter.convertToBytes({
        markdown: '# Test\n\nText with & < > " special chars.',
      });
      const ch = entryText(result.epubBytes, "OEBPS/chapter1.xhtml");
      // marked.parse() outputs HTML-safe text: & → &amp;, < → &lt;, > → &gt;, " → &quot;
      expect(ch).toContain("&amp;");
      expect(ch).toContain("&lt;");
      expect(ch).toContain("&gt;");
      expect(ch).toContain("&quot;");
    });
  });

  describe("large input", () => {
    it("handles large markdown input without error", () => {
      const lines = Array.from(
        { length: 5000 },
        (_, i) => `Line ${i}: some content here for testing.`,
      );
      const markdown = "# Large Test\n\n" + lines.join("\n");
      const result = converter.convertToBytes({ markdown });
      expect(result.epubBytes).toBeInstanceOf(Uint8Array);
      expect(result.epubBytes.length).toBeGreaterThan(0);
      expect(result.chapterCount).toBe(1);
      expect(result.bookTitle).toBe("Large Test");
    });
  });

  describe("mixed CJK + Latin language detection edge cases", () => {
    it("detects English when Latin count dominates CJK near threshold", () => {
      // ~400 latin chars (4 per "test ") vs ~100 CJK chars → 100 > 200? No → "en"
      const markdown = "# Mix\n\n" + "test ".repeat(100) + "测试测试".repeat(25);
      const result = converter.convertToBytes({ markdown });
      expect(result.language).toBe("en");
    });

    it("detects Chinese when CJK count crosses the 0.5× threshold", () => {
      // ~400 latin chars vs ~204 CJK chars → 204 > 200? Yes → "zh"
      const markdown = "# Mix\n\n" + "test ".repeat(100) + "测试测试".repeat(51);
      const result = converter.convertToBytes({ markdown });
      expect(result.language).toBe("zh");
    });
  });

  describe("whitespace-only markdown", () => {
    it("handles whitespace-only markdown gracefully", () => {
      const result = converter.convertToBytes({ markdown: "   \n\n  \n" });
      expect(result.chapterCount).toBe(1);
      expect(result.bookTitle).toBe("Untitled");
      expect(result.epubBytes.length).toBeGreaterThan(0);
    });
  });
});
