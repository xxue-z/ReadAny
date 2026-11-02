### Review Package — Task 6
BASE: 1dce4be8
HEAD: ea933b28
---
ea933b28 feat: detect and skip duplicate MD imports by file hash
5fc80bb0 test: enhance md-to-epub tests covering edge cases and test-cases-phase1 scenarios
e974164d feat: add isLoading guard to mobile editor background save
---
 .../app-expo/src/screens/DocumentEditorScreen.tsx  |  5 +-
 packages/app-expo/src/stores/library-store.ts      | 10 ++++
 packages/app/src/stores/library-store.ts           | 16 +++++--
 packages/core/src/utils/md-to-epub.test.ts         | 54 ++++++++++++++++++++++
 4 files changed, 80 insertions(+), 5 deletions(-)
---
diff --git a/packages/app-expo/src/screens/DocumentEditorScreen.tsx b/packages/app-expo/src/screens/DocumentEditorScreen.tsx
index 98dd2194..835115a6 100644
--- a/packages/app-expo/src/screens/DocumentEditorScreen.tsx
+++ b/packages/app-expo/src/screens/DocumentEditorScreen.tsx
@@ -249,34 +249,35 @@ export function DocumentEditorScreen() {
   }, [bookId, markdown, saveDocument]);
 
   const handleChangeText = useCallback(
     (text: string) => {
       setMarkdown(text);
       debouncedSave();
     },
     [debouncedSave],
   );
 
-  // Auto-save on app background
+  // Auto-save on app background / inactive
   useEffect(() => {
     const subscription = AppState.addEventListener("change", (nextState) => {
       if (nextState === "background" || nextState === "inactive") {
+        if (isLoading) return; // skip save while still loading
         if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
         saveDocument(bookId, markdown).catch((err) => {
           console.warn("[DocumentEditor] Background auto-save failed:", err);
         });
       }
     });
     return () => {
       subscription.remove();
     };
-  }, [bookId, markdown, saveDocument]);
+  }, [bookId, markdown, saveDocument, isLoading]);
 
   // Cleanup timer on unmount
   useEffect(() => {
     return () => {
       if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
     };
   }, []);
 
   const handleSave = useCallback(async () => {
     if (isSaving) return;
diff --git a/packages/app-expo/src/stores/library-store.ts b/packages/app-expo/src/stores/library-store.ts
index 057a12e6..e167f27b 100644
--- a/packages/app-expo/src/stores/library-store.ts
+++ b/packages/app-expo/src/stores/library-store.ts
@@ -1198,20 +1198,30 @@ export const useLibraryStore = create<LibraryState>((set, get) => ({
               }
               continue;
             } catch (convErr) {
               console.error("[importBooks] UMD conversion failed:", convErr);
               throw convErr;
             }
           }
 
           // For MD files: parse + convert to EPUB bytes (Markdown ebook format)
           if (ext === "md") {
+            // Re-check for MD duplicate by hash within this batch
+            const mdDuplicate = duplicateIndex.byHash.get(fileHash ?? "");
+            if (mdDuplicate && mdDuplicate.format === "md") {
+              result.skippedDuplicates.push({
+                name: fileName,
+                existingBook: mdDuplicate,
+              });
+              continue;
+            }
+
             try {
               const sourceBytes = await platform.readFile(filePath);
               const text = new TextDecoder("utf-8").decode(sourceBytes);
               const { MdToEpubConverter } = await import("@readany/core/utils/md-to-epub");
               const converter = new MdToEpubConverter();
               const conversion = converter.convertToBytes({ markdown: text });
 
               await ensureAppSubDir("books");
               const relativePath = `books/${bookId}.epub`;
               const absPath = await resolveAppPath(relativePath);
diff --git a/packages/app/src/stores/library-store.ts b/packages/app/src/stores/library-store.ts
index f5b31505..9f9dc7d3 100644
--- a/packages/app/src/stores/library-store.ts
+++ b/packages/app/src/stores/library-store.ts
@@ -1005,33 +1005,43 @@ export const useLibraryStore = create<LibraryState>((set, get) => ({
             if (result.author) author = result.author;
             const { writeFile, mkdir } = await import("@tauri-apps/plugin-fs");
             const { join } = await import("@tauri-apps/api/path");
             await mkdir(await join(await getDesktopLibraryRoot(), "books"), { recursive: true });
             const destEpub = await resolveAppPath(`books/${bookId}.epub`);
             await writeFile(destEpub, result.epubBytes);
           }
 
           // For MD files, convert Markdown to EPUB before storing
           if (ext === "md") {
+            // Re-check for MD duplicate by hash within this batch
+            const mdDuplicate = duplicateIndex.byHash.get(fileHash ?? "");
+            if (mdDuplicate && mdDuplicate.format === "md") {
+              result.skippedDuplicates.push({
+                name: fileName,
+                existingBook: mdDuplicate,
+              });
+              continue;
+            }
+
             const { MdToEpubConverter } = await import("@readany/core/utils/md-to-epub");
             const { readFile } = await import("@tauri-apps/plugin-fs");
             const rawBytes = await readFile(filePath);
             const decoder = new TextDecoder();
             const markdown = decoder.decode(rawBytes);
             const converter = new MdToEpubConverter();
-            const result = converter.convertToBytes({ markdown });
-            if (result.bookTitle) title = result.bookTitle;
+            const mdResult = converter.convertToBytes({ markdown });
+            if (mdResult.bookTitle) title = mdResult.bookTitle;
             const { writeFile, mkdir } = await import("@tauri-apps/plugin-fs");
             const { join } = await import("@tauri-apps/api/path");
             await mkdir(await join(await getDesktopLibraryRoot(), "books"), { recursive: true });
             const destEpub = await resolveAppPath(`books/${bookId}.epub`);
-            await writeFile(destEpub, result.epubBytes);
+            await writeFile(destEpub, mdResult.epubBytes);
             // Save source MD for future re-editing
             const mdPath = await resolveAppPath(`books/${bookId}.md`);
             await writeFile(mdPath, rawBytes);
           }
 
           // Copy book file into the managed library root (books/{id}.{ext})
           // For TXT/UMD: already written above; for others: OS-level copy (no JS memory)
           let relativePath: string;
           let destPath: string;
           if (ext === "txt" || ext === "umd" || ext === "md") {
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
