# Format Gating Review — `codex/feature-expansion` Branch

> Audit of format-based feature restrictions across all book formats.
> Generated: 2026-11-02

---

## 1. Format Routing — Complete List of `format ===` Conditionals

### 1.1 Desktop App (`packages/app/src/`)

| # | File | Line | Condition | Blocked/Mapped Behavior |
|---|------|------|-----------|------------------------|
| 1 | `components/reader/NotebookPanel.tsx` | 93 | `bookFormat === "CBZ"` | CBZ notes stored as standalone `Note` instead of highlight+note |
| 2 | `components/reader/NotebookPanel.tsx` | 115 | `isCbz` check in `handleSave` | Routes note creation path (standalone Note vs highlight+note) |
| 3 | `components/reader/ReaderToolbar.tsx` | 233 | `bookFormat === "CBZ"` | Shows/hides "Add Page Note" sticky-note button |
| 4 | `components/reader/SelectionPopover.tsx` | 45,64,88,91 | `isPdf` parameter | Disables highlight + note for PDF |
| 5 | `components/reader/ReaderView.tsx` | 3103 | `bookFormat === "PDF"` | Passes `isPdf` flag to SelectionPopover |
| 6 | `components/reader/FoliateViewer.tsx` | 2491 | `format === "PDF"` | PDF-specific theme filter + text selection overlay |
| 7 | `lib/reader/document-loader.ts` | 163 | `book.format === "md"` | Hard-routes MD books to `document` editor tab (not reader) |
| 8 | `lib/reader/document-loader.ts` | 225 | `format === "PDF" \|\| format === "CBZ"` | `isFixedLayoutFormat()` — determines fixed vs reflowable layout |
| 9 | `lib/library/open-book.ts` | 163 | `book.format === "md" && book.filePath` | Hard-routes MD to document editor tab instead of reader |
| 10 | `lib/rag/book-extractor.ts` | 33 | `format === "PDF"` | PDF extraction via pdfjs-dist (fallback: text-less CBZ returns empty) |
| 11 | `lib/rag/book-extractor.ts` | 40 | `format === "EPUB"` | EPUB-specific TOC fallback extraction |
| 12 | `stores/library-store.ts` | 297,302 | `book.format === "epub"` / `"pdf"` | Cover repair: different extraction for EPUB vs PDF vs other |
| 13 | `stores/library-store.ts` | 497,507 | `format === "epub"` / `"pdf"` | Metadata extraction: EPUB/PDF have optimized path; MOBI/AZW/FB2/CBZ use full DocumentLoader |
| 14 | `stores/library-store.ts` | 549 | `format === "pdf"` | PDF cover fallback after metadata extraction failure |
| 15 | `stores/library-store.ts` | 1017 | `mdDuplicate.format === "md"` | MD duplicate detection during import |
| 16 | `stores/library-store.ts` | 1061,1072 | `format === "epub"` / `"pdf"` | Same metadata extraction branching as #13 (import path) |

### 1.2 Mobile App (`packages/app-expo/src/`)

| # | File | Line | Condition | Blocked/Mapped Behavior |
|---|------|------|-----------|------------------------|
| 17 | `screens/LibraryScreen.tsx` | 565 | `book.format === "md"` | Routes MD to `DocumentEditor` screen instead of reader |
| 18 | `stores/library-store.ts` | 180 | `format === "epub"` | EPUB gets optimized metadata extraction |
| 19 | `stores/library-store.ts` | 192 | `format === "mobi" \|\| ... "azw3"` | MOBI/AZW uses range-readable file extraction |
| 20 | `stores/library-store.ts` | 206 | `format === "epub" \|\| "txt" \|\| "umd" \|\| "md"` | `shouldAutoVectorizeMobile()` — only these formats auto-vectorize |
| 21 | `stores/library-store.ts` | 1210 | `mdDuplicate.format === "md"` | MD duplicate detection |

### 1.3 Core (`packages/core/src/`)

| # | File | Line | Condition | Blocked/Mapped Behavior |
|---|------|------|-----------|------------------------|
| 22 | `export/annotation-exporter.ts` | 56,274 | `format === "json"` | Export format (JSON vs Markdown) — not book format |

---

## 2. Per-Feature Format Gating Analysis

### 2.1 Bookmarks

| Platform | Finding | Status |
|----------|---------|--------|
| Desktop | `ReaderToolbar.tsx` line 223-231: Bookmark button always visible, no format check in toggle handler. | ✅ OK |
| Desktop | `TOCPanel.tsx`: Bookmarks tab always available, filtered by `bookId` only. | ✅ OK |
| Desktop | `BookmarkRibbon.tsx`: Always renders when `visible=true`, no format check. | ✅ OK |
| Mobile | `ReaderScreen.tsx` line 1853-1862: Bookmark button always visible, `handleToggleBookmark` in `useReaderBookmark` hook. | ✅ OK |
| Mobile | `TOCPanel`: Bookmarks tab always available. | ✅ OK |

**Conclusion**: Bookmarks work for **all 10 formats** (EPUB, PDF, MOBI, AZW, AZW3, CBZ, FB2, FBZ, TXT, UMD) on both desktop and mobile. MD is excluded because it's routed to the document editor.

