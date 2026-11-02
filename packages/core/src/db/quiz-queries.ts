import type { QuestionBankEntry, QuizQuestion, QuizSession } from "../types/quiz";
import { getDB } from "./db-core";

// ---------------------------------------------------------------------------
// Quiz Sessions
// ---------------------------------------------------------------------------

export async function insertQuizSession(session: QuizSession): Promise<void> {
  const database = await getDB();
  await database.execute(
    `INSERT INTO quiz_sessions (id, type, config, status, score, time_spent, created_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      session.id,
      session.type,
      JSON.stringify(session.config),
      session.status,
      session.score ?? null,
      session.timeSpent,
      session.createdAt,
      session.completedAt ?? null,
    ],
  );
}

export async function getQuizSession(id: string): Promise<QuizSession | null> {
  const database = await getDB();
  const rows = await database.select<{
    id: string;
    type: string;
    config: string;
    status: string;
    score: number | null;
    time_spent: number;
    created_at: number;
    completed_at: number | null;
  }>("SELECT * FROM quiz_sessions WHERE id = ?", [id]);
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    type: r.type as QuizSession["type"],
    config: JSON.parse(r.config),
    status: r.status as QuizSession["status"],
    score: r.score ?? undefined,
    timeSpent: r.time_spent,
    createdAt: r.created_at,
    completedAt: r.completed_at ?? undefined,
  };
}

export async function getQuizSessions(limit = 50): Promise<QuizSession[]> {
  const database = await getDB();
  const rows = await database.select<{
    id: string;
    type: string;
    config: string;
    status: string;
    score: number | null;
    time_spent: number;
    created_at: number;
    completed_at: number | null;
  }>("SELECT * FROM quiz_sessions ORDER BY created_at DESC LIMIT ?", [limit]);
  return rows.map((r) => ({
    id: r.id,
    type: r.type as QuizSession["type"],
    config: JSON.parse(r.config),
    status: r.status as QuizSession["status"],
    score: r.score ?? undefined,
    timeSpent: r.time_spent,
    createdAt: r.created_at,
    completedAt: r.completed_at ?? undefined,
  }));
}

export async function updateQuizSession(id: string, updates: Partial<QuizSession>): Promise<void> {
  const database = await getDB();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (updates.type !== undefined) {
    sets.push("type = ?");
    values.push(updates.type);
  }
  if (updates.config !== undefined) {
    sets.push("config = ?");
    values.push(JSON.stringify(updates.config));
  }
  if (updates.status !== undefined) {
    sets.push("status = ?");
    values.push(updates.status);
  }
  if (Object.prototype.hasOwnProperty.call(updates, "score")) {
    sets.push("score = ?");
    values.push(updates.score ?? null);
  }
  if (updates.timeSpent !== undefined) {
    sets.push("time_spent = ?");
    values.push(updates.timeSpent);
  }
  if (Object.prototype.hasOwnProperty.call(updates, "completedAt")) {
    sets.push("completed_at = ?");
    values.push(updates.completedAt ?? null);
  }

  if (sets.length === 0) return;
  values.push(id);
  await database.execute(`UPDATE quiz_sessions SET ${sets.join(", ")} WHERE id = ?`, values);
}

// ---------------------------------------------------------------------------
// Quiz Questions
// ---------------------------------------------------------------------------

export async function insertQuizQuestions(questions: QuizQuestion[]): Promise<void> {
  const database = await getDB();
  for (const q of questions) {
    await database.execute(
      `INSERT INTO quiz_questions (id, session_id, type, stem, options, answer, source_book_id, source_chapter, difficulty, user_answer, is_correct, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        q.id,
        q.sessionId,
        q.type,
        q.stem,
        q.options ? JSON.stringify(q.options) : null,
        JSON.stringify(q.answer),
        q.sourceBookId ?? null,
        q.sourceChapter ?? null,
        q.difficulty,
        q.userAnswer ? JSON.stringify(q.userAnswer) : null,
        q.isCorrect != null ? (q.isCorrect ? 1 : 0) : null,
        q.createdAt,
      ],
    );
  }
}

