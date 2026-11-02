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
import { useCallback, useEffect, useState } from "react";
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

const TYPE_LABELS: Record<string, string> = {
  single_choice: "单选",
  multi_choice: "多选",
  true_false: "判断",
  short_answer: "简答",
};

/** `timeSpent` is stored in seconds (same unit as the desktop report). */
function formatDuration(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const min = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  if (min > 0) return `${min}分${sec}秒`;
  return `${sec}秒`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("zh-CN", {
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

function scoreLabel(rate: number): string {
  if (rate >= 0.9) return "优秀";
  if (rate >= 0.8) return "良好";
  if (rate >= 0.6) return "一般";
  return "需努力";
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
      Alert.alert("未配置 AI", "请先在设置中配置 AI 端点与模型。");
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
      Alert.alert("生成测验失败", getQuizFailureMessage(err));
    }
  }, [session, nav]);

  // -- Render helpers -------------------------------------------------------

  const renderScoreCard = () => {
    if (!report) return null;
    const { summary } = report;
    const rate = summary.correctRate;
    const c = scoreColor(rate);

    return (
      <View style={s.scoreCard}>
        <View style={s.scoreRingWrap}>
          <View style={[s.scoreRing, { borderColor: c }]}>
            <Text style={[s.scoreValue, { color: c }]}>{Math.round(rate * 100)}</Text>
            <Text style={s.scoreUnit}>%</Text>
          </View>
          <View style={[s.scoreLabelBadge, { backgroundColor: `${c}20` }]}>
            <Text style={[s.scoreLabelText, { color: c }]}>{scoreLabel(rate)}</Text>
          </View>
        </View>

        <View style={s.scoreStats}>
          <View style={s.scoreStatItem}>
            <CheckCheckIcon size={16} color={colors.emerald} />
            <Text style={s.scoreStatValue}>
              {summary.correctCount}/{summary.gradableCount}
            </Text>
            <Text style={s.scoreStatLabel}>正确</Text>
          </View>
          <View style={s.scoreStatItem}>
            <ClockIcon size={16} color={colors.blue} />
            <Text style={s.scoreStatValue}>{formatDuration(summary.timeSpent)}</Text>
            <Text style={s.scoreStatLabel}>用时</Text>
          </View>
          <View style={s.scoreStatItem}>
            <TrophyIcon size={16} color={colors.amber} />
            <Text style={s.scoreStatValue}>{session?.score ?? 0}</Text>
            <Text style={s.scoreStatLabel}>得分</Text>
          </View>
        </View>

        {session && (
          <Text style={s.sessionMeta}>
            {session.type === "daily"
              ? "每日测验"
              : session.type === "monthly"
                ? "月度测验"
                : session.type === "quarterly"
                  ? "季度测验"
                  : "自定义测验"}
            {" · "}
            {formatDate(session.createdAt)}
          </Text>
        )}

        {summary.pendingCount > 0 && (
          <Text style={[s.sessionMeta, { color: colors.amber }]}>
            待批改（简答题）：{summary.pendingCount} 题
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
            再来一次
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
        <Text style={s.sectionTitle}>题型分析</Text>
        <View style={s.breakdownGrid}>
          {types.map((type) => {
            const rate = correctRateByType[type];
            const c = scoreColor(rate);
            return (
              <View key={type} style={s.breakdownItem}>
                <Text style={s.breakdownType}>{TYPE_LABELS[type] ?? type}</Text>
                <View style={s.breakdownBarBg}>
                  <View
                    style={[
                      s.breakdownBarFill,
                      {
                        backgroundColor: c,
                        width: `${Math.round(rate * 100)}%` as unknown as number,
                      },
                    ]}
                  />
                </View>
                <Text style={[s.breakdownRate, { color: c }]}>{Math.round(rate * 100)}%</Text>
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
        <Text style={s.sectionTitle}>薄弱环节</Text>
        {report.weakAreas.slice(0, 5).map((area) => (
          <View key={area.tag} style={s.weakCard}>
            <View style={s.weakInfo}>
              <Text style={s.weakTag}>{area.tag}</Text>
              <Text style={s.weakCount}>{area.questionCount} 题</Text>
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
              <Text style={s.weakRate}>{Math.round(area.errorRate * 100)}% 错误率</Text>
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
          <Text style={s.sectionTitle}>题目回顾</Text>
          <TouchableOpacity onPress={() => setReviewMode(!reviewMode)}>
            <Text style={s.reviewToggle}>
              {reviewMode ? "收起" : `查看全部 (${questions.length})`}
            </Text>
          </TouchableOpacity>
        </View>

        {reviewMode &&
          questions.map((q, idx) => (
            <View key={q.id} style={s.reviewCard}>
              <View style={s.reviewHeader}>
                <Text style={s.reviewIndex}>#{idx + 1}</Text>
                <View style={[s.typeBadge, { backgroundColor: colors.muted }]}>
                  <Text style={s.reviewType}>{TYPE_LABELS[q.type] ?? q.type}</Text>
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
                  你的答案:{" "}
                  {Array.isArray(q.userAnswer) ? q.userAnswer.join(", ") : String(q.userAnswer)}
                </Text>
              )}
              {q.isCorrect === false && (
                <Text style={s.reviewCorrect}>
                  正确答案:{" "}
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
            <Text style={s.headerTitle}>测验报告</Text>
            <View style={{ width: 28 }} />
          </View>
        </View>
        <View style={s.loadingWrap}>
          <Text style={s.emptyText}>报告数据不可用</Text>
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
          <Text style={s.headerTitle}>测验报告</Text>
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
