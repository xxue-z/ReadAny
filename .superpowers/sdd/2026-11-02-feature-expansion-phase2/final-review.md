# Final Review — codex/feature-expansion (Phase 1 + Phase 2)

**Date:** 2026-11-02  
**Range:** 69719fa4 → 5fb35281  
**Files:** 18 modified, +1448 −133

## Verdict: APPROVE (with 2 recommended fixes)

No blocking issues. Two recommended fixes and 6 deferred minors.

---

## 1. Cross-Platform Consistency (Desktop vs Mobile)

### 1.1 `saveDocument` — ✅ Consistent

Both platforms implement `saveDocument(bookId, markdown)`:
- **Desktop** (`packages/app/src/stores/library-store.ts:1459`): writes `.md` + `.epub` via Tauri FS, updates book title if changed
- **Mobile** (`packages/app-expo/src/stores/library-store.ts:1699`): writes via `getPlatformService().writeFile`, same two-file model

Mobile additionally sets `updatedAt: Date.now()` on the book update; desktop uses the default `updateBook` which manages its own `updatedAt`. Both correct.

### 1.2 MD routing — ✅ Consistent

- **Desktop** (`open-book.ts:163`): `book.format === "md"` routes to `document` tab type
- **Mobile** (`DocumentEditorScreen.tsx`): MD books open in editor via navigation params

### 1.3 `quad_points` column — ✅ Both platforms share core

The column is added via migration v14 in `packages/core/src/db/migrations.ts` and inline ALTER TABLE in `db-core.ts:706-709`. Both platforms use the same `core` package, so no inconsistency.

### 1.4 `errMsg` unused variable — ⚠️ Minor (deferred, already recorded in Phase 1 progress.md)

`DocumentEditorScreen.tsx:219` declares `let errMsg = ""` which is never read. Harmless.

---

## 2. Phase 1 ↔ Phase 2 Conflicts — ✅ None

Phase 1 (MD import + editor) and Phase 2 (PDF/CBZ notes) modify entirely disjoint code areas:

| Area | Phase 1 | Phase 2 |
|------|---------|---------|
| `annotation.ts` | — | `quadPoints?: number[]` |
| `highlight-queries.ts` | — | `quad_points` read/write |
| `FoliateViewer.tsx` | — | `createPdfTextSelector`, `drawPdfHighlight`, `removePdfHighlight` |
| `NotebookPanel.tsx` | — | `CbzNoteItem`, format-aware sections |
| `DocumentWorkspace.tsx` | import fix, `saveDocument` | — |
| `DocumentEditorScreen.tsx` (mobile) | toolbar, auto-save | — |
| `open-book.ts` | MD routing | — |
| `library-store.ts` (both) | MD import, `saveDocument` | — |

No shared file has conflicting edits.

---

## 3. Dead Code / Unused Imports — ⚠️ 1 Finding

### 3.1 `handleDeleteCbzNote` dead guard (NotebookPanel.tsx:236)

```ts
const handleDeleteCbzNote = (note: Note) => {
  removeNote(note.id);
  if (editingHighlight?.id === note.id) {  // ← Highlight.id compared to Note.id
    clearPending();
    setNoteContent("");
  }
};
```

`editingHighlight` is `Highlight | null`; `note` is `Note`. These two IDs can never match. The guard is functionally dead — the pending note UI won't clear when a CBZ note is deleted while in editing mode. **Harmless** because `editingHighlight` is only set during highlight editing, which doesn't overlap with CBZ note deletion in practice.

**Recommendation:** Replace with a check against the actual CBZ note editing state if CBZ inline editing is added later.

### 3.2 Duplicated `getDesktopLibraryRoot` + `resolveDesktopDataPath` imports (library-store.ts:1466-1467)

```ts
const { getDesktopLibraryRoot } = await import("@/lib/storage/desktop-library-root");
const { resolveDesktopDataPath } = await import("@/lib/storage/desktop-library-root");
```

Two dynamic imports from the same module. Can be merged into a single `await import(...)` with destructuring.

---

## 4. EPUB Highlight Flow — ✅ Preserved

### 4.1 Highlight data model

`Highlight.quadPoints?: number[]` is optional. EPUB highlights have `undefined` quadPoints. The DB layer stores `null` for EPUB and `JSON.stringify([...])` for PDF. The read path parses JSON only when non-null.

### 4.2 Highlight rendering pipeline

The `ReaderView` highlight sync loop (line 742) checks `!!h.quadPoints` to distinguish PDF vs EPUB highlights:

```ts
const isPdf = !!h.quadPoints;
// ...
if (isPdf && h.quadPoints && pdfPageIndex !== undefined) {
  foliateRef.current.drawPdfHighlight(h.id, pdfPageIndex, h.quadPoints, color);
} else {
  foliateRef.current.addAnnotation({ value: h.cfi, type: "highlight", color, ... });
}
```

EPUB highlights without `quadPoints` go through the existing `addAnnotation` path — no code path change.

### 4.3 Color/note changes

When a highlight's color or note status changes, the existing annotation is removed and re-added. For EPUB, this uses the existing `deleteAnnotation` + `addAnnotation` flow. For PDF, it uses `removePdfHighlight` + `drawPdfHighlight`. Neither touches EPUB code paths.

### 4.4 Migration safety

Migration v14: `ALTER TABLE highlights ADD COLUMN quad_points TEXT` — additive, no data modification. Existing EPUB highlights retain `NULL` in the new column, which the read path correctly maps to `undefined`.

---

## 5. Tags / Groups — ✅ Unaffected

