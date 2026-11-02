import type { IDatabase } from "../services/platform";
import type {
  HistoryTrend,
  QuizQuestion,
  QuizReport,
  QuizSummary,
  WeakArea,
} from "../types/quiz";
import { getDB } from "../db/db-core";
import { getQuizQuestions, getQuizSession, getQuizSessions } from "../db/quiz-queries";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a comprehensive quiz report for a session: summary statistics,
 * weak-area analysis (per-tag error rates from the question bank), recent
 * history trend data, and the full question list.
 */
export async function buildQuizReport(sessionId: string): Promise<QuizReport> {
  const session = await getQuizSession(sessionId);
  if (!session) {
    throw new Error(`Quiz session not found: ${sessionId}`);
  }

  const questions = await getQuizQuestions(sessionId);

  const [summary, weakAreas, history] = await Promise.all([
    Promise.resolve(computeSummary(session, questions)),
    computeWeakAreas(questions),
    computeHistory(),
  ]);

  return { summary, weakAreas, history, questions };
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function computeSummary(
  session: { timeSpent: number },
  questions: QuizQuestion[],
): QuizSummary {
  const totalQuestions = questions.length;
  const correctCount = questions.filter((q) => q.isCorrect === true).length;
  const correctRate = totalQuestions > 0 ? correctCount / totalQuestions : 0;

  const byType = new Map<string, { total: number; correct: number }>();
  for (const q of questions) {
    let acc = byType.get(q.type);
    if (!acc) {
      acc = { total: 0, correct: 0 };
      byType.set(q.type, acc);
    }
    acc.total++;
    if (q.isCorrect) acc.correct++;
  }

  const correctRateByType: Record<string, number> = {};
  for (const [type, acc] of byType) {
    correctRateByType[type] = acc.total > 0 ? acc.correct / acc.total : 0;
  }

  return {
    totalQuestions,
    correctCount,
    correctRate,
    timeSpent: session.timeSpent,
    correctRateByType,
  };
}

// ---------------------------------------------------------------------------
// Weak areas (tag-level error-rate analysis)
// ---------------------------------------------------------------------------

async function computeWeakAreas(questions: QuizQuestion[]): Promise<WeakArea[]> {
  if (questions.length === 0) return [];

  const correctness = new Map<string, boolean>();
  const questionIds: string[] = [];

  for (const q of questions) {
    correctness.set(q.id, q.isCorrect ?? false);
    questionIds.push(q.id);
  }

  const db = await getDB();
  const entries = await loadBankEntriesForQuestionIds(db, questionIds);

  // tag → Set<questionId>
  const tagQuestions = new Map<string, Set<string>>();
  for (const entry of entries) {
    for (const tag of entry.tags) {
      let qSet = tagQuestions.get(tag);
      if (!qSet) {
        qSet = new Set();
        tagQuestions.set(tag, qSet);
      }
      qSet.add(entry.questionId);
    }
  }

  const weakAreas: WeakArea[] = [];
  for (const [tag, qIds] of tagQuestions) {
    let incorrect = 0;
    for (const qId of qIds) {
      if (!correctness.get(qId)) incorrect++;
    }
    weakAreas.push({
      tag,
      errorRate: qIds.size > 0 ? incorrect / qIds.size : 0,
      questionCount: qIds.size,
    });
  }

  // Sort descending by error rate so the weakest areas appear first
  weakAreas.sort((a, b) => b.errorRate - a.errorRate);
  return weakAreas;
}

interface BankEntryRow {
  questionId: string;
  tags: string[];
}

async function loadBankEntriesForQuestionIds(
  db: IDatabase,
  ids: string[],
): Promise<BankEntryRow[]> {
  if (ids.length === 0) return [];

  const placeholders = ids.map(() => "?").join(",");
  const rows = await db.select<{ question_id: string; tags: string }>(
    `SELECT question_id, tags FROM question_bank WHERE question_id IN (${placeholders})`,
    ids,
  );

  return rows.map((r) => ({
    questionId: r.question_id,
    tags: JSON.parse(r.tags) as string[],
  }));
}

// ---------------------------------------------------------------------------
// History trend
// ---------------------------------------------------------------------------

async function computeHistory(): Promise<HistoryTrend[]> {
  const sessions = await getQuizSessions(10);
  if (sessions.length === 0) return [];

  // Load questions for every session in parallel
  const trendPromises = sessions.map(async (s) => {
    const questions = await getQuizQuestions(s.id);
    const total = questions.length;
    const correct = questions.filter((q) => q.isCorrect === true).length;

    return {
      sessionId: s.id,
      date: s.createdAt,
      score: s.score ?? 0,
      correctRate: total > 0 ? correct / total : 0,
    } satisfies HistoryTrend;
  });

  const trends = await Promise.all(trendPromises);

  // Most-recent-first is already the order from getQuizSessions; reverse for
  // chronological display.
  trends.reverse();

  return trends;
}