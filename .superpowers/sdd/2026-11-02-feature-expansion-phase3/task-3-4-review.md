# Phase 3 — Task 3 & 4 Combined Review

**Reviewer:** delegated subagent  
**Date:** 2026-11-02  
**Files reviewed:**
- `packages/core/src/quiz/quiz-generator.ts` (689 lines)
- `packages/core/src/quiz/report-builder.ts` (176 lines)

---

## Task 3: `quiz-generator.ts` — `generateQuizQuestions` + `generateVariantQuestion`

### 3.1 Does `generateQuizQuestions` call `search()` + `createChatModel()`?

| Check | Result | Evidence |
|-------|--------|----------|
| Calls `search()` | ✅ **PASS** | Imported at L4 from `../rag/search`. Called at L99 inside `fetchChunksForBook`, which is invoked at L492 within `generateQuizQuestions`. Uses hybrid mode, per-book topK, and a threshold of 0.3. |
| Calls `createChatModel()` | ✅ **PASS** | Imported at L3 from `../ai/llm-provider`. Called at L533 with `aiConfig` + `{ temperature: 0.7, streaming: false }`. |

Both dependencies are correctly wired. The full pipeline is: resolve book IDs → RAG search per book → build prompt → `createChatModel()` → `model.invoke()` → parse.

### 3.2 Does it handle malformed JSON without crashing?

| Check | Result | Evidence |
|-------|--------|----------|
| Graceful JSON parsing | ✅ **PASS** | Multi-layer resilient pipeline — see details below. |
| Returns empty/partial on total failure | ✅ **PASS** | L554-556: `return []` if `tryParseAsQuestions` returns `null`. |
| Individual question failures don't abort | ✅ **PASS** | L561-576: per-question validation wrapped in try/catch; malformed entries silently skipped. |

**Resilient parsing chain (L226-369):**

1. **`extractJson()`** (L226-244): Strips markdown code fences (` ```json...``` `), handles nested fences recursively.
2. **`tryParseAsQuestions()`** (L246-277): Tries direct `JSON.parse` first. On failure, falls through to regex/bracket extraction — never throws.
3. **`findBalancedArray()`** (L280-313): Scans for balanced `[...]` using a depth counter that respects string escapes. Returns `null` on failure.
4. **`findJsonObjects()`** (L316-369): Last resort — finds individual `{...}` objects with the same depth-counter approach, tries `JSON.parse` per-object and catches errors silently.
5. **`validateAndMapQuestion()`** (L371-436): Validates every field (stem, type, answer, options) and returns `null` for any invalid entry rather than throwing.

**Error isolation is also present upstream:**
- `getExistingStemHashes()` (L39-59): catches DB errors, returns empty set.
- `resolveBookIds()` (L66-83): caller wraps in try/catch (L475-479), returns `[]`.
- `fetchChunksForBook()` (L89-119): per-query try/catch (L98-115); individual search failures skip silently.
- `createChatModel()` (L529-537): try/catch returns `[]`.
- LLM `invoke` (L540-546): try/catch returns `[]`.

**Verdict: PASS.** The code can survive LLM returning markdown, truncated JSON, stray text, invalid fields, DB failures, search failures, and model-creation failures — all without crashing.

### 3.3 Does `generateVariantQuestion` exist?

| Check | Result | Evidence |
|-------|--------|----------|
| Exported function | ✅ **PASS** | L594: `export async function generateVariantQuestion(...)` |
| Signature | ✅ **PASS** | `(baseQuestion: QuizQuestion, aiConfig?: AIConfig): Promise<QuizQuestion>` |
| Calls `createChatModel()` | ✅ **PASS** | L620 with `{ temperature: 0.8, streaming: false }` — higher temperature than generation for creative rewording. |
| Calls `model.invoke()` | ✅ **PASS** | L628. |
| Fallback on failure | ✅ **PASS** | L599-610: constructs a `fallbackVariant` with `[Variant]` prefix. Returns it when `aiConfig` is missing (L613), model creation fails (L623), invocation fails (L632), response is empty (L636), parsing fails (L643), or validation fails (L650, L654). |
| Resilient parsing | ✅ **PASS** | Reuses the same `tryParseAsQuestions()` + `extractJson()` chain. |
| Validates output | ✅ **PASS** | L649-654 checks stem and type against `ALL_QUESTION_TYPES`. L658-668 validates answer and options with fallback to base question values. |

