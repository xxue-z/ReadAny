# SDD ledger — plan: docs/superpowers/plans/2026-11-02-feature-expansion-phase2.md

## Pre-flight scan

The plan has 6 tasks. Scan results:

| Task pair | Shared file/interface | Finding |
|-----------|----------------------|---------|
| T2 ↔ T3 | FoliateViewer.tsx | T2 adds PDF text selection layer; T3 stores and renders highlight overlays on top. Compatible: T2 produces selection data; T3 consumes it and renders overlays in a separate section. Dispatch T2 first, then T3 gets the file with selection layer. |
| T1 ↔ T3 | Highlight.quadPoints type | T1 defines the type and DB column; T3 writes and reads quadPoints. Clean dependency. |
| T4 ↔ T3 | FoliateViewer.tsx, NotebookPanel.tsx | T4 adds CBZ note button in FoliateViewer and format-aware display in NotebookPanel. T3's highlight overlay code is in a different section of FoliateViewer. Dispatch T4 after T3. |
| T5 → T1, T3, T4 | Test files | Independent — tests already-implemented types and DB from T1, T3, T4. |
| T6 → all | docs/ only | Independent. |

Scan verdict: **Clean.** T1→T2→T3→T4 serial on FoliateViewer.tsx; T5 and T6 independent. Dispatch in task order.

All task self-consistency checks: each task's tests, files, and interfaces agree with its own text. No plan-mandated items conflict with review rules.

---

Task 1: complete (commits 7b29b553..a7707d3d, review clean)
Task 1: minor (deferred): updateHighlight does not handle quadPoints yet

Task 2: complete (commits a7707d3d..3982f2d0, review clean)
Task 2: minors (deferred): CFI-to-pageIndex parsing duplicated 3x; clicking existing PDF highlights may not trigger popover; text joining uses simple space concat

Task 3: complete (commits 3982f2d0..3b14673b, review clean)

Task 4: complete (commits f0245847..5fb35281, review clean)
Task 4: minor (deferred): handleDeleteCbzNote has dead guard comparing Highlight id to Note id — harmless

## Final Review

Final review: **APPROVED** (no blockers, 2 recommended fixes + 6 deferred minors).
Task 5: complete (commits 3b14673b..29e57f5c, review clean)
Task 6: complete (commits 3b14673b..f0245847, review clean)