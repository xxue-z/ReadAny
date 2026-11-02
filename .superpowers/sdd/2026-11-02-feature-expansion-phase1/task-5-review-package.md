### Review Package — Task 5
BASE: 8f4c6cd3
HEAD: 1dce4be88a26d270724af13f19aebfe4ab89abcd
---
1dce4be8 feat: add saveDocument store action and auto-save to mobile editor
---
 .../app-expo/src/screens/DocumentEditorScreen.tsx  | 73 +++++++++++++---------
 packages/app-expo/src/stores/library-store.ts      | 23 +++++++
 2 files changed, 68 insertions(+), 28 deletions(-)
---
diff --git a/packages/app-expo/src/screens/DocumentEditorScreen.tsx b/packages/app-expo/src/screens/DocumentEditorScreen.tsx
index 5110923a..98dd2194 100644
--- a/packages/app-expo/src/screens/DocumentEditorScreen.tsx
+++ b/packages/app-expo/src/screens/DocumentEditorScreen.tsx
@@ -13,20 +13,21 @@ import {
 } from "@/styles/theme";
 import { useNavigation, useRoute } from "@react-navigation/native";
 import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
 import type { RouteProp } from "@react-navigation/native";
 import { getPlatformService } from "@readany/core/services";
 import { useCallback, useEffect, useMemo, useRef, useState } from "react";
 import { useTranslation } from "react-i18next";
 import {
   ActivityIndicator,
   Alert,
+  AppState,
   Platform,
   ScrollView,
   StyleSheet,
   Text,
   TextInput,
   TouchableOpacity,
   View,
 } from "react-native";
 import { SafeAreaView } from "react-native-safe-area-context";
 
