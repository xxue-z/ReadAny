# Task 4 Report: Quiz Report Builder

## Status: ✅ Complete

## Summary

Implemented `buildQuizReport(sessionId)` in `packages/core/src/quiz/report-builder.ts`. The function loads a quiz session and its questions from the database, then computes four report sections: summary statistics, weak-area analysis, history trend data, and the full question list.

## Changes

### Created
- `packages/core/src/quiz/report-builder.ts` — `buildQuizReport()` and internal helpers:
  - `computeSummary()` — total/correct counts, overall correct rate, per-type correct rates, time spent
  - `computeWeakAreas()` — joins session questions with `question_bank` by `question_id`, aggregates error rates per tag (descending order, weakest first)
  - `computeHistory()` — loads the last 10 quiz sessions, computes `correctRate` from each session's questions, returns chronological `HistoryTrend[]`
  - `loadBankEntriesForQuestionIds()` — direct DB query to fetch `question_bank` rows for a batch of question IDs (avoids loading the entire bank)

## Design Decisions

- **Question-bank join**: Used a raw `SELECT … WHERE question_id IN (…)` query because `getQuestionBank()` only supports filtering by `bookId`/`type`/`tags`, not by question IDs. This avoids loading the entire bank table into memory.
- **History correctRate**: Computed from each session's questions rather than trusting a cached value, ensuring accuracy even if questions are updated after grading.
- **Parallel loading**: `computeHistory` loads questions for all 10 sessions in parallel via `Promise.all`.

## Verification
- `tsc --noEmit` on `@readany/core`: **passed** (0 errors in report-builder.ts; 2 pre-existing issues in quiz-generator.ts unrelated to this task)

## Commit
`(pending)` — `feat: add quiz report builder with statistics and weak-area analysis`