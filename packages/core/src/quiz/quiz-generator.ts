import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createChatModel } from "../ai/llm-provider";
import { getBankQuestionsForQuiz, getWrongQuestionsForQuiz, stemHash } from "../db/quiz-queries";
import { getAllReadingSessions, getReadingSessionsByDateRange } from "../db/session-queries";
import { search } from "../rag/search";
import type { AIConfig, QuestionType, QuizConfig, QuizQuestion, SearchResult } from "../types";
import { generateId } from "../utils/generate-id";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_SEARCH_TOP_K = 5;
const DEFAULT_SEARCH_THRESHOLD = 0.3;
const ALL_QUESTION_TYPES: QuestionType[] = [
  "single_choice",
  "multi_choice",
  "true_false",
  "short_answer",
];

// ---------------------------------------------------------------------------
// LLM response type (partial / best-effort)
// ---------------------------------------------------------------------------

interface LLMQuestionResponse {
  type?: string;
  stem?: string;
  options?: { key: string; content: string }[];
  answer?: { correct?: string | string[]; explanation?: string };
  difficulty?: number;
  tags?: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a set of existing stem hashes to dedup against. */
async function getExistingStemHashes(): Promise<Set<string>> {
  try {
    // We query all question_bank entries joined with quiz_questions to collect
    // every stem that already lives in the bank.
    const { getDB } = await import("../db/db-core");
    const database = await getDB();
    const rows = await database.select<{ stem: string }>(
      `SELECT qq.stem FROM question_bank qb
       JOIN quiz_questions qq ON qb.question_id = qq.id`,
    );
    const hashes = new Set<string>();
    for (const row of rows) {
      hashes.add(stemHash(row.stem));
    }
    return hashes;
  } catch {
    // If the DB query fails (e.g. table doesn't exist yet), return empty set
    // so generation can proceed.
    return new Set();
  }
}

/**
 * Determine which book IDs to generate questions for.
 * Prefers config.bookIds; falls back to books found in reading_sessions
 * within config.timeRange.
 */
async function resolveBookIds(config: QuizConfig): Promise<string[]> {
  if (config.bookIds && config.bookIds.length > 0) {
    return config.bookIds;
  }

  if (config.timeRange) {
    const sessions = await getReadingSessionsByDateRange(
      new Date(config.timeRange.start),
      new Date(config.timeRange.end),
    );
    const bookIds = [...new Set(sessions.map((s) => s.bookId))];
    return bookIds;
  }

  // Last resort: all books ever read
  const sessions = await getAllReadingSessions();
  return [...new Set(sessions.map((s) => s.bookId))];
}

/**
 * Fetch relevant text chunks for a single book by running multiple search
 * queries and merging results.
 */
async function fetchChunksForBook(bookId: string, topK: number): Promise<SearchResult[]> {
  // Use a few generic query patterns to surface diverse content
  const queries = ["key concepts", "important ideas", "main argument", "summary", "definition"];

  const allResults: SearchResult[] = [];
  const seenChunkIds = new Set<string>();

  for (const query of queries) {
    if (allResults.length >= topK * 2) break;
    try {
      const results = await search({
        query,
        bookId,
        mode: "hybrid",
        topK,
        threshold: DEFAULT_SEARCH_THRESHOLD,
      });
      for (const r of results) {
        if (!seenChunkIds.has(r.chunk.id)) {
          seenChunkIds.add(r.chunk.id);
          allResults.push(r);
        }
      }
    } catch {
      // Hybrid search may fail (e.g. no vector index); skip this query.
    }
  }

  // Sort by score descending, take topK * 2 to give LLM enough material
  return allResults.sort((a, b) => b.score - a.score).slice(0, topK * 2);
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

interface ChunkContext {
  bookId: string;
  chapterTitle: string;
  chapterIndex: number;
  content: string;
}

function buildChunkContexts(results: Map<string, SearchResult[]>): ChunkContext[] {
  const contexts: ChunkContext[] = [];
  for (const [bookId, bookResults] of results) {
    for (const r of bookResults) {
      contexts.push({
        bookId,
        chapterTitle: r.chunk.chapterTitle || `Chapter ${r.chunk.chapterIndex + 1}`,
        chapterIndex: r.chunk.chapterIndex,
        content: r.chunk.content,
      });
    }
  }
  return contexts;
}

function pickTypes(config: QuizConfig): QuestionType[] {
  if (config.typeDistribution) {
    const types = Object.keys(config.typeDistribution) as QuestionType[];
    if (types.length > 0) return types;
  }
  // Default: single_choice and true_false (most reliable for LLM generation)
  return ["single_choice", "true_false"];
}

interface TypePlanEntry {
  type: QuestionType;
  count: number;
}

function clampRatio(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Turn `config.typeDistribution` into concrete per-type counts that add up to
 * `total`. A partial distribution is scaled proportionally so the requested
 * mix is honoured even when the numbers don't add up.
 */
export function buildTypePlan(config: QuizConfig, total: number): TypePlanEntry[] | null {
  const distribution = config.typeDistribution;
  if (!distribution || total <= 0) return null;

  const entries = (Object.entries(distribution) as [QuestionType, number | undefined][]).filter(
    (entry): entry is [QuestionType, number] =>
      ALL_QUESTION_TYPES.includes(entry[0]) && typeof entry[1] === "number" && entry[1] > 0,
  );
  if (entries.length === 0) return null;

  const requestedTotal = entries.reduce((sum, [, count]) => sum + count, 0);
  const raw = entries.map(([type, count]) => ({
    type,
    exact: (count / requestedTotal) * total,
  }));

  const plan: TypePlanEntry[] = raw.map(({ type, exact }) => ({
    type,
    count: Math.max(0, Math.floor(exact)),
  }));

  let assigned = plan.reduce((sum, entry) => sum + entry.count, 0);
  // Hand out the rounded-away remainder to the largest fractional parts.
  const byRemainder = [...raw]
    .map((entry, index) => ({ index, fraction: entry.exact - Math.floor(entry.exact) }))
    .sort((a, b) => b.fraction - a.fraction);
  let cursor = 0;
  while (assigned < total && byRemainder.length > 0) {
    const remainder = byRemainder[cursor % byRemainder.length];
    if (!remainder) break;
    const target = plan[remainder.index];
    if (target) {
      target.count += 1;
      assigned += 1;
    }
    cursor += 1;
  }

  return plan.filter((entry) => entry.count > 0);
}

/** Keep at most `plan[type].count` questions per type (best effort). */
export function enforceTypePlan(
  questions: QuizQuestion[],
  plan: TypePlanEntry[] | null,
  limit: number,
): QuizQuestion[] {
  if (!plan || plan.length === 0) return questions.slice(0, limit);

  const remaining = new Map(plan.map((entry) => [entry.type, entry.count]));
  const kept: QuizQuestion[] = [];
  const leftovers: QuizQuestion[] = [];

  for (const question of questions) {
    const allowance = remaining.get(question.type) ?? 0;
    if (allowance > 0) {
      remaining.set(question.type, allowance - 1);
      kept.push(question);
    } else {
      leftovers.push(question);
    }
  }

  // If the model ignored part of the plan, fill the gaps with leftovers.
  for (const question of leftovers) {
    if (kept.length >= limit) break;
    kept.push(question);
  }
  return kept.slice(0, limit);
}

function buildGenerationPrompt(
  config: QuizConfig,
  contexts: ChunkContext[],
  remainingCount: number,
  plan: TypePlanEntry[] | null,
): string {
  const types = plan && plan.length > 0 ? plan.map((entry) => entry.type) : pickTypes(config);
  const typeList = types.join(", ");
  const difficulty = config.difficulty;

  const planLines =
    plan && plan.length > 0
      ? `\n- Exact type mix: ${plan.map((entry) => `${entry.type} x ${entry.count}`).join(", ")}`
      : "";

  const contextBlocks = contexts.map(
    (ctx, i) =>
      `--- Context ${i + 1} (Book: ${ctx.bookId}, ${ctx.chapterTitle}) ---\n${ctx.content}`,
  );

  return `You are an expert quiz question generator. Create ${remainingCount} quiz questions based on the provided reading material.

## Requirements
- Total questions: ${remainingCount}
- Question types: ${typeList}${planLines}
- Difficulty: ${difficulty} (1 = easy recall, 2 = comprehension, 3 = analysis/application)
- Each question MUST be grounded in the provided context
- For single_choice: exactly 4 options, one correct
- For multi_choice: 4-6 options, at least one correct (array)
- For true_false: options [{key: "A", content: "True"}, {key: "B", content: "False"}], answer.correct is "A" or "B"
- For short_answer: no options, answer.correct is the model answer string
- "tags": 1-3 short knowledge-point tags (same language as the stem)

## Source Material
${contextBlocks.join("\n\n")}

## Output Format
Return ONLY a valid JSON array. Each element must have exactly these fields:
{
  "type": "${types[0]}" | ...,
  "stem": "question text",
  "options": [{"key": "A", "content": "..."}, ...],  // omit for short_answer
  "answer": {"correct": "A" | ["A","B"] | "model answer", "explanation": "why this is correct"},
  "difficulty": ${difficulty},
  "tags": ["knowledge point"]
}

Output ONLY the JSON array — no markdown fences, no extra text.`;
}

function buildVariantPrompt(baseQuestion: QuizQuestion): string {
  return `You are an expert quiz question editor. Rephrase the following question so it tests the same knowledge but uses different wording and different distractors. Keep the same question type and difficulty, but change the stem, the wrong options, and the answer explanation.

## Original Question
${JSON.stringify(
  {
    type: baseQuestion.type,
    stem: baseQuestion.stem,
    options: baseQuestion.options,
    answer: baseQuestion.answer,
    difficulty: baseQuestion.difficulty,
  },
  null,
  2,
)}

## Output Format
Return ONLY a single valid JSON object with the same structure as above. No additional text.`;
}

// ---------------------------------------------------------------------------
// JSON parsing (resilient)
// ---------------------------------------------------------------------------

/**
 * Try to extract a JSON array or object from LLM output.
 * Handles markdown fences, stray text, and truncated output.
 */
export function extractJson(text: string): string {
  // Strip markdown code fences
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    const endFence = cleaned.indexOf("\n");
    const lang = cleaned.slice(3, endFence).trim();
    cleaned = cleaned.slice(endFence + 1);
    const closingIdx = cleaned.lastIndexOf("```");
    if (closingIdx !== -1) {
      cleaned = cleaned.slice(0, closingIdx);
    }
    // If the language marker wasn't json, re-check for nested fences
    if (lang && lang !== "json") {
      return extractJson(cleaned);
    }
  }

  return cleaned.trim();
}

export function tryParseAsQuestions(raw: string): LLMQuestionResponse[] | null {
  const json = extractJson(raw);
  if (!json) return null;

  // Try direct parse
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) return parsed;
    // Single object → wrap in array
    if (parsed && typeof parsed === "object") return [parsed];
    return null;
  } catch {
    // fall through to regex extraction
  }

