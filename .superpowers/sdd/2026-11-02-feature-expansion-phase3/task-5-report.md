# Task 5 Report: Quiz Zustand Store

**Status**: ✅ Complete  
**Date**: 2026-11-02

## Files Changed

### Created
- [`packages/core/src/stores/quiz-store.ts`](../../../packages/core/src/stores/quiz-store.ts) — 266 lines

### Modified
- [`packages/core/src/stores/index.ts`](../../../packages/core/src/stores/index.ts) — added 3 lines (export block for `useQuizStore` + `QuizState`)

## Implementation Summary

### State shape (`QuizState`)

| Field | Type | Purpose |
|---|---|---|
| `sessions` | `QuizSession[]` | All loaded history sessions |
| `currentSession` | `QuizSession \| null` | Active or resumed session |
| `currentQuestions` | `QuizQuestion[]` | Questions for current session |
| `currentQuestionIndex` | `number` | Current question position |
| `isGenerating` | `boolean` | LLM generation in progress |
| `isTaking` | `boolean` | User actively answering |
| `report` | `QuizReport \| null` | Built after completion |

### Actions

#### `startQuiz(config, aiConfig?)` → `Promise<void>`
1. Sets `isGenerating = true`
2. Calls `generateQuizQuestions(config, aiConfig)` — RAG + LLM pipeline
3. Generates a fresh `sessionId` via `generateId()`
4. Remaps all question `sessionId` fields to match the session
5. Persists session (`insertQuizSession`) and questions (`insertQuizQuestions`) to SQLite
6. Sets `isTaking = true`, `currentSession`, `currentQuestions`, `currentQuestionIndex = 0`
7. On error: clears `isGenerating` and re-throws

#### `submitAnswer(questionId, answer)` → `void`
1. Finds question by ID in `currentQuestions`
2. Sets `userAnswer`
3. **Auto-grades** non-`short_answer` types:
   - `single_choice` / `true_false`: direct string equality
   - `multi_choice`: sorted array comparison (order-independent)
   - `short_answer`: `isCorrect` stays `undefined`
4. Persists to DB via `updateQuizQuestion` (fire-and-forget)
5. Auto-advances `currentQuestionIndex` to next question (unless on last)

#### `completeQuiz()` → `Promise<void>`
1. Persists any unanswered `short_answer` questions with `isCorrect = null`
2. Calls `buildQuizReport(currentSession.id)` — loads fresh data from DB
3. Computes `score` as 0–100 integer from `report.summary.correctRate`
4. Updates session status to `"graded"` with score and `completedAt`
5. Sets `report`, `isTaking = false`

#### `loadSessions()` → `Promise<void>`
- Fetches all sessions via `getQuizSessions()` and stores in `sessions`

#### `loadSession(id)` → `Promise<void>`
- Fetches session via `getQuizSession(id)`
- Fetches questions via `getQuizQuestions(id)`
- Positions `currentQuestionIndex` at first unanswered question
- Sets `isTaking = true`, clears `report`

### Design Decisions

- **Session ID ownership**: `generateQuizQuestions()` internally creates its own `sessionId`. The store generates a separate ID and remaps question `sessionId` fields to own the session lifecycle.
- **Auto-advance**: `submitAnswer` only advances when the answered question is the current one, preventing jumps when the user navigates freely.
- **DB persistence strategy**: Answers are persisted fire-and-forget in `submitAnswer` — the UI does not block on DB writes. On `completeQuiz`, all writes are awaited before building the report.
- **Error resilience**: Generation failures clear `isGenerating` and re-throw for UI handling. DB persist failures in `submitAnswer` log to console but don't crash the flow.

### Verification

- `tsc --noEmit --project packages/core/tsconfig.json` passes with zero errors
- All type imports resolve correctly from `../types` (re-exported via `types/index.ts`)
- All DB query functions used match their signatures in `quiz-queries.ts`
- Store follows the same Zustand `create<T>((set, get) => ({…}))` pattern as `app-store.ts`