# Phase 3 Task 8: Mobile Quiz Screens — Report

**Date**: 2026-11-02  
**Commit**: `feat: add mobile quiz screens and bottom tab navigation`

## Summary

Implemented 3 new mobile quiz screens and modified 2 navigation files to add the Quiz feature to the mobile app.

## Files Created

### 1. `packages/app-expo/src/screens/QuizScreen.tsx`

Main quiz hub screen with 3 sub-tabs:

- **今日测验 (Daily Quiz)**: Shows a daily quiz card with start/resume button, 3 stats cards (weekly completions, average score, total sessions), and a scrollable list of recent sessions from the last 7 days. Each session card shows type, date, score, status badge, and navigates to the report (completed) or resumes (in-progress).

- **自定义测验 (Custom Quiz)**: ScrollView form with quiz type selector (daily/monthly/quarterly/custom), question count input, difficulty selector (easy/medium/hard), type distribution steppers (single/multi/true-false/short-answer), and slider chips for bank ratio and wrong ratio. Generates quiz via `useQuizStore.startQuiz()`.

- **题库 (Question Bank)**: FlatList fetching entries from `getQuestionBank()` DB query, showing question IDs, tags, usage count, and correct rate.

Uses SafeAreaView, useColors, makeStyles pattern matching SkillsScreen.

### 2. `packages/app-expo/src/screens/QuizPlayerScreen.tsx`

Quiz-taking screen pushed from QuizScreen with route params `{ sessionId }`. Features:

- **Header**: Progress bar (current/total), back button, 1-second interval timer
- **Type badge**: Color-coded chip (single/multi/true-false/short-answer)
- **Stem**: ScrollView containing the question text
- **Answer options**: TouchableOpacity buttons with radio-dot UI for single/multi choice, yes/no buttons for true-false, "show answer" for short-answer
- **Post-answer feedback**: Correct (green border/checkmark) or incorrect (red border/X-mark) with the correct answer highlighted, plus explanation section
- **Multi-choice confirm**: Confirm button appears after selecting options for multi_choice questions
- **Bottom navigation**: Prev/Next buttons with disabled states, centered "提交/完成" button that confirms unanswered questions before completing
- **Completion**: Calls `store.completeQuiz()` then `nav.replace("QuizReport", { sessionId })`

Uses `useQuizStore` for `submitAnswer`, `completeQuiz`, `loadSession`; manages local timer and explanation visibility state.

### 3. `packages/app-expo/src/screens/QuizReportScreen.tsx`

Post-quiz report screen pushed after completion with route params `{ sessionId }`. Features:

- **Score card**: Circular score ring with percentage, label (优秀/良好/一般/需努力), stats row (correct/total, duration, score), session type and date metadata
- **Type breakdown**: Per-question-type correct rate bars (single/multi/true-false/short-answer) with color coding
- **Weak areas**: Per-tag error rate cards from the report builder, top 5 displayed with error rate bars
- **Question review**: Toggle to show/hide all questions with index, type badge, correct/incorrect icon, stem preview, user answer, and correct answer for wrong ones

Loads data via `getQuizSession()` + `buildQuizReport()` on mount, independent of store state for robustness.

## Files Modified

### 4. `packages/app-expo/src/navigation/TabNavigator.tsx`

- Added `BrainIcon` to icon imports
- Added `QuizScreen` import
- Extended `TabParamList` with `Quiz: undefined`
- Added 5th `<Tab.Screen>` for Quiz with label "测验" and BrainIcon
- Updated JSDoc to reflect 5 tabs

### 5. `packages/app-expo/src/navigation/RootNavigator.tsx`

- Added imports for `QuizPlayerScreen` and `QuizReportScreen`
- Extended `RootStackParamList` with:
  - `QuizPlayer: { sessionId: string }`
  - `QuizReport: { sessionId: string }`
- Added `<Stack.Screen>` entries with `animation: "slide_from_right"`

## Lint Status

All 5 files pass `biome check` with zero errors and zero warnings.

## Dependencies

- `@readany/core/stores/quiz-store` — `useQuizStore` (startQuiz, submitAnswer, completeQuiz, loadSession, loadSessions)
- `@readany/core/db/quiz-queries` — `getQuestionBank`, `getQuizSession`
- `@readany/core/quiz/report-builder` — `buildQuizReport`
- `@readany/core/types/quiz` — `QuizSession`, `QuizQuestion`, `QuizReport`, `QuizConfig`, `QuestionBankEntry`, `QuestionType`
- `react-native-safe-area-context` — `SafeAreaView`
- `@react-navigation/native` / `@react-navigation/native-stack` — navigation
- `@/styles/theme` — `useColors`, `fontSize`, `fontWeight`, `radius`, `ThemeColors`
- `@/hooks/use-responsive-layout` — `useResponsiveLayout`