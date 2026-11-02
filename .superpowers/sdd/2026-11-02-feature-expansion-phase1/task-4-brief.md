# Task 4: Add mobile editor toolbar for Markdown syntax insertion

## Files

- Modify: `packages/app-expo/src/screens/DocumentEditorScreen.tsx`

## Steps

- [ ] **Step 1: Add a toolbar row between header and editor area**

Add a horizontally scrollable toolbar between the `<View style={s.header}>` and the content area (`{isLoading ? ... : isPreview ? ... : ...}`). The toolbar should contain these buttons:

| Button | Label | Action |
|--------|-------|--------|
| **B** | Bold | Wrap selection or insert `**text**` |
| *I* | Italic | Wrap selection or insert `*text*` |
| H1 | Heading 1 | Prefix line with `# ` |
| H2 | Heading 2 | Prefix line with `## ` |
| • | List | Prefix line with `- ` |
| 🔗 | Link | Insert `[text](url)` |

Each button should be a `Pressable`/`TouchableOpacity` with text label, styled consistently with the header buttons.

- [ ] **Step 2: Add `TextInput` ref for cursor tracking**

Add a `useRef<TextInput>(null)` for the TextInput. Add an `onSelectionChange` handler that tracks the current cursor position. Store it in a ref:
```ts
const selectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
```

- [ ] **Step 3: Implement `insertMarkdownSyntax` helper**

Add a helper function that inserts Markdown syntax at the cursor position:
```ts
function applyMarkdownSyntax(
  text: string,
  selection: { start: number; end: number },
  syntax: { prefix: string; suffix: string; placeholder: string },
): { text: string; cursorPos: number } {
  const selectedText = text.slice(selection.start, selection.end);
  if (selectedText.length > 0) {
    const newText = text.slice(0, selection.start) + syntax.prefix + selectedText + syntax.suffix + text.slice(selection.end);
    return { text: newText, cursorPos: selection.start + syntax.prefix.length + selectedText.length + syntax.suffix.length };
  }
  const newText = text.slice(0, selection.start) + syntax.prefix + syntax.placeholder + syntax.suffix + text.slice(selection.end);
  const cursorPos = selection.start + syntax.prefix.length + syntax.placeholder.length;
  return { text: newText, cursorPos };
}
```

Wire each toolbar button to call this helper and then call `setMarkdown` + set selection via the TextInput ref.

- [ ] **Step 4: Update TextInput to use ref and onSelectionChange**

Replace the current `<TextInput>` in the editor section with:
```tsx
<TextInput
  ref={inputRef}
  style={s.editor}
  value={markdown}
  onChangeText={setMarkdown}
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
```

- [ ] **Step 5: Verify Expo compiles**

Run: `cd packages/app-expo && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add packages/app-expo/src/screens/DocumentEditorScreen.tsx
git commit -m "feat: add markdown syntax toolbar to mobile document editor"
```