interface QuizQuestionRow {
  id: string;
  session_id: string;
  type: string;
  stem: string;
  options: string | null;
  answer: string;
  source_book_id: string | null;
  source_chapter: string | null;
  difficulty: number;
  user_answer: string | null;
  is_correct: number | null;
  created_at: number;
}

function mapQuestionRow(r: QuizQuestionRow): QuizQuestion {
  return {
    id: r.id,
    sessionId: r.session_id,
    type: r.type as QuizQuestion["type"],
    stem: r.stem,
    options: r.options ? JSON.parse(r.options) : undefined,
    answer: JSON.parse(r.answer),
    sourceBookId: r.source_book_id ?? undefined,
    sourceChapter: r.source_chapter ?? undefined,
    difficulty: r.difficulty,
    userAnswer: r.user_answer ? JSON.parse(r.user_answer) : undefined,
    isCorrect: r.is_correct != null ? r.is_correct === 1 : undefined,
    createdAt: r.created_at,
  };
}

export async function getQuizQuestions(sessionId: string): Promise<QuizQuestion[]> {
  const database = await getDB();
  const rows = await database.select<QuizQuestionRow>(
    "SELECT * FROM quiz_questions WHERE session_id = ? ORDER BY created_at ASC",
    [sessionId],
  );
  return rows.map(mapQuestionRow);
}

/**
 * Pick questions that already live in the question bank, preferring the ones
 * with the lowest correct rate / lowest usage so weak material resurfaces.
 */
export async function getBankQuestionsForQuiz(options: {
  limit: number;
  bookIds?: string[];
}): Promise<QuizQuestion[]> {
  const limit = Math.max(0, Math.floor(options.limit));
  if (limit === 0) return [];

  const database = await getDB();
  const values: unknown[] = [];
  let bookFilter = "";
  if (options.bookIds && options.bookIds.length > 0) {
    bookFilter = ` AND qq.source_book_id IN (${options.bookIds.map(() => "?").join(",")})`;
    values.push(...options.bookIds);
  }
  values.push(limit);

  const rows = await database.select<QuizQuestionRow & { tags: string | null }>(
    `SELECT qq.*, qb.tags AS tags
     FROM question_bank qb
     JOIN quiz_questions qq ON qb.question_id = qq.id
     WHERE 1 = 1${bookFilter}
     ORDER BY COALESCE(qb.correct_rate, 1) ASC, COALESCE(qb.usage_count, 0) ASC, RANDOM()
     LIMIT ?`,
    values,
  );

  return rows.map((row) => {
    const question = mapQuestionRow(row);
    let tags: string[] = [];
    if (row.tags) {
      try {
        const parsed = JSON.parse(row.tags);
        if (Array.isArray(parsed)) {
          tags = parsed.filter((t): t is string => typeof t === "string");
        }
      } catch {
        tags = [];
      }
    }
    return { ...question, tags };
  });
}

/** Pick previously answered-but-wrong questions (optionally scoped to books). */
export async function getWrongQuestionsForQuiz(options: {
  limit: number;
  bookIds?: string[];
}): Promise<QuizQuestion[]> {
  const limit = Math.max(0, Math.floor(options.limit));
  if (limit === 0) return [];

  const database = await getDB();
  const values: unknown[] = [];
  let bookFilter = "";
  if (options.bookIds && options.bookIds.length > 0) {
    bookFilter = ` AND source_book_id IN (${options.bookIds.map(() => "?").join(",")})`;
    values.push(...options.bookIds);
  }
  values.push(limit);

  const rows = await database.select<QuizQuestionRow>(
    `SELECT * FROM quiz_questions
     WHERE is_correct = 0${bookFilter}
     ORDER BY created_at DESC
     LIMIT ?`,
    values,
  );
  return rows.map(mapQuestionRow);
}

