# Task 2: Quiz DB queries

## Files
- Create: `packages/core/src/db/quiz-queries.ts`
- Modify: `packages/core/src/db/database.ts` — re-export

## Steps

- [ ] **Step 1: Create `quiz-queries.ts`**

Follow the pattern from `highlight-queries.ts`. Use `getDB()` for database access. Implement:

```ts
import type { QuizSession, QuizQuestion, QuestionBankEntry } from "../types/quiz";
import { getDB } from "./db-core";

// Quiz Sessions
export async function insertQuizSession(session: QuizSession): Promise<void>
export async function getQuizSession(id: string): Promise<QuizSession | null>
export async function getQuizSessions(limit = 50): Promise<QuizSession[]>
export async function updateQuizSession(id: string, updates: Partial<QuizSession>): Promise<void>

// Quiz Questions  
export async function insertQuizQuestions(questions: QuizQuestion[]): Promise<void>
export async function getQuizQuestions(sessionId: string): Promise<QuizQuestion[]>
export async function updateQuizQuestion(id: string, updates: Partial<QuizQuestion>): Promise<void>

// Question Bank
export async function insertQuestionBankEntry(entry: QuestionBankEntry): Promise<void>
export async function getQuestionBank(query?: { bookId?: string; tags?: string[]; type?: string }): Promise<QuestionBankEntry[]>
export async function updateQuestionBankEntry(id: string, updates: Partial<QuestionBankEntry>): Promise<void>
```

- [ ] **Step 2: Add stem-hash dedup helper**

```ts
export function stemHash(stem: string): string {
  const normalized = stem.trim().replace(/\s+/g, " ").toLowerCase();
  // Simple hash: first 32 chars of normalized stem
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return normalized.slice(0, 32) + "_" + Math.abs(hash).toString(16);
}
```

- [ ] **Step 3: JSON serialize/deserialize for config, options, answer, tags**

When reading from DB: `config: JSON.parse(row.config)`, `options: JSON.parse(row.options || "[]")`, etc.
When writing to DB: `JSON.stringify(session.config)`, etc.

- [ ] **Step 4: Re-export in `database.ts`**

Add at the end:
```ts
export type { QuizSession, QuizQuestion, QuestionBankEntry, QuizConfig } from "../types/quiz";
export { insertQuizSession, getQuizSession, getQuizSessions, updateQuizSession } from "./quiz-queries";
export { insertQuizQuestions, getQuizQuestions, updateQuizQuestion } from "./quiz-queries";
export { insertQuestionBankEntry, getQuestionBank, updateQuestionBankEntry, stemHash } from "./quiz-queries";
```

- [ ] **Step 5: Run tsc and commit**

```bash
git add packages/core/src/db/quiz-queries.ts packages/core/src/db/database.ts
git commit -m "feat: add quiz DB queries (CRUD for sessions, questions, bank)"
```