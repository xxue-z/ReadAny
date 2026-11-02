# Task 7: Add mobile editor background/rotation resilience

## Files

- Modify: `packages/app-expo/src/screens/DocumentEditorScreen.tsx`

## Steps

- [ ] **Step 1: Add auto-save on `AppState` change (app goes to background)**

Read the current file: `packages/app-expo/src/screens/DocumentEditorScreen.tsx`

Add an `AppState` listener that triggers `saveDocument` immediately when the app goes to background. This covers test cases: "edit in background", "receive call/notification", "low power mode".

```ts
import { AppState, type AppStateStatus } from "react-native";

// Inside the component, after other hooks:
const saveDocument = useLibraryStore((s) => s.saveDocument);

useEffect(() => {
  const handleAppStateChange = (nextState: AppStateStatus) => {
    if (nextState === "background" || nextState === "inactive") {
      // Save immediately when app goes to background
      saveDocument(bookId, markdown).catch((err) => {
        console.warn("[DocumentEditor] Background save failed:", err);
      });
    }
  };
  const subscription = AppState.addEventListener("change", handleAppStateChange);
  return () => subscription.remove();
}, [bookId, markdown, saveDocument]);
```

Note: Only save if `markdown` is non-empty and is not still loading (check `!isLoading`).

- [ ] **Step 2: Verify screen rotation preserves state**

React state (`markdown`, `isPreview`) already survives rotation. No code change needed — just verify by noting that all state is in `useState` (not local variables) and no rotation-specific cleanup happens. The `KeyboardAwareScrollView` already handles layout.

- [ ] **Step 3: Verify Expo compiles**

Run: `cd packages/app-expo && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add packages/app-expo/src/screens/DocumentEditorScreen.tsx
git commit -m "feat: save document on app background for mobile editor"
```