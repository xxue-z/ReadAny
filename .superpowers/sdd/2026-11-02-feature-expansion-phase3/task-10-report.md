# Phase 3 Task 10 Report: Quiz Test Suite

**Date:** 2026-11-02
**Commit:** `891af177` — `test: add quiz generator LLM parsing and scoring tests`

## Summary

Added a comprehensive test suite for the quiz module covering stem hash deduplication, JSON parsing resilience, scoring logic, and template configuration validation. 25 tests all pass.

## Changes

### New Files

| File | Description |
|------|-------------|
| `packages/core/src/quiz/quiz-generator.test.ts` | 25 test cases across 4 test groups |

### Modified Files

| File | Change |
|------|--------|
| `packages/core/src/quiz/quiz-generator.ts` | Exported `extractJson`, `tryParseAsQuestions`, `validateAndMapQuestion` for testability |
| `packages/core/src/quiz/report-builder.ts` | Exported `computeSummary` for testability |

## Test Cases (25 total)

### 1. stemHash dedup (3 tests)

| Test | Description |
|------|-------------|
| Same stem, different whitespace → same hash | Verifies normalization (trim, collapse whitespace, lowercase) |
| Different stems → different hash | Verifies hash uniqueness |
| Collapses multiple internal whitespace characters | Verifies `\t`, `\n` → single space |

### 2. JSON parsing resilience (13 tests)

| Test | Description |
|------|-------------|
| **extractJson** (3 tests) | |
| Strips markdown code fences with language | ` ```json ... ``` ` → inner JSON |
| Strips markdown fences without language | ` ``` ... ``` ` → inner content |
| Handles text without fences | Passthrough |
| **tryParseAsQuestions** (6 tests) | |
| Parses valid JSON array | Standard happy path |
| Handles JSON in markdown fences | Full parse pipeline through fences |
| Wraps single object in array | `{...}` → `[{...}]` |
| Handles extra unknown fields | Unknown fields ignored, no throw |
| Handles wrong types for fields | Malformed types → no throw, partial results |
| Handles truncated JSON with balanced arrays | Stray text + balanced array extraction |
| Handles completely empty string | Returns `null` |
| **validateAndMapQuestion** (4 tests) | |
| Validates correct single_choice question | Full validation pipeline |
| Rejects missing stem | Returns `null` |
| Rejects invalid type (e.g. "essay") | Returns `null` |
| Falls back to default difficulty on out-of-range | difficulty 99 → uses default |
| Deduplicates by stem hash | Second same stem → rejected |

### 3. Quiz scoring logic (3 tests)

| Test | Description |
|------|-------------|
| 10 questions, 7 correct → correctRate = 0.7 | Basic scoring |
| Per-type breakdown: single_choice (3/5=0.6), true_false (2/2=1.0), short_answer (1/2=0.5) | `correctRateByType` accuracy |
| Empty questions → correctRate = 0 | Edge case |

### 4. Quiz template configs (4 tests)

| Test | Description |
|------|-------------|
| Daily config: 7-day range, 10 questions, difficulty 1-2 | Range validation |
| Monthly config: 30-day range, 50 questions, difficulty 1-3 | Range validation |
| Daily difficulty constrained to 1-2 | Upper bound check |
| Monthly difficulty constrained to 1-3 | Upper bound check |

## Verification

```
 ✓ packages/core/src/quiz/quiz-generator.test.ts (25 tests) 12ms

 Test Files  1 passed (1)
      Tests  25 passed (25)
   Start at  13:59:34
   Duration  1.74s
```