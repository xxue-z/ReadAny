export type QuizType = "daily" | "monthly" | "quarterly" | "custom";
export type QuizStatus = "pending" | "in_progress" | "completed" | "graded";
export type QuestionType = "single_choice" | "multi_choice" | "true_false" | "short_answer";

export interface QuizConfig {
  type: QuizType;
  bookIds?: string[];
  timeRange?: { start: number; end: number };
  questionCount: number;
  typeDistribution?: Partial<Record<QuestionType, number>>;
  difficulty: 1 | 2 | 3;
  bankRatio: number; // 0-1, fraction from question_bank
  wrongRatio: number; // 0-1, fraction from previous wrong answers
}

export interface QuizSession {
  id: string;
  type: QuizType;
  config: QuizConfig;
  status: QuizStatus;
  score?: number;
  timeSpent: number;
  createdAt: number;
  completedAt?: number;
}

export interface QuizQuestion {
  id: string;
  sessionId: string;
  type: QuestionType;
  stem: string;
  options?: { key: string; content: string }[];
  answer: { correct: string | string[]; explanation: string };
  sourceBookId?: string;
  sourceChapter?: string;
  difficulty: number;
  userAnswer?: string | string[];
  isCorrect?: boolean;
  createdAt: number;
  /**
   * Knowledge-point tags. Persisted in `question_bank` (not in `quiz_questions`),
   * used by weak-area analysis and the question-bank filter.
   */
  tags?: string[];
}

export interface QuestionBankEntry {
  id: string;
  questionId: string;
  tags: string[];
  usageCount: number;
  correctRate: number;
  variantOf?: string;
  createdAt: number;
  /** Joined from quiz_questions for the bank browsing UI. */
  stem?: string;
  questionType?: QuestionType;
  difficulty?: number;
  sourceBookId?: string;
}

export interface QuizSummary {
  totalQuestions: number;
  /** Questions that can be auto-graded (everything except short_answer). */
  gradableCount: number;
  /** Questions waiting for manual grading (short_answer without a verdict). */
  pendingCount: number;
  correctCount: number;
  /** Correct / gradable — short-answer questions never deflate the score. */
  correctRate: number;
  timeSpent: number;
  correctRateByType: Record<string, number>;
}

export interface WeakArea {
  tag: string;
  errorRate: number;
  questionCount: number;
}

export interface HistoryTrend {
  sessionId: string;
  date: number;
  score: number;
  correctRate: number;
}

export interface QuizReport {
  summary: QuizSummary;
  weakAreas: WeakArea[];
  history: HistoryTrend[];
  questions: QuizQuestion[];
}