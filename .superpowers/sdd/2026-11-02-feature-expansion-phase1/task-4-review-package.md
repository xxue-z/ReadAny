### Review Package — Task 4
BASE: 54fdbe7a
HEAD: 8f4c6cd3
---
8f4c6cd3 feat: add markdown syntax toolbar to mobile document editor
---
 .../app-expo/src/screens/DocumentEditorScreen.tsx  | 126 ++++++++++++++++++++-
 1 file changed, 124 insertions(+), 2 deletions(-)
---
diff --git a/packages/app-expo/src/screens/DocumentEditorScreen.tsx b/packages/app-expo/src/screens/DocumentEditorScreen.tsx
index e84e694d..5110923a 100644
--- a/packages/app-expo/src/screens/DocumentEditorScreen.tsx
+++ b/packages/app-expo/src/screens/DocumentEditorScreen.tsx
@@ -8,27 +8,26 @@ import {
   fontSize,
   fontWeight,
   radius,
   useColors,
   withOpacity,
 } from "@/styles/theme";
 import { useNavigation, useRoute } from "@react-navigation/native";
 import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
 import type { RouteProp } from "@react-navigation/native";
 import { getPlatformService } from "@readany/core/services";
-import { useCallback, useEffect, useMemo, useState } from "react";
+import { useCallback, useEffect, useMemo, useRef, useState } from "react";
 import { useTranslation } from "react-i18next";
 import {
   ActivityIndicator,
   Alert,
   Platform,
-  Pressable,
   ScrollView,
   StyleSheet,
   Text,
   TextInput,
   TouchableOpacity,
   View,
 } from "react-native";
 import { SafeAreaView } from "react-native-safe-area-context";
 
 type Nav = NativeStackNavigationProp<RootStackParamList>;
@@ -164,35 +163,67 @@ function getMdPath(bookId: string): Promise<string> {
 }
 
 function getEpubPath(bookId: string): Promise<string> {
   return (async () => {
     const platform = getPlatformService();
     const appData = await platform.getAppDataDir();
     return platform.joinPath(appData, `books/${bookId}.epub`);
   })();
 }
 
