# Final Review — `codex/feature-expansion` (Phase 1)

**Review scope:** `69719fa4..4da7ea37` (9 commits, 7 files changed, +443/−59)

**Verdict: NEEDS FIXES** — 1 cross-platform data inconsistency (format mismatch), 1 dead code variable, 1 missing import destructuring cleanup.

---

## ✅ Strengths

- **Two-file model correctly implemented on both platforms** — `.md` source + `.epub` derived created at import time, both files written on save.
- **MD routing placement is correct** — in `openDesktopBook`, after remote-download block, before file-existence check (line 163). The `book.format === "md" && book.filePath` guard is appropriate.
- **saveDocument store action** correctly writes both `.md` and `.epub` on both desktop (`library-store.ts:1459–1478`) and mobile (`library-store.ts:1699–1719`).
- **Mobile toolbar** is syntactically correct and functional — `applyMarkdownSyntax` handles both selection-wrapping and placeholder-insertion.
- **Auto-save** works on both platforms: 3s debounce on desktop, 3s debounce + immediate save on `AppState` background/inactive on mobile.
- **All 27 md-to-epub tests pass** (verified: `pnpm vitest run packages/core/src/utils/md-to-epub.test.ts` → 27/27).
- **Tags/groups untouched** — only additive changes to library stores.
- **Biome formatting** consistent (2 spaces, double quotes, semicolons).

---

## 🔴 Critical Issues

None found. All core architecture decisions are sound.

---

## 🟡 Important Issues

### I-1: Cross-platform `inspectDeletedBookCandidate` format mismatch for MD files

**File:** `packages/app/src/stores/library-store.ts`, line 677  
**File:** `packages/app-expo/src/stores/library-store.ts`, line 698

Desktop `inspectDeletedDesktopBookCandidate` returns `format: "epub"` for MD files (line 677):
```ts
return { title, author, format: "epub", fileHash };
```

Mobile `inspectDeletedMobileBookCandidate` returns `format: "md"` (line 698):
```ts
return { title, author, format: "md", fileHash };
```

**Impact:** In `open-book.ts` (line 56), `shouldConfirmReimportCandidate` checks `originalBook.format !== candidate.format`. If an MD book (`format: "md"`) is re-inspected on desktop, the candidate returns `"epub"` → format mismatch → spurious confirmation dialog.

**Severity:** Latent bug. The MD routing in `openDesktopBook` (line 163) returns early before this code path for MD books with valid `filePath`. Only triggered if `book.filePath` is falsy for an MD book, which shouldn't happen in practice. Still, the data is wrong and creates a ticking inconsistency for future changes.

**Fix:** Change line 677 from `format: "epub"` to `format: "md"`:
```diff
- return { title, author, format: "epub", fileHash };
+ return { title, author, format: "md", fileHash };
```

---

## 🟢 Minor Issues

### M-1: Dead code — unused `errMsg` variable in mobile DocumentEditorScreen

**File:** `packages/app-expo/src/screens/DocumentEditorScreen.tsx`, line 219

```ts
let errMsg = "";
```

Declared but never read. A linter (Biome `noUnusedVariables`) should flag this. Remove or use in the catch block's `console.warn`.

### M-2: Duplicated dynamic imports in desktop `saveDocument`

**File:** `packages/app/src/stores/library-store.ts`, lines 1466–1467

```ts
const { getDesktopLibraryRoot } = await import("@/lib/storage/desktop-library-root");
const { resolveDesktopDataPath } = await import("@/lib/storage/desktop-library-root");
```

Two separate `import()` calls to the same module. Should be a single destructured import:
```ts
const { getDesktopLibraryRoot, resolveDesktopDataPath } = await import("@/lib/storage/desktop-library-root");
```

This is the T2 deferred minor — already noted in the ledger, low-priority. No functional impact.

### M-3: Duplicate hash check in desktop MD import

**File:** `packages/app/src/stores/library-store.ts`, lines 946–953 (primary) + 1016–1023 (secondary)

The MD import branch has a second `duplicateIndex.byHash.get(fileHash)` check inside the MD-specific block, after the primary duplicate check already ran. Redundant because MD files pass through the primary check first. This is the T6 deferred minor — already noted in the ledger.

### M-4: Whitespace-only markdown save behavior asymmetry

**Verification checklist** item 5.8 notes: desktop `handleSave` guards `!markdown.trim()` (does not save), but mobile `handleSave` does not have this guard — it saves regardless of content. The checklist correctly flags this as "需统一行为" (needs behavior unification). This is a UX consistency issue between platforms.

**File:** `packages/app/src/components/editor/DocumentWorkspace.tsx`, line 69  
**File:** `packages/app-expo/src/screens/DocumentEditorScreen.tsx`, lines 282–294

---

## 📋 Review Focus Checklist

| # | Focus Area | Status | Notes |
|---|-----------|--------|-------|
| 1 | `saveDocument` writes both .md and .epub on both platforms | ✅ | Desktop: lines 1470–1473; Mobile: lines 1707–1711 |
| 2 | MD routing in `openDesktopBook` at correct position | ✅ | After remote block (line 160), before file check (line 176) |
| 3 | Dead code paths / unused imports | ⚠️ | M-1: `errMsg` in DocumentEditorScreen.tsx:219 |
| 4 | Mobile toolbar syntactically correct and functional | ✅ | `applyMarkdownSyntax` handles selection and placeholder correctly |
| 5 | Edge cases from test-cases-phase1.md covered | ✅ | Tests cover empty, large, mixed CJK/Latin, XML escaping, no-heading fallback |
| 6 | Cross-platform inconsistencies | ⚠️ | I-1: format mismatch in `inspectDeletedBookCandidate` |

---

## 📊 Deferred Minors from Task Reviews

| ID | Description | Status |
|----|------------|--------|
| T1 | Self-review overstated tsc status (5 pre-existing errors) | Noted — no code impact |
| T2 | `getDesktopLibraryRoot` called redundantly in `saveDocument` | Noted — no functional impact |
| T6 | Duplicate hash check after file read | Noted — minor I/O waste |

---

## 🧪 Test Results

```
pnpm vitest run packages/core/src/utils/md-to-epub.test.ts
✓ 27 tests passed (33ms)
```

All 27 tests pass: EPUB structure, chapter splitting, GFM tables, code fences, XML escaping (NCX + XHTML body), language detection (zh/en), CJK/Latin threshold boundaries, large input (5000 lines), whitespace-only fallback, empty input fallback.

---

## Recommendation

**APPROVED for merge after fixing I-1.**

I-1 (format mismatch in `inspectDeletedDesktopBookCandidate`) is a one-line fix that prevents a latent cross-platform data inconsistency. M-1 through M-4 are non-blocking and can be addressed in a follow-up cleanup PR.