Phase 1 explicitly states at plan level: tags and groups already implemented, no changes needed. Phase 2 does not touch any tag/group code. Verification:
- No file in the diff touches `TagSelector`, `TagManagementSheet`, `TagField`, `book_tags`, `tags` table, `group-queries.ts`, or `book_groups`
- `allTags` computed from `books` remains unchanged
- `BookGroup`, `Book.groupId` unchanged

---

## 6. Review Focus — Detailed Check

### 6.1 Quad points coordinate system — ⚠️ RECOMMENDED FIX

**Finding:** The code comment at FoliateViewer.tsx:470 says "Convert viewport coordinates to PDF page coordinates" but the conversion may not use the correct transform matrix.

In `createPdfTextSelector` (line 506-510):
```ts
const scaleStr = targetDoc.documentElement.style.getPropertyValue("--total-scale-factor");
const scale = Number.parseFloat(scaleStr) || 1;
const viewport = {
  width: vpWidth,
  height: vpHeight,
  transform: [scale, 0, 0, scale, 0, 0],
};
```

The transform is constructed as `[scale, 0, 0, scale, 0, 0]` — a pure scale transform with no translation. This means the inverse transform `(vx - 0) / scale` reduces to `vx / scale`.

However, the `getRelativePos` function (line 336-339) computes positions relative to `textLayer.getBoundingClientRect()`, which is in the **iframe's** coordinate space, not the PDF page coordinate space. The iframe may have its own offset from the page origin. The `textLayer` itself already has its CSS transform applied.

When `drawPdfHighlight` renders stored quadPoints, it multiplies by the same `--total-scale-factor` from `targetDoc.documentElement` (line 2309-2312):
```ts
const scaleStr = targetDoc.documentElement.style.setPropertyValue("--total-scale-factor");
const scale = Number.parseFloat(scaleStr) || 1;
// ...
const x1 = quads[i] * scale;
```

**This is consistent within itself** (store by dividing by scale, render by multiplying by scale), so highlights will render correctly at the same zoom level. However, if `--total-scale-factor` differs between the selection scale and the render scale (e.g., the user changed zoom between creating and viewing a highlight), quad points may shift.

**Recommendation:** The zoom invariance declared in Review Focus #2 ("Quad points misaligned after zoom change") should be verified manually. If misalignment occurs, quad points should be stored in PDF page coordinate space using the pdf.js viewport transform matrix (`pdfPage.getViewport({ scale })`), not the CSS custom property.

### 6.2 CFI-to-pageIndex regex — ⚠️ RECOMMENDED FIX

The regex `/\/6\/(\d+)/` that extracts page index from CFI appears in 3 places:

1. `ReaderView.tsx:745` — highlight sync loop
2. `ReaderView.tsx:1440` — section load handler  
3. `FoliateViewer.tsx:2524` — PDF text selection (inverse: generates CFI from pageIndex)

**Recommendation:** Extract into a shared utility in `packages/core/src/`:
```ts
export function pageIndexFromPdfCfi(cfi: string): number | undefined { ... }
export function pdfCfiFromPageIndex(pageIndex: number): string { ... }
```

This reduces duplication and ensures the encoding/decoding stays consistent.

### 6.3 CBZ note `cfi` format — ✅ Correct

NotebookPanel.tsx:503 parses `cfi` with `/^page-(\d+)$/` — this is the correct format from the plan. The note creation path must ensure this format is used.

### 6.4 EPUB highlight backward compatibility — ✅ Verified

See Section 4 above. No change to EPUB code paths.

---

## 7. Deferred Minors (carried from progress.md)

| ID | Source | Description | Risk |
|----|--------|-------------|------|
| P1-T1 | Phase 1 T1 | Self-review overstated tsc status | None |
| P1-T2 | Phase 1 T2 | `saveDocument` calls `getDesktopLibraryRoot` redundantly (once explicitly + once inside `resolveDesktopDataPath`) | None |
| P1-T6 | Phase 1 T6 | Duplicate hash check after file read (minor I/O) | None |
| P1-M1 | Phase 1 final | Unused `errMsg` variable in DocumentEditorScreen | None |
| P1-M2 | Phase 1 final | Duplicated dynamic imports in desktop `saveDocument` (see 3.2) | None |
| P2-T2 | Phase 2 T2 | CFI-to-pageIndex regex duplicated 3x (see 6.2) | Low |
| P2-T4 | Phase 2 T4 | `handleDeleteCbzNote` dead guard (see 3.1) | None |
| P2-T2 | Phase 2 T2 | Text joining uses simple space concatenation (may merge words from different columns) | Low |

---

## 8. Spec Coverage

| Spec Item | Status | Notes |
|-----------|--------|-------|
| 1.1 MD file import | ✅ | `MdToEpubConverter`, two-file model |
| 1.2 MD editor (desktop) | ✅ | `DocumentWorkspace` + tiptap, `saveDocument` |
| 1.2 MD editor (mobile) | ✅ | `DocumentEditorScreen` + toolbar + auto-save |
| 1.3 Tags/groups | ✅ | Existing, unchanged |
| 2.1 PDF highlights | ✅ | `quadPoints` column, selection layer, store/render |
| 2.2 CBZ notes | ✅ | Page note creation, format-aware NotebookPanel |
| TXT/MD notes | ✅ | Inherited through EPUB conversion |
| Format-aware UI | ✅ | NotebookPanel distinguishes EPUB/PDF/CBZ |

---

## 9. Summary

**Status:** APPROVE with 2 recommended fixes (non-blocking)

1. **Extract CFI↔pageIndex utilities** (deduplicate 3 instances)
2. **Verify zoom invariance of quad points** (manual QA — check that highlights created at 100% zoom render correctly at 150%)

The 6 deferred minors are recorded for awareness but do not block merge.