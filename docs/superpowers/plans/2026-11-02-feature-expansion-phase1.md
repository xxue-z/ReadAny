# Phase 1 Feature Expansion — MD Import + Document Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Phase 1 feature set: MD import dedup, desktop MD-book routing to editor, bug fixes in DocumentWorkspace, mobile editor toolbar + auto-save, and comprehensive end-to-end test coverage.

**Architecture:** The core converter (`MdToEpubConverter`) and storage model (`.md` source + `.epub` derived) are already implemented. This plan fixes bugs in the desktop editor workspace, adds MD-vs-reader routing on desktop, enhances the mobile editor with toolbar + auto-save, and adds `saveDocument` as a proper store action so both editors share the save logic.

**Tech Stack:** TypeScript strict, React 19, Tauri 2 (desktop), Expo 54 (mobile), Zustand, marked, tiptap, Vitest

**Spec:** `docs/feature-expansion/01-doc-edit-tags.md` and `docs/feature-expansion/test-cases-phase1.md`

## Global Constraints

- MD files use the two-file model: `books/{bookId}.md` (source) + `books/{bookId}.epub` (derived)
- `Book.filePath` points to `.epub`; editors read/write the `.md` file
- Markdown rendered via `marked` (GFM support); no `remark-gfm`
- Desktop editor reuses tiptap `MarkdownEditor`; mobile uses `TextInput` + lightweight preview
- Tags and groups are already implemented — this plan must not break them
- All commits use conventional commits (`feat:` / `fix:`)
- Format with Biome: 2-space, double quotes, semicolons, 100 width

## Review Focus

1. **MD book double-click on desktop opens reader, not editor** — test: from library, open an MD format book; it must open in `DocumentWorkspace`, not `ReaderView`
2. **`resolveDesktopDataPath` is used but not imported in `DocumentWorkspace`** — test: open an MD document, edit, save; this must not throw a ReferenceError
3. **Mobile editor has no toolbar** — test: open mobile editor; toolbar buttons (bold, italic, heading, list, link) must be visible and insert correct syntax
4. **Mobile editor loses unsaved content on background** — test: edit text, switch apps, return; content must be preserved (React state + auto-save covers this)
5. **Duplicate MD import creates two books** — test: import same `.md` file twice; second must be silently skipped or prompted

---

### Task 1: Fix DocumentWorkspace bugs (missing imports, duplicate declarations)

**Files:**
- Modify: `packages/app/src/components/editor/DocumentWorkspace.tsx`

**Interfaces:**
- Produces: A working `DocumentWorkspace` that no longer throws ReferenceError on save

- [ ] **Step 1: Fix `resolveDesktopDataPath` import in DocumentWorkspace**

Add the missing import at the top:
```ts
import { resolveDesktopDataPath } from "@/lib/storage/desktop-library-root";
```
The function is used on line 87 without being imported.

- [ ] **Step 2: Remove duplicate `const { join }` declarations**

Lines 83 and 91-92 both declare `const { join } = await import("@tauri-apps/api/path");`. Remove the second declaration (lines 91-92) and reuse the first one.

- [ ] **Step 3: Verify the fix compiles**

