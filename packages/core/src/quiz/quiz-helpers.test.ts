import { describe, expect, it } from "vitest";
import {
  formatQuizAnswer,
  normalizeChoiceAnswer,
  normalizeQuizQuestionCount,
} from "./quiz-helpers";

const options = [
  { key: "A", content: "Alpha" },
  { key: "B", content: "Beta" },
  { key: "C", content: "Gamma" },
];

describe("normalizeQuizQuestionCount", () => {
  it("clamps the supported range", () => {
    expect(normalizeQuizQuestionCount("999")).toBe(50);
    expect(normalizeQuizQuestionCount("1")).toBe(3);
    expect(normalizeQuizQuestionCount("12")).toBe(12);
  });

  it("falls back for unusable values", () => {
    expect(normalizeQuizQuestionCount("")).toBe(10);
    expect(normalizeQuizQuestionCount("abc", 7)).toBe(7);
  });
});

describe("normalizeChoiceAnswer", () => {
  it("accepts a single existing key for single choice", () => {
    expect(normalizeChoiceAnswer("single_choice", "B", options)).toBe("B");
    expect(normalizeChoiceAnswer("single_choice", ["B"], options)).toBe("B");
    expect(normalizeChoiceAnswer("single_choice", ["A", "B"], options)).toBeNull();
    expect(normalizeChoiceAnswer("single_choice", "Z", options)).toBeNull();
  });

  it("splits and de-duplicates multi-choice strings", () => {
    expect(normalizeChoiceAnswer("multi_choice", "A, C", options)).toEqual(["A", "C"]);
    expect(normalizeChoiceAnswer("multi_choice", ["A", "A", "B"], options)).toEqual(["A", "B"]);
    expect(normalizeChoiceAnswer("multi_choice", "A, Z", options)).toBeNull();
  });

  it("normalises true/false labels and option keys", () => {
    const tfOptions = [
      { key: "A", content: "True" },
      { key: "B", content: "False" },
    ];
    expect(normalizeChoiceAnswer("true_false", "A", tfOptions)).toBe("true");
    expect(normalizeChoiceAnswer("true_false", "false", tfOptions)).toBe("false");
    expect(normalizeChoiceAnswer("true_false", "maybe", tfOptions)).toBeNull();
  });

  it("requires a non-empty string for short answers", () => {
    expect(normalizeChoiceAnswer("short_answer", "  answer ", undefined)).toBe("answer");
    expect(normalizeChoiceAnswer("short_answer", ["answer"], undefined)).toBeNull();
  });
});

describe("formatQuizAnswer", () => {
  it("localises true/false answers", () => {
    expect(
      formatQuizAnswer(
        {
          type: "true_false",
          options: [
            { key: "A", content: "True" },
            { key: "B", content: "False" },
          ],
          answer: { correct: "A", explanation: "" },
        },
        { trueLabel: "正确", falseLabel: "错误" },
      ),
    ).toBe("正确");
  });
});
