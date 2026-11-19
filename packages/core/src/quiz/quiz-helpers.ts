import type { QuestionType, QuizQuestion } from "../types";
import { type TrueFalseSemantic, trueFalseSemantic } from "./scoring";

export type ChoiceOption = { key: string; content: string };

export type QuizGenerationErrorCode = "NO_AI_CONFIG" | "NO_QUESTIONS" | "GENERATION_FAILED";

/** Typed quiz generation failure so the UI can render a localized message. */
export class QuizGenerationError extends Error {
  readonly code: QuizGenerationErrorCode;

  constructor(code: QuizGenerationErrorCode, message?: string) {
    super(message ?? code);
    this.name = "QuizGenerationError";
    this.code = code;
  }
}

/**
 * An answer could not be persisted before the quiz report was built. The
 * session stays in progress so the user can retry instead of receiving a score
 * computed from stale database state.
 */
export class QuizAnswerPersistenceError extends Error {
  readonly questionId: string;
  readonly cause?: unknown;

  constructor(questionId: string, cause?: unknown) {
    super(`Failed to persist answer for question ${questionId}`);
    this.name = "QuizAnswerPersistenceError";
    this.questionId = questionId;
    this.cause = cause;
  }
}

export const MIN_QUIZ_QUESTION_COUNT = 3;
export const MAX_QUIZ_QUESTION_COUNT = 50;
export const DEFAULT_QUIZ_QUESTION_COUNT = 10;

/** Normalise a numeric/string form value into the supported quiz-size range. */
export function normalizeQuizQuestionCount(
  value: unknown,
  fallback = DEFAULT_QUIZ_QUESTION_COUNT,
): number {
  if (typeof value === "string" && value.trim() === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_QUIZ_QUESTION_COUNT, Math.max(MIN_QUIZ_QUESTION_COUNT, Math.floor(parsed)));
}

function optionKeySet(options: ChoiceOption[] | undefined): Set<string> {
  return new Set((options ?? []).map((option) => String(option.key)));
}

function normaliseChoiceKeyArray(values: unknown[], optionKeys: Set<string>): string[] | null {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") return null;
    for (const piece of value.split(/[,，;；]/)) {
      const key = piece.trim();
      if (!key) continue;
      if (!optionKeys.has(key)) return null;
      if (seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
  }
  return keys.length > 0 ? keys : null;
}

/**
 * Normalise an LLM-provided answer to the representation expected by the
 * scorer and the player. Returns null when the answer cannot be mapped to the
 * supplied options, so callers can drop the malformed question.
 */
export function normalizeChoiceAnswer(
  type: QuestionType,
  correct: unknown,
  options: ChoiceOption[] | undefined,
): string | string[] | null {
  if (type === "short_answer") {
    return typeof correct === "string" && correct.trim() ? correct.trim() : null;
  }

  const rawValues = Array.isArray(correct) ? correct : [correct];
  const optionKeys = optionKeySet(options);

  if (type === "true_false") {
    if (rawValues.length !== 1 || typeof rawValues[0] !== "string") return null;
    const value = rawValues[0].trim();
    if (!value) return null;
    const direct = trueFalseSemantic(value);
    if (direct) return direct;
    if (!optionKeys.has(value)) return null;
    const option = options?.find((entry) => String(entry.key) === value);
    return option ? trueFalseSemantic(option.content) : null;
  }

  if (type === "single_choice") {
    const values = normaliseChoiceKeyArray(rawValues, optionKeys);
    return values?.length === 1 ? (values[0] as string) : null;
  }

  if (type === "multi_choice") {
    return normaliseChoiceKeyArray(rawValues, optionKeys);
  }

  return null;
}

export interface QuizAnswerLabels {
  trueLabel: string;
  falseLabel: string;
}

/** Human-readable answer label for report/review surfaces. */
export function formatQuizAnswer(
  question: Pick<QuizQuestion, "type" | "options" | "answer">,
  labels: QuizAnswerLabels,
): string {
  const correct = question.answer.correct;
  if (question.type === "true_false") {
    const value = Array.isArray(correct) ? correct[0] : correct;
    const direct = typeof value === "string" ? trueFalseSemantic(value) : null;
    const option =
      direct || typeof value !== "string"
        ? undefined
        : question.options?.find((entry) => String(entry.key) === value);
    const semantic: TrueFalseSemantic | null =
      direct ?? (option ? trueFalseSemantic(option.content) : null);
    if (semantic) return semantic === "true" ? labels.trueLabel : labels.falseLabel;
  }
  return Array.isArray(correct) ? correct.join(", ") : String(correct);
}
