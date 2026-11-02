# Task 6 Report: MD duplicate import detection

## Status

DONE

## Commits

- `ea933b28fdf8deb8fabed6bd547f009d848a33cd` — feat: detect and skip duplicate MD imports by file hash

## Summary

Added MD-format-specific duplicate import detection in both desktop and mobile `importBooks` actions.

### Changes

**Desktop** (`packages/app/src/stores/library-store.ts`):
- At the start of the `if (ext === "md")` block (line 1014), added a re-check against `duplicateIndex.byHash` for the current file's hash, filtered to `format === "md"`. If a duplicate is found, it pushes to `result.skippedDuplicates` and `continue`s — using the same skip/duplicate tracking pattern already established in the generic `findDuplicateBookByHash` check at line 946.
- Renamed the MD converter output variable from `result` to `mdResult` to avoid block-scoping conflict with the outer `ImportBooksResult` variable.

**Mobile** (`packages/app-expo/src/stores/library-store.ts`):
- Same pattern added at the start of the `if (ext === "md")` block (line 1207). The mobile code already used `conversion` for the converter output (not `result`), so no variable renaming was needed.

### Why inside the MD block?

The generic `findDuplicateBookByHash` check (line 946 desktop / 934 mobile) already catches hash-based duplicates across ALL formats using the initial `duplicateIndex`. The MD-specific check inside the MD block serves two purposes:
1. **Format-specific filtering**: Only skips books that are already MD format, avoiding false positives if a non-MD book happens to share the same hash.
2. **Within-batch dedup**: The `duplicateIndex.byHash` is updated after each successful import (line 1171 desktop / 1272 mobile), so this re-check catches MD files imported earlier in the same batch.

## Tests

- `tsc --noEmit` on `packages/app`: passes (pre-existing errors in unrelated files only)
- `tsc --noEmit` on `packages/app-expo`: passes (pre-existing error at line 690 in reimport function only)

## Concerns

None.