  // Try to find a JSON array with balanced brackets
  const arrayMatch = findBalancedArray(json);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // continue
    }
  }

  // Last resort: find individual JSON objects
  const objects = findJsonObjects(json);
  if (objects.length > 0) return objects;

  return null;
}

/** Find a balanced JSON array in a string. */
function findBalancedArray(text: string): string | null {
  const start = text.indexOf("[");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "[" || ch === "{") depth++;
    else if (ch === "]" || ch === "}") depth--;

    if (depth === 0) {
      return text.slice(start, i + 1);
    }
  }

  return null;
}

/** Find individual JSON objects in a string (best-effort). */
function findJsonObjects(text: string): LLMQuestionResponse[] {
  const objects: LLMQuestionResponse[] = [];
  let i = 0;

  while (i < text.length) {
    const braceOpen = text.indexOf("{", i);
    if (braceOpen === -1) break;

    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;

    for (let j = braceOpen; j < text.length; j++) {
      const ch = text[j];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\" && inString) {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (ch === "{") depth++;
      else if (ch === "}") depth--;

      if (depth === 0) {
        end = j;
        break;
      }
    }

    if (end === -1) break;

    try {
      const obj = JSON.parse(text.slice(braceOpen, end + 1));
      if (obj && typeof obj === "object") {
        objects.push(obj);
      }
    } catch {
      // skip malformed object
    }

    i = end + 1;
  }

  return objects;
}

export function validateAndMapQuestion(
  raw: LLMQuestionResponse,
  sessionId: string,
  defaultDifficulty: number,
  seenStems: Set<string>,
  existingHashes: Set<string>,
): QuizQuestion | null {
  // Must have a stem
  if (!raw.stem || typeof raw.stem !== "string" || raw.stem.trim().length === 0) {
    return null;
  }

  // Validate type
  const type = raw.type as QuestionType | undefined;
  if (!type || !ALL_QUESTION_TYPES.includes(type)) {
    return null;
  }

  // Dedup: skip if stem hash already exists
  const hash = stemHash(raw.stem);
  if (existingHashes.has(hash) || seenStems.has(hash)) {
    return null;
  }
  seenStems.add(hash);

  // Validate answer
  const answer = raw.answer;
  if (!answer || typeof answer !== "object") return null;
  const correct = answer.correct;
  if (correct === undefined || correct === null) return null;
  const explanation = typeof answer.explanation === "string" ? answer.explanation : "";

  // Validate options for choice types
  let options = raw.options;
  if (type === "single_choice" || type === "multi_choice" || type === "true_false") {
    if (!Array.isArray(options) || options.length < 2) {
      return null;
    }
    // Ensure each option has key and content
    options = options.map((opt) => ({
      key: String(opt.key || ""),
      content: String(opt.content || ""),
    }));
    if (options.some((opt) => !opt.key || !opt.content)) return null;
  } else {
    // short_answer has no options
    options = undefined;
  }

  const difficulty =
    typeof raw.difficulty === "number" && raw.difficulty >= 1 && raw.difficulty <= 3
      ? raw.difficulty
      : defaultDifficulty;

  const tags = normalizeTags(raw.tags);

  return {
    id: generateId(),
    sessionId,
    type,
    stem: raw.stem.trim(),
    options,
    answer: { correct, explanation },
    sourceBookId: undefined, // filled by caller if needed
    sourceChapter: undefined,
    difficulty,
    createdAt: Date.now(),
    tags: tags.length > 0 ? tags : undefined,
  };
}

/** Normalise the LLM-provided tags into a small, de-duplicated string array. */
function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const tag = value.trim();
    if (!tag || tag.length > 40) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= 3) break;
  }
  return tags;
}

