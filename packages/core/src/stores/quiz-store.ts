/**
 * Quiz Zustand Store — manage quiz sessions, question answering, and reports.
 *
 * Flows:
 *   1. startQuiz(config, aiConfig) → generateQuizQuestions() → save to DB → begin taking
 *      (throws QuizGenerationError and persists nothing when it cannot produce questions)
 *   2. submitAnswer(id, answer) → auto-grade non-short_answer → persist to DB
 *      (does not advance: the player decides when to move on so the verdict/explanation stay visible)
 *   3. completeQuiz() → buildQuizReport() → update session status → show report
 *   4. loadSessions() → list all sessions
 *   5. loadSession(id) → resume a session from DB
 *   6. resetQuiz() → leave the report / empty player and return to setup
 */

import { create } from "zustand";
import {
  getQuizQuestions,
  getQuizSession,
  getQuizSessions,
  insertQuestionBankEntries,
  insertQuizQuestions,
  insertQuizSession,
  updateQuestionBankStats,
  updateQuizQuestion,
  updateQuizSession,
} from "../db/quiz-queries";
import { generateQuizQuestions } from "../quiz/quiz-generator";
import { buildQuizReport } from "../quiz/report-builder";
import { answersEqual } from "../quiz/scoring";
import type { AIConfig, QuizConfig, QuizQuestion, QuizReport, QuizSession } from "../types";
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

  /**
   * Generate questions, create a session, save everything to DB, and start.
   * Throws a {@link QuizGenerationError} when generation cannot produce any
   * question — callers must surface it to the user instead of starting an
   * empty quiz.
   */
  startQuiz: (config: QuizConfig, aiConfig: AIConfig) => Promise<void>;

  /** Record an answer for a specific question and auto-grade non-short_answer types. */
  submitAnswer: (questionId: string, answer: string | string[]) => void;

  /** Finish the quiz: build a report, persist the final score, and stop taking. */
  completeQuiz: (timeSpentSeconds?: number) => Promise<void>;

  /** Abort an in-flight generation (the "cancel" button while generating). */
  cancelGeneration: () => void;

  /** Return from the report (or an empty quiz) back to the setup screen. */
  resetQuiz: () => void;

  /**
   * Checkpoint the answering time (seconds) of the current session so that a
   * resumed quiz continues the clock instead of restarting at 0.
   */
  saveElapsed: (seconds: number) => Promise<void>;

  /** Load all quiz sessions from DB into `sessions`. */
  loadSessions: () => Promise<void>;

  /** Load a specific session + its questions so the user can resume. */
  loadSession: (id: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type QuizGenerationErrorCode = "NO_AI_CONFIG" | "NO_QUESTIONS" | "GENERATION_FAILED";

/** Typed failure so the UI can render a localized, actionable message. */
export class QuizGenerationError extends Error {
  readonly code: QuizGenerationErrorCode;

  constructor(code: QuizGenerationErrorCode, message?: string) {
    super(message ?? code);
    this.name = "QuizGenerationError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compare a user answer against the correct answer for auto-grading.
 * Only called for single_choice / multi_choice / true_false.
 */
function autoGrade(question: QuizQuestion, userAnswer: string | string[]): boolean {
  if (question.type === "short_answer") return false;
  return answersEqual(question, userAnswer, question.answer.correct);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/** In-flight generation, so `cancelGeneration` can abort the LLM request. */
let activeGeneration: AbortController | null = null;

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
    // Clear any previous report first: otherwise the report branch in QuizPage
    // keeps rendering the old report even after a new quiz has been generated.
    set({ isGenerating: true, report: null });

    const controller = new AbortController();
    activeGeneration = controller;

    try {
      if (!aiConfig?.activeEndpointId || !aiConfig.activeModel) {
        throw new QuizGenerationError("NO_AI_CONFIG");
      }

      let questions: QuizQuestion[];
      try {
        questions = await generateQuizQuestions(config, aiConfig, { signal: controller.signal });
      } catch (err) {
        // A cancelled generation is not an error the user needs to see.
        if (controller.signal.aborted) {
          set({ isGenerating: false });
          return;
        }
        console.error("[QuizStore] Question generation failed:", err);
        throw new QuizGenerationError("GENERATION_FAILED");
      }

      if (controller.signal.aborted) {
        set({ isGenerating: false });
        return;
      }

      if (questions.length === 0) {
        // Do NOT persist an empty session: a graded 0-question session would
        // mark today's daily quiz as "completed" with a 0 score and block a
        // retry for the rest of the day.
        throw new QuizGenerationError("NO_QUESTIONS");
      }

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
      await insertQuizQuestions(sessionQuestions);

      // Register the new questions in the question bank so the bank browser,
      // bank-ratio sampling and weak-area analysis have data to work with.
      await insertQuestionBankEntries(sessionQuestions).catch((err) =>
        console.warn("[QuizStore] Failed to add questions to bank:", err),
      );

      set({
        sessions: [session, ...get().sessions.filter((entry) => entry.id !== session.id)],
        currentSession: session,
        currentQuestions: sessionQuestions,
        currentQuestionIndex: 0,
        isGenerating: false,
        isTaking: true,
      });
    } catch (err) {
      set({ isGenerating: false });
      throw err;
    } finally {
      if (activeGeneration === controller) activeGeneration = null;
    }
  },

  // -------------------------------------------------------------------------
  // cancelGeneration
  // -------------------------------------------------------------------------

  cancelGeneration: () => {
    activeGeneration?.abort();
    activeGeneration = null;
    set({ isGenerating: false });
  },

  // -------------------------------------------------------------------------
  // submitAnswer
  // -------------------------------------------------------------------------

  submitAnswer: (questionId, answer) => {
    const { currentQuestions } = get();
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

    // Do NOT auto-advance: the player must be able to show the correctness
    // verdict and the explanation for the question just answered. Navigation is
    // driven explicitly by the player (its own "next" control).
    set({ currentQuestions: updatedQuestions });
  },

  // -------------------------------------------------------------------------
  // completeQuiz
  // -------------------------------------------------------------------------

  completeQuiz: async (timeSpentSeconds) => {
    const { currentSession, currentQuestions } = get();
    if (!currentSession) return;

    const timeSpent =
      typeof timeSpentSeconds === "number" && Number.isFinite(timeSpentSeconds)
        ? Math.max(0, Math.round(timeSpentSeconds))
        : currentSession.timeSpent;

    // Build the report (loads fresh data from DB). Unanswered short answers keep
    // isCorrect undefined, which the report treats as "pending", not wrong.
    const report = await buildQuizReport(currentSession.id);

    // Score is a 0–100 integer derived from the correct-rate fraction. A quiz
    // made only of short-answer questions has nothing to auto-grade, so it must
    // not be reported as 0/100 — leave the score unset instead.
    const score =
      report.summary.gradableCount > 0 ? Math.round(report.summary.correctRate * 100) : undefined;
    const completedAt = Date.now();

    await updateQuizSession(currentSession.id, {
      status: "graded",
      ...(score !== undefined ? { score } : {}),
      timeSpent,
      completedAt,
    });

    // Feed real performance back into the question bank.
    await updateQuestionBankStats(currentQuestions).catch((err) =>
      console.warn("[QuizStore] Failed to update bank stats:", err),
    );

    // Refresh the history list so "recent quizzes" reflect this session.
    const sessions = await getQuizSessions().catch(() => get().sessions);

    set({
      sessions,
      currentSession: {
        ...currentSession,
        status: "graded",
        score,
        timeSpent,
        completedAt,
      },
      report: {
        ...report,
        summary: { ...report.summary, timeSpent },
      },
      isTaking: false,
    });
  },

  // -------------------------------------------------------------------------
  // resetQuiz — leave the report / empty player and return to the setup tabs
  // -------------------------------------------------------------------------

  resetQuiz: () => {
    set({
      currentSession: null,
      currentQuestions: [],
      currentQuestionIndex: 0,
      isGenerating: false,
      isTaking: false,
      report: null,
    });
  },

  // -------------------------------------------------------------------------
  // saveElapsed — checkpoint the answering time so resuming continues the clock
  // -------------------------------------------------------------------------

  saveElapsed: async (seconds) => {
    const { currentSession } = get();
    if (!currentSession) return;
    if (currentSession.status === "graded" || currentSession.status === "completed") return;

    const normalized = Math.max(0, Math.round(seconds));
    // Never move the clock backwards (e.g. a stale unmount flush).
    if (normalized <= (currentSession.timeSpent ?? 0)) return;

    set({ currentSession: { ...currentSession, timeSpent: normalized } });
    await updateQuizSession(currentSession.id, { timeSpent: normalized }).catch((err) => {
      console.warn("[QuizStore] Failed to persist elapsed time:", err);
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

    // A finished session opens as its report, never as a live quiz — otherwise
    // history entries would let the user "re-answer" a graded session.
    if (session.status === "graded" || session.status === "completed") {
      const report = await buildQuizReport(id);
      set({
        currentSession: session,
        currentQuestions: questions,
        currentQuestionIndex: 0,
        isTaking: false,
        report,
      });
      return;
    }

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
