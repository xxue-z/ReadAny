import {
  CheckCheckIcon,
  CheckIcon,
  ChevronLeftIcon,
  ClockIcon,
  OctagonXIcon,
  TrophyIcon,
} from "@/components/ui/Icon";
import { useResponsiveLayout } from "@/hooks/use-responsive-layout";
import { getQuizFailureMessage, hasUsableAIConfig } from "@/lib/quiz/quiz-error";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { type ThemeColors, fontSize, fontWeight, radius, useColors } from "@/styles/theme";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { getQuizSession } from "@readany/core/db/quiz-queries";
import { buildQuizReport } from "@readany/core/quiz/report-builder";
import { useQuizStore } from "@readany/core/stores/quiz-store";
import { useSettingsStore } from "@readany/core/stores/settings-store";
import type { QuizReport, QuizSession } from "@readany/core/types/quiz";
import type { TFunction } from "i18next";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_LABEL_KEYS: Record<string, string> = {
  single_choice: "quiz.badgeSingle",
  multi_choice: "quiz.badgeMulti",
  true_false: "quiz.badgeTrueFalse",
  short_answer: "quiz.badgeShort",
};

/** `timeSpent` is stored in seconds (same unit as the desktop report). */
function formatDuration(seconds: number, t: TFunction): string {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const min = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  if (min > 0) {
    return t("quiz.durationMinutes", {
      minutes: min,
      seconds: sec,
      defaultValue: `${min}m ${sec}s`,
    });
  }
  return t("quiz.durationSeconds", { count: sec, defaultValue: `${sec}s` });
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function scoreColor(rate: number): string {
  if (rate >= 0.8) return "#10b981";
  if (rate >= 0.6) return "#f59e0b";
  return "#ef4444";
}

function scoreLabel(rate: number, t: TFunction): string {
  if (rate >= 0.9) return t("quiz.gradeExcellent", "Excellent");
  if (rate >= 0.8) return t("quiz.gradeGood", "Good");
  if (rate >= 0.6) return t("quiz.gradeFair", "Fair");
  return t("quiz.gradePoor", "Needs work");
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function QuizReportScreen() {
  const colors = useColors();
  const s = makeStyles(colors);
  const layout = useResponsiveLayout();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "QuizReport">>();
  const { sessionId } = route.params;
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<QuizSession | null>(null);
  const [report, setReport] = useState<QuizReport | null>(null);
  const [reviewMode, setReviewMode] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([getQuizSession(sessionId), buildQuizReport(sessionId)])
      .then(([s, r]) => {
        setSession(s);
        setReport(r);
      })
      .catch((err) => {
        console.error("[QuizReport] load:", err);
      })
      .finally(() => setLoading(false));
  }, [sessionId]);

  /** Re-run the same configuration so the report is not a dead end. */
  const handleRestart = useCallback(async () => {
    if (!session) return;
    const { aiConfig } = useSettingsStore.getState();
    if (!hasUsableAIConfig(aiConfig)) {
      Alert.alert(t("quiz.noAITitle", "AI not configured"), t("quiz.errorNoAIConfig"));
      return;
    }
    try {
      await useQuizStore.getState().startQuiz(session.config, aiConfig);
      const nextSessionId = useQuizStore.getState().currentSession?.id;
      if (nextSessionId) {
        nav.replace("QuizPlayer", { sessionId: nextSessionId });
      }
    } catch (err) {
      console.error("[QuizReport] restart:", err);
      Alert.alert(
        t("quiz.generationFailedTitle", "Quiz generation failed"),
        getQuizFailureMessage(err, t),
      );
    }
  }, [session, nav, t]);

  // -- Render helpers -------------------------------------------------------

  const renderScoreCard = () => {
    if (!report) return null;
    const { summary } = report;
    // Nothing to auto-grade (short-answer-only quiz): show "—" instead of 0%.
    const hasGradable = summary.gradableCount > 0;
    const rate = summary.correctRate;
    const c = hasGradable ? scoreColor(rate) : colors.mutedForeground;

    return (
      <View style={s.scoreCard}>
        <View style={s.scoreRingWrap}>
          <View style={[s.scoreRing, { borderColor: c }]}>
            <Text style={[s.scoreValue, { color: c }]}>
              {hasGradable ? Math.round(rate * 100) : "—"}
            </Text>
            {hasGradable && <Text style={s.scoreUnit}>%</Text>}
          </View>
          <View style={[s.scoreLabelBadge, { backgroundColor: `${c}20` }]}>
            <Text style={[s.scoreLabelText, { color: c }]}>
              {hasGradable ? scoreLabel(rate, t) : t("quiz.selfGraded", "待自评")}
            </Text>
          </View>
        </View>

        <View style={s.scoreStats}>
          <View style={s.scoreStatItem}>
            <CheckCheckIcon size={16} color={colors.emerald} />
            <Text style={s.scoreStatValue}>
              {summary.correctCount}/{summary.gradableCount}
            </Text>
            <Text style={s.scoreStatLabel}>{t("quiz.correctCount", "Correct")}</Text>
          </View>
          <View style={s.scoreStatItem}>
            <ClockIcon size={16} color={colors.blue} />
            <Text style={s.scoreStatValue}>{formatDuration(summary.timeSpent, t)}</Text>
            <Text style={s.scoreStatLabel}>{t("quiz.timeSpent", "Time Spent")}</Text>
          </View>
          <View style={s.scoreStatItem}>
            <TrophyIcon size={16} color={colors.amber} />
            <Text style={s.scoreStatValue}>
              {session?.score != null ? session.score : t("quiz.notGraded", "—")}
            </Text>
            <Text style={s.scoreStatLabel}>{t("quiz.score", "Score")}</Text>
          </View>
        </View>

        {session && (
          <Text style={s.sessionMeta}>
            {session.type === "daily"
              ? t("quiz.daily")
              : session.type === "monthly"
                ? t("quiz.monthly")
                : session.type === "quarterly"
                  ? t("quiz.quarterly")
                  : t("quiz.custom")}
            {" · "}
            {formatDate(session.createdAt)}
          </Text>
        )}

        {summary.pendingCount > 0 && (
          <Text style={[s.sessionMeta, { color: colors.amber }]}>
            {t("quiz.pendingGradingCount", { count: summary.pendingCount })}
          </Text>
        )}

        {summary.unansweredCount > 0 && (
          <Text style={[s.sessionMeta, { color: colors.mutedForeground }]}>
            {t("quiz.unansweredCount", "Unanswered")}: {summary.unansweredCount}
          </Text>
        )}

        <TouchableOpacity
          style={{
            marginTop: 12,
            alignSelf: "center",
            paddingHorizontal: 18,
            paddingVertical: 10,
            borderRadius: radius.md,
            backgroundColor: colors.primary,
          }}
          onPress={() => void handleRestart()}
        >
          <Text style={{ color: colors.primaryForeground, fontWeight: fontWeight.semibold }}>
            {t("quiz.restart", "Try again")}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderTypeBreakdown = () => {
    if (!report) return null;
    const { correctRateByType } = report.summary;
    const types = Object.keys(correctRateByType);
    if (types.length === 0) return null;

    return (
      <View style={s.section}>
        <Text style={s.sectionTitle}>{t("quiz.perTypeAccuracy", "Accuracy by type")}</Text>
        <View style={s.breakdownGrid}>
          {types.map((type) => {
            const gradable = type !== "short_answer";
            const rate = correctRateByType[type];
            const c = gradable ? scoreColor(rate) : colors.mutedForeground;
            return (
              <View key={type} style={s.breakdownItem}>
                <Text style={s.breakdownType}>
                  {TYPE_LABEL_KEYS[type] ? t(TYPE_LABEL_KEYS[type]) : type}
                </Text>
                <View style={s.breakdownBarBg}>
                  {gradable && (
                    <View
                      style={[
                        s.breakdownBarFill,
                        {
                          backgroundColor: c,
                          width: `${Math.round(rate * 100)}%` as unknown as number,
                        },
                      ]}
                    />
                  )}
                </View>
                <Text style={[s.breakdownRate, { color: c }]}>
                  {gradable ? `${Math.round(rate * 100)}%` : "—"}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderWeakAreas = () => {
    if (!report || report.weakAreas.length === 0) return null;

    return (
      <View style={s.section}>
        <Text style={s.sectionTitle}>{t("quiz.weakAreas", "Weak Areas")}</Text>
        {report.weakAreas.slice(0, 5).map((area) => (
          <View key={area.tag} style={s.weakCard}>
            <View style={s.weakInfo}>
              <Text style={s.weakTag}>{area.tag}</Text>
              <Text style={s.weakCount}>
                {t("quiz.questionCountShort", { count: area.questionCount })}
              </Text>
            </View>
            <View style={s.weakBarWrap}>
              <View style={s.weakBarBg}>
                <View
                  style={[
                    s.weakBarFill,
                    {
                      backgroundColor: scoreColor(1 - area.errorRate),
                      width: `${Math.round(area.errorRate * 100)}%` as unknown as number,
                    },
                  ]}
                />
              </View>
              <Text style={s.weakRate}>
                {t("quiz.errorRate", { rate: `${Math.round(area.errorRate * 100)}%` })}
              </Text>
            </View>
          </View>
        ))}
      </View>
    );
  };

  const renderQuestionReview = () => {
    if (!report) return null;
    const { questions } = report;

    return (
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>{t("quiz.questionReview", "Question review")}</Text>
          <TouchableOpacity onPress={() => setReviewMode(!reviewMode)}>
            <Text style={s.reviewToggle}>
              {reviewMode
                ? t("quiz.collapse", "Collapse")
                : t("quiz.viewAll", { count: questions.length })}
            </Text>
          </TouchableOpacity>
        </View>

        {reviewMode &&
          questions.map((q, idx) => (
            <View key={q.id} style={s.reviewCard}>
              <View style={s.reviewHeader}>
                <Text style={s.reviewIndex}>#{idx + 1}</Text>
                <View style={[s.typeBadge, { backgroundColor: colors.muted }]}>
                  <Text style={s.reviewType}>
                    {TYPE_LABEL_KEYS[q.type] ? t(TYPE_LABEL_KEYS[q.type]) : q.type}
                  </Text>
                </View>
                {q.isCorrect === true ? (
                  <CheckIcon size={14} color="#10b981" />
                ) : q.isCorrect === false ? (
                  <OctagonXIcon size={14} color="#ef4444" />
                ) : null}
              </View>
              <Text style={s.reviewStem} numberOfLines={3}>
                {q.stem}
              </Text>
              {q.userAnswer !== undefined && (
                <Text style={s.reviewAnswer}>
                  {t("quiz.yourAnswer", "Your answer")}:{" "}
                  {Array.isArray(q.userAnswer) ? q.userAnswer.join(", ") : String(q.userAnswer)}
                </Text>
              )}
              {q.isCorrect === false && (
                <Text style={s.reviewCorrect}>
                  {t("quiz.correctAnswer", "Correct answer")}:{" "}
                  {Array.isArray(q.answer.correct)
                    ? q.answer.correct.join(", ")
                    : String(q.answer.correct)}
                </Text>
              )}
            </View>
          ))}
      </View>
    );
  };

  // -- Main render ----------------------------------------------------------

  if (loading) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: colors.background }]} edges={["top"]}>
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={colors.mutedForeground} />
        </View>
      </SafeAreaView>
    );
  }

  if (!report) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: colors.background }]} edges={["top"]}>
        {/* Header */}
        <View style={s.header}>
          <View style={[s.headerInner, { maxWidth: layout.centeredContentWidth }]}>
            <TouchableOpacity style={s.backBtn} onPress={() => nav.goBack()}>
              <ChevronLeftIcon size={20} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={s.headerTitle}>{t("quiz.reportTitle", "Quiz Report")}</Text>
            <View style={{ width: 28 }} />
          </View>
        </View>
        <View style={s.loadingWrap}>
          <Text style={s.emptyText}>
            {t("quiz.reportUnavailable", "Report data is unavailable.")}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.container, { backgroundColor: colors.background }]} edges={["top"]}>
      {/* Header */}
      <View style={s.header}>
        <View style={[s.headerInner, { maxWidth: layout.centeredContentWidth }]}>
          <TouchableOpacity style={s.backBtn} onPress={() => nav.goBack()}>
            <ChevronLeftIcon size={20} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>{t("quiz.reportTitle", "Quiz Report")}</Text>
          <View style={{ width: 28 }} />
        </View>
      </View>

      <ScrollView
        style={s.scrollView}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[s.contentInner, { maxWidth: layout.centeredContentWidth }]}>
          {renderScoreCard()}
          {renderTypeBreakdown()}
          {renderWeakAreas()}
          {renderQuestionReview()}
        </View>
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
    emptyText: { fontSize: fontSize.sm, color: colors.mutedForeground },

    // Header
    header: {
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: 0.5,
      borderBottomColor: colors.border,
    },
    headerInner: {
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
    },
    backBtn: { padding: 4 },
    headerTitle: {
      fontSize: fontSize.lg,
      fontWeight: fontWeight.semibold,
      color: colors.foreground,
    },

    // Scroll
    scrollView: { flex: 1 },
    scrollContent: { paddingBottom: 8, alignItems: "center" },
    contentInner: { width: "100%" },

    // Score card
    scoreCard: {
      margin: 16,
      padding: 24,
      backgroundColor: colors.card,
      borderRadius: radius.xl,
      borderWidth: 0.5,
      borderColor: colors.border,
      alignItems: "center",
    },
    scoreRingWrap: { alignItems: "center", marginBottom: 20 },
    scoreRing: {
      width: 100,
      height: 100,
      borderRadius: 50,
      borderWidth: 5,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      marginBottom: 8,
    },
    scoreValue: {
      fontSize: 34,
      fontWeight: fontWeight.bold,
    },
    scoreUnit: {
      fontSize: fontSize.xs,
      color: colors.mutedForeground,
      marginLeft: 2,
      alignSelf: "flex-end",
      marginBottom: 6,
    },
    scoreLabelBadge: {
      paddingHorizontal: 14,
      paddingVertical: 4,
      borderRadius: radius.full,
    },
    scoreLabelText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
    scoreStats: {
      flexDirection: "row",
      justifyContent: "space-around",
      width: "100%",
      marginBottom: 16,
    },
    scoreStatItem: { alignItems: "center", gap: 4 },
    scoreStatValue: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.bold,
      color: colors.foreground,
    },
    scoreStatLabel: { fontSize: fontSize.xs, color: colors.mutedForeground },
    sessionMeta: { fontSize: fontSize.xs, color: colors.mutedForeground },

    // Sections
    section: { paddingHorizontal: 16, marginBottom: 20 },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 10,
    },
    sectionTitle: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.medium,
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 10,
    },
    reviewToggle: { fontSize: fontSize.xs, color: colors.primary, fontWeight: fontWeight.medium },

    // Type breakdown
    breakdownGrid: { gap: 10 },
    breakdownItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 6,
    },
    breakdownType: { fontSize: fontSize.sm, color: colors.foreground, width: 50 },
    breakdownBarBg: {
      flex: 1,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.muted,
      overflow: "hidden",
    },
    breakdownBarFill: { height: "100%", borderRadius: 4 },
    breakdownRate: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      width: 36,
      textAlign: "right",
    },

    // Weak areas
    weakCard: {
      padding: 12,
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 0.5,
      borderColor: colors.border,
      marginBottom: 8,
    },
    weakInfo: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 6,
    },
    weakTag: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.foreground },
    weakCount: { fontSize: fontSize.xs, color: colors.mutedForeground },
    weakBarWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
    weakBarBg: {
      flex: 1,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.muted,
      overflow: "hidden",
    },
    weakBarFill: { height: "100%", borderRadius: 3 },
    weakRate: { fontSize: 11, color: colors.mutedForeground },

    // Question review
    reviewCard: {
      padding: 14,
      backgroundColor: colors.card,
      borderRadius: radius.xl,
      borderWidth: 0.5,
      borderColor: colors.border,
      marginBottom: 8,
    },
    reviewHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 8,
    },
    reviewIndex: {
      fontSize: fontSize.xs,
      color: colors.mutedForeground,
      fontWeight: fontWeight.bold,
    },
    typeBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: radius.full,
    },
    reviewType: { fontSize: 11, color: colors.mutedForeground },
    reviewStem: {
      fontSize: fontSize.sm,
      color: colors.foreground,
      lineHeight: 20,
      marginBottom: 8,
    },
    reviewAnswer: { fontSize: fontSize.xs, color: colors.mutedForeground, marginBottom: 2 },
    reviewCorrect: { fontSize: fontSize.xs, color: "#10b981" },
  });
