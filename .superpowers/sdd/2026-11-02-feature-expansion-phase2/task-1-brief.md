# Task 1: Add `quad_points` column to highlights table

## Files
- Modify: `packages/core/src/types/annotation.ts` — add `quadPoints?: number[]` to `Highlight`
- Modify: `packages/core/src/db/migrations.ts` — add migration v14
- Modify: `packages/core/src/db/db-core.ts` — inline ALTER TABLE fallback (after last ALTER TABLE around line 660)
- Modify: `packages/core/src/db/highlight-queries.ts` — update `getHighlights`, `getAllHighlights`, `getAllHighlightsWithBooks`, `insertHighlight`

## Steps

- [ ] **Step 1: Add `quadPoints` to Highlight type**

In `packages/core/src/types/annotation.ts`, add to `Highlight` after `cfi`:
```ts
/** PDF highlight bounding rect in page coordinate space. Flat array [x1,y1,x2,y2,x3,y3,x4,y4]. null/undefined for EPUB. */
quadPoints?: number[];
```

- [ ] **Step 2: Add migration v14 to `migrations.ts`**

Look at the last migration (around v13, line ~120). Add after it:
```ts
{
  version: 14,
  description: "Add quad_points column to highlights for PDF highlight positioning",
  up: "ALTER TABLE highlights ADD COLUMN quad_points TEXT",
},
```

- [ ] **Step 3: Add inline ALTER TABLE in `db-core.ts`**

Find the last inline ALTER TABLE in the `setupDatabase` function (look for `ALTER TABLE books ADD COLUMN reviews TEXT` or similar). Add after the last one:
```ts
await database.execute("ALTER TABLE highlights ADD COLUMN quad_points TEXT");
```

- [ ] **Step 4: Update `getHighlights` in `highlight-queries.ts`**

In the `select` call output mapping (line 26-37), add:
```ts
quadPoints: r.quad_points ? JSON.parse(r.quad_points) : undefined,
```

Also update the TypeScript select type to include `quad_points: string | null`.

- [ ] **Step 5: Update `getAllHighlights` similarly**

Same pattern as Step 4. Add `quad_points` to the select type and map it.

- [ ] **Step 6: Update `getAllHighlightsWithBooks` similarly**

Add `quad_points` column if the query uses `SELECT *`. If it uses explicit column names, add `h.quad_points`.

- [ ] **Step 7: Update `insertHighlight`**

Add `quad_points` to the INSERT. Before the INSERT, compute:
```ts
const quadPointsJson = highlight.quadPoints && highlight.quadPoints.length > 0
  ? JSON.stringify(highlight.quadPoints)
  : null;
```
Then add to the column list: `"quad_points"` and to the values array `quadPointsJson`.

- [ ] **Step 8: Verify compiles**

Run: `pnpm vitest run packages/core/src/` (quick check, at minimum tsc for core)

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/types/annotation.ts packages/core/src/db/migrations.ts packages/core/src/db/db-core.ts packages/core/src/db/highlight-queries.ts
git commit -m "feat: add quad_points column to highlights table for PDF positioning"
```

## Spec Ref
From `docs/feature-expansion/02-cross-format-notes.md`:
- Highlight 类型扩展 `location` 字段，PDF 高亮用 `pageNumber + textQuadPoints`
- 数据库 migration：`highlights` 表新增位置相关列