### Review Package — Task 8
BASE: e974164d
HEAD: 5fc80bb0
---
5fc80bb0 test: enhance md-to-epub tests covering edge cases and test-cases-phase1 scenarios
---
 packages/core/src/utils/md-to-epub.test.ts | 54 ++++++++++++++++++++++++++++++
 1 file changed, 54 insertions(+)
---
diff --git a/packages/core/src/utils/md-to-epub.test.ts b/packages/core/src/utils/md-to-epub.test.ts
index 2121d96b..b1f0dced 100644
--- a/packages/core/src/utils/md-to-epub.test.ts
+++ b/packages/core/src/utils/md-to-epub.test.ts
@@ -220,11 +220,65 @@ describe("MdToEpubConverter", () => {
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
+
+  describe("XML escaping in XHTML chapter body", () => {
+    it("escapes XML special characters in chapter body text", () => {
+      const result = converter.convertToBytes({
+        markdown: '# Test\n\nText with & < > " special chars.',
+      });
+      const ch = entryText(result.epubBytes, "OEBPS/chapter1.xhtml");
+      // marked.parse() outputs HTML-safe text: & → &amp;, < → &lt;, > → &gt;, " → &quot;
+      expect(ch).toContain("&amp;");
+      expect(ch).toContain("&lt;");
+      expect(ch).toContain("&gt;");
+      expect(ch).toContain("&quot;");
+    });
+  });
+
+  describe("large input", () => {
+    it("handles large markdown input without error", () => {
+      const lines = Array.from(
+        { length: 5000 },
+        (_, i) => `Line ${i}: some content here for testing.`,
+      );
+      const markdown = "# Large Test\n\n" + lines.join("\n");
+      const result = converter.convertToBytes({ markdown });
+      expect(result.epubBytes).toBeInstanceOf(Uint8Array);
+      expect(result.epubBytes.length).toBeGreaterThan(0);
+      expect(result.chapterCount).toBe(1);
+      expect(result.bookTitle).toBe("Large Test");
+    });
+  });
+
+  describe("mixed CJK + Latin language detection edge cases", () => {
+    it("detects English when Latin count dominates CJK near threshold", () => {
+      // ~400 latin chars (4 per "test ") vs ~100 CJK chars → 100 > 200? No → "en"
+      const markdown = "# Mix\n\n" + "test ".repeat(100) + "测试测试".repeat(25);
+      const result = converter.convertToBytes({ markdown });
+      expect(result.language).toBe("en");
+    });
+
+    it("detects Chinese when CJK count crosses the 0.5× threshold", () => {
+      // ~400 latin chars vs ~204 CJK chars → 204 > 200? Yes → "zh"
+      const markdown = "# Mix\n\n" + "test ".repeat(100) + "测试测试".repeat(51);
+      const result = converter.convertToBytes({ markdown });
+      expect(result.language).toBe("zh");
+    });
+  });
+
+  describe("whitespace-only markdown", () => {
+    it("handles whitespace-only markdown gracefully", () => {
+      const result = converter.convertToBytes({ markdown: "   \n\n  \n" });
+      expect(result.chapterCount).toBe(1);
+      expect(result.bookTitle).toBe("Untitled");
+      expect(result.epubBytes.length).toBeGreaterThan(0);
+    });
+  });
 });
