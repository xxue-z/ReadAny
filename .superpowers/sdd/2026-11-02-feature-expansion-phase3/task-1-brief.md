# Task 1: Quiz types and DB migration (v15-v17)

## Files
- Create: `packages/core/src/types/quiz.ts`
- Modify: `packages/core/src/db/migrations.ts` — add v15, v16, v17
- Modify: `packages/core/src/db/db-core.ts` — inline CREATE TABLE fallback

## Steps

- [ ] **Step 1: Create `packages/core/src/types/quiz.ts`**

Define these types:

```ts
export type QuizType = "daily" | "monthly" | "quarterly" | "custom";
export type QuizStatus = "pending" | "in_progress" | "completed" | "graded";
export type QuestionType = "single_choice" | "multi_choice" | "true_false" | "short_answer";

export interface QuizConfig {
  type: QuizType;
  bookIds?: string[];
  timeRange?: { start: number; end: number };
  questionCount: number;
  typeDistribution?: Partial<Record<QuestionType, number>>;
  difficulty: 1 | 2 | 3;
  bankRatio: number;   // 0-1, fraction from question_bank
  wrongRatio: number;   // 0-1, fraction from previous wrong answers
}

export interface QuizSession {
  id: string;
  type: QuizType;
  config: QuizConfig;
  status: QuizStatus;
  score?: number;
  timeSpent: number;
  createdAt: number;
  completedAt?: number;
}

export interface QuizQuestion {
  id: string;
  sessionId: string;
  type: QuestionType;
  stem: string;
  options?: { key: string; content: string }[];
  answer: { correct: string | string[]; explanation: string };
  sourceBookId?: string;
  sourceChapter?: string;
  difficulty: number;
  userAnswer?: string | string[];
  isCorrect?: boolean;
  createdAt: number;
}

export interface QuestionBankEntry {
  id: string;
  questionId: string;
  tags: string[];
  usageCount: number;
  correctRate: number;
  variantOf?: string;
  createdAt: number;
}

export interface QuizSummary {
  totalQuestions: number;
  correctCount: number;
  correctRate: number;
  timeSpent: number;
  correctRateByType: Record<string, number>;
}

export interface WeakArea {
  tag: string;
  errorRate: number;
  questionCount: number;
}

export interface HistoryTrend {
  sessionId: string;
  date: number;
  score: number;
  correctRate: number;
}

export interface QuizReport {
  summary: QuizSummary;
  weakAreas: WeakArea[];
  history: HistoryTrend[];
  questions: QuizQuestion[];
}
```

- [ ] **Step 2: Add migration v15 — quiz_sessions**

In `migrations.ts`, after the v14 entry (line ~128), add:
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

- [ ] **Step 5: Add inline CREATE TABLE in db-core.ts**

Find the last inline ALTER TABLE and add after it:
```ts
await database.execute(`CREATE TABLE IF NOT EXISTS quiz_sessions (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, config TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', score REAL,
  time_spent INTEGER DEFAULT 0, created_at INTEGER NOT NULL,
  completed_at INTEGER
)`);
await database.execute(`CREATE TABLE IF NOT EXISTS quiz_questions (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL,
  type TEXT NOT NULL, stem TEXT NOT NULL,
  options TEXT, answer TEXT NOT NULL,
  source_book_id TEXT, source_chapter TEXT,
  difficulty INTEGER DEFAULT 1, user_answer TEXT,
  is_correct INTEGER, created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES quiz_sessions(id)
)`);
await database.execute(`CREATE TABLE IF NOT EXISTS question_bank (
  id TEXT PRIMARY KEY, question_id TEXT NOT NULL,
  tags TEXT, usage_count INTEGER DEFAULT 0,
  correct_rate REAL, variant_of TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (question_id) REFERENCES quiz_questions(id)
)`);
```

- [ ] **Step 6: Run tsc and commit**

```bash
git add packages/core/src/types/quiz.ts packages/core/src/db/migrations.ts packages/core/src/db/db-core.ts
git commit -m "feat: add quiz types and DB schema (sessions, questions, bank)"
```