**Verdict: PASS.** The function exists, is well-structured, and never crashes — it always returns at least a fallback variant.

### T3 Overall: ✅ ALL 3 CHECKS PASS

---

## Task 4: `report-builder.ts` — `buildQuizReport`

### 4.1 Does `buildQuizReport` load session + questions?

| Check | Result | Evidence |
|-------|--------|----------|
| Loads session | ✅ **PASS** | L22: `await getQuizSession(sessionId)`. Throws if not found (L23-25). |
| Loads questions | ✅ **PASS** | L27: `await getQuizQuestions(sessionId)`. |
| Imports from correct modules | ✅ **PASS** | L10: `getQuizSession`, `getQuizQuestions`, `getQuizSessions` from `../db/quiz-queries`. |

### 4.2 Does it compute summary (`correctRateByType`)?

| Check | Result | Evidence |
|-------|--------|----------|
| `computeSummary()` exists | ✅ **PASS** | L42-73, called at L30. |
| Computes `correctRateByType` | ✅ **PASS** | L50-64: iterates questions, groups by `q.type`, computes correct/total per type. Returns `Record<string, number>`. |
| Computes other summary fields | ✅ **PASS** | `totalQuestions`, `correctCount`, `correctRate`, `timeSpent` (L46-71). |
| Returns `QuizSummary` | ✅ **PASS** | L66-72 matches the `QuizSummary` type with all required fields. |

### 4.3 Does it compute `weakAreas` from `question_bank` tags?

| Check | Result | Evidence |
|-------|--------|----------|
| Queries `question_bank` | ✅ **PASS** | `loadBankEntriesForQuestionIds()` (L129-145) runs `SELECT question_id, tags FROM question_bank WHERE question_id IN (...)` and parses tags with `JSON.parse`. |
| Groups by tag | ✅ **PASS** | L94-104: builds `tagQuestions` map (`tag → Set<questionId>`). |
| Computes error rate per tag | ✅ **PASS** | L107-117: counts incorrect answers per tag, computes `errorRate = incorrect / totalQuestionsWithTag`. |
| Returns `WeakArea[]` | ✅ **PASS** | L112-116: pushes `{ tag, errorRate, questionCount }`. Sorted descending by errorRate (L120). |
| Empty-questions guard | ✅ **PASS** | L80: returns `[]` immediately when no questions. |

### 4.4 Does it compute history trends?

| Check | Result | Evidence |
|-------|--------|----------|
| Loads past sessions | ✅ **PASS** | L152: `await getQuizSessions(10)` — last 10 sessions. |
| Computes per-session stats | ✅ **PASS** | L156-167: loads questions per session, computes `correctRate` from `q.isCorrect`. |
| Returns `HistoryTrend[]` | ✅ **PASS** | Each entry has `sessionId`, `date`, `score`, `correctRate` (L162-166). |
| Chronological order | ✅ **PASS** | L173: `trends.reverse()` — `getQuizSessions` is most-recent-first, reversed for chronological display. |
| Empty guard | ✅ **PASS** | L153: returns `[]` when no sessions exist. |

### T4 Overall: ✅ ALL 4 CHECKS PASS

---

## Summary

| Task | Check | Status |
|------|-------|--------|
| T3.1 | `generateQuizQuestions` calls `search()` + `createChatModel()` | ✅ PASS |
| T3.2 | Malformed JSON handled without crashing | ✅ PASS |
| T3.3 | `generateVariantQuestion` exists | ✅ PASS |
| T4.1 | `buildQuizReport` loads session + questions | ✅ PASS |
| T4.2 | Computes summary (`correctRateByType`) | ✅ PASS |
| T4.3 | Computes `weakAreas` from `question_bank` tags | ✅ PASS |
| T4.4 | Computes history trends | ✅ PASS |

**Combined verdict: ALL 7 CHECKS PASS. Both tasks are complete and correct.**