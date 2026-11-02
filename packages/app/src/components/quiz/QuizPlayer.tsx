import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { useCallback, useEffect, useMemo, useState } from "react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<QuestionType, string> = {
  single_choice: "单选题",
  multi_choice: "多选题",
  true_false: "判断题",
  short_answer: "简答题",
};

const TYPE_COLORS: Record<QuestionType, string> = {
  single_choice: "bg-blue-100 text-blue-700 border-blue-200",
  multi_choice: "bg-purple-100 text-purple-700 border-purple-200",
  true_false: "bg-amber-100 text-amber-700 border-amber-200",
  short_answer: "bg-teal-100 text-teal-700 border-teal-200",
};

const DIFFICULTY_LABELS: Record<number, string> = {
  1: "简单",
  2: "中等",
  3: "困难",
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
  const currentQuestions = useQuizStore((s) => s.currentQuestions);
  const currentQuestionIndex = useQuizStore((s) => s.currentQuestionIndex);
  const submitAnswer = useQuizStore((s) => s.submitAnswer);
  const completeQuiz = useQuizStore((s) => s.completeQuiz);

  const [localIndex, setLocalIndex] = useState(currentQuestionIndex);
  const [elapsed, setElapsed] = useState(0);
  const [textareaValue, setTextareaValue] = useState("");
  const [expandedReview, setExpandedReview] = useState<Set<string>>(new Set());
  const [multiSelect, setMultiSelect] = useState<Set<string>>(new Set());
  const [isCompleting, setIsCompleting] = useState(false);

  // Sync local index when store index changes (e.g. auto-advance from submitAnswer).
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

  const handleComplete = useCallback(async () => {
    setIsCompleting(true);
    try {
      await completeQuiz();
    } finally {
      setIsCompleting(false);
    }
  }, [completeQuiz]);

  // -------------------------------------------------------------------
  // Computed
  // -------------------------------------------------------------------

  const answeredCount = useMemo(
    () => currentQuestions.filter((q) => q.userAnswer !== undefined).length,
    [currentQuestions],
  );

  const userHasAnswered = question?.userAnswer !== undefined;
  const isCorrect = question?.isCorrect;

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
        <p className="text-lg">没有问题可显示</p>
        <Button variant="outline" className="mt-4" onClick={handleComplete}>
          完成测验
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
              {TYPE_LABELS[question.type]}
            </Badge>
            <span
              className={cn(
                "text-xs tabular-nums",
                question.difficulty <= 2 ? "text-amber-600" : "text-red-500",
              )}
              title={DIFFICULTY_LABELS[question.difficulty]}
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
                  确认选择 ({multiSelect.size})
                </Button>
              )}
            </>
          )}

          {/* True / false */}
          {question.type === "true_false" && (
            <div className="flex gap-3">
              {(["true", "false"] as const).map((val) => {
                const isSelected = userHasAnswered && question.userAnswer === val;
                const isCorrectVal = userHasAnswered && question.answer.correct === val;
                const label = val === "true" ? "✓ 正确" : "✗ 错误";

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
                placeholder="输入你的回答..."
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
                  提交回答
                </Button>
              </div>
            </div>
          )}

          {question.type === "short_answer" && userHasAnswered && (
            <div className="rounded-lg border p-4 bg-muted/30 text-sm space-y-2">
              <div>
                <span className="font-medium text-muted-foreground">你的回答：</span>
                <p className="mt-1 whitespace-pre-wrap">{String(question.userAnswer)}</p>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">参考答案：</span>
                <p className="mt-1 whitespace-pre-wrap">{correctAnswerLabel}</p>
              </div>
              <p className="text-xs text-muted-foreground italic">简答题需人工评分，请继续作答。</p>
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
              查看解析
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
                      回答正确
                    </>
                  ) : (
                    <>
                      <XCircle className="size-4 text-red-500" />
                      回答错误
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
          上一题
        </Button>

        <span className="text-xs text-muted-foreground tabular-nums">
          已答 {answeredCount}/{total}
        </span>

        {localIndex < total - 1 ? (
          <Button variant="ghost" size="sm" onClick={goNext}>
            下一题
            <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button variant="default" size="sm" onClick={handleComplete} disabled={isCompleting}>
            {isCompleting ? "提交中..." : "完成测验"}
          </Button>
        )}
      </div>
    </div>
  );
}
