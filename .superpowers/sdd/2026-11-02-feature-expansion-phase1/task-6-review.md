# Task 6 Review: MD Duplicate Import Detection

## Verdict: ✅ APPROVED

All 5 checklist items pass.

---

### Checklist

| # | Check | Desktop | Mobile | Status |
|---|-------|---------|--------|--------|
| 1 | `importBooks` checks `fileHash` before importing MD | ✅ L1016 | ✅ L1209 | **PASS** |
| 2 | mobile `importBooks` checks `fileHash` before importing MD | — | ✅ L1209 | **PASS** |
| 3 | Duplicates added to `result.skippedDuplicates` correctly | ✅ L1018-L1021 | ✅ L1211-L1214 | **PASS** |
| 4 | Variable naming conflict resolved (`mdResult` vs `result`) | ✅ L1031-L1037 | N/A (mobile uses `conversion`) | **PASS** |
| 5 | No new TypeScript errors | ✅ (pre-existing only) | ✅ (pre-existing only) | **PASS** |

---

### Detailed Analysis

#### 1. Desktop (lines 1014–1041)

```
1014:  if (ext === "md") {
1015:    // Re-check for MD duplicate by hash within this batch
1016:    const mdDuplicate = duplicateIndex.byHash.get(fileHash ?? "");
1017:    if (mdDuplicate && mdDuplicate.format === "md") {
1018:      result.skippedDuplicates.push({
1019:        name: fileName,
1020:        existingBook: mdDuplicate,
1021:      });
1022:      continue;
1023:    }
```

- Hash check is **before** any heavy work (converter import, file read, conversion).
- `duplicateIndex.byHash.get(fileHash)` mirrors the exact pattern from the outer check at L946.
- `mdDuplicate.format === "md"` ensures format-specific filtering (won't skip if a non-MD book shares the same hash).
- `result.skippedDuplicates.push({name, existingBook})` matches the `ImportBooksResult` type exactly (see `packages/core/src/import/import-dedupe.ts:5-8`).
- Variable rename from `result` → `mdResult` (L1031) avoids shadowing the outer `result: ImportBooksResult` variable declared at L907. All 4 usages updated (L1031, L1032, L1037).

#### 2. Mobile (lines 1207–1216)

```
1207:  if (ext === "md") {
1208:    // Re-check for MD duplicate by hash within this batch
1209:    const mdDuplicate = duplicateIndex.byHash.get(fileHash ?? "");
1210:    if (mdDuplicate && mdDuplicate.format === "md") {
1211:      result.skippedDuplicates.push({
1212:        name: fileName,
1213:        existingBook: mdDuplicate,
1214:      });
1215:      continue;
1216:    }
```

- Identical pattern to desktop. Hash check at top of MD block.
- Mobile code already used `conversion` (not `result`) for the converter output variable, so no naming conflict existed.
- `fileHash` is populated at L931 via `getMobileFileStat(filePath)` — good.

#### 3. Why in-branch (not only outer)?

The report correctly explains: the generic `findDuplicateBookByHash` check (desktop L946, mobile L934) runs against `duplicateIndex` built **before** the batch loop starts. The in-branch re-check catches MD files imported **earlier in the same batch**, since `duplicateIndex.byHash` is updated after each successful import (desktop L1171, mobile L1272). Without this, importing two identical MD files in the same `importBooks` call would allow the second one through.

The `format === "md"` filter is a safety measure: if a non-MD book happens to hash to the same value (extremely unlikely with MD5, but defensive), it would not block the MD import.

#### 4. Type correctness

Both `result.skippedDuplicates.push({name: fileName, existingBook: mdDuplicate})` calls match the `ImportBooksResult.skippedDuplicates` type:
```ts
skippedDuplicates: Array<{ name: string; existingBook: Book }>;
```

`mdDuplicate` is typed as `Book | undefined` (Map.get returns `Book | undefined`), and the `if (mdDuplicate && ...)` guard ensures it's narrowed to `Book` before the push.

#### 5. Diff scope

The diff (review-package.md) shows changes in exactly 2 target files plus 2 unrelated files:
- `packages/app/src/stores/library-store.ts` — 16 insertions, 5 deletions (the MD dedup check + `mdResult` rename)
- `packages/app-expo/src/stores/library-store.ts` — 10 insertions (the MD dedup check)
- `packages/core/src/utils/md-to-epub.test.ts` — test additions (from task 5, not task 6)
- `packages/app-expo/src/screens/DocumentEditorScreen.tsx` — unrelated `isLoading` guard (not task 6)

The task-6-relevant changes are clean and focused.

---

### Concerns

None. The implementation is correct, consistent across platforms, and uses the established patterns from the outer dedup check. Both `tsc --noEmit` checks pass (only pre-existing unrelated errors remain).