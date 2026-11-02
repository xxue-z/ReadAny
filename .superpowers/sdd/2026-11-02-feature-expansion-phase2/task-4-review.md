# Task 4 Review: CBZ page-level notes and format-aware NotebookPanel

**Reviewer:** AI agent review  
**Date:** 2026-11-02  
**Verdict:** ✅ APPROVED — all 6 checklist items pass

---

## Checklist Summary

| # | Criterion | Result |
|---|-----------|--------|
| 1 | "Add Page Note" button appears only for CBZ format? | ✅ PASS |
| 2 | CBZ note uses cfi = "page-{n}" format? | ✅ PASS |
| 3 | NotebookPanel shows CBZ notes in "Page Notes" section with "Page N Note" label? | ✅ PASS |
| 4 | CBZ notes are standalone (no highlightId)? | ✅ PASS |
| 5 | EPUB/PDF flows unchanged? | ✅ PASS |
| 6 | No new TS errors? | ✅ PASS |

---

## Detailed Findings

### 1. "Add Page Note" button appears only for CBZ format

**Location:** `ReaderToolbar.tsx` lines 233–243

```tsx
{bookFormat === "CBZ" && (
  <Button ... onClick={handleAddCbzPageNote} title={t("notebook.addPageNote")}>
    <StickyNote className="h-3.5 w-3.5" />
  </Button>
)}
```

- `bookFormat` is typed as `BookFormat?` (line 56), which is `"CBZ"` (not `"cbz"`). The `document-loader.ts` `BookFormat` type confirms `"CBZ"` is the correct literal.
- The `StickyNote` icon is imported from `lucide-react` (line 24).
- `handleAddCbzPageNote` (lines 144–155) guards with `bookFormat !== "CBZ"` before constructing the CFI.
- The button is rendered only when `bookFormat === "CBZ"`. ✅

### 2. CBZ note uses cfi = "page-{n}" format

**Location:** `ReaderToolbar.tsx` lines 144–155

```typescript
const handleAddCbzPageNote = () => {
  if (!bookId || bookFormat !== "CBZ") return;
  const pageIndex = currentPage > 0 ? currentPage - 1 : 0; // 0-based
  const cfi = `page-${pageIndex}`;
  const chapterTitle = `Page ${currentPage}`; // 1-based display
  startNewNote({ text: chapterTitle, cfi, chapterTitle });
};
```

- CFI uses 0-based page index (`page-0`, `page-1`, …), consistent with foliate-js's CBZ fake CFI scheme (noted in the brief line 10).
- `chapterTitle` uses 1-based display: `"Page 1"`, `"Page 2"`, etc.
- The `CbzNoteItem` sub-component (NotebookPanel.tsx lines 501–505) parses back from `page-{n}` → page `n+1` for display:

```typescript
const pageNumber = useMemo(() => {
  const match = note.cfi?.match(/^page-(\d+)$/);
  return match ? Number.parseInt(match[1], 10) + 1 : null;
}, [note.cfi]);
```

- Tests in `task-4-review-package.md` lines 884–897 confirm the `page-{n}` round-trip. ✅

### 3. NotebookPanel shows CBZ notes in "Page Notes" section with "Page N Note" label

**Location:** `NotebookPanel.tsx` lines 373–405 (CBZ Page Notes section)

```tsx
{isCbz && bookNotes.length > 0 && (
  <div className="border-b border-border/40">
    <button ... onClick={() => toggleSection("cbzNotes")}>
      <StickyNote ... />
      <span>{t("notebook.pageNotes")}</span>  {/* "Page Notes" / "页面笔记" */}
      <span>({bookNotes.length})</span>
    </button>
    {expandedSections.cbzNotes && (
      <div>
        {bookNotes.map((note) => (
          <CbzNoteItem key={note.id} note={note} ... />
        ))}
      </div>
    )}
  </div>
)}
```

- The `CbzNoteItem` sub-component (lines 498–562) renders:
  - `t("notebook.pageNNote", { n: pageNumber })` → "Page N Note" / "第 N 页笔记"
  - Content preview (first line of `note.content`)
  - `chapterTitle` if present
- Edit/delete actions are available on hover. ✅

### 4. CBZ notes are standalone (no highlightId)

**Locations:**

1. **Save path** (NotebookPanel.tsx lines 115–141): When `isCbz` is true, `handleSave` creates a **plain `Note`** object with no `highlightId` field:
   ```typescript
   addNote({
     id: generateId(),
     bookId,
     cfi: pendingNote.cfi,
     title: pendingNote.chapterTitle || pendingNote.text,
     content: noteContent,
     chapterTitle: pendingNote.chapterTitle,
     tags: [],
     createdAt: Date.now(),
     updatedAt: Date.now(),
   });
   ```