@@ -155,28 +156,20 @@ function MarkdownPreview({ content, colors }: { content: string; colors: ThemeCo
 
 // Helper: find the book dir path and md path from a book
 function getMdPath(bookId: string): Promise<string> {
   return (async () => {
     const platform = getPlatformService();
     const appData = await platform.getAppDataDir();
     return platform.joinPath(appData, `books/${bookId}.md`);
   })();
 }
 
-function getEpubPath(bookId: string): Promise<string> {
-  return (async () => {
-    const platform = getPlatformService();
-    const appData = await platform.getAppDataDir();
-    return platform.joinPath(appData, `books/${bookId}.epub`);
-  })();
-}
-
 // Helper: insert Markdown syntax at cursor position
 function applyMarkdownSyntax(
   text: string,
   selection: { start: number; end: number },
   syntax: { prefix: string; suffix: string; placeholder: string },
 ): { text: string; cursorPos: number } {
   const selectedText = text.slice(selection.start, selection.end);
   if (selectedText.length > 0) {
     const newText =
       text.slice(0, selection.start) +
@@ -200,29 +193,30 @@ function applyMarkdownSyntax(
 }
 
 export function DocumentEditorScreen() {
   const colors = useColors();
   const { t } = useTranslation();
   const nav = useNavigation<Nav>();
   const route = useRoute<DocumentEditorRoute>();
   const layout = useResponsiveLayout();
   const { bookId } = route.params;
   const book = useLibraryStore((s) => s.books.find((b) => b.id === bookId));
-  const updateBook = useLibraryStore((s) => s.updateBook);
+  const saveDocument = useLibraryStore((s) => s.saveDocument);
 
   const [markdown, setMarkdown] = useState("");
   const [isLoading, setIsLoading] = useState(true);
   const [isPreview, setIsPreview] = useState(route.params.initialPreview ?? false);
   const [isSaving, setIsSaving] = useState(false);
 
   const inputRef = useRef<TextInput>(null);
   const selectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
+  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
 
   const s = useMemo(() => makeStyles(colors, layout.horizontalPadding), [colors, layout]);
 
   useEffect(() => {
     let cancelled = false;
     (async () => {
       let errMsg = "";
       try {
         const mdPath = await getMdPath(bookId);
         const platform = getPlatformService();
@@ -238,49 +232,72 @@ export function DocumentEditorScreen() {
           setMarkdown(book?.meta.title ? `# ${book.meta.title}` : "# Untitled");
           setIsLoading(false);
         }
       }
     })();
     return () => {
       cancelled = true;
     };
   }, [bookId]);
 
+  const debouncedSave = useCallback(() => {
+    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
+    saveTimerRef.current = setTimeout(() => {
+      saveDocument(bookId, markdown).catch((err) => {
+        console.warn("[DocumentEditor] Auto-save failed:", err);
+      });
+    }, 3000);
+  }, [bookId, markdown, saveDocument]);
+
+  const handleChangeText = useCallback(
+    (text: string) => {
+      setMarkdown(text);
+      debouncedSave();
+    },
+    [debouncedSave],
+  );
+
+  // Auto-save on app background
+  useEffect(() => {
+    const subscription = AppState.addEventListener("change", (nextState) => {
+      if (nextState === "background" || nextState === "inactive") {
+        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
+        saveDocument(bookId, markdown).catch((err) => {
+          console.warn("[DocumentEditor] Background auto-save failed:", err);
+        });
+      }
+    });
+    return () => {
+      subscription.remove();
+    };
+  }, [bookId, markdown, saveDocument]);
+
+  // Cleanup timer on unmount
+  useEffect(() => {
+    return () => {
+      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
+    };
+  }, []);
+
   const handleSave = useCallback(async () => {
     if (isSaving) return;
     setIsSaving(true);
     try {
-      const title = markdown.match(/^#\s+(.+)/m)?.[1]?.trim() || book?.meta.title || "Untitled";
-      const { MdToEpubConverter } = await import("@readany/core/utils/md-to-epub");
-      const converter = new MdToEpubConverter();
-      const result = converter.convertToBytes({ markdown, title });
-
-      const mdPath = await getMdPath(bookId);
-      const epubPath = await getEpubPath(bookId);
-      const platform = getPlatformService();
-      const encoder = new TextEncoder();
-      await platform.writeFile(mdPath, encoder.encode(markdown));
-      await platform.writeFile(epubPath, result.epubBytes);
-
-      await updateBook(bookId, {
-        meta: { ...book?.meta, title: result.bookTitle },
-        updatedAt: Date.now(),
-      });
-
+      await saveDocument(bookId, markdown);
       Alert.alert("", t("library.editor.saved", "已保存"));
     } catch (err) {
       console.error("[DocumentEditor] Save failed:", err);
       Alert.alert(t("library.editor.saveError", "保存失败"), String(err));
     } finally {
       setIsSaving(false);
     }
-  }, [markdown, bookId, book?.meta, updateBook, isSaving, t]);
+  }, [bookId, markdown, saveDocument, isSaving, t]);
 
   const handleToolbarAction = useCallback(
     (syntax: { prefix: string; suffix: string; placeholder: string }) => {
       const sel = selectionRef.current;
       const result = applyMarkdownSyntax(markdown, sel, syntax);
       setMarkdown(result.text);
       // Set cursor after the state update
       setTimeout(() => {
         inputRef.current?.setNativeProps({
           selection: { start: result.cursorPos, end: result.cursorPos },
@@ -386,21 +403,21 @@ export function DocumentEditorScreen() {
           <ActivityIndicator size="large" color={colors.primary} />
         </View>
       ) : isPreview ? (
         <MarkdownPreview content={markdown} colors={colors} />
       ) : (
         <KeyboardAwareScrollView style={{ flex: 1 }}>
           <TextInput
             ref={inputRef}
             style={s.editor}
             value={markdown}
-            onChangeText={setMarkdown}
+            onChangeText={handleChangeText}
             onSelectionChange={(e) => {
               selectionRef.current = e.nativeEvent.selection;
             }}
             multiline
             textAlignVertical="top"
             placeholder="# Title"
             placeholderTextColor={colors.mutedForeground}
             autoFocus={!markdown || markdown === "# Untitled"}
             scrollEnabled={false}
           />
diff --git a/packages/app-expo/src/stores/library-store.ts b/packages/app-expo/src/stores/library-store.ts
index e16a4e0b..057a12e6 100644
--- a/packages/app-expo/src/stores/library-store.ts
+++ b/packages/app-expo/src/stores/library-store.ts
@@ -99,20 +99,21 @@ export interface LibraryState {
   renameTag: (oldName: string, newName: string) => void;
   addGroup: (name: string) => Promise<BookGroup | null>;
   renameGroup: (groupId: string, name: string) => void;
   removeGroup: (groupId: string) => Promise<void>;
   moveBookToGroup: (bookId: string, groupId?: string) => void;
   moveBooksToGroup: (bookIds: string[], groupId?: string) => void;
   removeBookFromGroup: (bookId: string) => void;
   addTagToBook: (bookId: string, tag: string) => void;
   removeTagFromBook: (bookId: string, tag: string) => void;
   createDocument: (title?: string) => Promise<Book | null>;
+  saveDocument: (bookId: string, markdown: string) => Promise<void>;
 }
 
 async function resolveAppPath(relativePath: string): Promise<string> {
   const platform = getPlatformService();
   const appData = await platform.getAppDataDir();
   return platform.joinPath(appData, relativePath);
 }
 
 function isRelativeAppPath(path: string): boolean {
   return (
@@ -1677,11 +1678,33 @@ export const useLibraryStore = create<LibraryState>((set, get) => ({
       updatedAt: Date.now(),
       progress: 0,
       isVectorized: false,
       vectorizeProgress: 0,
       tags: [],
       syncStatus: "local",
     };
     await get().addBook(book);
     return book;
   },
+
+  saveDocument: async (bookId, markdown) => {
+    const { MdToEpubConverter } = await import("@readany/core/utils/md-to-epub");
+    const converter = new MdToEpubConverter();
+    const result = converter.convertToBytes({ markdown });
+    const platform = getPlatformService();
+    await ensureAppSubDir("books");
+    const relativeEpub = `books/${bookId}.epub`;
+    const relativeMd = `books/${bookId}.md`;
+    const epubPath = await resolveAppPath(relativeEpub);
+    const mdPath = await resolveAppPath(relativeMd);
+    const encoder = new TextEncoder();
+    await platform.writeFile(epubPath, result.epubBytes);
+    await platform.writeFile(mdPath, encoder.encode(markdown));
+    const book = get().books.find((b) => b.id === bookId);
+    if (book && result.bookTitle !== book.meta.title) {
+      await get().updateBook(bookId, {
+        meta: { ...book.meta, title: result.bookTitle },
+        updatedAt: Date.now(),
+      });
+    }
+  },
 }));