export async function updateQuizQuestion(
  id: string,
  updates: Partial<QuizQuestion>,
): Promise<void> {
  const database = await getDB();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (updates.type !== undefined) {
    sets.push("type = ?");
    values.push(updates.type);
  }
  if (updates.options !== undefined) {
    sets.push("options = ?");
    values.push(JSON.stringify(updates.options));
  }
  if (updates.answer !== undefined) {
    sets.push("answer = ?");
    values.push(JSON.stringify(updates.answer));
  }
  if (updates.difficulty !== undefined) {
    sets.push("difficulty = ?");
    values.push(updates.difficulty);
  }
  if (Object.prototype.hasOwnProperty.call(updates, "userAnswer")) {
    sets.push("user_answer = ?");
    values.push(updates.userAnswer ? JSON.stringify(updates.userAnswer) : null);
  }
  if (Object.prototype.hasOwnProperty.call(updates, "isCorrect")) {
    sets.push("is_correct = ?");
    values.push(updates.isCorrect != null ? (updates.isCorrect ? 1 : 0) : null);
  }

  if (sets.length === 0) return;
  values.push(id);
  await database.execute(`UPDATE quiz_questions SET ${sets.join(", ")} WHERE id = ?`, values);
}

// ---------------------------------------------------------------------------
// Question Bank
// ---------------------------------------------------------------------------

export async function insertQuestionBankEntry(entry: QuestionBankEntry): Promise<void> {
  const database = await getDB();
  await database.execute(
    `INSERT INTO question_bank (id, question_id, tags, usage_count, correct_rate, variant_of, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.id,
      entry.questionId,
      JSON.stringify(entry.tags),
      entry.usageCount,
      entry.correctRate ?? null,
      entry.variantOf ?? null,
      entry.createdAt,
    ],
  );
}

export async function getQuestionBank(query?: {
  bookId?: string;
  tags?: string[];
  type?: string;
}): Promise<QuestionBankEntry[]> {
  const database = await getDB();
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (query?.bookId) {
    // question_bank entries are linked via question_id -> quiz_questions.source_book_id
    conditions.push(
      "qb.question_id IN (SELECT qq.id FROM quiz_questions qq WHERE qq.source_book_id = ?)",
    );
    values.push(query.bookId);
  }
  if (query?.type) {
    conditions.push("qb.question_id IN (SELECT qq.id FROM quiz_questions qq WHERE qq.type = ?)");
    values.push(query.type);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await database.select<{
    id: string;
    question_id: string;
    tags: string;
    usage_count: number;
    correct_rate: number | null;
    variant_of: string | null;
    created_at: number;
    stem: string | null;
    type: string | null;
    difficulty: number | null;
    source_book_id: string | null;
  }>(
    `SELECT qb.*, qq.stem, qq.type, qq.difficulty, qq.source_book_id
     FROM question_bank qb
     LEFT JOIN quiz_questions qq ON qb.question_id = qq.id
     ${where} ORDER BY qb.created_at DESC`,
    values,
  );

  // Filter by tags after fetching (tags are JSON arrays in DB)
  let results = rows.map((r) => ({
    id: r.id,
    questionId: r.question_id,
    tags: JSON.parse(r.tags) as string[],
    usageCount: r.usage_count,
    correctRate: r.correct_rate ?? undefined,
    variantOf: r.variant_of ?? undefined,
    createdAt: r.created_at,
    stem: r.stem ?? undefined,
    questionType: (r.type as QuestionBankEntry["questionType"]) ?? undefined,
    difficulty: r.difficulty ?? undefined,
    sourceBookId: r.source_book_id ?? undefined,
  }));

  if (query?.tags && query.tags.length > 0) {
    const tags = query.tags;
    results = results.filter((entry) => tags.some((tag) => entry.tags.includes(tag)));
  }

  return results;
}

/**
 * Persist newly generated questions into the question bank.
 *
 * Duplicate stems (already in the bank) are skipped so re-used bank questions
 * never get double-counted. Returns the number of inserted entries.
 */
export async function insertQuestionBankEntries(
  questions: QuizQuestion[],
  options?: { createdAt?: number },
): Promise<number> {
  if (questions.length === 0) return 0;
  const database = await getDB();

  const existing = await database.select<{ stem: string }>(
    `SELECT qq.stem FROM question_bank qb
     JOIN quiz_questions qq ON qb.question_id = qq.id`,
  );
  const existingHashes = new Set(existing.map((row) => stemHash(row.stem)));

  const now = options?.createdAt ?? Date.now();
  let inserted = 0;
  for (const question of questions) {
    const hash = stemHash(question.stem);
    if (existingHashes.has(hash)) continue;
    existingHashes.add(hash);
    await database.execute(
      `INSERT INTO question_bank (id, question_id, tags, usage_count, correct_rate, variant_of, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [`bank-${question.id}`, question.id, JSON.stringify(question.tags ?? []), 0, null, null, now],
    );
    inserted++;
  }
  return inserted;
}

