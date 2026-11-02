import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  bankRows: [] as { stem: string }[],
  llmContent: "[]",
  llmCalls: 0,
}));

vi.mock("../db/db-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db/db-core")>();
  return {
    ...actual,
    getDB: async () => ({
      select: async (sql: string) => {
        if (sql.includes("question_bank")) return h.bankRows;
        return [];
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
    getBankQuestionsForQuiz: async () => [],
    getWrongQuestionsForQuiz: async () => [],
    insertQuestionBankEntries: async () => 0,
  };
});

vi.mock("../ai/llm-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ai/llm-provider")>();
  return {
    ...actual,
    createChatModel: async () => {
      h.llmCalls += 1;
      return { invoke: async () => ({ content: h.llmContent }) };
    },
  };
});

vi.mock("../rag/search", () => ({
  search: async () => [
    {
      chunk: {
        id: "chunk-1",
        bookId: "book-1",
        content: "根号 2 是无理数。",
        chapterIndex: 0,
        chapterTitle: "第一章",
      },
      score: 0.9,
      matchType: "hybrid",
    },
  ],
}));

const { generateQuizQuestions, tryParseAsQuestions, validateAndMapQuestion } = await import(
  "./quiz-generator"
);

const AI_CONFIG = {
  activeEndpointId: "ep-1",
  activeModel: "m",
  endpoints: [
    {
      id: "ep-1",
      name: "t",
      provider: "openai",
      baseUrl: "https://example.invalid/v1",
      apiKey: "k",
      models: ["m"],
    },
  ],
} as unknown as import("../types").AIConfig;

const CONFIG = {
  type: "custom" as const,
  bookIds: ["book-1"],
  questionCount: 1,
  difficulty: 2 as const,
  bankRatio: 0,
  wrongRatio: 0,
};

function question(stem: string) {
  return {
    type: "single_choice",
    stem,
    options: [
      { key: "A", content: "对" },
      { key: "B", content: "错" },
    ],
    answer: { correct: "A", explanation: "原文如此" },
    difficulty: 2,
    tags: ["数论"],
    contextIndex: 1,
  };
}

describe("quiz generation retry / attribution", () => {
  it("tops up with the freshly generated question when the model repeats the bank", async () => {
    h.llmContent = JSON.stringify([question("根号 2 是无理数吗？")]);
    h.llmCalls = 0;
    // The bank already contains this stem → dedup would normally drop it.
    h.bankRows = [{ stem: "根号 2 是无理数吗？" }];

    const questions = await generateQuizQuestions(CONFIG, AI_CONFIG);

    expect(h.llmCalls).toBe(1);
    expect(questions).toHaveLength(1);
    expect(questions[0]?.stem).toBe("根号 2 是无理数吗？");
    // The re-used question is attributed to the only book in scope.
    expect(questions[0]?.sourceBookId).toBe("book-1");
    expect(questions[0]?.sourceChapter).toBe("第一章");
  });

  it("does not top up when the model returns new questions", async () => {
    h.llmContent = JSON.stringify([question("全新的题目")]);
    h.bankRows = [{ stem: "别的旧题" }];

    const questions = await generateQuizQuestions(CONFIG, AI_CONFIG);
    expect(questions).toHaveLength(1);
    expect(questions[0]?.stem).toBe("全新的题目");
  });

  it("attributes questions by contextIndex", () => {
    const seen = new Set<string>();
    const mapped = validateAndMapQuestion(
      { ...question("来自第二本书"), contextIndex: 2 },
      "session-1",
      2,
      seen,
      new Set(),
      {
        contexts: [
          { bookId: "book-1", chapterTitle: "A", chapterIndex: 0, content: "a" },
          { bookId: "book-2", chapterTitle: "B", chapterIndex: 1, content: "b" },
        ],
      },
    );
    expect(mapped?.sourceBookId).toBe("book-2");
    expect(mapped?.sourceChapter).toBe("B");
  });

  it("parses prose + single object as the question, not its options array", () => {
    const parsed = tryParseAsQuestions(`这是唯一一题：\n${JSON.stringify(question("单题"))}`);
    expect(parsed).toHaveLength(1);
    expect(parsed?.[0]?.stem).toBe("单题");
    expect(parsed?.[0]?.type).toBe("single_choice");
  });

  it("unwraps a { questions: [...] } envelope", () => {
    const parsed = tryParseAsQuestions(
      `好的：\n${JSON.stringify({ questions: [question("A"), question("B")] })}`,
    );
    expect(parsed?.map((q) => q.stem)).toEqual(["A", "B"]);
  });
});
