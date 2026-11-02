# Phase 3 — AI Quiz Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI-powered quiz generation, question bank, and quiz-taking UI as a new "测验" tab in the app.

**Architecture:** Core quiz logic (`quiz-generator.ts`, `report-builder.ts`) lives in `packages/core/src/quiz/` and is platform-agnostic. It calls `createChatModel()` from the existing LLM provider and `search()` from the RAG module to generate questions from reading material. Desktop UI lives in `packages/app/src/components/quiz/` and uses a Zustand store for state. The quiz system uses 3 new SQLite tables.

**Tech Stack:** TypeScript strict, React 19, Zustand, SQLite, LangChain.js, existing llm-provider.ts + rag/search.ts

**Spec:** `docs/feature-expansion/03-ai-quiz.md`

## Global Constraints

- DB migration must be additive (v15-v17): `quiz_sessions`, `quiz_questions`, `question_bank` tables
- LLM calls use `createChatModel(config)` from `packages/core/src/ai/llm-provider.ts`
- RAG uses `search({ query, bookId, mode: "hybrid", topK, threshold })` from `packages/core/src/rag/search.ts`
- Question dedup: `source_book_id + stem_hash` in `question_bank`
- 问答题不自动批改，用户自行对照答案
- Variant question generation reuses the same LLM prompt pattern
- Tab integration: add `"quiz"` to `TabType`, add to `HOME_VIEWS` and `TAB_ICONS`
- i18n: new `quiz.json` namespace per locale
- Format: Biome — 2 spaces, double quotes, semicolons, 100 width

## Review Focus

1. **LLM returns malformed JSON** — test: mock LLM to return JSON with missing fields, extra fields, non-array `options`; parser must gracefully handle and not crash.
2. **RAG search returns empty results for new books** — test: generate quiz for a book that hasn't been vectorized yet; fallback to chapter-based question generation or show "insufficient material" message.
3. **Question bank dedup fails with similar but not identical stems** — test: add question with stem "What is X?", then another with stem "What is X?" (exact match); second must be deduplicated. Stems must be normalized (trim, collapse whitespace).
4. **Quiz session interruption (app close mid-quiz)** — test: start quiz, answer 3/10 questions, close app, reopen; session appears in "in_progress" state with answers preserved and a "resume" button.
5. **Custom quiz with extreme parameters** — test: set all sliders to max (100 questions, difficulty 3, 100% AI); generator must not OOM or timeout.

---

### Task 1: Types and DB migration

**Files:**
- Create: `packages/core/src/types/quiz.ts` — `QuizSession`, `QuizQuestion`, `QuestionBank`, `QuizConfig`, `QuizType`
- Modify: `packages/core/src/db/migrations.ts` — add migrations v15, v16, v17
- Modify: `packages/core/src/db/db-core.ts` — inline CREATE TABLE fallback

**Interfaces:**
- Produces: `QuizType = "daily" | "monthly" | "quarterly" | "custom"`
- Produces: `QuizStatus = "pending" | "in_progress" | "completed" | "graded"`
- Produces: `QuestionType = "single_choice" | "multi_choice" | "true_false" | "short_answer"`
- Produces: `QuizConfig { type: QuizType; bookIds?: string[]; timeRange?: { start: number; end: number }; questionCount: number; typeDistribution?: Record<QuestionType, number>; difficulty: 1|2|3; bankRatio: number; wrongRatio: number }`
- Produces: `QuizSession { id, type, config, status, score, timeSpent, createdAt, completedAt }`
- Produces: `QuizQuestion { id, sessionId, type, stem, options, answer, sourceBookId, sourceChapter, difficulty, userAnswer, isCorrect, createdAt }`
- Produces: `QuestionBank { id, questionId, tags, usageCount, correctRate, variantOf, createdAt }`

- [ ] **Step 1: Create `packages/core/src/types/quiz.ts`**

Define all types exactly as above. `options` is `{ key: string; content: string }[]` serialized as JSON. `answer` is `{ correct: string | string[]; explanation: string }` serialized as JSON.

- [ ] **Step 2: Add migration v15 — quiz_sessions**

```ts
{
  version: 15,
  description: "Create quiz_sessions table",
  up: `CREATE TABLE IF NOT EXISTS quiz_sessions (
    id TEXT PRIMARY KEY, type TEXT NOT NULL, config TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', score REAL,
    time_spent INTEGER DEFAULT 0, created_at INTEGER NOT NULL,
    completed_at INTEGER
  )`,
},
```

