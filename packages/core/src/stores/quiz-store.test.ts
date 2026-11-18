import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AIConfig, QuizConfig, QuizQuestion } from "../types";

// ---------------------------------------------------------------------------
// In-memory persistence + generator stubs
// ---------------------------------------------------------------------------

const mem = vi.hoisted(() => {
  const sessions = new Map<string, any>();
  const questions = new Map<string, any>();
  return {
    sessions,
    questions,
    reset() {
      sessions.clear();
      questions.clear();
    },
  };
});

const gen = vi.hoisted(() => ({
  questions: [] as any[],
  throwOnGenerate: null as Error | null,
  /** When set, generation waits for this promise (for cancellation tests). */
  gate: null as Promise<void> | null,
  seenSignal: null as AbortSignal | null,
}));

vi.mock("../db/quiz-queries", () => ({
  insertQuizSession: async (session: any) => {
    mem.sessions.set(session.id, { ...session });
  },
  insertQuizQuestions: async (questions: any[]) => {
    for (const question of questions) mem.questions.set(question.id, { ...question });
  },
  getQuizSession: async (id: string) => mem.sessions.get(id) ?? null,
  getQuizSessions: async () => [...mem.sessions.values()],
  getQuizQuestions: async (sessionId: string) =>
    [...mem.questions.values()].filter((q) => q.sessionId === sessionId),
  updateQuizSession: async (id: string, updates: any) => {
    mem.sessions.set(id, { ...mem.sessions.get(id), ...updates });
  },
  updateQuizQuestion: async (id: string, updates: any) => {
    mem.questions.set(id, { ...mem.questions.get(id), ...updates });
  },
  insertQuestionBankEntry: async () => {},
  insertQuestionBankEntries: async () => 0,
  updateQuestionBankStats: async () => {},
  getQuestionBank: async () => [],
  updateQuestionBankEntry: async () => {},
  getBankQuestionsForQuiz: async () => [],
  getWrongQuestionsForQuiz: async () => [],
  stemHash: (stem: string) => stem,
}));

vi.mock("../quiz/quiz-generator", () => ({
  generateQuizQuestions: async (
    _config: unknown,
    _aiConfig: unknown,
    options?: { signal?: AbortSignal },
  ) => {
    gen.seenSignal = options?.signal ?? null;
    if (gen.gate) await gen.gate;
    if (gen.throwOnGenerate) throw gen.throwOnGenerate;
    return gen.questions;
  },
  generateVariantQuestion: async () => null,
}));

vi.mock("../quiz/report-builder", () => ({
  buildQuizReport: async (sessionId: string) => {
    const questions = [...mem.questions.values()].filter((q) => q.sessionId === sessionId);
    const gradable = questions.filter((q) => q.type !== "short_answer");
    const correctCount = gradable.filter((q) => q.isCorrect === true).length;
    return {
      summary: {
        totalQuestions: questions.length,
        gradableCount: gradable.length,
        pendingCount: 0,
        unansweredCount: questions.filter((q) => q.userAnswer === undefined).length,
        correctCount,
        correctRate: gradable.length > 0 ? correctCount / gradable.length : 0,
        timeSpent: 0,
        correctRateByType: {},
      },
      weakAreas: [],
      history: [],
      questions,
    };
  },
}));

import { QuizGenerationError, useQuizStore } from "./quiz-store";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const config: QuizConfig = {
  type: "daily",
  questionCount: 2,
  difficulty: 2,
  bankRatio: 0.3,
  wrongRatio: 0.2,
};

const aiConfig = {
  activeEndpointId: "endpoint-1",
  activeModel: "test-model",
  endpoints: [{ id: "endpoint-1" }],
} as unknown as AIConfig;

function makeQuestion(overrides: Partial<QuizQuestion>): QuizQuestion {
  return {
    id: "q1",
    sessionId: "ignored",
    type: "single_choice",
    stem: "Q?",
    options: [
      { key: "A", content: "a" },
      { key: "B", content: "b" },
    ],
    answer: { correct: "A", explanation: "because" },
    difficulty: 2,
    createdAt: 0,
    ...overrides,
  };
}

beforeEach(() => {
  mem.reset();
  gen.questions = [];
  gen.throwOnGenerate = null;
  gen.gate = null;
  gen.seenSignal = null;
  useQuizStore.setState({
    sessions: [],
    currentSession: null,
    currentQuestions: [],
    currentQuestionIndex: 0,
    isGenerating: false,
    isTaking: false,
    report: null,
  });
});

// ---------------------------------------------------------------------------
// P0 regressions
// ---------------------------------------------------------------------------

