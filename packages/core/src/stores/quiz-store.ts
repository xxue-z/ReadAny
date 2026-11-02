/**
 * Quiz Zustand Store — manage quiz sessions, question answering, and reports.
 *
 * Flows:
 *   1. startQuiz(config) → generateQuizQuestions() → save to DB → begin taking
 *   2. submitAnswer(id, answer) → auto-grade non-short_answer → persist to DB
 *   3. completeQuiz() → buildQuizReport() → update session status → show report
 *   4. loadSessions() → list all sessions
 *   5. loadSession(id) → resume a session from DB
 */

import { create } from "zustand";
import type { AIConfig, QuizConfig, QuizQuestion, QuizReport, QuizSession } from "../types";
import { generateQuizQuestions } from "../quiz/quiz-generator";
import { buildQuizReport } from "../quiz/report-builder";
import {
  insertQuizSession,
  insertQuizQuestions,
  getQuizSession,
  getQuizSessions,
  getQuizQuestions,
  updateQuizSession,
  updateQuizQuestion,
} from "../db/quiz-queries";
import { generateId } from "../utils/generate-id";

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export interface QuizState {
  /** All quiz sessions loaded from DB (for history list). */
  sessions: QuizSession[];

  /** The session currently being taken or reviewed. */
  currentSession: QuizSession | null;

  /** Questions belonging to currentSession. */
  currentQuestions: QuizQuestion[];

  /** Index within currentQuestions of the question the user is on. */
  currentQuestionIndex: number;

  /** True while the LLM is generating questions. */
  isGenerating: boolean;

  /** True when the user is actively answering questions. */
  isTaking: boolean;

  /** Populated after completeQuiz() builds the report. */
  report: QuizReport | null;

  // -- actions ---------------------------------------------------------------

  /** Generate questions, create a session, save everything to DB, and start. */
  startQuiz: (config: QuizConfig, aiConfig?: AIConfig) => Promise<void>;

  /** Record an answer for a specific question and auto-grade non-short_answer types. */
  submitAnswer: (questionId: string, answer: string | string[]) => void;

  /** Finish the quiz: build a report, persist the final score, and stop taking. */
  completeQuiz: () => Promise<void>;

  /** Load all quiz sessions from DB into `sessions`. */
  loadSessions: () => Promise<void>;

  /** Load a specific session + its questions so the user can resume. */
  loadSession: (id: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compare a user answer against the correct answer for auto-grading.
 * Only called for single_choice / multi_choice / true_false.
 */
function autoGrade(question: QuizQuestion, userAnswer: string | string[]): boolean {
  const correct = question.answer.correct;

  if (question.type === "multi_choice") {
    if (!Array.isArray(userAnswer) || !Array.isArray(correct)) return false;
    const sortedUser = [...userAnswer].sort();
    const sortedCorrect = [...correct].sort();
    return (
      sortedUser.length === sortedCorrect.length &&
      sortedUser.every((v, i) => v === sortedCorrect[i])
    );
  }

  // single_choice / true_false — direct string equality
  return String(userAnswer) === String(correct);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useQuizStore = create<QuizState>((set, get) => ({
  sessions: [],
  currentSession: null,
  currentQuestions: [],
  currentQuestionIndex: 0,
  isGenerating: false,
  isTaking: false,
  report: null,

  // -------------------------------------------------------------------------
  // startQuiz
  // -------------------------------------------------------------------------

  startQuiz: async (config, aiConfig) => {
    set({ isGenerating: true });

    try {
      const questions = await generateQuizQuestions(config, aiConfig);
      const sessionId = generateId();

      // Remap all questions to our freshly-generated session ID.
      const sessionQuestions: QuizQuestion[] = questions.map((q) => ({
        ...q,
        sessionId,
      }));

      const session: QuizSession = {
        id: sessionId,
        type: config.type,
        config,
        status: "in_progress",
        timeSpent: 0,
        createdAt: Date.now(),
      };

      // Persist session + questions to DB.
      await insertQuizSession(session);
      if (sessionQuestions.length > 0) {
        await insertQuizQuestions(sessionQuestions);
      }

      set({
        currentSession: session,
        currentQuestions: sessionQuestions,
        currentQuestionIndex: 0,
        isGenerating: false,
        isTaking: true,
      });
    } catch (err) {
      set({ isGenerating: false });
      throw err;
    }
  },

  // -------------------------------------------------------------------------
  // submitAnswer
  // -------------------------------------------------------------------------

  submitAnswer: (questionId, answer) => {
    const { currentQuestions, currentQuestionIndex } = get();
    const idx = currentQuestions.findIndex((q) => q.id === questionId);
    if (idx === -1) return;

    const question = currentQuestions[idx];
    const isShortAnswer = question.type === "short_answer";

    const updatedQuestion: QuizQuestion = {
      ...question,
      userAnswer: answer,
      // Auto-grade non-short_answer; short_answer stays undefined (graded later).
      isCorrect: isShortAnswer ? undefined : autoGrade(question, answer),
    };

    const updatedQuestions = [...currentQuestions];
    updatedQuestions[idx] = updatedQuestion;

    // Persist to DB (fire-and-forget — UI does not need to wait).
    updateQuizQuestion(questionId, {
      userAnswer: answer,
      isCorrect: updatedQuestion.isCorrect,
    }).catch((err) => console.error("[QuizStore] Failed to persist answer:", err));

    // Auto-advance to the next question unless we're on the last one.
    const nextIndex =
      idx === currentQuestionIndex && idx < currentQuestions.length - 1
        ? idx + 1
        : currentQuestionIndex;

    set({
      currentQuestions: updatedQuestions,
      currentQuestionIndex: nextIndex,
    });
  },

  // -------------------------------------------------------------------------
  // completeQuiz
  // -------------------------------------------------------------------------

  completeQuiz: async () => {
    const { currentSession, currentQuestions } = get();
    if (!currentSession) return;

    // Persist any short_answer questions that were never submitted with
    // isCorrect = null (the grader will handle them manually or skip).
    for (const q of currentQuestions) {
      if (q.type === "short_answer" && q.isCorrect === undefined) {
        await updateQuizQuestion(q.id, { isCorrect: undefined as unknown as boolean }).catch(() => {
          // Non-critical: report builder tolerates missing isCorrect.
        });
      }
    }

    // Build the report (loads fresh data from DB).
    const report = await buildQuizReport(currentSession.id);

    // Score is a 0–100 integer derived from the correct-rate fraction.
    const score = Math.round(report.summary.correctRate * 100);

    await updateQuizSession(currentSession.id, {
      status: "graded",
      score,
      completedAt: Date.now(),
    });

    set({
      currentSession: {
        ...currentSession,
        status: "graded",
        score,
        completedAt: Date.now(),
      },
      report,
      isTaking: false,
    });
  },

  // -------------------------------------------------------------------------
  // loadSessions
  // -------------------------------------------------------------------------

  loadSessions: async () => {
    const sessions = await getQuizSessions();
    set({ sessions });
  },

  // -------------------------------------------------------------------------
  // loadSession (resume)
  // -------------------------------------------------------------------------

  loadSession: async (id) => {
    const session = await getQuizSession(id);
    if (!session) return;

    const questions = await getQuizQuestions(id);

    // Position the user at the first unanswered question, if any.
    const firstUnanswered = questions.findIndex((q) => q.userAnswer === undefined);

    set({
      currentSession: session,
      currentQuestions: questions,
      currentQuestionIndex: firstUnanswered >= 0 ? firstUnanswered : 0,
      isTaking: true,
      report: null,
    });
  },
}));