### 2.2 TTS (Text-to-Speech)

| Platform | Finding | Status |
|----------|---------|--------|
| Desktop | `ReaderToolbar.tsx` line 307-314: TTS button always visible, no format check. | ⚠️ Partial |
| Desktop | `FoliateViewer.tsx`: TTS segments extracted from DOM text content. Works for reflowable formats (EPUB, MOBI, FB2, TXT, etc.). Fixed-layout (PDF, CBZ) uses fallback text extraction. | ⚠️ Partial |
| Desktop | `SelectionPopover.tsx` line 95: "Speak selection" button always available, no format check. | ✅ OK |
| Mobile | `ReaderScreen.tsx` line 1762-1770: TTS button always visible, `handleToggleTTS` from `useReaderTTS` hook. | ✅ OK |

**Conclusion**: TTS button is **always visible**. However, TTS quality depends on text extraction:
- **EPUB/MOBI/FB2/TXT**: Full TTS support, paragraph-by-paragraph highlighting.
- **PDF**: TTS works via text layer extraction, but quality depends on the PDF's embedded text.
- **CBZ (comics)**: No text to speak → TTS effectively useless but not blocked. The button is still visible, which could confuse users.

### 2.3 Notes & Highlights (NotebookPanel / SelectionPopover)

| Platform | Finding | Status |
|----------|---------|--------|
| Desktop | `ReaderToolbar.tsx` line 213-221: Notebook button always visible. | ⚠️ Partial |
| Desktop | `NotebookPanel.tsx` line 93: `isCbz` check → CBZ notes are standalone `Note` records (page-level), while EPUB/PDF/reflowable use highlight+note. | ⚠️ Partial |
| Desktop | `SelectionPopover.tsx` line 64-91: `isPdf` flag → highlight + note **disabled** for PDF. Only Copy/Translate/AskAI/Speak remain. | ❌ Blocked |
| Mobile | `ReaderScreen.tsx` line 1869-1871: Notebook button always visible. | ✅ OK |

**Detailed Analysis — SelectionPopover**:
- **EPUB/MOBI/FB2/TXT**: Full highlight + note + copy + translate + ask AI + speak.
- **PDF**: `isPdf=true` → Highlights and Notes are **completely blocked** (buttons greyed out with tooltip "PDF doesn't support highlighting"). Copy/Translate/AskAI/Speak still work.
- **CBZ (comics)**: No text to select → SelectionPopover never appears. Cannot highlight or create notes from selection. However, CBZ has a dedicated "Add Page Note" button in the toolbar, which creates standalone notes linked to page indices.

**NotebookPanel**:
- **EPUB/MOBI/FB2/TXT/PDF**: Shows highlights with/without notes. Notes use highlight+note model.
- **CBZ**: Shows standalone CBZ page notes section. Note links use `page-{n}` CFI format.

### 2.4 Full-Text Search

| Platform | Finding | Status |
|----------|---------|--------|
| Desktop | `ReaderToolbar.tsx` line 316-323: Search button always visible. | ✅ OK |
| Desktop | `FoliateViewer.tsx` line 1979-1984: `search()` method delegates to foliate-js `viewRef.current.search(opts)`, no format check. | ✅ OK |

**Conclusion**: Search is **never format-gated** in the app layer. foliate-js handles the format differences internally. All formats that have text content support search.

### 2.5 AI Chat / Ask Book

| Platform | Finding | Status |
|----------|---------|--------|
| Desktop | `ReaderToolbar.tsx` line 334-342: Chat button always visible. `ChatPanel` receives `book` prop with no format check. | ✅ OK |
| Desktop | `SelectionPopover.tsx` line 94: "Ask AI" button always available (even for PDF). | ✅ OK |
| Mobile | `ReaderScreen.tsx` line 1771-1776: BotIcon button always navigates to `BookChat` with `bookId`. | ✅ OK |

**Conclusion**: AI Chat is available for **all formats**. The chat panel receives the book object and uses RAG context if available, or falls back to a generic prompt.

### 2.6 Chapter Translation

| Platform | Finding | Status |
|----------|---------|--------|
| Desktop | `ReaderToolbar.tsx` line 255: `ChapterTranslationMenu` always rendered. | ✅ OK |
| Desktop | `useChapterTranslation.ts`: No format check in the hook. Works with `getParagraphs()` DOM extraction. | ✅ OK |

**Conclusion**: Chapter translation is available for all reflowable formats (any with DOM text content). For fixed-layout (PDF/CBZ), it may fail silently or produce no output since there are no paragraph nodes to extract.

### 2.7 Auto-Vectorization (RAG Indexing)

| Platform | Finding | Status |
|----------|---------|--------|
| Desktop | `stores/library-store.ts` line 1186-1199: Auto-vectorize triggered for **all formats** when enabled. No format filter. | ✅ OK |
| Mobile | `stores/library-store.ts` line 205-206: `shouldAutoVectorizeMobile()` → only `epub`, `txt`, `umd`, `md`. | ❌ Blocked |

