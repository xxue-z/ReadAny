import { getDB } from "../db/db-core";
import { getQuizQuestions, getQuizSession, getQuizSessions } from "../db/quiz-queries";
import type { IDatabase } from "../services/platform";
import type { HistoryTrend, QuizQuestion, QuizReport, QuizSummary, WeakArea } from "../types/quiz";

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

export function computeSummary(
  session: { timeSpent: number },
  questions: QuizQuestion[],
): QuizSummary {
  const totalQuestions = questions.length;
  // Short-answer questions are graded by the reader, not by the app, so they
  // must never count as wrong in the score.
  const gradable = questions.filter((q) => q.type !== "short_answer");
  const pending = questions.filter((q) => q.type === "short_answer" && q.isCorrect === undefined);
  const unansweredCount = questions.filter((q) => q.userAnswer === undefined).length;
  const gradableCount = gradable.length;
  const correctCount = gradable.filter((q) => q.isCorrect === true).length;
  const correctRate = gradableCount > 0 ? correctCount / gradableCount : 0;

  const byType = new Map<string, { total: number; correct: number; gradable: number }>();
  for (const q of questions) {
    let acc = byType.get(q.type);
    if (!acc) {
      acc = { total: 0, correct: 0, gradable: 0 };
      byType.set(q.type, acc);
    }
    acc.total++;
    if (q.type !== "short_answer") acc.gradable++;
    if (q.isCorrect) acc.correct++;
  }

  const correctRateByType: Record<string, number> = {};
  for (const [type, acc] of byType) {
    correctRateByType[type] = acc.gradable > 0 ? acc.correct / acc.gradable : 0;
  }

  return {
    totalQuestions,
    gradableCount,
    pendingCount: pending.length,
    unansweredCount,
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
    // Short answers have no automatic verdict; unanswered questions are not
    // evidence of weakness either (skipping 5 questions must not flag their
    // tags as 100% wrong).
    if (q.type === "short_answer") continue;
    if (q.isCorrect === undefined) continue;
    correctness.set(q.id, q.isCorrect);
    questionIds.push(q.id);
  }

  if (questionIds.length === 0) return [];

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

  // Only finished quizzes have a meaningful score; an abandoned session would
  // otherwise be drawn as a 0% bar.
  const finished = sessions.filter(
    (session) => session.status === "graded" || session.status === "completed",
  );
  if (finished.length === 0) return [];

  // Load questions for every session in parallel
  const trendPromises = finished.map(async (s) => {
    const questions = await getQuizQuestions(s.id);
    const gradable = questions.filter((q) => q.type !== "short_answer");
    // A session with nothing auto-graded (e.g. all short answers) has no
    // meaningful score — skip it instead of drawing a fabricated 0% bar.
    if (gradable.length === 0) return null;
    const correct = gradable.filter((q) => q.isCorrect === true).length;

    return {
      sessionId: s.id,
      date: s.createdAt,
      score: s.score ?? 0,
      correctRate: correct / gradable.length,
    } satisfies HistoryTrend;
  });

  const trends = (await Promise.all(trendPromises)).filter(
    (trend): trend is HistoryTrend => trend !== null,
  );

  // Most-recent-first is already the order from getQuizSessions; reverse for
  // chronological display.
  trends.reverse();

  return trends;
}
