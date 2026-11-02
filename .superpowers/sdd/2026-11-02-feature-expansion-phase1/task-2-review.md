# Task 2 Review: Add `saveDocument` store action and use in DocumentWorkspace

## Status: APPROVED

## Summary

The implementation correctly adds `saveDocument` to the library store interface and implementation, and refactors `DocumentWorkspace.tsx` to delegate save logic to the store action. All global constraints are met.

## Detailed Findings

### Spec Compliance: PASS

| Step | Requirement | Status | Notes |
|------|-------------|--------|-------|
| 1 | Add `saveDocument` to `LibraryState` interface (~line 385) | ✅ | Added at line 386, after `createDocument`, with correct signature |
| 2 | Add `saveDocument` implementation in store (~after line 1446) | ✅ | Added at lines 1449-1468, after `createDocument` implementation |
| 3 | Refactor `DocumentWorkspace.handleSave` to delegate to `saveDocument` | ✅ | `handleSave` simplified, removed unused imports |
| 4 | Compiles without new errors | ✅ | See task-2-report.md for tsc results |
| 5 | Commit in conventional format | ✅ | `feat: add saveDocument store action and use in DocumentWorkspace` |

### Code Quality Assessment

| Finding | Severity | Details |
|---------|----------|---------|
| Correct `await` on `join` in `mkdir` | ✅ Good | The brief's code snippet at line 31 omitted `await` before `join(root, "books")`, but the implementer correctly added it. `@tauri-apps/api/path`'s `join` returns `Promise<string>`. The existing `createDocument` (line 1427) already uses `await mkdir(await join(root, 'books'), ...)`, confirming this is correct. |
| Both `.md` and `.epub` files written | ✅ Good | `saveDocument` writes both `result.epubBytes` to `${bookId}.epub` and encoded markdown to `${bookId}.md`, satisfying the dual-file requirement. |
| Title update logic preserved | ✅ Good | The `updateBook` call when `result.bookTitle` differs from `book.meta.title` is correctly preserved in `saveDocument`. |
| Unused imports cleaned up | ✅ Good | `MdToEpubConverter` and `resolveDesktopDataPath` removed from `DocumentWorkspace.tsx` imports (no longer needed). `getDesktopLibraryRoot` retained (still used in the `useEffect` loader). `updateBook` selector removed (no longer used directly). |
| Callback dependencies correct | ✅ Good | `handleSave` deps changed from `[markdown, bookId, book, updateBook, t]` to `[markdown, bookId, saveDocument, t]` — `book` and `updateBook` no longer needed since the store action handles them internally. |
| `saveDocument` mirrors `createDocument` | ✅ Good | Structurally follows the same patterns: dynamic imports for Tauri APIs, `mkdir` with `recursive: true`, writes both epub and md files. |
| `getDesktopLibraryRoot` called redundantly | Minor | `saveDocument` calls `getDesktopLibraryRoot()` once for `root` (used for `mkdir`) and `resolveDesktopDataPath` calls it again internally. This matches the brief's prescribed code exactly and has no functional impact — just a minor efficiency note. Not worth blocking. |

## Verdict

1. **Spec compliance**: ✅ FULL — All 5 steps completed as specified.
2. **Task quality**: ✅ CORRECT — `saveDocument` properly writes both `.md` and `.epub` files. `DocumentWorkspace` correctly delegates to it. The `await` on `join` deviation from the brief is the *correct* behavior, confirmed by the existing `createDocument` pattern.
3. **Report status**: **APPROVED** — No blocking issues found.