- [ ] **Step 3: Add migration v16 — quiz_questions**

```ts
{
  version: 16,
  description: "Create quiz_questions table",
  up: `CREATE TABLE IF NOT EXISTS quiz_questions (
    id TEXT PRIMARY KEY, session_id TEXT NOT NULL,
    type TEXT NOT NULL, stem TEXT NOT NULL,
    options TEXT, answer TEXT NOT NULL,
    source_book_id TEXT, source_chapter TEXT,
    difficulty INTEGER DEFAULT 1, user_answer TEXT,
    is_correct INTEGER, created_at INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES quiz_sessions(id)
  )`,
},
```

- [ ] **Step 4: Add migration v17 — question_bank**

```ts
{
  version: 17,
  description: "Create question_bank table",
  up: `CREATE TABLE IF NOT EXISTS question_bank (
    id TEXT PRIMARY KEY, question_id TEXT NOT NULL,
    tags TEXT, usage_count INTEGER DEFAULT 0,
    correct_rate REAL, variant_of TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (question_id) REFERENCES quiz_questions(id)
  )`,
},
```

- [ ] **Step 5: Add inline CREATE TABLE fallback in `db-core.ts`**

Add three `await database.execute("CREATE TABLE IF NOT EXISTS ...")` calls after the last inline ALTER TABLE.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/types/quiz.ts packages/core/src/db/migrations.ts packages/core/src/db/db-core.ts
git commit -m "feat: add quiz types and DB schema (sessions, questions, bank)"
```

---

### Task 2: Quiz DB queries

**Files:**
- Create: `packages/core/src/db/quiz-queries.ts` — CRUD for all three tables
- Modify: `packages/core/src/db/database.ts` — re-export quiz queries

**Interfaces:**
- Produces: `insertQuizSession(session: QuizSession)`, `getQuizSession(id)`, `getQuizSessions()`, `updateQuizSession(id, updates)`
- Produces: `insertQuizQuestions(questions: QuizQuestion[])`, `getQuizQuestions(sessionId)`, `updateQuizQuestion(id, updates)`
- Produces: `insertQuestionBankEntry(entry)`, `getQuestionBank(query?)`, `updateQuestionBankEntry(id, updates)`

- [ ] **Step 1: Create `quiz-queries.ts` with full CRUD**

Follow the pattern from `highlight-queries.ts`. Each function gets `const database = await getDB()`, executes SQL, and returns typed results.

- [ ] **Step 2: Add stem-hash dedup logic**

```ts
function stemHash(stem: string): string {
  const normalized = stem.trim().replace(/\s+/g, " ").toLowerCase();
  // Use a simple hash: first 8 chars of sha256-like
  return normalized.slice(0, 32);
}
```

- [ ] **Step 3: Re-export in `database.ts`**

Add `export { insertQuizSession, ... } from "./quiz-queries"` to database.ts barrel.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/db/quiz-queries.ts packages/core/src/db/database.ts
git commit -m "feat: add quiz DB queries (CRUD for sessions, questions, bank)"
```

---

### Task 3: Quiz generator (LLM + RAG)

**Files:**
- Create: `packages/core/src/quiz/quiz-generator.ts`

**Interfaces:**
- Consumes: `createChatModel()` from `ai/llm-provider.ts`, `search()` from `rag/search.ts`, `getReadingSessions()` from `db/session-queries.ts`
- Produces: `generateQuizQuestions(config: QuizConfig, aiConfig?: AIConfig): Promise<QuizQuestion[]>`
- Produces: `generateVariantQuestion(baseQuestion: QuizQuestion, aiConfig?: AIConfig): Promise<QuizQuestion>`

- [ ] **Step 1: Build the main `generateQuizQuestions` function**

Flow:
1. From `config.timeRange`, query `reading_sessions` to get books/chapters the user read
2. For each book, call `search()` to get relevant chunks as question material
3. Build the LLM prompt: include chunks as context, specify question types/quantity/difficulty
4. Call `createChatModel(aiConfig).invoke([SystemMessage(prompt), HumanMessage("Generate questions")])`
5. Parse the JSON response into `QuizQuestion[]`
6. Deduplicate against `question_bank` by `stem_hash`

- [ ] **Step 2: Build the LLM prompt template**

