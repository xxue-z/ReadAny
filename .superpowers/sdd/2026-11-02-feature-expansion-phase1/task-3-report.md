# Task 3 Report: Route MD books to DocumentWorkspace editor on desktop

## Status: DONE

## Commits

- `54fdbe7a34b956212de2ac0359cc2d30e771e361` — feat: route MD books to DocumentWorkspace editor on desktop

## Changes

- **File modified:** `packages/app/src/lib/library/open-book.ts` (+14 lines)
- Inserted MD-format routing check in `openDesktopBook` after the remote-book download block (line 160) and before `const platform = getPlatformService()` (line 176)
- For MD books with a `filePath`, opens a `"document"` tab instead of falling through to the reader path

## Tests

- Ran `cd packages/app && pnpm exec tsc --noEmit`
- Result: No new TypeScript errors introduced by this change
- Pre-existing errors (unrelated to this change):
  - `DocumentWorkspace.tsx:45` — possibly undefined join
  - `DesktopImportActions.tsx:19-20` — duplicate `useAppStore` identifier
  - `library-store.ts:1417,1445` — format type mismatch

## Concerns

- None. The change is minimal and well-scoped. `useAppStore` was already imported (line 3). The `"document"` tab type is already a valid `TabType` in the core store. The inserted block is placed exactly as specified in the brief.

## Self-review

- Verified `useAppStore` import exists on line 3
- Verified the `"document"` `TabType` exists in `packages/core/src/stores/app-store.ts` line 6
- Verified `addTab` / `setActiveTab` signatures match the call site
- Verified insertion point is after the remote download block and before the `getPlatformService()` call
- Verified `book.format === "md" && book.filePath` guard is correct — MD books always have a local file pair
- Verified no new TypeScript errors
- Verified commit message follows conventional commit format