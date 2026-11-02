import {
  BarChart3Icon,
  BookOpenIcon,
  BrainIcon,
  ChevronRightIcon,
  ClockIcon,
  PlayIcon,
  SwordsIcon,
  TrendingUpIcon,
  TrophyIcon,
} from "@/components/ui/Icon";
import { useResponsiveLayout } from "@/hooks/use-responsive-layout";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { type ThemeColors, fontSize, fontWeight, radius, useColors } from "@/styles/theme";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { getQuestionBank } from "@readany/core/db/quiz-queries";
import { useQuizStore } from "@readany/core/stores/quiz-store";
import type { QuestionBankEntry, QuizConfig, QuizSession } from "@readany/core/types/quiz";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

type SubTab = "daily" | "custom" | "bank";

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "daily", label: "今日测验" },
  { key: "custom", label: "自定义测验" },
  { key: "bank", label: "题库" },
];

const DIFFICULTY_LABELS: Record<number, string> = {
  1: "简单",
  2: "中等",
  3: "困难",
};

function statusBadge(status: string): { label: string; color: string } {
  switch (status) {
    case "in_progress":
      return { label: "进行中", color: "#3b82f6" };
    case "graded":
    case "completed":
      return { label: "已完成", color: "#10b981" };
    default:
      return { label: "待开始", color: "#7c7c82" };
  }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function QuizScreen() {
  const colors = useColors();
  const s = makeStyles(colors);
  const layout = useResponsiveLayout();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  useTranslation();

  // Store
  const store = useQuizStore();
  const sessions = store.sessions;
  const isGenerating = store.isGenerating;

  // Local state
  const [activeTab, setActiveTab] = useState<SubTab>("daily");
  const [bankEntries, setBankEntries] = useState<QuestionBankEntry[]>([]);
  const [bankLoading, setBankLoading] = useState(false);

  // -- Custom form state ----------------------------------------------------
  const [customType, setCustomType] = useState<"daily" | "monthly" | "quarterly" | "custom">(
    "daily",
  );
  const [customCount, setCustomCount] = useState("10");
  const [customDifficulty, setCustomDifficulty] = useState<1 | 2 | 3>(2);
  const [customBankRatio, setCustomBankRatio] = useState(0.5);
  const [customWrongRatio, setCustomWrongRatio] = useState(0.3);
  const [typeDistSingle, setTypeDistSingle] = useState(5);
  const [typeDistMulti, setTypeDistMulti] = useState(3);
  const [typeDistTF, setTypeDistTF] = useState(1);
  const [typeDistShort, setTypeDistShort] = useState(1);

  // biome-ignore lint/correctness/useExhaustiveDependencies: loadSessions stable from store
  useEffect(() => {
    store.loadSessions().catch((err) => console.warn("[Quiz] loadSessions:", err));
  }, []);

  // Load question bank when bank tab active
  useEffect(() => {
    if (activeTab !== "bank") return;
    setBankLoading(true);
    getQuestionBank()
      .then(setBankEntries)
      .catch((err) => console.warn("[Quiz] getQuestionBank:", err))
      .finally(() => setBankLoading(false));
  }, [activeTab]);

  // -- Handlers -------------------------------------------------------------

  const startDailyQuiz = useCallback(async () => {
    try {
      const config: QuizConfig = {
        type: "daily",
        questionCount: 10,
        difficulty: 2,
        bankRatio: 0.4,
        wrongRatio: 0.2,
      };
      await store.startQuiz(config);
      const sessionId = store.currentSession?.id;
      if (sessionId) {
        nav.navigate("QuizPlayer" as never, { sessionId } as never);
      }
    } catch (err) {
      Alert.alert("错误", "生成测验失败，请重试");
      console.error("[Quiz] startDailyQuiz:", err);
    }
  }, [store, nav]);

  const startCustomQuiz = useCallback(async () => {
    try {
      const typeDist: Partial<Record<QuestionType, number>> = {};
      if (typeDistSingle > 0) typeDist.single_choice = typeDistSingle;
      if (typeDistMulti > 0) typeDist.multi_choice = typeDistMulti;
      if (typeDistTF > 0) typeDist.true_false = typeDistTF;
      if (typeDistShort > 0) typeDist.short_answer = typeDistShort;

      const config: QuizConfig = {
        type: customType,
        questionCount: Number(customCount) || 10,
        typeDistribution: typeDist,
        difficulty: customDifficulty,
        bankRatio: customBankRatio,
        wrongRatio: customWrongRatio,
      };
      await store.startQuiz(config);
      const sessionId = store.currentSession?.id;
      if (sessionId) {
        nav.navigate("QuizPlayer" as never, { sessionId } as never);
      }
    } catch (err) {
      Alert.alert("错误", "生成测验失败，请重试");
      console.error("[Quiz] startCustomQuiz:", err);
    }
  }, [
    store,
    nav,
    customType,
    customCount,
    customDifficulty,
    customBankRatio,
    customWrongRatio,
    typeDistSingle,
    typeDistMulti,
    typeDistTF,
    typeDistShort,
  ]);

  const resumeSession = useCallback(
    async (session: QuizSession) => {
      try {
        await store.loadSession(session.id);
        const sessionId = store.currentSession?.id;
        if (sessionId) {
          nav.navigate("QuizPlayer" as never, { sessionId } as never);
        }
      } catch (err) {
        Alert.alert("错误", "加载测验失败");
        console.error("[Quiz] resumeSession:", err);
      }
    },
    [store, nav],
  );

  const viewReport = useCallback(
    (sessionId: string) => {
      nav.navigate("QuizReport" as never, { sessionId } as never);
    },
    [nav],
  );

  // -- Derived data ---------------------------------------------------------

  const recentSessions = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return sessions.filter((s) => s.createdAt >= sevenDaysAgo);
  }, [sessions]);

  const todaySession = useMemo(() => {
    const startOfDay = new Date().setHours(0, 0, 0, 0);
    return sessions.find((s) => s.createdAt >= startOfDay && s.type === "daily");
  }, [sessions]);

  const weeklyCompleted = recentSessions.filter(
    (s) => s.status === "graded" || s.status === "completed",
  ).length;
  const weeklyAvgScore = useMemo(() => {
    const completed = recentSessions.filter((s) => s.score != null);
    if (completed.length === 0) return 0;
    return Math.round(completed.reduce((sum, s) => sum + (s.score ?? 0), 0) / completed.length);
  }, [recentSessions]);

  // -- Render sub-tabs ------------------------------------------------------

  const renderDailyTab = () => (
    <ScrollView style={s.tabContent} showsVerticalScrollIndicator={false}>
      {/* Today's quiz card */}
      <View style={s.dailyCard}>
        <View style={s.dailyCardHeader}>
          <BrainIcon size={28} color={colors.primary} />
          <View style={s.dailyCardTitleWrap}>
            <Text style={s.dailyCardTitle}>今日测验</Text>
            <Text style={s.dailyCardSubtitle}>
              {todaySession
                ? todaySession.status === "graded"
                  ? `已完成 · 得分 ${todaySession.score ?? 0}`
                  : "进行中"
                : "还未开始今日测验"}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[s.startBtn, isGenerating && s.startBtnDisabled]}
          onPress={startDailyQuiz}
          disabled={isGenerating}
          activeOpacity={0.8}
        >
          {isGenerating ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <>
              <PlayIcon size={16} color={colors.primaryForeground} />
              <Text style={s.startBtnText}>
                {todaySession?.status === "in_progress" ? "继续测验" : "开始测验"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Weekly stats */}
      <View style={s.statsGrid}>
        <View style={s.statCard}>
          <TrophyIcon size={20} color={colors.amber} />
          <Text style={s.statValue}>{weeklyCompleted}</Text>
          <Text style={s.statLabel}>本周完成</Text>
        </View>
        <View style={s.statCard}>
          <BarChart3Icon size={20} color={colors.indigo} />
          <Text style={s.statValue}>{weeklyAvgScore}</Text>
          <Text style={s.statLabel}>平均分</Text>
        </View>
        <View style={s.statCard}>
          <TrendingUpIcon size={20} color={colors.emerald} />
          <Text style={s.statValue}>{recentSessions.length}</Text>
          <Text style={s.statLabel}>总次数</Text>
        </View>
      </View>

      {/* Recent sessions */}
      <Text style={s.sectionTitle}>最近测验</Text>
      {recentSessions.length === 0 ? (
        <View style={s.emptyWrap}>
          <Text style={s.emptyText}>暂无测验记录</Text>
        </View>
      ) : (
        recentSessions.slice(0, 10).map((session) => (
          <TouchableOpacity
            key={session.id}
            style={s.sessionCard}
            onPress={() =>
              session.status === "graded" || session.status === "completed"
                ? viewReport(session.id)
                : resumeSession(session)
            }
            activeOpacity={0.7}
          >
            <View style={s.sessionLeft}>
              <ClockIcon size={16} color={colors.mutedForeground} />
              <View style={s.sessionInfo}>
                <Text style={s.sessionType}>
                  {session.type === "daily"
                    ? "每日测验"
                    : session.type === "monthly"
                      ? "月度测验"
                      : session.type === "quarterly"
                        ? "季度测验"
                        : "自定义测验"}
                </Text>
                <Text style={s.sessionDate}>
                  {new Date(session.createdAt).toLocaleDateString("zh-CN")}
                </Text>
              </View>
            </View>
            <View style={s.sessionRight}>
              {session.score != null && <Text style={s.sessionScore}>{session.score}分</Text>}
              <View
                style={[
                  s.statusBadge,
                  { backgroundColor: `${statusBadge(session.status).color}20` },
                ]}
              >
                <Text style={[s.statusBadgeText, { color: statusBadge(session.status).color }]}>
                  {statusBadge(session.status).label}
                </Text>
              </View>
              <ChevronRightIcon size={14} color={colors.mutedForeground} />
            </View>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );

  const renderCustomTab = () => (
    <ScrollView
      style={s.tabContent}
      contentContainerStyle={s.customFormContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Type */}
      <Text style={s.fieldLabel}>测验类型</Text>
      <View style={s.typeRow}>
        {(["daily", "monthly", "quarterly", "custom"] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[s.typeChip, customType === t && s.typeChipActive]}
            onPress={() => setCustomType(t)}
          >
            <Text style={[s.typeChipText, customType === t && s.typeChipTextActive]}>
              {t === "daily"
                ? "每日"
                : t === "monthly"
                  ? "月度"
                  : t === "quarterly"
                    ? "季度"
                    : "自定义"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Question count */}
      <Text style={s.fieldLabel}>题目数量</Text>
      <TextInput
        style={s.fieldInput}
        value={customCount}
        onChangeText={setCustomCount}
        keyboardType="number-pad"
        placeholder="10"
        placeholderTextColor={colors.mutedForeground}
      />

      {/* Difficulty */}
      <Text style={s.fieldLabel}>难度</Text>
      <View style={s.typeRow}>
        {([1, 2, 3] as const).map((d) => (
          <TouchableOpacity
            key={d}
            style={[s.typeChip, customDifficulty === d && s.typeChipActive]}
            onPress={() => setCustomDifficulty(d)}
          >
            <Text style={[s.typeChipText, customDifficulty === d && s.typeChipTextActive]}>
              {DIFFICULTY_LABELS[d]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Type distribution */}
      <Text style={s.fieldLabel}>题型分布</Text>
      <View style={s.distRow}>
        {[
          { label: "单选", value: typeDistSingle, set: setTypeDistSingle },
          { label: "多选", value: typeDistMulti, set: setTypeDistMulti },
          { label: "判断", value: typeDistTF, set: setTypeDistTF },
          { label: "简答", value: typeDistShort, set: setTypeDistShort },
        ].map((item) => (
          <View key={item.label} style={s.distItem}>
            <Text style={s.distLabel}>{item.label}</Text>
            <View style={s.distStepper}>
              <TouchableOpacity
                style={s.distStepBtn}
                onPress={() => item.set(Math.max(0, item.value - 1))}
              >
                <Text style={s.distStepBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={s.distValue}>{item.value}</Text>
              <TouchableOpacity
                style={s.distStepBtn}
                onPress={() => item.set(Math.min(20, item.value + 1))}
              >
                <Text style={s.distStepBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      {/* Bank ratio */}
      <Text style={s.fieldLabel}>题库占比: {Math.round(customBankRatio * 100)}%</Text>
      <View style={s.sliderWrap}>
        <TouchableOpacity
          style={[s.sliderTrack, { backgroundColor: colors.muted }]}
          onPress={(_e) => {
            // Simple tap-based slider
          }}
          activeOpacity={1}
        >
          <View
            style={[
              s.sliderFill,
              {
                backgroundColor: colors.primary,
                width: `${customBankRatio * 100}%` as unknown as number,
              },
            ]}
          />
        </TouchableOpacity>
        {/* Quick select chips */}
        <View style={s.sliderChips}>
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <TouchableOpacity
              key={v}
              style={[s.sliderChip, customBankRatio === v && s.sliderChipActive]}
              onPress={() => setCustomBankRatio(v)}
            >
              <Text
                style={[
                  s.sliderChipText,
                  // eslint-disable-next-line react-native/no-inline-styles
                  {
                    color:
                      customBankRatio === v ? colors.primaryForeground : colors.mutedForeground,
                  },
                ]}
              >
                {Math.round(v * 100)}%
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Wrong ratio */}
      <Text style={s.fieldLabel}>错题占比: {Math.round(customWrongRatio * 100)}%</Text>
      <View style={s.sliderWrap}>
        <View style={[s.sliderTrack, { backgroundColor: colors.muted }]}>
          <View
            style={[
              s.sliderFill,
              {
                backgroundColor: colors.destructive,
                width: `${customWrongRatio * 100}%` as unknown as number,
              },
            ]}
          />
        </View>
        <View style={s.sliderChips}>
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <TouchableOpacity
              key={v}
              style={[s.sliderChip, customWrongRatio === v && s.sliderChipActive]}
              onPress={() => setCustomWrongRatio(v)}
            >
              <Text
                style={[
                  s.sliderChipText,
                  // eslint-disable-next-line react-native/no-inline-styles
                  {
                    color:
                      customWrongRatio === v ? colors.primaryForeground : colors.mutedForeground,
                  },
                ]}
              >
                {Math.round(v * 100)}%
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Action */}
      <TouchableOpacity
        style={[s.startBtn, s.customStartBtn, isGenerating && s.startBtnDisabled]}
        onPress={startCustomQuiz}
        disabled={isGenerating}
        activeOpacity={0.8}
      >
        {isGenerating ? (
          <ActivityIndicator size="small" color={colors.primaryForeground} />
        ) : (
          <>
            <SwordsIcon size={16} color={colors.primaryForeground} />
            <Text style={s.startBtnText}>开始自定义测验</Text>
          </>
        )}
      </TouchableOpacity>
      <View style={{ height: 24 }} />
    </ScrollView>
  );

  const renderBankTab = () => {
    if (bankLoading) {
      return (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={colors.mutedForeground} />
        </View>
      );
    }
    return (
      <FlatList
        style={s.tabContent}
        data={bankEntries}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={s.bankCard}>
            <View style={s.bankHeader}>
              <BookOpenIcon size={14} color={colors.mutedForeground} />
              <Text style={s.bankId} numberOfLines={1}>
                {item.questionId}
              </Text>
            </View>
            {item.tags.length > 0 && (
              <View style={s.bankTags}>
                {item.tags.map((tag) => (
                  <View key={tag} style={s.bankTag}>
                    <Text style={s.bankTagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            )}
            <View style={s.bankMeta}>
              <Text style={s.bankMetaText}>使用 {item.usageCount} 次</Text>
              <Text style={s.bankMetaText}>正确率 {(item.correctRate * 100).toFixed(0)}%</Text>
            </View>
          </View>
        )}
        contentContainerStyle={s.bankList}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Text style={s.emptyText}>题库暂无题目</Text>
          </View>
        }
      />
    );
  };

  // -- Main render ----------------------------------------------------------

  return (
    <SafeAreaView style={[s.container, { backgroundColor: colors.background }]} edges={["top"]}>
      {/* Header */}
      <View style={s.header}>
        <View style={[s.headerInner, { maxWidth: layout.centeredContentWidth }]}>
          <Text style={s.headerTitle}>测验</Text>
        </View>
      </View>

      {/* Sub-tabs */}
      <View style={s.subTabBar}>
        {SUB_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[s.subTab, activeTab === tab.key && s.subTabActive]}
            onPress={() => setActiveTab(tab.key)}
            activeOpacity={0.7}
          >
            <Text style={[s.subTabText, activeTab === tab.key && s.subTabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab content */}
      {activeTab === "daily" && renderDailyTab()}
      {activeTab === "custom" && renderCustomTab()}
      {activeTab === "bank" && renderBankTab()}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40 },

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
    headerTitle: {
      fontSize: fontSize.lg,
      fontWeight: fontWeight.semibold,
      color: colors.foreground,
    },

    // Sub-tabs
    subTabBar: {
      flexDirection: "row",
      paddingHorizontal: 16,
      paddingVertical: 10,
      gap: 20,
      borderBottomWidth: 0.5,
      borderBottomColor: colors.border,
    },
    subTab: {
      paddingVertical: 6,
      paddingHorizontal: 4,
      borderBottomWidth: 2,
      borderBottomColor: "transparent",
    },
    subTabActive: { borderBottomColor: colors.primary },
    subTabText: {
      fontSize: fontSize.sm,
      color: colors.mutedForeground,
      fontWeight: fontWeight.medium,
    },
    subTabTextActive: { color: colors.foreground, fontWeight: fontWeight.semibold },

    // Tab content
    tabContent: { flex: 1 },

    // Daily tab
    dailyCard: {
      margin: 16,
      padding: 20,
      backgroundColor: colors.card,
      borderRadius: radius.xl,
      borderWidth: 0.5,
      borderColor: colors.border,
    },
    dailyCardHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
    dailyCardTitleWrap: { flex: 1 },
    dailyCardTitle: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.semibold,
      color: colors.foreground,
    },
    dailyCardSubtitle: { fontSize: fontSize.sm, color: colors.mutedForeground, marginTop: 2 },
    startBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: radius.lg,
      paddingVertical: 12,
    },
    startBtnDisabled: { opacity: 0.5 },
    startBtnText: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.semibold,
      color: colors.primaryForeground,
    },

    // Stats
    statsGrid: { flexDirection: "row", gap: 10, paddingHorizontal: 16, marginBottom: 16 },
    statCard: {
      flex: 1,
      alignItems: "center",
      padding: 12,
      backgroundColor: colors.card,
      borderRadius: radius.xl,
      borderWidth: 0.5,
      borderColor: colors.border,
    },
    statValue: {
      fontSize: fontSize.xl,
      fontWeight: fontWeight.bold,
      color: colors.foreground,
      marginTop: 4,
    },
    statLabel: { fontSize: fontSize.xs, color: colors.mutedForeground, marginTop: 2 },

    // Sections
    sectionTitle: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.medium,
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      paddingHorizontal: 16,
      marginBottom: 10,
    },

    // Session cards
    sessionCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginHorizontal: 16,
      marginBottom: 8,
      padding: 14,
      backgroundColor: colors.card,
      borderRadius: radius.xl,
      borderWidth: 0.5,
      borderColor: colors.border,
    },
    sessionLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
    sessionInfo: {},
    sessionType: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.foreground },
    sessionDate: { fontSize: fontSize.xs, color: colors.mutedForeground, marginTop: 2 },
    sessionRight: { flexDirection: "row", alignItems: "center", gap: 8 },
    sessionScore: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.bold,
      color: colors.primary,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: radius.full,
    },
    statusBadgeText: { fontSize: 11, fontWeight: fontWeight.medium },
    emptyWrap: { paddingVertical: 40, alignItems: "center" },
    emptyText: { fontSize: fontSize.sm, color: colors.mutedForeground },

    // Custom form
    customFormContent: { paddingBottom: 8 },
    fieldLabel: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.medium,
      color: colors.mutedForeground,
      paddingHorizontal: 16,
      marginTop: 16,
      marginBottom: 8,
    },
    typeRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16 },
    typeChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: radius.full,
      borderWidth: 0.5,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    typeChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    typeChipText: { fontSize: fontSize.sm, color: colors.foreground },
    typeChipTextActive: { color: colors.primaryForeground, fontWeight: fontWeight.medium },
    fieldInput: {
      marginHorizontal: 16,
      height: 40,
      backgroundColor: colors.muted,
      borderRadius: radius.lg,
      paddingHorizontal: 12,
      fontSize: fontSize.sm,
      color: colors.foreground,
    },
    distRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
      paddingHorizontal: 16,
    },
    distItem: { alignItems: "center", gap: 4 },
    distLabel: { fontSize: fontSize.xs, color: colors.mutedForeground },
    distStepper: { flexDirection: "row", alignItems: "center", gap: 2 },
    distStepBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    distStepBtnText: { fontSize: 16, color: colors.foreground, lineHeight: 20 },
    distValue: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.medium,
      color: colors.foreground,
      minWidth: 20,
      textAlign: "center",
    },

    // Slider
    sliderWrap: { paddingHorizontal: 16, marginTop: 4 },
    sliderTrack: {
      height: 6,
      borderRadius: 3,
      overflow: "hidden",
    },
    sliderFill: { height: "100%", borderRadius: 3 },
    sliderChips: { flexDirection: "row", gap: 6, marginTop: 8, justifyContent: "space-between" },
    sliderChip: {
      flex: 1,
      paddingVertical: 6,
      borderRadius: radius.sm,
      backgroundColor: colors.muted,
      alignItems: "center",
    },
    sliderChipActive: { backgroundColor: colors.primary },
    sliderChipText: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },

    customStartBtn: { margin: 16, marginTop: 20 },

    // Bank tab
    bankList: { padding: 16 },
    bankCard: {
      padding: 14,
      backgroundColor: colors.card,
      borderRadius: radius.xl,
      borderWidth: 0.5,
      borderColor: colors.border,
      marginBottom: 8,
    },
    bankHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
    bankId: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.medium,
      color: colors.foreground,
      flex: 1,
    },
    bankTags: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginBottom: 8 },
    bankTag: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: radius.full,
      backgroundColor: colors.muted,
    },
    bankTagText: { fontSize: 11, color: colors.mutedForeground },
    bankMeta: { flexDirection: "row", gap: 16 },
    bankMetaText: { fontSize: fontSize.xs, color: colors.mutedForeground },
  });