/** Clone a stored question into a fresh session (answers cleared). */
export function cloneQuestionForSession(
  question: QuizQuestion,
  sessionId: string,
  createdAtForOrder: number,
): QuizQuestion {
  return {
    ...question,
    id: generateId(),
    sessionId,
    userAnswer: undefined,
    isCorrect: undefined,
    createdAt: createdAtForOrder,
    tags: question.tags && question.tags.length > 0 ? [...question.tags] : undefined,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate quiz questions for a session.
 *
 * Order of assembly:
 *   1. `wrongRatio` — previously answered-but-wrong questions (spaced repetition).
 *   2. `bankRatio` — questions already in the question bank (weak ones first).
 *   3. The remainder — freshly generated by the LLM from RAG context.
 *
 * Re-using stored questions requires no AI call, so a quiz can still be built
 * (partially) when the bank already has material and the LLM is unavailable.
 *
 * NEVER crashes on malformed LLM JSON — always returns partial results.
 *
 * @param config Quiz generation configuration
 * @param aiConfig Optional AI configuration needed for the generated portion
 * @returns Generated QuizQuestion array (may be empty or partial on LLM failure)
 */
export async function generateQuizQuestions(
  config: QuizConfig,
  aiConfig?: AIConfig,
): Promise<QuizQuestion[]> {
  const sessionId = generateId();
  const totalRequested = Math.max(0, Math.floor(config.questionCount));
  if (totalRequested === 0) return [];

  // 1. Resolve book IDs
  let bookIds: string[];
  try {
    bookIds = await resolveBookIds(config);
  } catch (err) {
    console.error("[QuizGenerator] Failed to resolve book IDs:", err);
    return [];
  }

  if (bookIds.length === 0) {
    return [];
  }

  // 2. Pull reusable questions from the bank and from past mistakes.
  const reused: QuizQuestion[] = [];
  const reusedStems = new Set<string>();
  const addReused = (candidates: QuizQuestion[], limit: number) => {
    let added = 0;
    for (const candidate of candidates) {
      if (added >= limit || reused.length >= totalRequested) break;
      const hash = stemHash(candidate.stem);
      if (reusedStems.has(hash)) continue;
      reusedStems.add(hash);
      reused.push(cloneQuestionForSession(candidate, sessionId, Date.now() - 1_000_000 + added));
      added++;
    }
  };

  const wrongQuota = Math.min(
    totalRequested,
    Math.round(totalRequested * clampRatio(config.wrongRatio)),
  );
  if (wrongQuota > 0) {
    try {
      const wrong = await getWrongQuestionsForQuiz({ limit: wrongQuota * 2, bookIds });
      addReused(wrong, wrongQuota);
    } catch (err) {
      console.warn("[QuizGenerator] Failed to sample wrong questions:", err);
    }
  }

  const bankQuota = Math.min(
    totalRequested - reused.length,
    Math.round(totalRequested * clampRatio(config.bankRatio)),
  );
  if (bankQuota > 0) {
    try {
      const bank = await getBankQuestionsForQuiz({ limit: bankQuota * 2, bookIds });
      addReused(bank, bankQuota);
    } catch (err) {
      console.warn("[QuizGenerator] Failed to sample bank questions:", err);
    }
  }

  // 3. Generate the remainder with the LLM.
  const remainingCount = totalRequested - reused.length;
  if (remainingCount <= 0) {
    return reused.slice(0, totalRequested);
  }

  // Existing bank stems are used to avoid regenerating known questions.
  let existingHashes: Set<string>;
  try {
    existingHashes = await getExistingStemHashes();
  } catch {
    existingHashes = new Set();
  }

  const chunkResults = new Map<string, SearchResult[]>();
  const perBookTopK = Math.max(DEFAULT_SEARCH_TOP_K, Math.ceil(remainingCount / bookIds.length));

  for (const bookId of bookIds) {
    try {
      const results = await fetchChunksForBook(bookId, perBookTopK);
      if (results.length > 0) {
        chunkResults.set(bookId, results);
      }
    } catch (err) {
      console.warn(`[QuizGenerator] Failed to fetch chunks for book ${bookId}:`, err);
      // Continue with other books
    }
  }

  if (chunkResults.size === 0) {
    // No reading material available — return whatever the bank/wrong pools gave us.
    return reused.slice(0, totalRequested);
  }

  const contexts = buildChunkContexts(chunkResults);

  // Limit total context to avoid token overflow
  const MAX_CONTEXT_CHARS = 12000;
  let totalChars = 0;
  const trimmedContexts: ChunkContext[] = [];
  for (const ctx of contexts) {
    if (totalChars + ctx.content.length > MAX_CONTEXT_CHARS) {
      const remaining = MAX_CONTEXT_CHARS - totalChars;
      if (remaining > 200) {
        trimmedContexts.push({ ...ctx, content: ctx.content.slice(0, remaining) });
      }
      break;
    }
    trimmedContexts.push(ctx);
    totalChars += ctx.content.length;
  }

  const typePlan = buildTypePlan(config, remainingCount);
  const prompt = buildGenerationPrompt(config, trimmedContexts, remainingCount, typePlan);

  let response: string;
  try {
    if (!aiConfig) {
      console.warn("[QuizGenerator] No AI config provided; skipping LLM generation.");
      return reused.slice(0, totalRequested);
    }
    const model = await createChatModel(aiConfig, { temperature: 0.7, streaming: false });
    const result = await model.invoke(prompt);
    response = typeof result.content === "string" ? result.content : String(result.content ?? "");
  } catch (err) {
    console.error("[QuizGenerator] LLM generation failed:", err);
    return reused.slice(0, totalRequested);
  }

  if (!response) {
    return reused.slice(0, totalRequested);
  }

  const rawQuestions = tryParseAsQuestions(response);
  if (!rawQuestions) {
    console.warn("[QuizGenerator] Failed to parse LLM response as JSON:", response.slice(0, 200));
    return reused.slice(0, totalRequested);
  }

  // Seed dedup with the reused stems so the LLM cannot duplicate them.
  const seenStems = new Set<string>(reusedStems);
  const generated: QuizQuestion[] = [];
  const difficulty = config.difficulty;
  for (const raw of rawQuestions) {
    try {
      const question = validateAndMapQuestion(
        raw,
        sessionId,
        difficulty,
        seenStems,
        existingHashes,
      );
      if (question) {
        generated.push(question);
      }
    } catch {
      // Skip individual malformed question
    }
  }

  const planned = enforceTypePlan(generated, typePlan, remainingCount);
  return [...reused, ...planned].slice(0, totalRequested);
}

/**
 * Generate a variant of an existing quiz question by asking the LLM to rephrase
 * the stem and change distractors while keeping the same answer.
 *
 * @param baseQuestion The original question to create a variant of
 * @param aiConfig Optional AI configuration
 * @returns A new QuizQuestion with the same answer but rephrased stem and options
 */
export async function generateVariantQuestion(
  baseQuestion: QuizQuestion,
  aiConfig?: AIConfig,
): Promise<QuizQuestion> {
  // Build a fallback variant in case LLM fails entirely
  const fallbackVariant: QuizQuestion = {
    id: generateId(),
    sessionId: baseQuestion.sessionId,
    type: baseQuestion.type,
    stem: `[Variant] ${baseQuestion.stem}`,
    options: baseQuestion.options,
    answer: baseQuestion.answer,
    sourceBookId: baseQuestion.sourceBookId,
    sourceChapter: baseQuestion.sourceChapter,
    difficulty: baseQuestion.difficulty,
    createdAt: Date.now(),
  };

  if (!aiConfig) {
    return fallbackVariant;
  }

  const prompt = buildVariantPrompt(baseQuestion);

  let model: BaseChatModel;
  try {
    model = await createChatModel(aiConfig, { temperature: 0.8, streaming: false });
  } catch (err) {
    console.warn("[QuizGenerator] Failed to create chat model for variant:", err);
    return fallbackVariant;
  }

  let response: string;
  try {
    const result = await model.invoke(prompt);
    response = typeof result.content === "string" ? result.content : String(result.content ?? "");
  } catch (err) {
    console.warn("[QuizGenerator] LLM invocation failed for variant:", err);
    return fallbackVariant;
  }

  if (!response) {
    return fallbackVariant;
  }

  // Parse response
  const rawQuestions = tryParseAsQuestions(response);
  if (!rawQuestions || rawQuestions.length === 0) {
    console.warn("[QuizGenerator] Failed to parse variant response:", response.slice(0, 200));
    return fallbackVariant;
  }

  const raw = rawQuestions[0];

  // Validate minimum fields
  if (!raw.stem || typeof raw.stem !== "string") {
    return fallbackVariant;
  }

  if (!raw.type || !ALL_QUESTION_TYPES.includes(raw.type as QuestionType)) {
    return fallbackVariant;
  }

  const validatedAnswer = raw.answer;
  const answerCorrect = validatedAnswer?.correct ?? baseQuestion.answer.correct;
  const answerExplanation = validatedAnswer?.explanation ?? baseQuestion.answer.explanation;

  let options = raw.options;
  if (baseQuestion.type !== "short_answer") {
    if (!Array.isArray(options) || options.length < 2) {
      options = baseQuestion.options;
    }
  } else {
    options = undefined;
  }

  const difficulty =
    typeof raw.difficulty === "number" && raw.difficulty >= 1 && raw.difficulty <= 3
      ? raw.difficulty
      : baseQuestion.difficulty;

  return {
    id: generateId(),
    sessionId: baseQuestion.sessionId,
    type: raw.type as QuestionType,
    stem: raw.stem.trim(),
    options,
    answer: {
      correct: answerCorrect,
      explanation: typeof answerExplanation === "string" ? answerExplanation : "",
    },
    sourceBookId: baseQuestion.sourceBookId,
    sourceChapter: baseQuestion.sourceChapter,
    difficulty,
    createdAt: Date.now(),
  };
}
