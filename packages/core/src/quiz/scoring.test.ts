import { describe, expect, it } from "vitest";
import type { QuestionType, QuizQuestion } from "../types";
import { answerSemantic, answersEqual, trueFalseSemantic } from "./scoring";

function makeQuestion(overrides: Partial<QuizQuestion> & { type: QuestionType }): QuizQuestion {
  return {
    id: "q1",
    sessionId: "s1",
    stem: "stem",
    answer: { correct: "A", explanation: "" },
    difficulty: 1,
    createdAt: 0,
    ...overrides,
  };
}

describe("trueFalseSemantic", () => {
  it("maps literal labels and symbols", () => {
    expect(trueFalseSemantic("true")).toBe("true");
    expect(trueFalseSemantic("TRUE")).toBe("true");
    expect(trueFalseSemantic("正确")).toBe("true");
    expect(trueFalseSemantic("✓ 正确")).toBe("true");
    expect(trueFalseSemantic("false")).toBe("false");
    expect(trueFalseSemantic("错误")).toBe("false");
    expect(trueFalseSemantic("✗ 错误")).toBe("false");
    expect(trueFalseSemantic("maybe")).toBeNull();
  });
});

describe("answerSemantic", () => {
  const tf = makeQuestion({
    type: "true_false",
    options: [
      { key: "A", content: "True" },
      { key: "B", content: "False" },
    ],
  });

  it("resolves option keys via option content", () => {
    expect(answerSemantic(tf, "A")).toBe("true");
    expect(answerSemantic(tf, "B")).toBe("false");
    expect(answerSemantic(tf, "true")).toBe("true");
  });

  it("handles flipped option labels", () => {
    const flipped = makeQuestion({
      type: "true_false",
      options: [
        { key: "A", content: "False" },
        { key: "B", content: "True" },
      ],
    });
    expect(answerSemantic(flipped, "A")).toBe("false");
    expect(answerSemantic(flipped, "B")).toBe("true");
  });

  it("ignores non true/false questions", () => {
    const single = makeQuestion({
      type: "single_choice",
      options: [{ key: "A", content: "True" }],
    });
    expect(answerSemantic(single, "A")).toBeNull();
  });
});

describe("answersEqual", () => {
  const tf = makeQuestion({
    type: "true_false",
    options: [
      { key: "A", content: "True" },
      { key: "B", content: "False" },
    ],
  });

  it("grades the player's true/false keys against the generator's option keys", () => {
    // The generator answers with "A"; the player submits "true".
    expect(answersEqual(tf, "true", "A")).toBe(true);
    expect(answersEqual(tf, "false", "A")).toBe(false);
    expect(answersEqual(tf, "false", "B")).toBe(true);
  });

  it("compares multi-choice arrays order-insensitively", () => {
    const multi = makeQuestion({
      type: "multi_choice",
      answer: { correct: ["A", "C"], explanation: "" },
    });
    expect(answersEqual(multi, ["C", "A"], ["A", "C"])).toBe(true);
    expect(answersEqual(multi, ["A"], ["A", "C"])).toBe(false);
  });

  it("keeps single-choice comparison strict", () => {
    const single = makeQuestion({ type: "single_choice" });
    expect(answersEqual(single, "A", "A")).toBe(true);
    expect(answersEqual(single, "B", "A")).toBe(false);
  });
});
