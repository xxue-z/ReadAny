import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useSettingsStore } from "@/stores/settings-store";
import { useQuizStore } from "@readany/core/stores";
import type { HistoryTrend as HistoryTrendType, QuestionType } from "@readany/core/types";
import { cn } from "@readany/core/utils";
/**
 * QuizReport — post-quiz statistics and question review.
 * Displays summary card, per-type breakdown, weak areas, history trend,
 * and an expandable question review list.
 */
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Target,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getQuizErrorMessage, hasUsableAIConfig } from "./quiz-error";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<QuestionType, string> = {
  single_choice: "单选题",
  multi_choice: "多选题",
  true_false: "判断题",
  short_answer: "简答题",
};

function formatTimeSpent(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}分${s}秒` : `${m}分钟`;
}

function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ScoreRing({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100);
  const circumference = 2 * Math.PI * 38;
  const offset = circumference * (1 - rate);

  return (
    <div className="relative size-24 shrink-0">
      <svg className="size-24 -rotate-90" viewBox="0 0 96 96" role="img">
        <title>{`正确率 ${pct}%`}</title>
        <circle cx="48" cy="48" r="38" fill="none" stroke="var(--border)" strokeWidth="6" />
        <circle
          cx="48"
          cy="48"
          r="38"
          fill="none"
          stroke={pct >= 60 ? "var(--emerald-500, #10b981)" : "var(--amber-500, #f59e0b)"}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-lg font-bold tabular-nums">
        {pct}%
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HistoryTrendBar — lightweight bars for history entries
// ---------------------------------------------------------------------------

function HistoryTrendBar({ history }: { history: HistoryTrendType[] }) {
  if (history.length === 0) {
    return (
      <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
        暂无历史记录
      </div>
    );
  }

  const maxBarH = 80;

  return (
    <div className="flex items-end gap-1 h-[100px] pb-5">
      {history.map((entry, i) => {
        const h = Math.max(Math.round(entry.correctRate * maxBarH), 4);
        return (
          <div key={entry.sessionId || i} className="flex flex-col items-center flex-1 min-w-0">
            <span className="text-[10px] tabular-nums text-muted-foreground mb-0.5">
              {Math.round(entry.correctRate * 100)}%
            </span>
            <div
              className="w-full max-w-[20px] rounded-t-sm transition-all"
              style={{
                height: h,
                backgroundColor:
                  entry.correctRate >= 0.8
                    ? "rgb(16, 185, 129)"
                    : entry.correctRate >= 0.5
                      ? "rgb(245, 158, 11)"
                      : "rgb(239, 68, 68)",
              }}
              title={`${formatDate(entry.date)} — ${formatRate(entry.correctRate)}`}
            />
            <span className="mt-1 text-[9px] text-muted-foreground leading-none truncate w-full text-center">
              {formatDate(entry.date)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Report main component
// ---------------------------------------------------------------------------

export function QuizReport() {
  const { t } = useTranslation();
  const report = useQuizStore((s) => s.report);
  const currentSession = useQuizStore((s) => s.currentSession);
  const loadSessions = useQuizStore((s) => s.loadSessions);
  const startQuiz = useQuizStore((s) => s.startQuiz);
  const resetQuiz = useQuizStore((s) => s.resetQuiz);

  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());
  const [isRestarting, setIsRestarting] = useState(false);

  const toggleQuestion = (id: string) => {
    setExpandedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRestart = async () => {
    if (!currentSession) return;
    const { aiConfig } = useSettingsStore.getState();
    if (!hasUsableAIConfig(aiConfig)) {
      toast.error(t("quiz.errorNoAIConfig", "请先在设置中配置 AI 端点与模型。"));
      return;
    }
    setIsRestarting(true);
    try {
      await loadSessions();
      // Use the same config to generate a new quiz; aiConfig is required or the
      // generator returns zero questions.
      await startQuiz(currentSession.config, aiConfig);
    } catch (err) {
      console.error("[QuizReport] Failed to restart quiz:", err);
      toast.error(getQuizErrorMessage(err, t));
    } finally {
      setIsRestarting(false);
    }
  };

  // -------------------------------------------------------------------
  // Empty / loading
  // -------------------------------------------------------------------

  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <p className="text-lg">报告生成中...</p>
      </div>
    );
  }

  const { summary, weakAreas, history, questions } = report;
  const score = currentSession?.score ?? Math.round(summary.correctRate * 100);

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="max-w-2xl mx-auto w-full px-6 py-6 space-y-8">
        {/* ---- Summary Card ---- */}
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-bold mb-4">测验报告</h2>
          <div className="flex items-center gap-6">
            <ScoreRing rate={summary.correctRate} />
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-2">
                <Target className="size-4 text-primary" />
                <span className="text-sm text-muted-foreground">得分</span>
                <span className="text-2xl font-bold tabular-nums ml-auto">
                  {score}
                  <span className="text-sm font-normal text-muted-foreground">/100</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="size-4 text-emerald-500" />
                <span className="text-sm text-muted-foreground">正确</span>
                <span className="tabular-nums ml-auto font-medium">
                  {summary.correctCount} / {summary.gradableCount}
                </span>
              </div>
              {summary.pendingCount > 0 && (
                <div className="flex items-center gap-2">
                  <AlertCircle className="size-4 text-amber-500" />
                  <span className="text-sm text-muted-foreground">待批改（简答题）</span>
                  <span className="tabular-nums ml-auto font-medium">{summary.pendingCount}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-amber-500" />
                <span className="text-sm text-muted-foreground">用时</span>
                <span className="tabular-nums ml-auto font-medium">
                  {formatTimeSpent(summary.timeSpent)}
                </span>
              </div>
            </div>
          </div>
          <Button className="w-full mt-5" onClick={handleRestart} disabled={isRestarting}>
            {isRestarting ? "正在准备..." : "再来一次"}
          </Button>
          <Button
            variant="outline"
            className="w-full mt-2"
            onClick={resetQuiz}
            disabled={isRestarting}
          >
            返回测验
          </Button>
        </div>

        {/* ---- Per-type breakdown ---- */}
        <section>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <Target className="size-4" /> 题型正确率
          </h3>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground">
                  <th className="text-left px-4 py-2.5 font-medium">题型</th>
                  <th className="text-center px-4 py-2.5 font-medium">题数</th>
                  <th className="text-center px-4 py-2.5 font-medium">正确率</th>
                  <th className="text-right px-4 py-2.5 font-medium">进度条</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(summary.correctRateByType).map(([type, rate]) => {
                  const typeCount = questions.filter((q) => q.type === type).length;
                  return (
                    <tr key={type} className="border-t border-border">
                      <td className="px-4 py-2.5">
                        <Badge variant="secondary" className="text-xs">
                          {TYPE_LABELS[type as QuestionType] ?? type}
                        </Badge>
                      </td>
                      <td className="text-center px-4 py-2.5 tabular-nums">{typeCount}</td>
                      <td className="text-center px-4 py-2.5 tabular-nums font-medium">
                        {formatRate(rate)}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="h-1.5 w-full rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-500",
                              rate >= 0.8
                                ? "bg-emerald-500"
                                : rate >= 0.5
                                  ? "bg-amber-500"
                                  : "bg-red-500",
                            )}
                            style={{ width: `${Math.round(rate * 100)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* ---- Weak areas ---- */}
        {weakAreas.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
              <AlertCircle className="size-4 text-amber-500" /> 薄弱领域
            </h3>
            <div className="space-y-2">
              {weakAreas.map((wa) => (
                <div key={wa.tag} className="flex items-center gap-3 rounded-lg border px-4 py-2.5">
                  <div
                    className={cn(
                      "size-2 rounded-full shrink-0",
                      wa.errorRate >= 0.6
                        ? "bg-red-500"
                        : wa.errorRate >= 0.3
                          ? "bg-amber-500"
                          : "bg-amber-300",
                    )}
                  />
                  <span className="text-sm flex-1 font-medium">{wa.tag}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {wa.questionCount} 题
                  </span>
                  <span
                    className={cn(
                      "text-xs font-semibold tabular-nums",
                      wa.errorRate >= 0.6
                        ? "text-red-600"
                        : wa.errorRate >= 0.3
                          ? "text-amber-600"
                          : "text-amber-500",
                    )}
                  >
                    错误率 {formatRate(wa.errorRate)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ---- History trend ---- */}
        {history.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
              <TrendingUp className="size-4" /> 历史趋势
            </h3>
            <div className="rounded-lg border px-4 pt-3 pb-1 bg-card">
              <HistoryTrendBar history={history} />
            </div>
          </section>
        )}

        {/* ---- Question review list ---- */}
        <section>
          <h3 className="text-sm font-semibold mb-3">题目回顾</h3>
          <div className="space-y-2">
            {questions.map((q, idx) => (
              <Collapsible
                key={q.id}
                open={expandedQuestions.has(q.id)}
                onOpenChange={() => toggleQuestion(q.id)}
              >
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-sm text-left transition-colors hover:bg-accent/50",
                    )}
                  >
                    {expandedQuestions.has(q.id) ? (
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    {q.isCorrect === true ? (
                      <CheckCircle className="size-4 text-emerald-500 shrink-0" />
                    ) : q.isCorrect === false ? (
                      <XCircle className="size-4 text-red-500 shrink-0" />
                    ) : (
                      <AlertCircle className="size-4 text-amber-400 shrink-0" />
                    )}
                    <span className="flex-1 truncate">
                      <span className="text-muted-foreground tabular-nums mr-2">{idx + 1}.</span>
                      {q.stem}
                    </span>
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {TYPE_LABELS[q.type]}
                    </Badge>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mx-1 border-x border-b rounded-b-lg bg-muted/20 px-4 py-3 text-sm space-y-2">
                    {/* Options display */}
                    {q.options && q.options.length > 0 && (
                      <div>
                        <span className="text-xs text-muted-foreground font-medium">选项：</span>
                        <ul className="mt-1 space-y-0.5">
                          {q.options.map((opt) => {
                            const isCorrectOpt = Array.isArray(q.answer.correct)
                              ? (q.answer.correct as string[]).includes(opt.key)
                              : q.answer.correct === opt.key;
                            return (
                              <li
                                key={opt.key}
                                className={cn(
                                  "flex items-center gap-2 text-xs px-2 py-1 rounded",
                                  isCorrectOpt &&
                                    "bg-emerald-50 dark:bg-emerald-950/20 font-medium text-emerald-700",
                                )}
                              >
                                <span className="tabular-nums font-semibold">{opt.key}.</span>
                                <span>{opt.content}</span>
                                {isCorrectOpt && (
                                  <CheckCircle className="size-3 text-emerald-500 ml-auto" />
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    {/* User + correct answer */}
                    <div className="flex gap-4 text-xs">
                      <div>
                        <span className="text-muted-foreground">你的答案：</span>
                        <span
                          className={cn(
                            "font-medium",
                            q.isCorrect === true
                              ? "text-emerald-600"
                              : q.isCorrect === false
                                ? "text-red-600"
                                : "text-muted-foreground",
                          )}
                        >
                          {q.userAnswer !== undefined
                            ? Array.isArray(q.userAnswer)
                              ? (q.userAnswer as string[]).join(", ")
                              : String(q.userAnswer)
                            : "未作答"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">正确答案：</span>
                        <span className="font-medium text-emerald-600">
                          {Array.isArray(q.answer.correct)
                            ? (q.answer.correct as string[]).join(", ")
                            : String(q.answer.correct)}
                        </span>
                      </div>
                    </div>

                    {/* Explanation */}
                    <p className="text-xs text-muted-foreground leading-relaxed border-t border-border pt-2 mt-1">
                      <span className="font-medium">解析：</span>
                      {q.answer.explanation}
                    </p>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