describe("startQuiz generation guards", () => {
  it("fails loudly (and persists nothing) when no AIConfig is supplied", async () => {
    gen.questions = [makeQuestion({})];

    await expect(
      useQuizStore.getState().startQuiz(config, undefined as unknown as AIConfig),
    ).rejects.toMatchObject({ code: "NO_AI_CONFIG" });

    expect(mem.sessions.size).toBe(0);
    expect(useQuizStore.getState().isTaking).toBe(false);
    expect(useQuizStore.getState().isGenerating).toBe(false);
  });

  it("fails loudly instead of saving an empty session", async () => {
    gen.questions = [];

    const error = await useQuizStore
      .getState()
      .startQuiz(config, aiConfig)
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(QuizGenerationError);
    expect((error as QuizGenerationError).code).toBe("NO_QUESTIONS");
    expect(mem.sessions.size).toBe(0);
    expect(useQuizStore.getState().currentQuestions).toHaveLength(0);
    expect(useQuizStore.getState().isTaking).toBe(false);
  });

  it("reports LLM failures as GENERATION_FAILED", async () => {
    gen.throwOnGenerate = new Error("boom");

    await expect(useQuizStore.getState().startQuiz(config, aiConfig)).rejects.toMatchObject({
      code: "GENERATION_FAILED",
    });
    expect(mem.sessions.size).toBe(0);
  });

  it("persists a session and starts taking when questions are generated", async () => {
    gen.questions = [makeQuestion({ id: "gen-1" }), makeQuestion({ id: "gen-2" })];

    await useQuizStore.getState().startQuiz(config, aiConfig);

    const state = useQuizStore.getState();
    expect(state.isTaking).toBe(true);
    expect(state.currentQuestions).toHaveLength(2);
    expect(state.sessions[0]?.id).toBe(state.currentSession?.id);
    expect(state.currentQuestions[0]?.sessionId).toBe(state.currentSession?.id);
    expect(mem.sessions.size).toBe(1);
    expect(mem.questions.size).toBe(2);
  });

  it("clears a stale report so the player is shown instead of the old report", async () => {
    useQuizStore.setState({
      report: {
        summary: {
          totalQuestions: 1,
          gradableCount: 1,
          pendingCount: 0,
          unansweredCount: 0,
          correctCount: 1,
          correctRate: 1,
          timeSpent: 0,
          correctRateByType: {},
        },
        weakAreas: [],
        history: [],
        questions: [],
      },
    });

    gen.questions = [makeQuestion({ id: "gen-1" })];
    await useQuizStore.getState().startQuiz(config, aiConfig);

    // QuizPage renders the report branch before the player branch.
    expect(useQuizStore.getState().report).toBeNull();
  });
});

describe("answering", () => {
  it("does not auto-advance, so the verdict/explanation stays visible", async () => {
    gen.questions = [makeQuestion({ id: "gen-1" }), makeQuestion({ id: "gen-2" })];
    await useQuizStore.getState().startQuiz(config, aiConfig);

    useQuizStore.getState().submitAnswer("gen-1", "A");

    const state = useQuizStore.getState();
    expect(state.currentQuestionIndex).toBe(0);
    expect(state.currentQuestions[0]?.userAnswer).toBe("A");
    expect(state.currentQuestions[0]?.isCorrect).toBe(true);
  });

  it("grades a true/false answer submitted with the player's keys", async () => {
    gen.questions = [
      makeQuestion({
        id: "tf-1",
        type: "true_false",
        options: [
          { key: "A", content: "True" },
          { key: "B", content: "False" },
        ],
        answer: { correct: "A", explanation: "" },
      }),
    ];
    await useQuizStore.getState().startQuiz(config, aiConfig);

    useQuizStore.getState().submitAnswer("tf-1", "true");

    expect(useQuizStore.getState().currentQuestions[0]?.isCorrect).toBe(true);
  });

  it("keeps short answers ungraded", async () => {
    gen.questions = [makeQuestion({ id: "sa-1", type: "short_answer", options: undefined })];
    await useQuizStore.getState().startQuiz(config, aiConfig);

    useQuizStore.getState().submitAnswer("sa-1", "my answer");

    expect(useQuizStore.getState().currentQuestions[0]?.isCorrect).toBeUndefined();
  });
});

describe("generation cancellation", () => {
  it("cancels an in-flight generation without persisting a session", async () => {
    let release: () => void = () => {};
    gen.gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const pending = useQuizStore.getState().startQuiz(config, aiConfig);
    expect(useQuizStore.getState().isGenerating).toBe(true);
    expect(gen.seenSignal).not.toBeNull();

    useQuizStore.getState().cancelGeneration();
    expect(gen.seenSignal?.aborted).toBe(true);
    expect(useQuizStore.getState().isGenerating).toBe(false);

    release();
    await pending;

    expect(mem.sessions.size).toBe(0);
    expect(useQuizStore.getState().currentSession).toBeNull();
    expect(useQuizStore.getState().isTaking).toBe(false);
  });
});

