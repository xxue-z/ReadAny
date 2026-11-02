/**
 * DailyQuiz — daily quiz card with recent completions.
 */
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/stores/settings-store";
import { useQuizStore } from "@readany/core/stores/quiz-store";
import { CalendarDays, CheckCircle2, Play, RotateCcw, Trophy, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getQuizErrorMessage, hasUsableAIConfig } from "./quiz-error";

/** Number of past days to show in the completion strip. */
const RECENT_DAYS = 7;

/** The daily template looks at the last week of reading activity. */
export function buildDailyTimeRange(now = Date.now()): { start: number; end: number } {
  return { start: now - RECENT_DAYS * 24 * 60 * 60 * 1000, end: now };
}

export function DailyQuiz() {
  const { t } = useTranslation();
  const sessions = useQuizStore((s) => s.sessions);
  const loadSessions = useQuizStore((s) => s.loadSessions);
  const startQuiz = useQuizStore((s) => s.startQuiz);
  const loadSession = useQuizStore((s) => s.loadSession);
  const isGenerating = useQuizStore((s) => s.isGenerating);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Compute last N days completion status.
  const recentDays = useMemo(() => {
    const now = new Date();
    const days: { date: Date; label: string; completed: boolean; score?: number }[] = [];

    for (let i = RECENT_DAYS - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const session = sessions.find((s) => {
        const sDate = new Date(s.createdAt).toISOString().slice(0, 10);
        return sDate === dateStr && s.type === "daily" && s.status === "graded";
      });

      days.push({
        date: d,
        label: d.toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
        }),
        completed: !!session,
        score: session?.score,
      });
    }
    return days;
  }, [sessions]);

  const today = new Date();
  const todayStr = today.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Today's daily session, if any — used to resume or review instead of
  // silently starting a second quiz for the same day.
  const todaySession = useMemo(() => {
    const startOfDay = new Date().setHours(0, 0, 0, 0);
    return sessions.find((s) => s.type === "daily" && s.createdAt >= startOfDay);
  }, [sessions]);

  const handleStartQuiz = useCallback(async () => {
    try {
      const { aiConfig } = useSettingsStore.getState();
      if (!hasUsableAIConfig(aiConfig)) {
        toast.error(t("quiz.errorNoAIConfig", "请先在设置中配置 AI 端点与模型。"));
        return;
      }
      // The quiz generator needs the real AIConfig — without it it returns zero
      // questions and the user would be stuck on an empty quiz.
      await startQuiz(
        {
          type: "daily",
          questionCount: 10,
          difficulty: 2,
          bankRatio: 0.3,
          wrongRatio: 0.2,
          // Daily quizzes are based on the last 7 days of reading.
          timeRange: buildDailyTimeRange(),
        },
        aiConfig,
      );
    } catch (err) {
      console.error("[DailyQuiz] Failed to start quiz:", err);
      toast.error(getQuizErrorMessage(err, t));
    }
  }, [startQuiz, t]);

  const handleResume = useCallback(
    async (sessionId: string) => {
      try {
        await loadSession(sessionId);
      } catch (err) {
        console.error("[DailyQuiz] Failed to open session:", err);
        toast.error(getQuizErrorMessage(err, t));
      }
    },
    [loadSession, t],
  );

  const recentSessions = useMemo(() => sessions.slice(0, 5), [sessions]);

  return (
    <div className="flex flex-col gap-6 py-2">
      {/* Date / streak card */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <CalendarDays className="h-7 w-7 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{todayStr}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {todaySession
                ? todaySession.status === "graded"
                  ? `${t("quiz.dailyCompleted")} · ${todaySession.score ?? 0}%`
                  : t("quiz.dailyInProgress", "今日测验进行中，可继续作答。")
                : t("quiz.dailyNotStarted")}
            </p>
          </div>
          {todaySession?.status === "graded" ? (
            <Button
              variant="outline"
              className="shrink-0 gap-2"
              onClick={() => void handleResume(todaySession.id)}
            >
              <Trophy className="h-4 w-4" />
              {t("quiz.viewTodayReport", "查看今日报告")}
            </Button>
          ) : todaySession?.status === "in_progress" ? (
            <Button
              className="shrink-0 gap-2"
              onClick={() => void handleResume(todaySession.id)}
              disabled={isGenerating}
            >
              <RotateCcw className="h-4 w-4" />
              {t("quiz.resume", "继续测验")}
            </Button>
          ) : (
            <Button onClick={handleStartQuiz} disabled={isGenerating} className="shrink-0 gap-2">
              {isGenerating ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {isGenerating ? t("quiz.generating") : t("quiz.start")}
            </Button>
          )}
        </div>
      </div>

      {/* Last 7 days strip */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-foreground">{t("quiz.recentDays")}</h3>
        <div className="grid grid-cols-7 gap-2">
          {recentDays.map((day) => (
            <div
              key={day.label}
              className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-colors ${
                day.completed
                  ? "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20"
                  : "border-border bg-muted/30"
              }`}
            >
              <span className="text-[10px] font-medium text-muted-foreground">
                {day.date.toLocaleDateString(undefined, { weekday: "short" })}
              </span>
              <span className="text-xs text-muted-foreground">{day.date.getDate()}</span>
              {day.completed ? (
                <div className="flex flex-col items-center gap-0.5">
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                  {day.score != null && (
                    <span className="text-[10px] font-semibold text-green-700 dark:text-green-300">
                      {day.score}%
                    </span>
                  )}
                </div>
              ) : (
                <XCircle className="h-4 w-4 text-muted-foreground/40" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Recent sessions — resume an interrupted quiz or reopen a report */}
      {recentSessions.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-medium text-foreground">
            {t("quiz.recentSessions", "最近测验")}
          </h3>
          <div className="flex flex-col gap-2">
            {recentSessions.map((session) => {
              const date = new Date(session.createdAt);
              const graded = session.status === "graded";
              return (
                <div
                  key={session.id}
                  className="flex items-center gap-3 rounded-lg border bg-card px-4 py-2.5"
                >
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                  <span className="text-xs font-medium text-foreground">
                    {t(`quiz.${session.type}`, session.type)}
                  </span>
                  {graded ? (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {session.score ?? 0}%
                    </span>
                  ) : (
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      {t("quiz.dailyInProgressShort", "进行中")}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    onClick={() => void handleResume(session.id)}
                  >
                    {graded ? t("quiz.viewReport", "查看报告") : t("quiz.resume", "继续测验")}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-3 rounded-lg border bg-card p-4">
          <Trophy className="h-5 w-5 text-amber-500" />
          <div>
            <p className="text-xs text-muted-foreground">{t("quiz.streak")}</p>
            <p className="text-lg font-semibold text-foreground">{computeStreak(recentDays)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-card p-4">
          <CheckCircle2 className="h-5 w-5 text-green-500" />
          <div>
            <p className="text-xs text-muted-foreground">{t("quiz.avgScore")}</p>
            <p className="text-lg font-semibold text-foreground">{computeAverageScore(sessions)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Compute the current streak of consecutive completed days. */
function computeStreak(days: { date: Date; completed: boolean }[]): number {
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].completed) {
      streak += 1;
    } else if (i < days.length - 1) {
      break;
    }
  }
  return streak;
}

/** Compute average score across graded daily sessions. */
function computeAverageScore(sessions: { type: string; status: string; score?: number }[]): string {
  const daily = sessions.filter(
    (s) => s.type === "daily" && s.status === "graded" && s.score != null,
  );
  if (daily.length === 0) return "--";
  const avg = daily.reduce((sum, s) => sum + (s.score ?? 0), 0) / daily.length;
  return `${Math.round(avg)}%`;
}
