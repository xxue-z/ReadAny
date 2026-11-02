### Final Review — codex/feature-expansion (Phase 1+2)
MERGE_BASE: 69719fa4
HEAD: 5fb35281f8cdd1e1135e398e0e7a2c6770da39e9
---
COMMITS:
5fb35281 feat: add CBZ page-level notes and format-aware note UI
29e57f5c test: add PDF quad-points serialization and CBZ note CFI tests
f0245847 docs: add Phase 2 cross-format notes verification checklist
3b14673b feat: add quadPoints support to updateHighlight
3982f2d0 feat: add PDF text selection layer with quad-point extraction
a7707d3d feat: add quad_points column to highlights table for PDF positioning
7b29b553 fix: use correct md format in inspectDeletedDesktopBookCandidate
4da7ea37 docs: add phase 1 verification checklist
ea933b28 feat: detect and skip duplicate MD imports by file hash
5fc80bb0 test: enhance md-to-epub tests covering edge cases and test-cases-phase1 scenarios
e974164d feat: add isLoading guard to mobile editor background save
1dce4be8 feat: add saveDocument store action and auto-save to mobile editor
8f4c6cd3 feat: add markdown syntax toolbar to mobile document editor
54fdbe7a feat: route MD books to DocumentWorkspace editor on desktop
58e59e1d feat: add saveDocument store action and use in DocumentWorkspace
61f7fe5d fix: add missing resolveDesktopDataPath import and remove duplicate join in DocumentWorkspace
---
FILES CHANGED:
 docs/feature-expansion/verification-checklist.md   | 147 +++++++
 .../app-expo/src/screens/DocumentEditorScreen.tsx  | 196 +++++++--
 packages/app-expo/src/stores/library-store.ts      |  33 ++
 .../src/components/editor/DocumentWorkspace.tsx    |  33 +-
 .../app/src/components/reader/FoliateViewer.tsx    | 487 ++++++++++++++++++++-
 .../app/src/components/reader/NotebookPanel.tsx    | 286 ++++++++++--
 .../app/src/components/reader/ReaderToolbar.tsx    |  34 +-
 packages/app/src/components/reader/ReaderView.tsx  | 144 ++++--
 packages/app/src/lib/library/open-book.ts          |  14 +
 packages/app/src/stores/library-store.ts           |  40 +-
 .../core/src/__tests__/pdf-highlight-quads.test.ts |  67 +++
 packages/core/src/db/db-core.ts                    |   7 +
 packages/core/src/db/highlight-queries.ts          |  22 +-
 packages/core/src/db/migrations.ts                 |   5 +
 packages/core/src/i18n/locales/en/reader.json      |   5 +-
 packages/core/src/i18n/locales/zh/reader.json      |   5 +-
 packages/core/src/types/annotation.ts              |   2 +
 packages/core/src/utils/md-to-epub.test.ts         |  54 +++
 18 files changed, 1448 insertions(+), 133 deletions(-)
