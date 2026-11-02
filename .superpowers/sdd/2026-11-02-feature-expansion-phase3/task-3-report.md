# Task 3 Report: Quiz Generator (LLM + RAG)

## Status: ✅ Complete

## Summary

Created `packages/core/src/quiz/quiz-generator.ts` with two public functions:
`generateQuizQuestions` (RAG-enhanced batch generation) and
`generateVariantQuestion` (single question rephrasing).

## Implementation

### Created
- `packages/core/src/quiz/quiz-generator.ts` (689 lines)

### `generateQuizQuestions(config, aiConfig?)` flow

1. **Resolve books** — prefers `config.bookIds`, falls back to
   `reading_sessions` within `config.timeRange`, finally all sessions.
2. **RAG chunk retrieval** — per book, runs ~5 hybrid search queries
   ("key concepts", "important ideas", …), deduplicates by chunk ID,
   sorts by score, collects `topK * 2` chunks.
3. **Prompt builder** — assembles chunks as numbered context blocks,
   injects `questionCount`, `typeDistribution`, `difficulty`, and a
   strict JSON output schema.
4. **LLM call** — `createChatModel(aiConfig, { temperature: 0.7, streaming: false }).invoke(prompt)`.
5. **JSON parsing (resilient)** — three-tier strategy:
   - Direct `JSON.parse` (with markdown fence stripping)
   - Balanced-bracket array extraction
   - Individual JSON object extraction (best-effort)
   Returns partial results on any failure; never throws.
6. **Validation + dedup** — each parsed question is validated (stem,
   type, options, answer) and checked against existing `question_bank`
   entries via `stemHash`. Internal duplicates within the same batch
   are also filtered.
7. **Cap** — returns at most `config.questionCount` questions.

### `generateVariantQuestion(baseQuestion, aiConfig?)` flow

1. Builds prompt with original question JSON, asking LLM to rephrase
   stem and distractors.
2. Calls LLM with `temperature: 0.8` for diversity.
3. Parses response with same resilient parser.
4. Falls back to `[Variant]`-prefixed original on any failure.

### Key design decisions

- **Context window safety**: total context capped at 12,000 chars to
  prevent token overflow.
- **Dedup**: queries `question_bank JOIN quiz_questions` for all
  existing stems; if the query fails (e.g. table doesn't exist),
  dedup gracefully degrades to empty set.
- **`generateId()`** used for all UUIDs (cross-platform compatible).
- **No `throw`** anywhere after initial validation — every LLM and
  parse failure returns empty array (or fallback variant).

## Hard rules verified

- ✅ NEVER crash on malformed LLM JSON — all `JSON.parse` calls are
  wrapped in try/catch with fallback extractors.
- ✅ Partial results returned on parse failures — individual malformed
  questions are skipped.
- ✅ `stemHash` dedup against `question_bank`.
- ✅ `search()` for RAG chunk retrieval.
- ✅ `createChatModel(aiConfig)` for LLM.
- ✅ `reading_sessions` for book resolution.

## Verification

- `tsc --noEmit` on `@readany/core`: **passed** (0 errors)

## Commit

See next step.