describe("completion and reset", () => {
  it("builds the report, grades the session, and can return to setup", async () => {
    gen.questions = [makeQuestion({ id: "gen-1" })];
    await useQuizStore.getState().startQuiz(config, aiConfig);
    useQuizStore.getState().submitAnswer("gen-1", "A");

    await useQuizStore.getState().completeQuiz();

    const graded = useQuizStore.getState();
    expect(graded.isTaking).toBe(false);
    expect(graded.report?.summary.correctRate).toBe(1);
    expect(graded.currentSession?.status).toBe("graded");
    expect(mem.sessions.get(graded.currentSession?.id ?? "")?.score).toBe(100);

    useQuizStore.getState().resetQuiz();

    const reset = useQuizStore.getState();
    expect(reset.report).toBeNull();
    expect(reset.currentSession).toBeNull();
    expect(reset.isTaking).toBe(false);
  });

  it("persists the reported time spent", async () => {
    gen.questions = [makeQuestion({ id: "gen-1" })];
    await useQuizStore.getState().startQuiz(config, aiConfig);
    useQuizStore.getState().submitAnswer("gen-1", "A");

    await useQuizStore.getState().completeQuiz(93);

    const state = useQuizStore.getState();
    expect(state.currentSession?.timeSpent).toBe(93);
    expect(state.report?.summary.timeSpent).toBe(93);
    expect(mem.sessions.get(state.currentSession?.id ?? "")?.timeSpent).toBe(93);
  });

  it("does not invent a 0/100 score for a short-answer-only quiz", async () => {
    gen.questions = [
      makeQuestion({
        id: "sa-1",
        type: "short_answer",
        options: undefined,
        answer: { correct: "自由作答", explanation: "" },
      }),
    ];
    await useQuizStore.getState().startQuiz(config, aiConfig);
    await useQuizStore.getState().completeQuiz(30);

    const state = useQuizStore.getState();
    expect(state.report?.summary.gradableCount).toBe(0);
    expect(state.currentSession?.status).toBe("graded");
    // No score is fabricated — the session keeps whatever the DB had (null/undefined).
    expect(state.currentSession?.score).toBeUndefined();
    expect(mem.sessions.get(state.currentSession?.id ?? "")?.score).toBeUndefined();
  });

  it("opens a graded session as its report instead of a live quiz", async () => {
    gen.questions = [makeQuestion({ id: "gen-1" })];
    await useQuizStore.getState().startQuiz(config, aiConfig);
    useQuizStore.getState().submitAnswer("gen-1", "A");
    await useQuizStore.getState().completeQuiz(10);
    const sessionId = useQuizStore.getState().currentSession?.id ?? "";

    useQuizStore.getState().resetQuiz();
    await useQuizStore.getState().loadSession(sessionId);

    const state = useQuizStore.getState();
    expect(state.isTaking).toBe(false);
    expect(state.report).not.toBeNull();
    expect(state.currentSession?.status).toBe("graded");
  });
});

describe("elapsed time checkpoint", () => {
  it("persists the elapsed time and never moves the clock backwards", async () => {
    gen.questions = [makeQuestion({ id: "gen-1" }), makeQuestion({ id: "gen-2" })];
    await useQuizStore.getState().startQuiz(config, aiConfig);
    const sessionId = useQuizStore.getState().currentSession?.id ?? "";

    await useQuizStore.getState().saveElapsed(42);
    expect(useQuizStore.getState().currentSession?.timeSpent).toBe(42);
    expect(mem.sessions.get(sessionId)?.timeSpent).toBe(42);

    // A stale unmount flush (smaller value) must not rewind the clock.
    await useQuizStore.getState().saveElapsed(12);
    expect(useQuizStore.getState().currentSession?.timeSpent).toBe(42);
    expect(mem.sessions.get(sessionId)?.timeSpent).toBe(42);
  });

  it("lets a resumed session continue from the checkpoint", async () => {
    gen.questions = [makeQuestion({ id: "gen-1" })];
    await useQuizStore.getState().startQuiz(config, aiConfig);
    const sessionId = useQuizStore.getState().currentSession?.id ?? "";
    await useQuizStore.getState().saveElapsed(75);

    useQuizStore.getState().resetQuiz();
    await useQuizStore.getState().loadSession(sessionId);

    expect(useQuizStore.getState().currentSession?.timeSpent).toBe(75);
  });

  it("ignores checkpoints for a finished session", async () => {
    gen.questions = [makeQuestion({ id: "gen-1" })];
    await useQuizStore.getState().startQuiz(config, aiConfig);
    const sessionId = useQuizStore.getState().currentSession?.id ?? "";
    useQuizStore.getState().submitAnswer("gen-1", "A");
    await useQuizStore.getState().completeQuiz(30);

    await useQuizStore.getState().saveElapsed(999);
    expect(useQuizStore.getState().currentSession?.timeSpent).toBe(30);
    expect(mem.sessions.get(sessionId)?.timeSpent).toBe(30);
  });
});
