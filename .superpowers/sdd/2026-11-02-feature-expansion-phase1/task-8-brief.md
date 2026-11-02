# Task 8: End-to-end test suite enhancement

## Files

- Modify: `packages/core/src/utils/md-to-epub.test.ts` (enhance existing)

The existing test file already covers: EPUB structure, chapter splitting, GFM tables/code fences, XML escaping (NCX), language detection, title derivation.

## Steps

- [ ] **Step 1: Add test for XML escaping in XHTML chapter body (not just NCX)**

Current tests only verify NCX escaping. Add a test that verifies `& < > "` in chapter **body text** are properly escaped in the XHTML output:

```ts
it("escapes XML special characters in chapter body", () => {
  const result = converter.convertToBytes({
    markdown: '# Test\n\nText with & < > " special chars.',
  });
  const ch = entryText(result.epubBytes, "OEBPS/chapter1.xhtml");
  expect(ch).toContain("&amp;");
  expect(ch).toContain("&lt;");
  expect(ch).toContain("&gt;");
  expect(ch).toContain("&quot;");
});
```

Note: `marked.parse()` may or may not escape these characters in the HTML body. If `marked` already produces `&amp;` etc. in its HTML output, the test should verify that the final XHTML contains them. Check the actual behavior first.

- [ ] **Step 2: Add test for large markdown input**

Generate ~5000 lines of markdown and verify `convertToBytes` completes without error and produces valid EPUB:

```ts
it("handles large markdown input without error", () => {
  const lines = Array.from({ length: 5000 }, (_, i) => `Line ${i}: some content here for testing.`);
  const markdown = "# Large Test\n\n" + lines.join("\n");
  const result = converter.convertToBytes({ markdown });
  expect(result.epubBytes).toBeInstanceOf(Uint8Array);
  expect(result.epubBytes.length).toBeGreaterThan(0);
  expect(result.chapterCount).toBe(1); // single H1 heading
  expect(result.bookTitle).toBe("Large Test");
});
```

- [ ] **Step 3: Add test for mixed CJK + Latin language detection edge case**

Test near the threshold where CJK count is ~50% of latin count:

```ts
it("detects English when Latin slightly dominates CJK", () => {
  const markdown = "# Mix\n\n" + "test ".repeat(100) + "测试".repeat(25); // ~100 latin words vs ~50 CJK chars
  const result = converter.convertToBytes({ markdown });
  expect(result.language).toBe("en");
});

it("detects Chinese when CJK count crosses threshold", () => {
  const markdown = "# Mix\n\n" + "test ".repeat(100) + "测试测试".repeat(26); // ~100 latin vs ~52 CJK chars (>0.5)
  const result = converter.convertToBytes({ markdown });
  expect(result.language).toBe("zh");
});
```

- [ ] **Step 4: Add test for empty file (0 bytes)**

From test-cases-phase1.md:

```ts
it("handles whitespace-only markdown", () => {
  const result = converter.convertToBytes({ markdown: "   \n\n  \n" });
  expect(result.chapterCount).toBe(1);
  expect(result.bookTitle).toBe("Untitled");
  expect(result.epubBytes.length).toBeGreaterThan(0);
});
```

- [ ] **Step 5: Run all tests**

```bash
pnpm vitest run packages/core/src/utils/md-to-epub.test.ts
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/utils/md-to-epub.test.ts
git commit -m "test: enhance md-to-epub tests covering edge cases and test-cases-phase1 scenarios"
```