# Phase 3 Task 7: Desktop QuizPlayer + QuizReport — Report

**Date:** 2026-11-02  
**Commit:** `feat: add QuizPlayer with timer and QuizReport with statistics`

## Files Created

### `packages/app/src/components/quiz/QuizPlayer.tsx` (546 lines)
Question-by-question answering interface featuring:
- **Progress indicator:** N/Total counter + type badge (color-coded per type) + difficulty stars (★☆☆/★★☆/★★★)
- **Question stem** with whitespace-pre-wrap for long text
- **Answer options** per question type:
  - `single_choice`: A/B/C/D styled card buttons with correct/incorrect green/red highlighting after answer
  - `multi_choice`: toggleable buttons with "确认选择 (N)" submit button; correct/incorrect per-option highlighting
  - `true_false`: two large "✓ 正确" / "✗ 错误" buttons
  - `short_answer`: free-text textarea with "提交回答" button; after submission shows user answer vs reference answer with "简答题需人工评分" note
- **Immediate feedback:** after answering, shows correct/incorrect badge with expandable explanation panel
- **Timer:** showing elapsed time (MM:SS) in top-right, incrementing every second
- **Navigation:** ← 上一题 / 下一题 → buttons; last question shows "完成测验" (calls `completeQuiz()`)
- **State:** uses local `localIndex` for navigation; syncs with store's `currentQuestionIndex` on auto-advance from `submitAnswer`

### `packages/app/src/components/quiz/QuizReport.tsx` (455 lines)
Post-quiz statistics view featuring:
- **Summary card:** SVG score ring (with gradient color: emerald ≥60%, amber <60%), score/100, correct count, time spent, and "再来一次" restart button
- **Per-type breakdown table:** rows per question type with count, correct rate %, and color-coded progress bar
- **Weak areas list:** from `report.weakAreas`, color-coded by error rate (red ≥60%, amber ≥30%), showing tag name, question count, and error rate %
- **History trend bar:** lightweight in-line bar chart showing correctRate % per past session with date labels; color: emerald ≥80%, amber ≥50%, red <50%
- **Question review list:** Radix `Collapsible` per question with expand chevron, correct/incorrect/unanswered icon, stem preview, and expanded detail showing options (with correct answer highlighted), user vs correct answer comparison, and full explanation

## Files Modified

### `packages/app/src/components/quiz/QuizPage.tsx`
Added `useQuizStore` subscriptions and conditional rendering:
1. **`report && currentSession`** → `<QuizReport />` (quiz just completed)
2. **`isTaking`** → `<QuizPlayer />` (actively answering)
3. **`isGenerating`** → spinner with "正在生成测验题目..." 
4. **default** → existing tabs (DailyQuiz / CustomQuiz / QuestionBank)

## Import Flow

```
QuizPage
  ├── QuizPlayer  (isTaking === true)
  │     └── useQuizStore: currentQuestions, currentQuestionIndex, submitAnswer, completeQuiz
  ├── QuizReport  (report !== null)
  │     └── useQuizStore: report, currentSession, loadSessions, startQuiz
  └── Default tabs (DailyQuiz, CustomQuiz, QuestionBank)
```

## Store Integration

Both components use `useQuizStore` from `@readany/core/stores` with selector patterns:
- `QuizPlayer`: reads `currentQuestions`, `currentQuestionIndex`, calls `submitAnswer(questionId, answer)` and `completeQuiz()`
- `QuizReport`: reads `report`, `currentSession`, calls `loadSessions()` + `startQuiz(config)` for restart

## TypeScript Verification

```
tsc --noEmit: QuizPlayer.tsx ✓ QuizReport.tsx ✓ QuizPage.tsx ✓
(2 pre-existing errors in CustomQuiz.tsx, QuestionBank.tsx unrelated to this task)
```