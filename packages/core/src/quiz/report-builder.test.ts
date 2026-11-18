import { describe, expect, it, vi } from "vitest";
import type { QuizQuestion } from "../types";

const h = vi.hoisted(() => ({
  bankRows: [] as { stem: string; tags: string }[],
  questions: [] as QuizQuestion[],
}));

vi.mock("../db/db-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db/db-core")>();
  return {
    ...actual,
    getDB: async () => ({
      // Honour the `qq.stem IN (…)` filter the builder issues.
      select: async (_sql: string, params: unknown[] = []) => {
        if (params.length === 0) return h.bankRows;
        const stems = new Set(params.map(String));
        return h.bankRows.filter((row) => stems.has(row.stem));
      },
      execute: async () => {},
      close: async () => {},
    }),
  };
});

vi.mock("../db/quiz-queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db/quiz-queries")>();
  return {
    ...actual,
    getQuizSession: async () => ({
      id: "s1",
      type: "custom",
      config: {},
      status: "graded",
      timeSpent: 12,
      createdAt: 1,
    }),
    getQuizQuestions: async () => h.questions,
    getQuizSessions: async () => [
      {
        id: "s1",
        type: "custom",
        config: {},
        status: "graded",
        score: 50,
        timeSpent: 12,
        createdAt: 1,
      },
      {
        id: "s2",
        type: "custom",
        config: {},
        status: "in_progress",
        timeSpent: 0,
        createdAt: 2,
      },
    ],
  };
});

const { buildQuizReport, computeSummary } = await import("./report-builder");

function question(overrides: Partial<QuizQuestion>): QuizQuestion {
  return {
    id: "q1",
    sessionId: "s1",
    type: "single_choice",
    stem: "Q",
    options: [
      { key: "A", content: "a" },
      { key: "B", content: "b" },
    ],
    answer: { correct: "A", explanation: "" },
    difficulty: 2,
    createdAt: 0,
    ...overrides,
  };
}

describe("computeSummary", () => {
  it("counts unanswered questions separately without deflating the score", () => {
    const summary = computeSummary({ timeSpent: 5 }, [
      question({ id: "q1", userAnswer: "A", isCorrect: true }),
      question({ id: "q2", userAnswer: "B", isCorrect: false }),
      question({ id: "q3" }),
    ]);

    expect(summary.unansweredCount).toBe(1);
    expect(summary.gradableCount).toBe(3);
    expect(summary.correctCount).toBe(1);
    expect(summary.correctRate).toBeCloseTo(1 / 3, 5);
  });

  it("reports a short-answer-only quiz as nothing gradable", () => {
    const summary = computeSummary({ timeSpent: 5 }, [
      question({ id: "q1", type: "short_answer", options: undefined, userAnswer: "mine" }),
    ]);
    expect(summary.gradableCount).toBe(0);
    expect(summary.correctRate).toBe(0);
    expect(summary.pendingCount).toBe(1);
  });
});

describe("buildQuizReport", () => {
  it("does not flag a tag as weak when its questions were skipped", async () => {
    h.questions = [
      question({ id: "q1", isCorrect: true, userAnswer: "A" }),
      question({ id: "q2" }),
    ];
    h.bankRows = [
      { stem: "Q", tags: JSON.stringify(["训练"]) },
      { stem: "Q", tags: JSON.stringify(["训练"]) },
    ];

    const report = await buildQuizReport("s1");
    expect(report.weakAreas.find((area) => area.tag === "训练")?.errorRate).toBe(0);
  });

  it("flags a tag when its answered questions are wrong", async () => {
    h.questions = [
      question({ id: "q1", isCorrect: false, userAnswer: "B" }),
      question({ id: "q2", isCorrect: false, userAnswer: "B" }),
    ];
    h.bankRows = [
      { stem: "Q", tags: JSON.stringify(["训练"]) },
      { stem: "Q", tags: JSON.stringify(["训练"]) },
    ];

    const report = await buildQuizReport("s1");
    expect(report.weakAreas.find((area) => area.tag === "训练")?.errorRate).toBe(1);
  });

  it("matches tags for a bank question cloned into the session", async () => {
    h.questions = [
      question({ id: "clone-1", stem: "Original stem", isCorrect: false, userAnswer: "B" }),
    ];
    h.bankRows = [{ stem: "Original stem", tags: JSON.stringify(["复用"]) }];

    const report = await buildQuizReport("s1");
    const area = report.weakAreas.find((entry) => entry.tag === "复用");
    expect(area?.errorRate).toBe(1);
    expect(area?.questionCount).toBe(1);
  });

  it("keeps unfinished sessions out of the history trend", async () => {
    h.questions = [question({ id: "q1", isCorrect: true, userAnswer: "A" })];
    h.bankRows = [];

    const report = await buildQuizReport("s1");
    expect(report.history.map((entry) => entry.sessionId)).toEqual(["s1"]);
  });

  it("keeps short-answer-only sessions out of the history trend", async () => {
    h.questions = [
      question({ id: "q1", type: "short_answer", options: undefined, userAnswer: "mine" }),
    ];
    h.bankRows = [];

    const report = await buildQuizReport("s1");
    expect(report.history).toEqual([]);
  });
});
