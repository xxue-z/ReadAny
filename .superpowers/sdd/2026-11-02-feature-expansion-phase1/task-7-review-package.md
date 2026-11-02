### Review Package — Task 7
BASE: 1dce4be8
HEAD: e974164d
---
e974164d feat: add isLoading guard to mobile editor background save
---
 packages/app-expo/src/screens/DocumentEditorScreen.tsx | 5 +++--
 1 file changed, 3 insertions(+), 2 deletions(-)
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
