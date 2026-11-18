import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QuizQuestion } from "../../types/quiz";

const mockExecute = vi.fn();
const mockSelect = vi.fn();
const mockDb = { execute: mockExecute, select: mockSelect, close: vi.fn() };

const coreMocks = vi.hoisted(() => ({ getDB: vi.fn() }));
vi.mock("../db-core", () => coreMocks);

const { updateQuestionBankStats } = await import("../quiz-queries");

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

describe("updateQuestionBankStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    coreMocks.getDB.mockResolvedValue(mockDb);
  });

  it("does not touch the bank for unanswered questions", async () => {
    await updateQuestionBankStats([question({ id: "q1", stem: "unanswered" })]);

    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("counts usage but not accuracy for answered short answers", async () => {
    mockSelect.mockResolvedValue([{ id: "bank-1", usage_count: 2, correct_rate: null }]);

    await updateQuestionBankStats([
      question({ id: "q1", type: "short_answer", options: undefined, userAnswer: "mine" }),
    ]);

    expect(mockExecute).toHaveBeenCalledWith(
      "UPDATE question_bank SET usage_count = ? WHERE id = ?",
      [3, "bank-1"],
    );
  });

  it("updates usage and the rolling correct rate for graded answers", async () => {
    mockSelect.mockResolvedValue([{ id: "bank-1", usage_count: 2, correct_rate: 0.5 }]);

    await updateQuestionBankStats([question({ id: "q1", userAnswer: "A", isCorrect: true })]);

    expect(mockExecute).toHaveBeenCalledWith(
      "UPDATE question_bank SET usage_count = ?, correct_rate = ? WHERE id = ?",
      [3, (0.5 * 2 + 1) / 3, "bank-1"],
    );
  });

  it("sets the initial rate from the first graded attempt", async () => {
    mockSelect.mockResolvedValue([{ id: "bank-1", usage_count: 0, correct_rate: null }]);

    await updateQuestionBankStats([question({ id: "q1", userAnswer: "B", isCorrect: false })]);

    expect(mockExecute).toHaveBeenCalledWith(
      "UPDATE question_bank SET usage_count = ?, correct_rate = ? WHERE id = ?",
      [1, 0, "bank-1"],
    );
  });
});