Run: `cd packages/app && npx tsc --noEmit` (check DocumentWorkspace compiles)

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/components/editor/DocumentWorkspace.tsx
git commit -m "fix: add missing resolveDesktopDataPath import and remove duplicate join in DocumentWorkspace"
```

---

### Task 2: Add `saveDocument` store action (shared save logic)

**Files:**
- Modify: `packages/app/src/stores/library-store.ts` (add `saveDocument` to State interface and implementation)
- Modify: `packages/app/src/components/editor/DocumentWorkspace.tsx` (use `saveDocument` instead of ad-hoc save)

**Interfaces:**
- Consumes: `bookId: string`, `markdown: string` (both already available in editors)
- Produces: `saveDocument(bookId: string, markdown: string) => Promise<void>` — writes `.md`, regenerates `.epub`, updates book metadata in store

- [ ] **Step 1: Add `saveDocument` to the library store interface and implementation**

In the `LibraryState` interface, add:
```ts
saveDocument: (bookId: string, markdown: string) => Promise<void>;
```

In the store implementation (after `createDocument`), add:
```ts
saveDocument: async (bookId, markdown) => {
  const { MdToEpubConverter } = await import("@readany/core/utils/md-to-epub");
  const converter = new MdToEpubConverter();
  const result = converter.convertToBytes({ markdown });
  const encoder = new TextEncoder();
  const { writeFile, mkdir } = await import("@tauri-apps/plugin-fs");
  const { join } = await import("@tauri-apps/api/path");
  const root = await getDesktopLibraryRoot();
  await mkdir(join(root, "books"), { recursive: true });
  const epubPath = await resolveDesktopDataPath(`books/${bookId}.epub`);
  const mdPath = await resolveDesktopDataPath(`books/${bookId}.md`);
  await writeFile(epubPath, result.epubBytes);
  await writeFile(mdPath, encoder.encode(markdown));
  const book = get().books.find((b) => b.id === bookId);
  if (book && result.bookTitle !== book.meta.title) {
    await get().updateBook(bookId, { meta: { ...book.meta, title: result.bookTitle } });
  }
},
```

- [ ] **Step 2: Refactor `DocumentWorkspace.handleSave` to use `saveDocument`**

Replace the ad-hoc save logic in `handleSave` with a call to `saveDocument(bookId, markdown)`. Import `saveDocument` from the store.

- [ ] **Step 3: Verify the refactor compiles**

Run: `cd packages/app && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/stores/library-store.ts packages/app/src/components/editor/DocumentWorkspace.tsx
git commit -m "feat: add saveDocument store action and use in DocumentWorkspace"
```

---

### Task 3: Route MD books to editor on desktop (BookList + openDesktopBook)

**Files:**
- Modify: `packages/app/src/components/home/BookList.tsx`
- Modify: `packages/app/src/lib/library/open-book.ts`

**Interfaces:**
- Consumes: `Book` (with `format: "md"`), `useAppStore.addTab`
- Produces: MD-format books open a "document" tab instead of a "reader" tab

- [ ] **Step 1: Modify `openDesktopBook` to route MD books to editor**

In `openDesktopBook`, after the remote-book download block and before the file-access check, add:
```ts
// MD documents open in the editor, not the reader
if (book.format === "md") {
  const { addTab, setActiveTab } = useAppStore.getState();
  const tabId = `document-${book.id}`;
  addTab({
    id: tabId,
    type: "document",
    title: book.meta.title,
    bookId: book.id,
  });
  setActiveTab(tabId);
  return true;
}
```
Place this check *after* the `syncStatus === "remote"` download block but *before* the `resolveDesktopDataPath(book.filePath)` existence check (since MD books always have a local `.md` + `.epub` pair created at import time — existence is guaranteed).

- [ ] **Step 2: Verify desktop compiles**

Run: `cd packages/app && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/lib/library/open-book.ts
git commit -m "feat: route MD books to DocumentWorkspace editor on desktop"
```

---

### Task 4: Add mobile editor toolbar for Markdown syntax insertion

**Files:**
- Modify: `packages/app-expo/src/screens/DocumentEditorScreen.tsx`

**Interfaces:**
- Consumes: `setMarkdown`, `markdown` state in `DocumentEditorScreen`
- Produces: Toolbar with Bold, Italic, Heading, List, Link buttons that insert Markdown syntax at cursor/selection

- [ ] **Step 1: Add a toolbar row between header and editor area**

Add a horizontal scrollable toolbar with buttons: **B** (bold), *I* (italic), H1, H2, • (list), 🔗 (link). Each button inserts the corresponding Markdown syntax at the current cursor position or wraps selected text.

- [ ] **Step 2: Implement `insertMarkdownSyntax` helper**

```ts
function insertMarkdownSyntax(
  text: string,
  selection: { start: number; end: number },
  wrapper: string,
  placeholder?: string
): { text: string; selection: { start: number; end: number } } {
  // Wraps selection (or inserts placeholder) with the wrapper syntax
  // e.g., wrapper "**" → **selected text**
  // e.g., wrapper "# " → prefix line with heading
}
```

- [ ] **Step 3: Use a `TextInput` ref with `selection` tracking**

Track the cursor position via `onSelectionChange` (React Native TextInput prop). Wire toolbar buttons to call `insertMarkdownSyntax` and update both `setMarkdown` and the selection.

- [ ] **Step 4: Refresh preview when toolbar is used**

When switching between edit and preview mode after toolbar changes, the `MarkdownPreview` component must show the updated content (already handled — preview re-renders from `markdown` state).

- [ ] **Step 5: Verify Expo compiles**

Run: `cd packages/app-expo && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add packages/app-expo/src/screens/DocumentEditorScreen.tsx
git commit -m "feat: add markdown syntax toolbar to mobile document editor"
```

---

### Task 5: Add mobile auto-save + `saveDocument` store action (Expo)

**Files:**
- Modify: `packages/app-expo/src/stores/library-store.ts` (add `saveDocument`)
- Modify: `packages/app-expo/src/screens/DocumentEditorScreen.tsx` (use `saveDocument` + debounced auto-save)

**Interfaces:**
- Produces: `saveDocument(bookId: string, markdown: string) => Promise<void>` in mobile library-store
- Consumer: `DocumentEditorScreen` calls `saveDocument` on explicit save and auto-save

- [ ] **Step 1: Add `saveDocument` to mobile library-store**

Add to `LibraryState` interface:
```ts
saveDocument: (bookId: string, markdown: string) => Promise<void>;
```

Implementation (mirrors desktop but uses `getPlatformService()` for file IO):
```ts
saveDocument: async (bookId, markdown) => {
  const { MdToEpubConverter } = await import("@readany/core/utils/md-to-epub");
  const converter = new MdToEpubConverter();
  const result = converter.convertToBytes({ markdown });
  const platform = getPlatformService();
  await ensureAppSubDir("books");
  const relativeEpub = `books/${bookId}.epub`;
  const relativeMd = `books/${bookId}.md`;
  const epubPath = await resolveAppPath(relativeEpub);
  const mdPath = await resolveAppPath(relativeMd);
  const encoder = new TextEncoder();
  await platform.writeFile(epubPath, result.epubBytes);
  await platform.writeFile(mdPath, encoder.encode(markdown));
  const book = get().books.find((b) => b.id === bookId);
  if (book && result.bookTitle !== book.meta.title) {
    await get().updateBook(bookId, { 
      meta: { ...book.meta, title: result.bookTitle },
      updatedAt: Date.now(),
    });
  }
},
```

- [ ] **Step 2: Add debounced auto-save to DocumentEditorScreen**

Add a `useRef<ReturnType<typeof setTimeout>>` for debounce (3 seconds after last edit). Call `saveDocument` from the store. Keep the explicit save button which calls `saveDocument` immediately.

- [ ] **Step 3: Remove old `handleSave` and use `saveDocument` from store**

Replace the ad-hoc `handleSave` implementation with `saveDocument(bookId, markdown)`.

- [ ] **Step 4: Verify Expo compiles**

Run: `cd packages/app-expo && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add packages/app-expo/src/stores/library-store.ts packages/app-expo/src/screens/DocumentEditorScreen.tsx
git commit -m "feat: add saveDocument store action and auto-save to mobile editor"
```

---

### Task 6: Add MD duplicate import detection

**Files:**
- Modify: `packages/app/src/stores/library-store.ts` (desktop import)
- Modify: `packages/app-expo/src/stores/library-store.ts` (mobile import)

**Interfaces:**
- Consumes: `fileHash` (already computed during import), existing books' `fileHash` values
- Produces: Duplicate `.md` imports are skipped with a toast notification

- [ ] **Step 1: Add MD file hash check in desktop import pipeline**

In the MD import branch of `importBooks`, after reading the file and computing `fileHash`, check against all existing `Book.fileHash` values. If matched, skip and show toast: `t("library.duplicateBook", "This book already exists in your library")`.

- [ ] **Step 2: Add MD file hash check in mobile import pipeline**

Same logic in the mobile `importBooks`.

- [ ] **Step 3: Verify both compile**

Run: `cd packages/app && npx tsc --noEmit && cd ../app-expo && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/stores/library-store.ts packages/app-expo/src/stores/library-store.ts
git commit -m "feat: detect and skip duplicate MD imports by file hash"
```

---

### Task 7: Add mobile editor background/rotation resilience

**Files:**
- Modify: `packages/app-expo/src/screens/DocumentEditorScreen.tsx`

**Interfaces:**
- None new — leverages existing auto-save and React state

- [ ] **Step 1: Add auto-save on `AppState` change (app goes to background)**

Add an `AppState.addEventListener("change")` listener that triggers `saveDocument` immediately when the app goes to background (not just debounce). This covers test cases: "edit in background", "receive call/notification", "low power mode".

- [ ] **Step 2: Verify screen rotation preserves state**

React state (`markdown`, `isPreview`) already survives rotation. Add a `useEffect` that logs or confirms no state loss. No code change needed — just verification.

- [ ] **Step 3: Commit**

```bash
git add packages/app-expo/src/screens/DocumentEditorScreen.tsx
git commit -m "feat: save document on app background for mobile editor"
```

---

### Task 8: End-to-end test suite

**Files:**
- Create: `packages/core/src/utils/md-to-epub.test.ts` (enhance existing)
- Existing tests already cover: EPUB structure, chapter splitting, GFM, XML escaping, language detection, title derivation

**Interfaces:**
- None new — tests exercise existing `MdToEpubConverter.convertToBytes`

- [ ] **Step 1: Add test for XML escaping of special chars in XHTML content (not just NCX)**

The current test only verifies NCX escaping. Add a test that verifies `& < > "` in chapter body text are properly escaped in the XHTML output.