+// Helper: insert Markdown syntax at cursor position
+function applyMarkdownSyntax(
+  text: string,
+  selection: { start: number; end: number },
+  syntax: { prefix: string; suffix: string; placeholder: string },
+): { text: string; cursorPos: number } {
+  const selectedText = text.slice(selection.start, selection.end);
+  if (selectedText.length > 0) {
+    const newText =
+      text.slice(0, selection.start) +
+      syntax.prefix +
+      selectedText +
+      syntax.suffix +
+      text.slice(selection.end);
+    return {
+      text: newText,
+      cursorPos: selection.start + syntax.prefix.length + selectedText.length + syntax.suffix.length,
+    };
+  }
+  const newText =
+    text.slice(0, selection.start) +
+    syntax.prefix +
+    syntax.placeholder +
+    syntax.suffix +
+    text.slice(selection.end);
+  const cursorPos = selection.start + syntax.prefix.length + syntax.placeholder.length;
+  return { text: newText, cursorPos };
+}
+
 export function DocumentEditorScreen() {
   const colors = useColors();
   const { t } = useTranslation();
   const nav = useNavigation<Nav>();
   const route = useRoute<DocumentEditorRoute>();
   const layout = useResponsiveLayout();
   const { bookId } = route.params;
   const book = useLibraryStore((s) => s.books.find((b) => b.id === bookId));
   const updateBook = useLibraryStore((s) => s.updateBook);
 
   const [markdown, setMarkdown] = useState("");
   const [isLoading, setIsLoading] = useState(true);
   const [isPreview, setIsPreview] = useState(route.params.initialPreview ?? false);
   const [isSaving, setIsSaving] = useState(false);
 
+  const inputRef = useRef<TextInput>(null);
+  const selectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
+
   const s = useMemo(() => makeStyles(colors, layout.horizontalPadding), [colors, layout]);
 
   useEffect(() => {
     let cancelled = false;
     (async () => {
       let errMsg = "";
       try {
         const mdPath = await getMdPath(bookId);
         const platform = getPlatformService();
         const bytes = await platform.readFile(mdPath);
@@ -237,20 +268,35 @@ export function DocumentEditorScreen() {
 
       Alert.alert("", t("library.editor.saved", "已保存"));
     } catch (err) {
       console.error("[DocumentEditor] Save failed:", err);
       Alert.alert(t("library.editor.saveError", "保存失败"), String(err));
     } finally {
       setIsSaving(false);
     }
   }, [markdown, bookId, book?.meta, updateBook, isSaving, t]);
 
+  const handleToolbarAction = useCallback(
+    (syntax: { prefix: string; suffix: string; placeholder: string }) => {
+      const sel = selectionRef.current;
+      const result = applyMarkdownSyntax(markdown, sel, syntax);
+      setMarkdown(result.text);
+      // Set cursor after the state update
+      setTimeout(() => {
+        inputRef.current?.setNativeProps({
+          selection: { start: result.cursorPos, end: result.cursorPos },
+        });
+      }, 0);
+    },
+    [markdown],
+  );
+
   if (!bookId) {
     return (
       <SafeAreaView style={s.container}>
         <Text style={s.errorText}>{t("library.bookNotFound", "Book not found")}</Text>
       </SafeAreaView>
     );
   }
 
   return (
     <SafeAreaView style={s.container}>
@@ -280,33 +326,84 @@ export function DocumentEditorScreen() {
           >
             {isSaving ? (
               <ActivityIndicator size="small" color={colors.primaryForeground} />
             ) : (
               <CheckIcon size={18} color={colors.primaryForeground} />
             )}
           </TouchableOpacity>
         </View>
       </View>
 
+      {/* Toolbar */}
+      {!isLoading && !isPreview ? (
+        <ScrollView
+          horizontal
+          showsHorizontalScrollIndicator={false}
+          style={s.toolbar}
+          contentContainerStyle={s.toolbarContent}
+        >
+          <TouchableOpacity
+            style={s.toolbarBtn}
+            onPress={() => handleToolbarAction({ prefix: "**", suffix: "**", placeholder: "bold" })}
+          >
+            <Text style={[s.toolbarBtnText, { fontWeight: "700" }]}>B</Text>
+          </TouchableOpacity>
+          <TouchableOpacity
+            style={s.toolbarBtn}
+            onPress={() => handleToolbarAction({ prefix: "*", suffix: "*", placeholder: "italic" })}
+          >
+            <Text style={[s.toolbarBtnText, { fontStyle: "italic" }]}>I</Text>
+          </TouchableOpacity>
+          <TouchableOpacity
+            style={s.toolbarBtn}
+            onPress={() => handleToolbarAction({ prefix: "\n# ", suffix: "", placeholder: "Heading 1" })}
+          >
+            <Text style={s.toolbarBtnText}>H1</Text>
+          </TouchableOpacity>
+          <TouchableOpacity
+            style={s.toolbarBtn}
+            onPress={() => handleToolbarAction({ prefix: "\n## ", suffix: "", placeholder: "Heading 2" })}
+          >
+            <Text style={s.toolbarBtnText}>H2</Text>
+          </TouchableOpacity>
+          <TouchableOpacity
+            style={s.toolbarBtn}
+            onPress={() => handleToolbarAction({ prefix: "\n- ", suffix: "", placeholder: "item" })}
+          >
+            <Text style={s.toolbarBtnText}>•</Text>
+          </TouchableOpacity>
+          <TouchableOpacity
+            style={s.toolbarBtn}
+            onPress={() => handleToolbarAction({ prefix: "[", suffix: "](url)", placeholder: "text" })}
+          >
+            <Text style={s.toolbarBtnText}>🔗</Text>
+          </TouchableOpacity>
+        </ScrollView>
+      ) : null}
+
       {/* Content */}
       {isLoading ? (
         <View style={s.loadingContainer}>
           <ActivityIndicator size="large" color={colors.primary} />
         </View>
       ) : isPreview ? (
         <MarkdownPreview content={markdown} colors={colors} />
       ) : (
         <KeyboardAwareScrollView style={{ flex: 1 }}>
           <TextInput
+            ref={inputRef}
             style={s.editor}
             value={markdown}
             onChangeText={setMarkdown}
+            onSelectionChange={(e) => {
+              selectionRef.current = e.nativeEvent.selection;
+            }}
             multiline
             textAlignVertical="top"
             placeholder="# Title"
             placeholderTextColor={colors.mutedForeground}
             autoFocus={!markdown || markdown === "# Untitled"}
             scrollEnabled={false}
           />
         </KeyboardAwareScrollView>
       )}
     </SafeAreaView>
@@ -346,17 +443,42 @@ const makeStyles = (colors: ThemeColors, hPad: number) =>
     editor: {
       flex: 1,
       padding: 16,
       fontSize: 15,
       lineHeight: 22,
       color: colors.foreground,
       fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
       minHeight: 400,
     },
     loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
+    toolbar: {
+      maxHeight: 44,
+      borderBottomWidth: 0.5,
+      borderBottomColor: colors.border,
+      backgroundColor: withOpacity(colors.muted, 0.3),
+    },
+    toolbarContent: {
+      flexDirection: "row",
+      alignItems: "center",
+      paddingHorizontal: 8,
+      gap: 2,
+    },
+    toolbarBtn: {
+      paddingHorizontal: 12,
+      paddingVertical: 8,
+      borderRadius: radius.md,
+      alignItems: "center",
+      justifyContent: "center",
+      minWidth: 36,
+    },
+    toolbarBtnText: {
+      fontSize: 14,
+      fontWeight: fontWeight.medium,
+      color: colors.foreground,
+    },
     errorText: {
       fontSize: fontSize.lg,
       color: colors.mutedForeground,
       textAlign: "center",
       marginTop: 40,
     },
   });