**Desktop**: `extractBookChapters()` works for:
- **EPUB/MOBI/AZW/FB2/FBZ/TXT**: Full chapter extraction.
- **PDF**: Uses pdfjs-dist for per-page text extraction.
- **CBZ**: Fallback — sections have no text, produces empty chapters. Vectorization succeeds but results are useless.

**Mobile**: Only EPUB, TXT, UMD, MD are auto-vectorized. PDF, MOBI, AZW, AZW3, CBZ, FB2, FBZ are **explicitly excluded** from mobile auto-vectorization.

---

## 3. The MD Book Hard-Routing Issue

This is the direct parallel to the issue mentioned in the task description.

### Desktop: `open-book.ts` line 163
```typescript
if (book.format === "md" && book.filePath) {
  // Opens in document editor tab (type: "document"), not reader tab (type: "reader")
}
```

### Mobile: `LibraryScreen.tsx` line 565
```typescript
if (book.format === "md") {
  nav.navigate("DocumentEditor", { bookId: book.id, initialPreview: true });
} else {
  await openMobileBook(...);
}
```

**Impact**: When a user opens an MD book:
- ❌ **Blocked from reader**: No bookmarks, highlights, TTS, search, chapter translation, or any reader-only feature.
- ✅ **Routed to editor**: Gets a markdown editor with preview mode.
- MD is converted to EPUB internally during import, but the stored `format` remains `"md"`, so the routing always sends it to the editor.

**This is intentional** — MD files are treated as editable documents, not read-only books. However, if the user wants to read an MD file with full reader features (TTS, bookmarks, etc.), they are blocked.

---

## 4. Summary Matrix

| Feature | EPUB | PDF | MOBI/AZW | CBZ | FB2/FBZ | TXT/UMD | MD |
|---------|------|-----|----------|-----|---------|---------|-----|
| **Bookmarks** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ (no reader) |
| **TTS** | ✅ | ⚠️ (text-layer) | ✅ | ⚠️ (no text) | ✅ | ✅ | ❌ (no reader) |
| **Highlights** | ✅ | ❌ (blocked) | ✅ | ❌ (no text sel) | ✅ | ✅ | ❌ (no reader) |
| **Notes (standalone)** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ (no reader) |
| **Full-text Search** | ✅ | ✅ (text-layer) | ✅ | ⚠️ (no text) | ✅ | ✅ | ❌ (no reader) |
| **AI Chat / Ask Book** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ (no reader) |
| **Chapter Translation** | ✅ | ⚠️ (DOM-based) | ✅ | ⚠️ (no DOM) | ✅ | ✅ | ❌ (no reader) |
| **Auto-Vectorize (desktop)** | ✅ | ✅ | ✅ | ⚠️ (empty) | ✅ | ✅ | ✅ |
| **Auto-Vectorize (mobile)** | ✅ | ❌ (excluded) | ❌ (excluded) | ❌ (excluded) | ❌ (excluded) | ✅ | ✅ |

---

## 5. Risk Classification

### ❌ Blocked (functionally unavailable)
1. **PDF Highlights & Notes**: `SelectionPopover.tsx` line 64 — `isPdf` flag blocks highlight creation. This is a **known foliate-js limitation** (PDF text selection requires SVG-based highlight rendering which is complex).
2. **Mobile PDF/MOBI/CBZ/FB2 Auto-Vectorization**: `shouldAutoVectorizeMobile()` explicitly excludes these formats. This is a **resource-conservation decision** for mobile devices.
3. **MD Reader Features**: All reader-only features blocked by routing MD to editor.

### ⚠️ Partially Limited (available but degraded)
1. **CBZ TTS & Search**: Button visible but no text content — effectively useless for comics.
2. **CBZ Chapter Translation**: May fail silently on fixed-layout formats.
3. **PDF TTS**: Quality depends on embedded text layer.
4. **PDF Chapter Translation**: No paragraph DOM nodes in PDF pages → translation may produce no output.

### ✅ OK (fully available)
1. Bookmarks — all formats in reader
2. AI Chat — all formats in reader (and MD in editor)
3. Full-text Search — all formats with text content
4. Desktop auto-vectorization — all formats (though CBZ is empty)

---

## 6. Recommendations

### High Priority
1. **PDF Highlight Support**: Investigate foliate-js SVG-based highlight rendering for PDFs. This is the single biggest format gap — users with PDF books cannot highlight or annotate.

### Medium Priority
2. **Mobile Vectorization Parity**: Consider enabling PDF/MOBI auto-vectorization on mobile when the device has sufficient resources (detect available RAM/CPU).
3. **MD "Read Mode"**: Consider a toggle to open MD files in the reader (with TTS, bookmarks) alongside the editor mode. MD is already converted to EPUB during import, so the reader can handle it.

### Low Priority
4. **CBZ TTS Button**: Consider hiding the TTS button for CBZ/comics since it's never useful.
5. **Format-Aware Feature Availability**: Add a metadata flag like `features: { tts: boolean, highlight: boolean, search: boolean }` per book, derived from format + content analysis, and use it to selectively hide toolbar buttons.