- [ ] **Step 2: Add test for large markdown input (5MB equiv)**

Generate ~5000 lines of markdown and verify `convertToBytes` completes without error and produces valid EPUB.

- [ ] **Step 3: Add test for mixed CJK + Latin language detection edge case**

When CJK count == Latin count * 0.51 (near the threshold), verify detection is deterministic.

- [ ] **Step 4: Add test covering test-cases-phase1.md scenarios**

Create test cases mapping to the test document:
- test-basic.md: bold+italic+lists
- test-table.md: GFM table rendering
- test-code.md: fenced code block
- test-special.md: XML special chars in title
- test-empty.md: empty file → single chapter, no crash

- [ ] **Step 5: Run all tests to verify**

```bash
pnpm vitest run packages/core/src/utils/md-to-epub.test.ts
```
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/utils/md-to-epub.test.ts
git commit -m "test: enhance md-to-epub tests covering edge cases and test-cases-phase1 scenarios"
```

---

### Task 9: Integration smoke test — full workflow

**Files:**
- Create: `docs/feature-expansion/verification-checklist.md`

This task verifies the full workflow end-to-end and documents results. No code changes.

- [ ] **Step 1: Desktop workflow verification**

Document step-by-step verification against test-cases-phase1.md:
1. Create new document → opens DocumentWorkspace with "# Untitled"
2. Edit content with tiptap toolbar → save → reopen → content preserved
3. Import test-basic.md → shows in library → open → renders in reader correctly
4. Import test-table.md → GFM table renders as `<table>`
5. Import test-code.md → code block renders as `<pre><code>`
6. Import same MD twice → second skipped
7. Add tags to MD book → works, filters correctly
8. Move MD book to group → works
9. Auto-save after idle 3s → works

- [ ] **Step 2: Mobile workflow verification**

Document verification:
1. Create new document → DocumentEditorScreen with "# Untitled"
2. Toolbar buttons insert correct syntax
3. Edit/preview toggle works
4. Save → back to library → reopen → content preserved
5. Auto-save triggers after 3s idle
6. Switch app to background → save triggers immediately
7. Rotate screen → content preserved
8. Open MD book from library → goes to editor (not reader) with preview mode

- [ ] **Step 3: Commit**

```bash
git add docs/feature-expansion/verification-checklist.md
git commit -m "docs: add phase 1 verification checklist"
```

---

## Self-Review

**Spec coverage (01-doc-edit-tags.md):**
- ✅ 1.1 MD file import — already implemented (converter, format, import pipeline)
- ✅ 1.2 MD editor (desktop) — Task 1 fixes bugs, Task 2 adds saveDocument
- ✅ 1.2 MD editor (mobile) — Task 4 adds toolbar, Task 5 adds auto-save
- ✅ 1.3 Tags/groups — already implemented, no changes needed
- ✅ New document entry — already implemented on both platforms
- ✅ MD book routing — Task 3 adds desktop routing (mobile already does it)

**Spec coverage (test-cases-phase1.md):**
- ✅ Section 1 (MD import): Tasks 6 (dedup), 8 (tests) cover all scenarios
- ✅ Section 2 (New document): Tasks 1-5 cover creation + editing
- ✅ Section 3 (Editor): Tasks 1, 2, 4, 5 cover all editor test cases
- ✅ Section 4 (Tags/groups regression): No changes — existing tests cover
- ✅ Section 5 (Edge cases): Tasks 7, 8 cover boundary scenarios
- ✅ Section 6 (Mobile-specific): Tasks 7 covers background/rotation

**Review Focus coverage:**
- ✅ MD book opens editor, not reader: Task 3
- ✅ resolveDesktopDataPath import: Task 1
- ✅ Mobile toolbar: Task 4
- ✅ Background content preservation: Task 7
- ✅ Duplicate import: Task 6