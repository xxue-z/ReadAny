import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { AIConfig, QuizConfig, QuizQuestion, QuestionType, SearchResult } from "../types";
import { createChatModel } from "../ai/llm-provider";
import { search } from "../rag/search";
import { getReadingSessionsByDateRange, getAllReadingSessions } from "../db/session-queries";
import { stemHash } from "../db/quiz-queries";
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

function buildGenerationPrompt(
  config: QuizConfig,
  contexts: ChunkContext[],
): string {
  const types = pickTypes(config);
  const typeList = types.join(", ");
  const count = config.questionCount;
  const difficulty = config.difficulty;

  const contextBlocks = contexts.map(
    (ctx, i) =>
      `--- Context ${i + 1} (Book: ${ctx.bookId}, ${ctx.chapterTitle}) ---\n${ctx.content}`,
  );

  return `You are an expert quiz question generator. Create ${count} quiz questions based on the provided reading material.

## Requirements
- Total questions: ${count}
- Question types: ${typeList}
- Difficulty: ${difficulty} (1 = easy recall, 2 = comprehension, 3 = analysis/application)
- Each question MUST be grounded in the provided context
- For single_choice: exactly 4 options, one correct
- For multi_choice: 4-6 options, at least one correct (array)
- For true_false: options [{key: "A", content: "True"}, {key: "B", content: "False"}]
- For short_answer: no options, answer.correct is the model answer string

## Source Material
${contextBlocks.join("\n\n")}

## Output Format
Return ONLY a valid JSON array. Each element must have exactly these fields:
{
  "type": "${types[0]}" | ...,
  "stem": "question text",
  "options": [{"key": "A", "content": "..."}, ...],  // omit for short_answer
  "answer": {"correct": "A" | ["A","B"] | "model answer", "explanation": "why this is correct"},
  "difficulty": ${difficulty}
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

  const difficulty = typeof raw.difficulty === "number" && raw.difficulty >= 1 && raw.difficulty <= 3
    ? raw.difficulty
    : defaultDifficulty;

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
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate quiz questions from reading material using RAG + LLM.
 *
 * 1. Resolves book IDs from config (explicit or via reading_sessions).
 * 2. Runs RAG hybrid search per book to collect relevant text chunks.
 * 3. Builds an LLM prompt with chunks and config parameters.
 * 4. Calls the configured LLM and parses the JSON response.
 * 5. Deduplicates against existing question_bank entries via stemHash.
 *
 * NEVER crashes on malformed LLM JSON — always returns partial results.
 *
 * @param config Quiz generation configuration
 * @param aiConfig Optional AI configuration (uses active endpoint if omitted)
 * @returns Generated QuizQuestion array (may be empty or partial on LLM failure)
 */
export async function generateQuizQuestions(
  config: QuizConfig,
  aiConfig?: AIConfig,
): Promise<QuizQuestion[]> {
  const sessionId = generateId();
  const questions: QuizQuestion[] = [];
  const seenStems = new Set<string>();

  // 1. Get existing stem hashes for dedup
  let existingHashes: Set<string>;
  try {
    existingHashes = await getExistingStemHashes();
  } catch {
    existingHashes = new Set();
  }

  // 2. Resolve book IDs
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

  // 3. Fetch chunks for each book
  const chunkResults = new Map<string, SearchResult[]>();
  const perBookTopK = Math.max(DEFAULT_SEARCH_TOP_K, Math.ceil(config.questionCount / bookIds.length));

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
    return [];
  }

  // 4. Build context and prompt
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

  const prompt = buildGenerationPrompt(config, trimmedContexts);

  // 5. Call LLM
  let model: BaseChatModel;
  try {
    if (!aiConfig) {
      throw new Error("No AI config provided");
    }
    model = await createChatModel(aiConfig, { temperature: 0.7, streaming: false });
  } catch (err) {
    console.error("[QuizGenerator] Failed to create chat model:", err);
    return [];
  }

  let response: string;
  try {
    const result = await model.invoke(prompt);
    response = typeof result.content === "string" ? result.content : String(result.content ?? "");
  } catch (err) {
    console.error("[QuizGenerator] LLM invocation failed:", err);
    return [];
  }

  if (!response) {
    return [];
  }

  // 6. Parse response
  const rawQuestions = tryParseAsQuestions(response);
  if (!rawQuestions) {
    console.warn("[QuizGenerator] Failed to parse LLM response as JSON:", response.slice(0, 200));
    return [];
  }

  // 7. Validate, dedup, and map
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
        questions.push(question);
      }
    } catch {
      // Skip individual malformed question
    }
  }

  // 8. Enforce question count cap
  if (questions.length > config.questionCount) {
    return questions.slice(0, config.questionCount);
  }

  return questions;
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

  const difficulty = typeof raw.difficulty === "number" && raw.difficulty >= 1 && raw.difficulty <= 3
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