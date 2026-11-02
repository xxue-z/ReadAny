# Task 1 Report: Quiz types and DB migration (v15-v17)

## Status: ✅ Complete

## Summary

Created quiz type definitions and added three database migrations (v15, v16, v17) for quiz sessions, questions, and question bank tables.

## Changes

### Created
- `packages/core/src/types/quiz.ts` — All quiz type definitions:
  - `QuizType`, `QuizStatus`, `QuestionType` (union types)
  - `QuizConfig`, `QuizSession`, `QuizQuestion`, `QuestionBankEntry`
  - `QuizSummary`, `WeakArea`, `HistoryTrend`, `QuizReport`

### Modified
- `packages/core/src/types/index.ts` — Added `export * from "./quiz"`
- `packages/core/src/db/migrations.ts` — Added migrations v15 (quiz_sessions), v16 (quiz_questions), v17 (question_bank)
- `packages/core/src/db/db-core.ts` — Added inline `CREATE TABLE IF NOT EXISTS` fallback statements for all three quiz tables

## Verification
- `tsc --noEmit` on `@readany/core`: **passed** (0 errors)

## Commit
`56174488` — `feat: add quiz types and DB schema (sessions, questions, bank)`