# Task 2 Review: Quiz DB Queries

**Commit**: `5ffa60a9` feat: add quiz DB queries (CRUD for sessions, questions, bank)

**Files**:
- `packages/core/src/db/quiz-queries.ts` — 334 lines
- `packages/core/src/db/database.ts` — 19 lines added (re-exports)

---

## Check 1: CRUD for all 3 tables?

### quiz_sessions

| Operation | Function | Verdict |
|-----------|----------|---------|
| Create    | `insertQuizSession` (L8-24) | ✅ |
| Read      | `getQuizSession` (L26-50), `getQuizSessions` (L52-74) | ✅ |
| Update    | `updateQuizSession` (L76-115) | ✅ |
| **Delete**| **None** | ❌ **MISSING** |

### quiz_questions

| Operation | Function | Verdict |
|-----------|----------|---------|
| Create    | `insertQuizQuestions` (L121-143) | ✅ |
| Read      | `getQuizQuestions` (L145-175) | ✅ |
| Update    | `updateQuizQuestion` (L177-216) | ✅ |
| **Delete**| **None** | ❌ **MISSING** |

### question_bank

| Operation | Function | Verdict |
|-----------|----------|---------|
| Create    | `insertQuestionBankEntry` (L222-237) | ✅ |
| Read      | `getQuestionBank` (L239-285) | ✅ |
| Update    | `updateQuestionBankEntry` (L287-318) | ✅ |
| **Delete**| **None** | ❌ **MISSING** |

**Finding**: All 3 tables have Create, Read, Update — but **none have Delete**. The task description says "CRUD" which implies full Create/Read/Update/Delete. Delete functions are missing for all three tables.

---

## Check 2: stemHash exists?

**✅ Yes** — `stemHash` is defined at lines 324–334.

```ts
export function stemHash(stem: string): string
```

It normalizes the stem (trim, collapse whitespace, lowercase) and produces a hash string combining the first 32 characters of the normalized text with a numeric hash. This is suitable for deduplication.

---

## Check 3: JSON columns deserialized?

The schema has these JSON (TEXT) columns:

| Table            | Column       | Type in `QuizQuestion["answer"]` | Write          | Read           |
|------------------|--------------|----------------------------------|----------------|----------------|
| quiz_sessions    | `config`     | `QuizConfig` (object)            | `JSON.stringify` (L16) | `JSON.parse` (L43, L67) | ✅ |
| quiz_questions   | `options`    | `{key, content}[] \| undefined`  | `JSON.stringify` (L132) | `JSON.parse` (L166) | ✅ |
| quiz_questions   | `answer`     | `{correct, explanation}`         | `JSON.stringify` (L133) | `JSON.parse` (L167) | ✅ |
| quiz_questions   | `userAnswer` | `string \| string[] \| undefined`| `JSON.stringify` (L137) | `JSON.parse` (L171) | ✅ |
| question_bank    | `tags`       | `string[]`                       | `JSON.stringify` (L230) | `JSON.parse` (L271) | ✅ |

All JSON columns are consistently serialized (`JSON.stringify`) on write and deserialized (`JSON.parse`) on read. The nullable ones (`options`, `userAnswer`) correctly guard with `r.options ? JSON.parse(...) : undefined`.

---

## Check 4: database.ts re-exports?

**✅ Yes** — `database.ts` lines 120–137 re-export all quiz functions:

```ts
export type { QuizSession, QuizQuestion, QuestionBankEntry, QuizConfig } from "../types/quiz";
export { insertQuizSession, getQuizSession, getQuizSessions, updateQuizSession } from "./quiz-queries";
export { insertQuizQuestions, getQuizQuestions, updateQuizQuestion } from "./quiz-queries";
export { insertQuestionBankEntry, getQuestionBank, updateQuestionBankEntry, stemHash } from "./quiz-queries";
```

Types are also re-exported (L120). All publicly exported query functions from `quiz-queries.ts` appear.

---

## Additional Observations

### 1. Schema ↔ Types consistency ✅

All column names in queries match the DDL from `db-core.ts` (L713-734) and `migrations.ts` (L130-162):

| TypeScript field    | DB column       | Matches? |
|---------------------|-----------------|----------|
| `QuizSession.config` | `config` | ✅ |
| `QuizSession.status` | `status` | ✅ |
| `QuizSession.score` | `score` (REAL) | ✅ |
| `QuizSession.timeSpent` | `time_spent` | ✅ |
| `QuizSession.createdAt` | `created_at` | ✅ |
| `QuizSession.completedAt` | `completed_at` | ✅ |
| `QuizQuestion.sessionId` | `session_id` | ✅ |
| `QuizQuestion.stem` | `stem` | ✅ |
| `QuizQuestion.options` | `options` | ✅ |
| `QuizQuestion.answer` | `answer` | ✅ |
| `QuizQuestion.sourceBookId` | `source_book_id` | ✅ |
| `QuizQuestion.sourceChapter` | `source_chapter` | ✅ |
| `QuizQuestion.difficulty` | `difficulty` | ✅ |
| `QuizQuestion.userAnswer` | `user_answer` | ✅ |
| `QuizQuestion.isCorrect` | `is_correct` | ✅ |
| `QuizQuestion.createdAt` | `created_at` | ✅ |
| `QuestionBankEntry.questionId` | `question_id` | ✅ |
| `QuestionBankEntry.tags` | `tags` | ✅ |
| `QuestionBankEntry.usageCount` | `usage_count` | ✅ |
| `QuestionBankEntry.correctRate` | `correct_rate` | ✅ |
| `QuestionBankEntry.variantOf` | `variant_of` | ✅ |
| `QuestionBankEntry.createdAt` | `created_at` | ✅ |

### 2. Nullable column handling ✅

- `score` / `completedAt` use `Object.prototype.hasOwnProperty.call` to distinguish `undefined` from `null` intentionally set — correct pattern.
- Boolean `isCorrect` stored as `INTEGER` (0/1/null) in DB, converted via `r.is_correct === 1` — correct.
- `correctRate` in `getQuestionBank` uses `r.correct_rate ?? 0` instead of `?? undefined` (type says `number`, default 0 is reasonable).

### 3. `insertQuizQuestions` uses sequential loop

L123: `for (const q of questions)` — inserts are done one at a time. For batch insertion this could be a transaction or multi-value INSERT for performance, but it's functionally correct.

### 4. No single-entry `getQuestionBankEntry` by ID

`getQuestionBank` only supports filtered list queries. There's no `getQuestionBankEntry(id: string): Promise<QuestionBankEntry | null>` function. This may be needed later (e.g., for the update path), but isn't strictly part of the CRUD requirement.

### 5. stemHash is a lossy hash

The hash function uses `Math.abs(hash).toString(16)` which converts negative hashes to positive, losing one bit of entropy. The truncation to 32 chars + hash means very long, similar stems could collide. For deduplication this is acceptable; for uniqueness guarantees it's weak.

---

## Summary

| Check | Item | Result |
|-------|------|--------|
| 1 | CRUD for all 3 tables | ⚠️ **Create, Read, Update present; Delete missing for all 3** |
| 2 | stemHash exists | ✅ |
| 3 | JSON columns deserialized | ✅ |
| 4 | database.ts re-exports | ✅ |

**Overall**: The implementation is solid for the operations it covers — schema consistency, JSON (de)serialization, and re-exports are all correct. The primary gap is missing **Delete** functions for all three tables. If "CRUD" in the commit message was intentional, `deleteQuizSession`, `deleteQuizQuestion` (or `deleteQuizQuestionsBySession`), and `deleteQuestionBankEntry` should be added.