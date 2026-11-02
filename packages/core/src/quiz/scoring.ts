/**
 * Quiz answer semantics shared by the grader (quiz-store) and the answer UIs.
 *
 * The generator prompts the LLM to answer true/false questions with option keys
 * ("A" / "B"), while the players render "true" / "false". Keeping a single
 * normalisation helper here prevents scoring and highlighting from drifting
 * apart (a mismatch used to mark every true/false question as wrong).
 */
import type { QuizQuestion } from "../types";

export type TrueFalseSemantic = "true" | "false";

// NOTE: option keys ("A"/"B") are intentionally NOT listed here — they must be
// resolved through the question's option content, which keeps flipped
// True/False option orders working.
const TRUE_WORDS = new Set(["true", "t", "yes", "y", "正确", "对", "是"]);
const FALSE_WORDS = new Set(["false", "f", "no", "n", "错误", "错", "否"]);

/** Map a literal key or on-screen label to its true/false meaning. */
export function trueFalseSemantic(value: string | null | undefined): TrueFalseSemantic | null {
  if (value == null) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (TRUE_WORDS.has(normalized)) return "true";
  if (FALSE_WORDS.has(normalized)) return "false";
  if (/^[✓√]/.test(normalized)) return "true";
  if (/^[✗×]/.test(normalized)) return "false";
  return null;
}

/**
 * Resolve the true/false meaning of an answer for a question. Accepts either a
 * literal ("true"/"false") or an option key ("A"/"B").
 */
export function answerSemantic(question: QuizQuestion, value: string): TrueFalseSemantic | null {
  if (question.type !== "true_false") return null;
  const direct = trueFalseSemantic(value);
  if (direct) return direct;
  const option = question.options?.find((opt) => String(opt.key) === String(value));
  return option ? trueFalseSemantic(option.content) : null;
}

/**
 * Compare two answers for a question, tolerating the true/false key/label
 * mismatch described above. Handles multi-choice arrays as well.
 */
export function answersEqual(
  question: QuizQuestion,
  a: string | string[],
  b: string | string[],
): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    const left = Array.isArray(a) ? a.map(String) : [String(a)];
    const right = Array.isArray(b) ? b.map(String) : [String(b)];
    if (left.length !== right.length) return false;
    const leftValues = left.map((value) => answerSemantic(question, value) ?? value).sort();
    const rightValues = right.map((value) => answerSemantic(question, value) ?? value).sort();
    return leftValues.every((value, index) => value === rightValues[index]);
  }

  const left = answerSemantic(question, String(a));
  const right = answerSemantic(question, String(b));
  if (left && right) return left === right;
  return String(a) === String(b);
}