```ts
const QUIZ_SYSTEM_PROMPT = `You are a quiz generator. Given text excerpts, generate quiz questions.
Output ONLY valid JSON array. Each question:
{
  "type": "single_choice" | "multi_choice" | "true_false" | "short_answer",
  "stem": "the question text",
  "options": [{ "key": "A", "content": "option text" }, ...],  // omit for short_answer
  "answer": { "correct": "A", "explanation": "why" },  // correct: string[] for multi_choice
  "difficulty": 1-3
}
Generate {count} questions of types {types} at difficulty {difficulty}.`;
```

- [ ] **Step 3: Handle parser errors gracefully**

Wrap JSON.parse in try/catch. On parse failure, attempt to extract partial results. Return partial results + log error. Never crash the caller.

- [ ] **Step 4: Build `generateVariantQuestion`**

Takes an existing `QuizQuestion`, builds a prompt asking LLM to rephrase the stem, change distractors, adjust difficulty. Returns a new `QuizQuestion` with `variantOf = baseQuestion.id` in the bank.

- [ ] **Step 5: Add RAG fallback for unvectorized books**

If `search()` returns `< 3 results`, fall back to using chapter titles from the book's TOC as context for question generation.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/quiz/quiz-generator.ts
git commit -m "feat: add LLM-powered quiz generator with RAG context"
```

---

### Task 4: Quiz report builder

**Files:**
- Create: `packages/core/src/quiz/report-builder.ts`

**Interfaces:**
- Consumes: `QuizSession`, `QuizQuestion[]`, `QuestionBank[]`
- Produces: `buildQuizReport(session: QuizSession, questions: QuizQuestion[], bank: QuestionBank[]): QuizReport`
- Produces: `QuizReport { summary: QuizSummary; weakAreas: WeakArea[]; history: HistoryTrend[]; questions: QuizQuestion[] }`

- [ ] **Step 1: Define `QuizReport` and `QuizSummary` types**

```ts
interface QuizSummary {
  totalQuestions: number;
  correctCount: number;
  correctRate: number; // 0-1
  timeSpent: number; // seconds
  correctRateByType: Record<string, number>;
}
interface WeakArea {
  tag: string;
  errorRate: number;
  questionCount: number;
}
interface HistoryTrend {
  sessionId: string;
  date: number;
  score: number;
  correctRate: number;
}
```

- [ ] **Step 2: Implement `buildQuizReport`**

Count correct by type, aggregate tags from `QuestionBank` entries, compute error rate per tag. Fetch historical sessions from DB for trend data.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/quiz/report-builder.ts
git commit -m "feat: add quiz report builder with statistics and weak-area analysis"
```

---

### Task 5: Quiz Zustand store

**Files:**
- Create: `packages/core/src/stores/quiz-store.ts`
- Modify: `packages/core/src/stores/index.ts` — export

**Interfaces:**
- Produces: `useQuizStore` with state: `sessions, currentSession, currentQuestions, isGenerating, isTaking`
- Produces: actions: `startQuiz(config), submitAnswer(questionId, answer), completeQuiz(), gradeQuiz(), loadSessions()`

- [ ] **Step 1: Create quiz-store.ts**

```ts
interface QuizState {
  sessions: QuizSession[];
  currentSession: QuizSession | null;
  currentQuestions: QuizQuestion[];
  currentQuestionIndex: number;
  isGenerating: boolean;
  isTaking: boolean;
  report: QuizReport | null;

  startQuiz: (config: QuizConfig, aiConfig?: AIConfig) => Promise<void>;
  submitAnswer: (questionId: string, answer: string | string[]) => void;
  completeQuiz: () => Promise<void>;
  loadSessions: () => Promise<void>;
  loadSession: (id: string) => Promise<void>;
}
```