2. **Edit path** (NotebookPanel.tsx lines 214–222): `handleEditCbzNote` sets `highlightId: undefined` explicitly:
   ```typescript
   startNewNote({
     text: note.title,
     cfi: note.cfi || "",
     chapterTitle: note.chapterTitle,
     existingNote: note.content,
     highlightId: undefined,
   });
   ```

3. **Upsert path** (NotebookPanel.tsx lines 117–125): The existing-note lookup uses `!n.highlightId` filter:
   ```typescript
   const existingNote = bookNotes.find((n) => n.cfi === pendingNote.cfi && !n.highlightId);
   ```

No `highlightId` linkage anywhere in the CBZ flow. ✅

### 5. EPUB/PDF flows unchanged

**Location:** `NotebookPanel.tsx` lines 142–159 (the `else` branch of `isCbz` check)

The original `createSelectionNoteMutation` flow is preserved exactly for non-CBZ formats:
```typescript
} else {
  // EPUB/PDF: highlight + note via createSelectionNoteMutation
  const mutation = createSelectionNoteMutation({ ... });
  if (mutation.kind === "create") {
    addHighlight(mutation.highlight);
    onAddAnnotation?.(pendingNote.cfi, mutation.highlight.color, mutation.highlight.note);
  }
  clearDraft(pendingNote.text);
  clearPending();
}
```

- The selection text preview (with `<Highlighter>` icon) is guarded by `!isCbzEditing && editingText` (line 311), so it still shows for EPUB/PDF. ✅
- The editor shows the CBZ header only when `isCbzEditing && pendingNote` (line 327). ✅
- The three existing highlight sections (Highlights with Notes, Highlights without Notes, Empty state) are untouched. ✅

### 6. No new TS errors

The task report states "`tsc --noEmit` passes: no new type errors in modified files." The diff shows:

- `BookFormat` type imported from `@/lib/reader/document-loader` in both `ReaderToolbar.tsx` (line 4) and `NotebookPanel.tsx` (line 4).
- The type literal `"CBZ"` matches the `BookFormat` union: `"EPUB" | "PDF" | "MOBI" | "AZW" | "AZW3" | "CBZ" | "FB2" | "FBZ" | "TXT"`.
- `currentPage?: number` is added as an optional prop; defaults to `0`.
- All new state operations (`addNote`, `updateNote`, `removeNote`) are already present on `useAnnotationStore`.
- `generateId` import added from `@readany/core/utils` (used for note IDs). ✅

---

## Minor Observations (non-blocking)

1. **CBZ section visibility even for non-CBZ books:** The "Page Notes" section rendering is guarded by `isCbz && bookNotes.length > 0` (line 374), so it won't show for EPUB/PDF. However, `bookNotes` is always populated from `notes` store (line 86). For non-CBZ books, `bookNotes` will be empty under normal operation (unless standalone notes from CBZ sessions linger). This is fine — the section simply won't render.

2. **Export now includes notes:** `annotationExporter.export` now receives `bookNotes` instead of `[] as Note[]` (line 269–274). This means standalone CBZ notes will be included in exports (markdown, JSON). This is a beneficial side-effect and consistent with user expectations.

3. **i18n keys:** Three new keys added to both `en/reader.json` and `zh/reader.json` under `notebook`:
   - `addPageNote` — "Add page note" / "添加页面笔记"
   - `pageNotes` — "Page Notes" / "页面笔记"
   - `pageNNote` — "Page {{n}} Note" / "第 {{n}} 页笔记"

4. **Delete CBZ note — guard condition:** In `handleDeleteCbzNote` (lines 234–240), the guard `if (editingHighlight?.id === note.id)` compares a `Highlight` id against a `Note` id. These are different types and will never match, so this guard is effectively dead code. The `clearPending()` call is still reachable via the preceding conditional path. This is harmless but slightly misleading — it suggests a shared state model that doesn't apply. (Not a regression, just a minor style note.)

---

## Conclusion

All 6 checklist items pass. The implementation correctly:
- Shows the "Add Page Note" button only for CBZ format books
- Uses `page-{n}` (0-based) CFI consistent with foliate-js
- Displays CBZ notes in a dedicated "Page Notes" section with "Page N Note" labels
- Creates standalone `Note` objects without `highlightId` linkage
- Preserves all existing EPUB/PDF highlight+note flows
- Introduces no new TypeScript errors

**Status:** ✅ READY TO MERGE