/**
 * Update usage counters / rolling correct rate for the questions of a session.
 * Called when a session is graded so the bank reflects real performance.
 */
export async function updateQuestionBankStats(questions: QuizQuestion[]): Promise<void> {
  if (questions.length === 0) return;
  const database = await getDB();

  for (const question of questions) {
    // Bank entries reference the *original* question row; a question re-used in
    // a new session is a clone with a fresh id, so fall back to the stem.
    const rows = await database.select<{
      id: string;
      usage_count: number;
      correct_rate: number | null;
    }>(
      `SELECT qb.id AS id, qb.usage_count AS usage_count, qb.correct_rate AS correct_rate
       FROM question_bank qb
       LEFT JOIN quiz_questions qq ON qb.question_id = qq.id
       WHERE qb.question_id = ? OR qq.stem = ?
       LIMIT 1`,
      [question.id, question.stem],
    );
    const entry = rows[0];
    if (!entry) continue;

    if (question.isCorrect === undefined) {
      await database.execute("UPDATE question_bank SET usage_count = ? WHERE id = ?", [
        entry.usage_count + 1,
        entry.id,
      ]);
      continue;
    }

    const attemptCorrect = question.isCorrect ? 1 : 0;
    const previousRate = entry.correct_rate;
    const nextRate =
      previousRate == null
        ? attemptCorrect
        : (previousRate * entry.usage_count + attemptCorrect) / (entry.usage_count + 1);
    await database.execute(
      "UPDATE question_bank SET usage_count = ?, correct_rate = ? WHERE id = ?",
      [entry.usage_count + 1, nextRate, entry.id],
    );
  }
}

export async function updateQuestionBankEntry(
  id: string,
  updates: Partial<QuestionBankEntry>,
): Promise<void> {
  const database = await getDB();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (updates.tags !== undefined) {
    sets.push("tags = ?");
    values.push(JSON.stringify(updates.tags));
  }
  if (updates.usageCount !== undefined) {
    sets.push("usage_count = ?");
    values.push(updates.usageCount);
  }
  if (Object.prototype.hasOwnProperty.call(updates, "correctRate")) {
    sets.push("correct_rate = ?");
    values.push(updates.correctRate ?? null);
  }
  if (Object.prototype.hasOwnProperty.call(updates, "variantOf")) {
    sets.push("variant_of = ?");
    values.push(updates.variantOf ?? null);
  }

  if (sets.length === 0) return;
  values.push(id);
  await database.execute(`UPDATE question_bank SET ${sets.join(", ")} WHERE id = ?`, values);
}

// ---------------------------------------------------------------------------
// Stem hash helper (for deduplication)
// ---------------------------------------------------------------------------

export function stemHash(stem: string): string {
  const normalized = stem.trim().replace(/\s+/g, " ").toLowerCase();
  // Simple hash: first 32 chars of normalized stem
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `${normalized.slice(0, 32)}_${Math.abs(hash).toString(16)}`;
}