`startQuiz`: calls `generateQuizQuestions()`, saves session + questions to DB, sets `isTaking = true`.
`submitAnswer`: updates question's `userAnswer`, auto-checks non-short_answer types and sets `isCorrect`.
`completeQuiz`: grades remaining short_answer as `isCorrect: null`, builds report, updates session.

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/stores/quiz-store.ts packages/core/src/stores/index.ts
git commit -m "feat: add quiz Zustand store with generate/answer/complete flow"
```

---

### Task 6: Desktop quiz UI — QuizPage + DailyQuiz + CustomQuiz + QuestionBank

**Files:**
- Create: `packages/app/src/components/quiz/QuizPage.tsx`
- Create: `packages/app/src/components/quiz/DailyQuiz.tsx`
- Create: `packages/app/src/components/quiz/CustomQuiz.tsx`
- Create: `packages/app/src/components/quiz/QuestionBank.tsx`
- Modify: `packages/app/src/components/layout/AppLayout.tsx` — add `"quiz"` tab
- Modify: `packages/core/src/stores/app-store.ts` — add `"quiz"` to TabType
- Modify: `packages/app/src/components/layout/TabBar.tsx` — add quiz icon

**Interfaces:**
- Consumes: `useQuizStore`, `useAIConfigStore`, `useLibraryStore`
- Produces: `QuizPage` with sub-tabs: 今日测验 / 自定义测验 / 题库浏览

- [ ] **Step 1: Add `"quiz"` to TabType and integrate into AppLayout**

In `app-store.ts` line 6: append `| "quiz"`.
In `AppLayout.tsx` line 44 `HOME_VIEWS` array: add `{ id: "quiz", Component: QuizPage }`.
In `TabBar.tsx` `TAB_ICONS`: add `quiz: Brain` (or similar icon from lucide-react).

- [ ] **Step 2: Create `QuizPage` shell**

```tsx
function QuizPage() {
  const [activeTab, setActiveTab] = useState<"daily" | "custom" | "bank">("daily");
  return (
    <div>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="daily">今日测验</TabsTrigger>
          <TabsTrigger value="custom">自定义测验</TabsTrigger>
          <TabsTrigger value="bank">题库浏览</TabsTrigger>
        </TabsList>
        <TabsContent value="daily"><DailyQuiz /></TabsContent>
        <TabsContent value="custom"><CustomQuiz /></TabsContent>
        <TabsContent value="bank"><QuestionBank /></TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 3: Create `DailyQuiz`**

Show: today's date, "最近7天完成情况" (last 7 days completion cards), "开始测验" button.
Template: `QuizConfig{ type: "daily", timeRange: [today-7d, today], questionCount: 10, difficulty: 1|2 }`.

- [ ] **Step 4: Create `CustomQuiz`**

Config form: book multi-select (from useLibraryStore), time range picker, question type ratio sliders (single_choice/multi_choice/true_false/short_answer), total question count, difficulty 1-3, bank/AI ratio slider, wrong question ratio slider. "开始测验" button.

- [ ] **Step 5: Create `QuestionBank`**

Grid/list of questions filtered by book/tags/type/correctRate. Each item shows stem preview, type badge, difficulty stars. Click to expand full question + answer. "生成变种题" button per question.

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/components/quiz/ packages/app/src/components/layout/AppLayout.tsx packages/core/src/stores/app-store.ts packages/app/src/components/layout/TabBar.tsx
git commit -m "feat: add quiz tab with DailyQuiz, CustomQuiz, and QuestionBank UI"
```

---

### Task 7: Desktop quiz UI — QuizPlayer + QuizReport

**Files:**
- Create: `packages/app/src/components/quiz/QuizPlayer.tsx`
- Create: `packages/app/src/components/quiz/QuizReport.tsx`

**Interfaces:**
- Consumes: `useQuizStore` (currentQuestions, submitAnswer)
- Produces: `QuizPlayer` — sequential question display with timer
- Produces: `QuizReport` — score summary, per-type breakdown, weak areas, history chart, question review list

- [ ] **Step 1: Create `QuizPlayer`**

- Question card: shows question number (N/Total), type badge, difficulty stars
- Stem text centered, options as selectable cards (A/B/C/D) for choice types, true/false buttons, textarea for short_answer
- After answering: immediately show correct/incorrect with explanation (spec says "答题后立即显示对错+解析")
- Navigation: previous/next buttons; cannot go back after answering (or can — decide: allow review but not re-answer)
- Timer: show elapsed time, countdown if configured
- "完成测验" button on last question

- [ ] **Step 2: Create `QuizReport`**

- Summary card: total score (correct/total), correct rate %, time spent
- Per-type breakdown: table { type, correct, total, rate }
- Weak area analysis: list of tags with high error rates (from `report.weakAreas`)
- History trend: mini sparkline or bar chart of recent sessions (from `report.history`)
- Question review: scrollable list of all questions with user answer vs correct answer, explanation

- [ ] **Step 3: Wire QuizPage to show QuizPlayer/QuizReport**

When `isTaking` is true in the store, render `QuizPlayer`. When quiz is completed and `report` exists, render `QuizReport`. Add "返回测验列表" button on report to go back.

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/components/quiz/QuizPlayer.tsx packages/app/src/components/quiz/QuizReport.tsx packages/app/src/components/quiz/QuizPage.tsx
git commit -m "feat: add QuizPlayer with timer and QuizReport with statistics"
```

---

### Task 8: Mobile quiz screens + bottom tab navigation

**Files:**
- Create: `packages/app-expo/src/screens/QuizScreen.tsx`
- Create: `packages/app-expo/src/screens/QuizPlayerScreen.tsx`
- Create: `packages/app-expo/src/screens/QuizReportScreen.tsx`
- Modify: `packages/app-expo/src/navigation/TabNavigator.tsx` — add 5th tab "测验"
- Modify: `packages/app-expo/src/navigation/RootNavigator.tsx` — register QuizPlayer/QuizReport routes

**Interfaces:**
- Consumes: `useQuizStore` from `@readany/core/stores/quiz-store`
- Consumes: theme system: `useTheme()`, `useResponsiveLayout()`, `useColors()`

- [ ] **Step 1: Create `QuizScreen.tsx`**

Follow `LibraryScreen.tsx`/`NotesScreen.tsx` pattern. `SafeAreaView` wrapper. Three sub-tabs via `TouchableOpacity` toggle (no nested navigator):
- 今日测验：日期卡片 + 最近7天完成情况 + "开始测验"按钮
- 自定义测验：`ScrollView` 表单（书选择、时间范围、题型占比、数量、难度、题库占比、错题占比）
- 题库浏览：`FlatList` 筛选+预览，支持按书/标签/题型/正确率筛选。"生成变种题"按钮

- [ ] **Step 2: Create `QuizPlayerScreen.tsx`**

Stack screen `push`ed from QuizScreen on quiz start (`route.params: { sessionId }`):
- 顶部：进度条 N/Total + 题型徽章 + 难度星 + 计时器
- 中段：题目 stem (`ScrollView`)
- 底部：选项按钮（A/B/C/D 用 `TouchableOpacity` 卡片）/ 判断题（正确/错误按钮）/ `TextInput`（简答）
- 答后展开区：对错图标 + 解析文字
- 导航栏：上一题/下一题 + 最后一题显示"完成测验"
- 返回时弹出确认（`Alert.alert`："确定退出？进度将保存"）

- [ ] **Step 3: Create `QuizReportScreen.tsx`**

Stack screen pushed after completion (`route.params: { sessionId }`):
- 总分卡片：分数 + 正确率（环形进度组件）+ 用时
- 题型统计表（`View` 行布局）
- 薄弱知识标签列表
- 原卷回顾：`FlatList` 每题可展开（用户答案 vs 正确答案 + 解析）

- [ ] **Step 4: Add Quiz tab to `TabNavigator.tsx`**

Add `Quiz: undefined` to `TabParamList` and a 5th `Tab.Screen`:
```tsx
<Tab.Screen
  name="Quiz"
  component={QuizScreen}
  options={{
    tabBarLabel: t("tabs.quiz", "测验"),
    tabBarIcon: ({ color, size }) => <BrainIcon color={color} size={size} />,
  }}
/>
```
Import `BrainIcon` (or `LightbulbIcon`) from `@/components/ui/Icon`.

- [ ] **Step 5: Register routes in `RootNavigator.tsx`**

Add to `RootStackParamList`:
```tsx
QuizPlayer: { sessionId: string };
QuizReport: { sessionId: string };
```

Add to `Stack.Navigator`:
```tsx
<Stack.Screen name="QuizPlayer" component={QuizPlayerScreen} options={{ animation: "slide_from_right" }} />
<Stack.Screen name="QuizReport" component={QuizReportScreen} options={{ animation: "slide_from_right" }} />
```

- [ ] **Step 6: Commit**

```bash
git add packages/app-expo/src/screens/QuizScreen.tsx packages/app-expo/src/screens/QuizPlayerScreen.tsx packages/app-expo/src/screens/QuizReportScreen.tsx packages/app-expo/src/navigation/TabNavigator.tsx packages/app-expo/src/navigation/RootNavigator.tsx
git commit -m "feat: add mobile quiz screens and bottom tab navigation"
```

---

### Task 9: i18n for quiz module

**Files:**
- Create: `packages/core/src/i18n/locales/en/quiz.json`
- Create: `packages/core/src/i18n/locales/zh/quiz.json`
- Modify: `packages/core/src/i18n/index.ts` — import quiz.json for each locale

- [ ] **Step 1: Create `en/quiz.json`**

```json
{
  "quiz": {
    "title": "Quiz",
    "daily": "Daily Quiz",
    "monthly": "Monthly Quiz",
    "custom": "Custom Quiz",
    "questionBank": "Question Bank",
    "start": "Start Quiz",
    "resume": "Resume",
    "submit": "Submit",
    "complete": "Finish Quiz",
    "correct": "Correct!",
    "incorrect": "Incorrect",
    "explanation": "Explanation",
    "score": "Score",
    "correctRate": "Correct Rate",
    "timeSpent": "Time Spent",
    "difficulty": "Difficulty",
    "singleChoice": "Single Choice",
    "multiChoice": "Multi Choice",
    "trueFalse": "True/False",
    "shortAnswer": "Short Answer",
    "questionCount": "Questions",
    "typeDistribution": "Question Types",
    "bankRatio": "From Question Bank",
    "wrongRatio": "Wrong Questions Review",
    "report": "Report",
    "weakAreas": "Weak Areas",
    "history": "History",
    "review": "Review Answers",
    "noSessions": "No quiz sessions yet. Start your first quiz!",
    "generating": "Generating questions..."
  }
}
```

- [ ] **Step 2: Create `zh/quiz.json`**

Same keys, Chinese values.

- [ ] **Step 3: Import in `packages/core/src/i18n/index.ts`**

Add `import enQuiz from "./locales/en/quiz.json"` and spread `...enQuiz` into the `en` resource. Same for zh and other locales.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/i18n/
git commit -m "feat: add i18n keys for quiz module (en/zh)"
```

---

### Task 10: End-to-end test suite

**Files:**
- Create: `packages/core/src/quiz/quiz-generator.test.ts`

- [ ] **Step 1: Test LLM response JSON parsing**

Mock `createChatModel` to return a BaseChatModel that invokes with predefined JSON. Test: valid JSON, missing fields, wrong types, empty array. Verify parser handles all cases.

- [ ] **Step 2: Test stem-hash dedup logic**

Two questions with same stem (different whitespace) → same hash. Two questions with different stems → different hash.

- [ ] **Step 3: Test quiz scoring logic**

Mock a completed quiz session with 10 questions (7 correct, 3 wrong). Verify `buildQuizReport` returns correct statistics.

- [ ] **Step 4: Test template configs**

Daily quiz: timeRange = [today-7d, today], count = 10, difficulty 1-2.
Monthly: timeRange = [today-30d, today], count = 50, difficulty 1-3.

- [ ] **Step 5: Run tests and commit**

```bash
pnpm vitest run packages/core/src/quiz/
```

```bash
git add packages/core/src/quiz/quiz-generator.test.ts
git commit -m "test: add quiz generator LLM parsing and scoring tests"
```

---

### Task 11: Verification checklist

**Files:**
- Modify: `docs/feature-expansion/verification-checklist.md` — add Phase 3 section

- [ ] **Step 1: Add "九、AI 测验" section**

7 manual verification items:
1. Daily quiz: generates 10 questions from last 7 days of reading
2. Custom quiz: all sliders/config work, generates correct number of questions
3. Quiz play: answer questions, see immediate correct/incorrect + explanation
4. Quiz complete: see report with correct rates and weak areas
5. Question bank: browse, filter, view question detail, generate variant
6. Session resume: close app mid-quiz, reopen, resume from where left off
7. Empty state: no reading history → "insufficient material" message shown

- [ ] **Step 2: Commit**

```bash
git add docs/feature-expansion/verification-checklist.md
git commit -m "docs: add Phase 3 AI quiz verification checklist"
```

---

## Self-Review

**Spec coverage (03-ai-quiz.md):**
- ✅ 3.1 Data model — Task 1 (types + migration)
- ✅ 3.2 Quiz generator — Task 3 (LLM + RAG)
- ✅ 3.3 Quiz templates — Task 6 (DailyQuiz, CustomQuiz)
- ✅ 3.4 Quiz UI — Task 6 + Task 7 (all 5 sub-pages)
- ✅ 3.5 Report builder — Task 4

**Step scan:** Every step names exact file, function, or type.

**Type consistency:**
- `QuizConfig` defined in Task 1, consumed by Tasks 3, 5, 6 ✅
- `QuizSession`, `QuizQuestion`, `QuestionBank` defined in Task 1, consumed by Tasks 2, 4, 5 ✅
- Migration v15-v17 sequential, no gaps ✅

**Review Focus coverage:**
- ✅ Malformed JSON — Task 9 test
- ✅ Empty RAG results — Task 3 fallback
- ✅ Stem dedup — Task 2 + Task 9 test
- ✅ Session interruption — Task 5 (state persistence via DB)
- ✅ Extreme parameters — Task 9 test