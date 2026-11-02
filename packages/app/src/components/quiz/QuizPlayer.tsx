import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { answersEqual } from "@readany/core/quiz/scoring";
import { useQuizStore } from "@readany/core/stores";
import type { QuestionType } from "@readany/core/types";
import { cn } from "@readany/core/utils";
/**
 * QuizPlayer — question-by-question answering interface with timer,
 * auto-grading, and navigation controls.
 */
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_LABEL_KEYS: Record<QuestionType, string> = {
  single_choice: "quiz.singleChoice",
  multi_choice: "quiz.multiChoice",
  true_false: "quiz.trueFalse",
  short_answer: "quiz.shortAnswer",
};

const TYPE_COLORS: Record<QuestionType, string> = {
  single_choice: "bg-blue-100 text-blue-700 border-blue-200",
  multi_choice: "bg-purple-100 text-purple-700 border-purple-200",
  true_false: "bg-amber-100 text-amber-700 border-amber-200",
  short_answer: "bg-teal-100 text-teal-700 border-teal-200",
};

const DIFFICULTY_LABEL_KEYS: Record<number, string> = {
  1: "quiz.easy",
  2: "quiz.medium",
  3: "quiz.hard",
};

const DIFFICULTY_STARS: Record<number, string> = {
  1: "★☆☆",
  2: "★★☆",
  3: "★★★",
};

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QuizPlayer() {
  const { t } = useTranslation();
  const currentQuestions = useQuizStore((s) => s.currentQuestions);
  const currentQuestionIndex = useQuizStore((s) => s.currentQuestionIndex);
  const submitAnswer = useQuizStore((s) => s.submitAnswer);
  const completeQuiz = useQuizStore((s) => s.completeQuiz);
  const resetQuiz = useQuizStore((s) => s.resetQuiz);
  const currentSession = useQuizStore((s) => s.currentSession);

  const [localIndex, setLocalIndex] = useState(currentQuestionIndex);
  // Resume the timer from the time already spent on this session.
  const [elapsed, setElapsed] = useState(currentSession?.timeSpent ?? 0);
  const [textareaValue, setTextareaValue] = useState("");
  const [expandedReview, setExpandedReview] = useState<Set<string>>(new Set());
  const [multiSelect, setMultiSelect] = useState<Set<string>>(new Set());
  const [isCompleting, setIsCompleting] = useState(false);

  // Sync local index when the store index changes (e.g. resuming a session).
  useEffect(() => {
    setLocalIndex(currentQuestionIndex);
    setTextareaValue("");
    setMultiSelect(new Set());
  }, [currentQuestionIndex]);

  const total = currentQuestions.length;
  const question = currentQuestions[localIndex] ?? null;

  // Timer — increment every second while mounted.
  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Checkpoint the elapsed time so a resumed quiz continues the clock instead
  // of restarting at 0. Flush once more when the player unmounts.
  const saveElapsed = useQuizStore((s) => s.saveElapsed);
  const elapsedRef = useRef(elapsed);
  useEffect(() => {
    elapsedRef.current = elapsed;
  }, [elapsed]);
  useEffect(() => {
    const id = setInterval(() => {
      void saveElapsed(elapsedRef.current);
    }, 15000);
    return () => {
      clearInterval(id);
      void saveElapsed(elapsedRef.current);
    };
  }, [saveElapsed]);

  // -------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------

  const goPrev = useCallback(() => {
    if (localIndex > 0) {
      setLocalIndex(localIndex - 1);
      setTextareaValue("");
      setMultiSelect(new Set());
    }
  }, [localIndex]);

  const goNext = useCallback(() => {
    if (localIndex < total - 1) {
      setLocalIndex(localIndex + 1);
      setTextareaValue("");
      setMultiSelect(new Set());
    }
  }, [localIndex, total]);

  // -------------------------------------------------------------------
  // Answer submission
  // -------------------------------------------------------------------

  const handleSingleChoice = useCallback(
    (key: string) => {
      if (!question) return;
      // Prevent re-answering
      if (question.userAnswer !== undefined) return;
      submitAnswer(question.id, key);
    },
    [question, submitAnswer],
  );

  const handleTrueFalse = useCallback(
    (value: string) => {
      if (!question) return;
      if (question.userAnswer !== undefined) return;
      submitAnswer(question.id, value);
    },
    [question, submitAnswer],
  );

  const handleMultiToggle = useCallback((key: string) => {
    setMultiSelect((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleMultiSubmit = useCallback(() => {
    if (!question || multiSelect.size === 0) return;
    if (question.userAnswer !== undefined) return;
    submitAnswer(question.id, [...multiSelect]);
  }, [question, multiSelect, submitAnswer]);

  const handleShortAnswer = useCallback(() => {
    if (!question || !textareaValue.trim()) return;
    if (question.userAnswer !== undefined) return;
    submitAnswer(question.id, textareaValue.trim());
  }, [question, textareaValue, submitAnswer]);

  const [confirmingComplete, setConfirmingComplete] = useState(false);

  const handleComplete = useCallback(async () => {
    setIsCompleting(true);
    try {
      // Persist the actual answering time so the report is not always 0s.
      await completeQuiz(elapsed);
    } finally {
      setIsCompleting(false);
    }
  }, [completeQuiz, elapsed]);

  const unansweredCount = useMemo(
    () => currentQuestions.filter((q) => q.userAnswer === undefined).length,
    [currentQuestions],
  );

  /** Ask for confirmation when questions are still unanswered. */
  const handleCompleteClick = useCallback(() => {
    if (unansweredCount > 0 && !confirmingComplete) {
      setConfirmingComplete(true);
      return;
    }
    void handleComplete();
  }, [unansweredCount, confirmingComplete, handleComplete]);

  // -------------------------------------------------------------------
  // Computed
  // -------------------------------------------------------------------

  const answeredCount = useMemo(
    () => currentQuestions.filter((q) => q.userAnswer !== undefined).length,
    [currentQuestions],
  );

  const userHasAnswered = question?.userAnswer !== undefined;
  const isCorrect = question?.isCorrect;

  // Reveal the verdict + explanation as soon as the question is answered.
  // Intentionally keyed on id+answer: re-running on every store update would
  // re-open panels the user just collapsed.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on id+answer
  useEffect(() => {
    if (!question || question.userAnswer === undefined) return;
    setExpandedReview((prev) => {
      if (prev.has(question.id)) return prev;
      const next = new Set(prev);
      next.add(question.id);
      return next;
    });
  }, [question?.id, question?.userAnswer]);

  // The correct answer label for display
  const correctAnswerLabel = useMemo(() => {
    if (!question) return "";
    const correct = question.answer.correct;
    if (Array.isArray(correct)) return correct.join(", ");
    return String(correct);
  }, [question]);

  // -------------------------------------------------------------------
  // Toggle review expansion
  // -------------------------------------------------------------------

  const toggleReview = useCallback((id: string) => {
    setExpandedReview((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // -------------------------------------------------------------------
  // Render: empty state
  // -------------------------------------------------------------------

  if (!question) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <p className="text-lg">{t("quiz.noQuestionsToShow", "No questions to show")}</p>
        <Button variant="outline" className="mt-4" onClick={resetQuiz}>
          {t("quiz.backToQuiz", "Back to quiz")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* ---- Top bar: progress + timer ---- */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold tabular-nums">
            {localIndex + 1} / {total}
          </span>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn("text-xs border", TYPE_COLORS[question.type])}>
              {t(TYPE_LABEL_KEYS[question.type])}
            </Badge>
            <span
              className={cn(
                "text-xs tabular-nums",
                question.difficulty <= 2 ? "text-amber-600" : "text-red-500",
              )}
              title={t(DIFFICULTY_LABEL_KEYS[question.difficulty] ?? "quiz.difficulty")}
            >
              {DIFFICULTY_STARS[question.difficulty]}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="size-3.5" />
          <span className="tabular-nums">{formatElapsed(elapsed)}</span>
        </div>
      </div>

      {/* ---- Stem ---- */}
      <div className="flex-1 overflow-auto">
        <div className="px-6 py-5">
          <p className="text-base leading-relaxed whitespace-pre-wrap">{question.stem}</p>
        </div>

        {/* ---- Options ---- */}
        <div className="px-6 pb-4 space-y-3">
          {/* Single choice */}
          {question.type === "single_choice" &&
            question.options?.map((opt) => {
              const isSelected = userHasAnswered && question.userAnswer === opt.key;
              const isCorrectOpt = userHasAnswered && question.answer.correct === opt.key;
              const isWrong = isSelected && !isCorrect;

              return (
                <button
                  key={opt.key}
                  type="button"
                  disabled={userHasAnswered}
                  onClick={() => handleSingleChoice(opt.key)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-sm text-left transition-all",
                    "hover:border-primary/50 hover:bg-accent/50",
                    "disabled:cursor-default",
                    isCorrectOpt && "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30",
                    isWrong && "border-red-400 bg-red-50 dark:bg-red-950/30",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                      isCorrectOpt && "border-emerald-400 bg-emerald-500 text-white",
                      isWrong && "border-red-400 bg-red-500 text-white",
                    )}
                  >
                    {opt.key}
                  </span>
                  <span className="flex-1">{opt.content}</span>
                  {isCorrectOpt && <CheckCircle className="size-4 text-emerald-500 shrink-0" />}
                  {isWrong && <XCircle className="size-4 text-red-500 shrink-0" />}
                </button>
              );
            })}

          {/* Multi choice */}
          {question.type === "multi_choice" && (
            <>
              {question.options?.map((opt) => {
                const isInUserAnswer =
                  userHasAnswered &&
                  Array.isArray(question.userAnswer) &&
                  (question.userAnswer as string[]).includes(opt.key);
                const isInCorrect =
                  Array.isArray(question.answer.correct) &&
                  (question.answer.correct as string[]).includes(opt.key);
                const isChecked = multiSelect.has(opt.key);
                const isSelected = userHasAnswered ? isInUserAnswer : isChecked;

                return (
                  <button
                    key={opt.key}
                    type="button"
                    disabled={userHasAnswered}
                    onClick={() => handleMultiToggle(opt.key)}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-sm text-left transition-all",
                      "hover:border-primary/50 hover:bg-accent/50",
                      "disabled:cursor-default",
                      isSelected && !userHasAnswered && "border-primary bg-primary/5",
                      userHasAnswered &&
                        isInCorrect &&
                        "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30",
                      userHasAnswered &&
                        isInUserAnswer &&
                        !isInCorrect &&
                        "border-red-400 bg-red-50 dark:bg-red-950/30",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                        isSelected &&
                          !userHasAnswered &&
                          "border-primary bg-primary text-primary-foreground",
                        userHasAnswered &&
                          isInCorrect &&
                          "border-emerald-400 bg-emerald-500 text-white",
                        userHasAnswered &&
                          isInUserAnswer &&
                          !isInCorrect &&
                          "border-red-400 bg-red-500 text-white",
                      )}
                    >
                      {isSelected && !userHasAnswered ? <Check className="size-3.5" /> : opt.key}
                    </span>
                    <span className="flex-1">{opt.content}</span>
                    {userHasAnswered && isInCorrect && (
                      <CheckCircle className="size-4 text-emerald-500 shrink-0" />
                    )}
                    {userHasAnswered && isInUserAnswer && !isInCorrect && (
                      <XCircle className="size-4 text-red-500 shrink-0" />
                    )}
                  </button>
                );
              })}
              {!userHasAnswered && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  disabled={multiSelect.size === 0}
                  onClick={handleMultiSubmit}
                >
                  {t("quiz.confirmSelection", {
                    count: multiSelect.size,
                    defaultValue: `Confirm selection (${multiSelect.size})`,
                  })}
                </Button>
              )}
            </>
          )}

          {/* True / false */}
          {question.type === "true_false" && (
            <div className="flex gap-3">
              {(["true", "false"] as const).map((val) => {
                const isSelected = userHasAnswered && question.userAnswer === val;
                const isCorrectVal =
                  userHasAnswered && answersEqual(question, String(question.answer.correct), val);
                const label =
                  val === "true"
                    ? `✓ ${t("quiz.trueLabel", "True")}`
                    : `✗ ${t("quiz.falseLabel", "False")}`;

                return (
                  <button
                    key={val}
                    type="button"
                    disabled={userHasAnswered}
                    onClick={() => handleTrueFalse(val)}
                    className={cn(
                      "flex-1 rounded-lg border px-4 py-3 text-sm font-medium text-center transition-all",
                      "hover:border-primary/50 hover:bg-accent/50",
                      "disabled:cursor-default",
                      isCorrectVal &&
                        "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700",
                      isSelected &&
                        !isCorrectVal &&
                        "border-red-400 bg-red-50 dark:bg-red-950/30 text-red-700",
                    )}
                  >
                    {label}
                    {isCorrectVal && (
                      <CheckCircle className="inline size-4 ml-1.5 text-emerald-500 align-[-1px]" />
                    )}
                    {isSelected && !isCorrectVal && (
                      <XCircle className="inline size-4 ml-1.5 text-red-500 align-[-1px]" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Short answer */}
          {question.type === "short_answer" && !userHasAnswered && (
            <div className="space-y-2">
              <textarea
                className="flex min-h-[120px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                placeholder={t("quiz.shortAnswerPlaceholder", "Type your answer...")}
                value={textareaValue}
                onChange={(e) => setTextareaValue(e.target.value)}
              />
              <div className="flex justify-end">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!textareaValue.trim()}
                  onClick={handleShortAnswer}
                >
                  {t("quiz.submitAnswer", "Submit answer")}
                </Button>
              </div>
            </div>
          )}

          {question.type === "short_answer" && userHasAnswered && (
            <div className="rounded-lg border p-4 bg-muted/30 text-sm space-y-2">
              <div>
                <span className="font-medium text-muted-foreground">
                  {t("quiz.yourAnswer", "Your answer")}:
                </span>
                <p className="mt-1 whitespace-pre-wrap">{String(question.userAnswer)}</p>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">
                  {t("quiz.referenceAnswer", "Reference answer")}:
                </span>
                <p className="mt-1 whitespace-pre-wrap">{correctAnswerLabel}</p>
              </div>
              <p className="text-xs text-muted-foreground italic">
                {t("quiz.shortAnswerManual", "Short answers are graded manually.")}
              </p>
            </div>
          )}
        </div>

        {/* ---- Explanation (post-answer) ---- */}
        {userHasAnswered && (
          <div className="mx-6 mb-4">
            <button
              type="button"
              onClick={() => toggleReview(question.id)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {expandedReview.has(question.id) ? (
                <ChevronUp className="size-3.5" />
              ) : (
                <ChevronDown className="size-3.5" />
              )}
              {t("quiz.showExplanation", "Show explanation")}
            </button>
            {expandedReview.has(question.id) && (
              <div
                className={cn(
                  "mt-2 rounded-lg border p-4 text-sm space-y-1",
                  isCorrect
                    ? "border-emerald-200 bg-emerald-50/70 dark:bg-emerald-950/20"
                    : "border-red-200 bg-red-50/70 dark:bg-red-950/20",
                )}
              >
                <p className="flex items-center gap-1.5 font-semibold">
                  {isCorrect ? (
                    <>
                      <CheckCircle className="size-4 text-emerald-500" />
                      {t("quiz.answerCorrect", "Correct")}
                    </>
                  ) : (
                    <>
                      <XCircle className="size-4 text-red-500" />
                      {t("quiz.answerIncorrect", "Incorrect")}
                    </>
                  )}
                </p>
                <p className="text-muted-foreground mt-1">{question.answer.explanation}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---- Bottom navigation ---- */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-background/95 backdrop-blur-sm">
        <Button variant="ghost" size="sm" disabled={localIndex === 0} onClick={goPrev}>
          <ArrowLeft className="size-4" />
          {t("quiz.prevQuestion", "Previous")}
        </Button>

        <span className="text-xs text-muted-foreground tabular-nums">
          {t("quiz.answeredProgress", {
            answered: answeredCount,
            total,
            defaultValue: `Answered ${answeredCount}/${total}`,
          })}
        </span>

        {localIndex < total - 1 ? (
          <Button variant="ghost" size="sm" onClick={goNext}>
            {t("quiz.nextQuestion", "Next")}
            <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button
            variant={confirmingComplete ? "destructive" : "default"}
            size="sm"
            onClick={handleCompleteClick}
            disabled={isCompleting}
          >
            {isCompleting
              ? t("quiz.submitting", "Submitting...")
              : confirmingComplete
                ? t("quiz.unansweredConfirm", {
                    count: unansweredCount,
                    defaultValue: `${unansweredCount} question(s) left unanswered. Submit anyway?`,
                  })
                : t("quiz.complete", "Finish Quiz")}
          </Button>
        )}
      </div>
    </div>
  );
}
