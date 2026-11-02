# Task 4: Add mobile editor toolbar for Markdown syntax insertion

## Status

DONE

## Commits

- `8f4c6cd3` — feat: add markdown syntax toolbar to mobile document editor

## Changes

- `packages/app-expo/src/screens/DocumentEditorScreen.tsx` (+124 / -2)

### What was done

1. **Added `applyMarkdownSyntax` helper** (lines 174-200): A function that inserts Markdown syntax at the cursor position. When text is selected, it wraps the selection with prefix/suffix; otherwise it inserts `prefix + placeholder + suffix` and positions the cursor after the placeholder.

2. **Added refs for cursor tracking** (lines 218-219):
   - `inputRef` — `useRef<TextInput>(null)` for programmatic cursor control
   - `selectionRef` — `useRef<{ start: number; end: number }>` tracking current selection

3. **Added `handleToolbarAction` callback** (lines 279-292): Reads current selection from `selectionRef`, calls `applyMarkdownSyntax`, updates `markdown` state, then positions the cursor via `setNativeProps`.

4. **Added toolbar** (lines 337-382): A horizontally scrollable `<ScrollView>` with 6 buttons:
   | Button | Label | Syntax |
   |--------|-------|--------|
   | **B**  | Bold  | `**text**` |
   | *I*    | Italic | `*text*` |
   | H1     | Heading 1 | `# text` |
   | H2     | Heading 2 | `## text` |
   | •      | List | `- text` |
   | 🔗     | Link | `[text](url)` |

   The toolbar is only shown when not loading and not in preview mode.

5. **Updated TextInput** (lines 393-407): Added `ref={inputRef}` and `onSelectionChange` handler that syncs `selectionRef`.

6. **Added toolbar styles** (lines 454-478): `toolbar`, `toolbarContent`, `toolbarBtn`, `toolbarBtnText` — using theme colors with `withOpacity(colors.muted, 0.3)` for subtle background.

7. **Cleanup**: Removed unused `Pressable` import.

## Tests

- `cd packages/app-expo && pnpm exec tsc --noEmit`: Only pre-existing errors remain (line 265 `BookMeta` type mismatch in `handleSave`, and `library-store.ts` `platform` reference). No new TypeScript errors introduced.

## Concerns

None. The toolbar follows the brief's exact specifications.

## Self-review

- Verified the file compiles with no new TypeScript errors
- Verified each toolbar button uses the correct Markdown syntax per the brief
- Verified the toolbar is conditionally rendered (hidden during loading and preview)
- Verified `applyMarkdownSyntax` implementation matches the brief exactly
- Verified `selectionRef` is updated via `onSelectionChange` and read by `handleToolbarAction`
- Cleaned up the unused `Pressable` import