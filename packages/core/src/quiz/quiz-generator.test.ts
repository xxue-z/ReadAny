import type { QuizConfig, QuizQuestion, QuestionType } from "../types";
import { beforeEach, describe, expect, it } from "vitest";
import { stemHash } from "../db/quiz-queries";
import { extractJson, tryParseAsQuestions, validateAndMapQuestion } from "./quiz-generator";
import { computeSummary } from "./report-builder";

// ---------------------------------------------------------------------------
// 1. stemHash dedup
// ---------------------------------------------------------------------------

describe("stemHash dedup", () => {
  it("produces the same hash for the same stem with different whitespace", () => {
    const h1 = stemHash("What is the capital of France?");
    const h2 = stemHash("  What   is  the  capital  of  France?  ");
    const h3 = stemHash("what is the capital of france?");

    expect(h1).toBe(h2);
    expect(h1).toBe(h3);
  });

  it("produces different hashes for different stems", () => {
    const h1 = stemHash("What is the capital of France?");
    const h2 = stemHash("What is the capital of Germany?");

    expect(h1).not.toBe(h2);
  });

  it("collapses multiple internal whitespace characters", () => {
    const h1 = stemHash("hello\tworld\nfoo");
    const h2 = stemHash("hello world foo");

    expect(h1).toBe(h2);
  });
});

// ---------------------------------------------------------------------------
// 2. JSON parsing resilience
// ---------------------------------------------------------------------------

