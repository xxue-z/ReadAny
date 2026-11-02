# Task 1 Review: Add `quad_points` column to highlights table

## Verdict: ✅ APPROVED — No issues found.

## Checklist

| # | Check | Result |
|---|-------|--------|
| 1 | `quadPoints?: number[]` added to `Highlight` type | ✅ `annotation.ts:25` — optional, correct JSDoc |
| 2 | Migration v14 added with correct version and description | ✅ `migrations.ts:124-128` — `version: 14`, `up: "ALTER TABLE highlights ADD COLUMN quad_points TEXT"` |
| 3 | Inline ALTER TABLE in `db-core.ts` | ✅ `db-core.ts:705-710` — wrapped in try/catch, placed after last inline ALTER TABLE |
| 4 | `getHighlights` reads `quad_points` and parses JSON | ✅ line 35: `JSON.parse(r.quad_points)` with null guard |
| 5 | `getAllHighlights` also updated | ✅ line 65: same pattern |
| 6 | `getAllHighlightsWithBooks` also updated | ✅ line 106: same pattern; explicit `h.quad_points` in SELECT |
| 7 | `insertHighlight` writes `quad_points` | ✅ lines 162-176: serialized to JSON, column added to INSERT |
| 8 | All tests pass | ✅ 86 files / 655 tests (per implementer report) |

## Additional Notes

- **`updateHighlight` gap**: The function does not handle `quadPoints` updates. This is acknowledged in the report and deferred to a later task (Phase 2 Task 3+). Not a defect for this task.
- **Consistency**: All three read functions and the write function follow identical serialization patterns. The optional field maps cleanly: `NULL` → `undefined`.
- **Migration safety**: Both the migration system and the inline ALTER TABLE silently skip if the column already exists, consistent with all prior migrations.

## Files Changed

| File | Insertions | Deletions |
|------|-----------|-----------|
| `packages/core/src/types/annotation.ts` | +2 | 0 |
| `packages/core/src/db/migrations.ts` | +5 | 0 |
| `packages/core/src/db/db-core.ts` | +7 | 0 |
| `packages/core/src/db/highlight-queries.ts` | +14 | -2 |
| **Total** | **+28** | **-2** |

## Review Date

2026-11-02