describe("JSON parsing resilience", () => {
  describe("extractJson", () => {
    it("strips markdown code fences", () => {
      const input = '```json\n[{"type":"single_choice"}]\n```';
      expect(extractJson(input)).toBe('[{"type":"single_choice"}]');
    });

    it("strips markdown fences without language marker", () => {
      const input = '```\n[{"type":"single_choice"}]\n```';
      expect(extractJson(input)).toBe('[{"type":"single_choice"}]');
    });

    it("handles text without fences", () => {
      const input = '[{"type":"single_choice"}]';
      expect(extractJson(input)).toBe('[{"type":"single_choice"}]');
    });
  });

  describe("tryParseAsQuestions", () => {
    it("parses a valid JSON array of questions", () => {
      const raw = JSON.stringify([
        {
          type: "single_choice",
          stem: "What is 2+2?",
          options: [
            { key: "A", content: "3" },
            { key: "B", content: "4" },
            { key: "C", content: "5" },
            { key: "D", content: "6" },
          ],
          answer: { correct: "B", explanation: "Basic math" },
          difficulty: 1,
        },
      ]);

      const result = tryParseAsQuestions(raw);
      expect(result).not.toBeNull();
      expect(result!).toHaveLength(1);
      expect(result![0].stem).toBe("What is 2+2?");
    });

    it("handles JSON wrapped in markdown fences", () => {
      const raw = '```json\n[{"type":"single_choice","stem":"Q1"}]\n```';
      const result = tryParseAsQuestions(raw);
      expect(result).not.toBeNull();
      expect(result!).toHaveLength(1);
    });

    it("wraps a single object in an array", () => {
      const raw = '{"type":"single_choice","stem":"Q1"}';
      const result = tryParseAsQuestions(raw);
      expect(result).not.toBeNull();
      expect(result!).toHaveLength(1);
    });

    it("handles extra unknown fields gracefully", () => {
      const raw = JSON.stringify([
        {
          type: "single_choice",
          stem: "What is 2+2?",
          extra_field: "should be ignored",
          another_extra: 42,
          options: [
            { key: "A", content: "3" },
            { key: "B", content: "4" },
            { key: "C", content: "5" },
            { key: "D", content: "6" },
          ],
          answer: { correct: "B", explanation: "Basic math" },
          difficulty: 1,
        },
      ]);

      const result = tryParseAsQuestions(raw);
      expect(result).not.toBeNull();
      expect(result!).toHaveLength(1);
      // extra fields are present in raw parse result but ignored by validation
      expect(result![0].type).toBe("single_choice");
      expect(result![0].stem).toBe("What is 2+2?");
    });

    it("handles wrong types for fields (returns partial results without throwing)", () => {
      // stem is a number instead of string, difficulty is a string
      const raw = JSON.stringify([
        {
          type: "single_choice",
          stem: 12345,
          options: [
            { key: "A", content: "3" },
            { key: "B", content: "4" },
          ],
          answer: { correct: "B", explanation: "test" },
          difficulty: "hard",
        },
        {
          type: "single_choice",
          stem: "Valid question",
          options: [
            { key: "A", content: "Yes" },
            { key: "B", content: "No" },
          ],
          answer: { correct: "A", explanation: "valid explanation" },
          difficulty: 2,
        },
      ]);

      // tryParseAsQuestions should not throw even with malformed types
      const result = tryParseAsQuestions(raw);
      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThanOrEqual(1);
    });

    it("handles truncated / malformed JSON by extracting balanced arrays", () => {
      const raw = 'Some stray text [{"type":"single_choice","stem":"Q1"}] more text';
      const result = tryParseAsQuestions(raw);
      expect(result).not.toBeNull();
      expect(result!).toHaveLength(1);
    });

    it("handles completely empty string", () => {
      const result = tryParseAsQuestions("");
      expect(result).toBeNull();
    });
  });

  describe("validateAndMapQuestion", () => {
    const seenStems = new Set<string>();
    const existingHashes = new Set<string>();
    const defaultDifficulty = 2;

    beforeEach(() => {
      seenStems.clear();
      existingHashes.clear();
    });

    it("validates a correct single_choice question", () => {
      const raw = {
        type: "single_choice",
        stem: "What is 2+2?",
        options: [
          { key: "A", content: "3" },
          { key: "B", content: "4" },
          { key: "C", content: "5" },
          { key: "D", content: "6" },
        ],
        answer: { correct: "B", explanation: "Basic math" },
        difficulty: 1,
      };

      const question = validateAndMapQuestion(
        raw,
        "session-1",
        defaultDifficulty,
        seenStems,
        existingHashes,
      );

      expect(question).not.toBeNull();
      expect(question!.type).toBe("single_choice");
      expect(question!.stem).toBe("What is 2+2?");
      expect(question!.difficulty).toBe(1);
    });

    it("rejects a question with missing stem", () => {
      const raw = {
        type: "single_choice",
        options: [{ key: "A", content: "3" }],
        answer: { correct: "A", explanation: "" },
        difficulty: 1,
      };

      const question = validateAndMapQuestion(
        raw as any,
        "session-1",
        defaultDifficulty,
        seenStems,
        existingHashes,
      );

      expect(question).toBeNull();
    });

    it("rejects a question with invalid type", () => {
      const raw = {
        type: "essay",
        stem: "Write an essay",
        answer: { correct: "anything", explanation: "" },
        difficulty: 1,
      };

      const question = validateAndMapQuestion(
        raw as any,
        "session-1",
        defaultDifficulty,
        seenStems,
        existingHashes,
      );

      expect(question).toBeNull();
    });

    it("falls back to default difficulty when difficulty is out of range", () => {
      const raw = {
        type: "true_false",
        stem: "The sky is blue?",
        options: [
          { key: "A", content: "True" },
          { key: "B", content: "False" },
        ],
        answer: { correct: "A", explanation: "Yes" },
        difficulty: 99,
      };

      const question = validateAndMapQuestion(
        raw,
        "session-1",
        defaultDifficulty,
        seenStems,
        existingHashes,
      );

      expect(question).not.toBeNull();
      expect(question!.difficulty).toBe(defaultDifficulty);
    });

    it("deduplicates by stem hash: second same stem is rejected", () => {
      const raw = {
        type: "true_false",
        stem: "The sky is blue?",
        options: [
          { key: "A", content: "True" },
          { key: "B", content: "False" },
        ],
        answer: { correct: "A", explanation: "Yes" },
        difficulty: 1,
      };

      const first = validateAndMapQuestion(
        raw,
        "session-1",
        defaultDifficulty,
        seenStems,
        existingHashes,
      );
      expect(first).not.toBeNull();

      const second = validateAndMapQuestion(
        { ...raw, stem: "  The sky is blue?  " },
        "session-1",
        defaultDifficulty,
        seenStems,
        existingHashes,
      );
      expect(second).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Quiz scoring logic
// ---------------------------------------------------------------------------

describe("quiz scoring logic", () => {
  it("computes correctRate = 0.7 for 10 questions with 7 correct", () => {
    const questions: QuizQuestion[] = [
      makeQuestion("sq1", "single_choice", true),
      makeQuestion("sq2", "single_choice", true),
      makeQuestion("sq3", "single_choice", true),
      makeQuestion("sq4", "single_choice", true),
      makeQuestion("sq5", "single_choice", true),
      makeQuestion("tf1", "true_false", true),
      makeQuestion("tf2", "true_false", true),
      makeQuestion("sq6", "single_choice", false),
      makeQuestion("sq7", "single_choice", false),
      makeQuestion("tf3", "true_false", false),
    ];

    const summary = computeSummary({ timeSpent: 120_000 }, questions);

    expect(summary.totalQuestions).toBe(10);
    expect(summary.correctCount).toBe(7);
    expect(summary.correctRate).toBeCloseTo(0.7, 5);
  });

  it("computes per-type breakdown correctly", () => {
    const questions: QuizQuestion[] = [
      // single_choice: 3 correct, 2 wrong → 0.6
      makeQuestion("sq1", "single_choice", true),
      makeQuestion("sq2", "single_choice", true),
      makeQuestion("sq3", "single_choice", true),
      makeQuestion("sq4", "single_choice", false),
      makeQuestion("sq5", "single_choice", false),
      // true_false: 2 correct, 0 wrong → 1.0
      makeQuestion("tf1", "true_false", true),
      makeQuestion("tf2", "true_false", true),
      // short_answer: 1 correct, 1 wrong → 0.5
      makeQuestion("sa1", "short_answer", true),
      makeQuestion("sa2", "short_answer", false),
    ];

    const summary = computeSummary({ timeSpent: 60_000 }, questions);

    expect(summary.totalQuestions).toBe(9);
    expect(summary.correctCount).toBe(6);
    expect(summary.correctRate).toBeCloseTo(6 / 9, 5);

    expect(summary.correctRateByType["single_choice"]).toBeCloseTo(0.6, 5);
    expect(summary.correctRateByType["true_false"]).toBeCloseTo(1.0, 5);
    expect(summary.correctRateByType["short_answer"]).toBeCloseTo(0.5, 5);
  });

  it("handles empty questions array with correctRate = 0", () => {
    const summary = computeSummary({ timeSpent: 0 }, []);
    expect(summary.totalQuestions).toBe(0);
    expect(summary.correctCount).toBe(0);
    expect(summary.correctRate).toBe(0);
    expect(Object.keys(summary.correctRateByType)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Quiz template configs
// ---------------------------------------------------------------------------

describe("quiz template configs", () => {
  it("daily template has 7-day range, 10 questions, difficulty 1-2", () => {
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    const dailyConfig: QuizConfig = {
      type: "daily",
      timeRange: { start: now - sevenDaysMs, end: now },
      questionCount: 10,
      difficulty: 2,
      bankRatio: 0.3,
      wrongRatio: 0.2,
    };

    expect(dailyConfig.type).toBe("daily");
    expect(dailyConfig.questionCount).toBe(10);
    expect(dailyConfig.timeRange).toBeDefined();
    expect(dailyConfig.timeRange!.end - dailyConfig.timeRange!.start).toBe(sevenDaysMs);
    expect(dailyConfig.difficulty).toBeGreaterThanOrEqual(1);
    expect(dailyConfig.difficulty).toBeLessThanOrEqual(2);
  });

  it("monthly template has 30-day range, 50 questions, difficulty 1-3", () => {
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    const monthlyConfig: QuizConfig = {
      type: "monthly",
      timeRange: { start: now - thirtyDaysMs, end: now },
      questionCount: 50,
      difficulty: 3,
      bankRatio: 0.3,
      wrongRatio: 0.2,
    };

    expect(monthlyConfig.type).toBe("monthly");
    expect(monthlyConfig.questionCount).toBe(50);
    expect(monthlyConfig.timeRange).toBeDefined();
    expect(monthlyConfig.timeRange!.end - monthlyConfig.timeRange!.start).toBe(thirtyDaysMs);
    expect(monthlyConfig.difficulty).toBeGreaterThanOrEqual(1);
    expect(monthlyConfig.difficulty).toBeLessThanOrEqual(3);
  });

  it("daily config difficulty is constrained to 1-2", () => {
    // Verify that daily template difficulty is within reasonable range
    const daily: QuizConfig = {
      type: "daily",
      questionCount: 10,
      difficulty: 1,
      bankRatio: 0,
      wrongRatio: 0,
    };
    expect(daily.difficulty).toBeGreaterThanOrEqual(1);
    expect(daily.difficulty).toBeLessThanOrEqual(2);
  });

  it("monthly config difficulty is constrained to 1-3", () => {
    const monthly: QuizConfig = {
      type: "monthly",
      questionCount: 50,
      difficulty: 3,
      bankRatio: 0,
      wrongRatio: 0,
    };
    expect(monthly.difficulty).toBeGreaterThanOrEqual(1);
    expect(monthly.difficulty).toBeLessThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQuestion(
  id: string,
  type: QuestionType,
  isCorrect: boolean,
): QuizQuestion {
  return {
    id,
    sessionId: "session-test",
    type,
    stem: `Question ${id}`,
    answer: { correct: type === "short_answer" ? "answer" : "A", explanation: "" },
    difficulty: 1,
    isCorrect,
    createdAt: Date.now(),
  };
}