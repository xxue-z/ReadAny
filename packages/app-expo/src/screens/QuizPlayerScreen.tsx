import {
  CheckCheckIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  OctagonXIcon,
} from "@/components/ui/Icon";
import { useResponsiveLayout } from "@/hooks/use-responsive-layout";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { type ThemeColors, fontSize, fontWeight, radius, useColors } from "@/styles/theme";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { answersEqual } from "@readany/core/quiz/scoring";
import { useQuizStore } from "@readany/core/stores/quiz-store";
import type { QuestionType } from "@readany/core/types/quiz";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextStyle,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_BADGES: Record<QuestionType, { labelKey: string; color: string }> = {
  single_choice: { labelKey: "quiz.badgeSingle", color: "#6366f1" },
  multi_choice: { labelKey: "quiz.badgeMulti", color: "#7c3aed" },
  true_false: { labelKey: "quiz.badgeTrueFalse", color: "#f59e0b" },
  short_answer: { labelKey: "quiz.badgeShort", color: "#10b981" },
};

function formatTimer(s: number): string {
  const min = Math.floor(s / 60);
  const sec = s % 60;
  return `${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function QuizPlayerScreen() {
  const colors = useColors();
  const s = makeStyles(colors);
  const layout = useResponsiveLayout();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "QuizPlayer">>();
  const { sessionId } = route.params;
  const { t } = useTranslation();

  // Store
  const {
    currentQuestions,
    currentQuestionIndex,
    isTaking,
    submitAnswer,
    completeQuiz,
    loadSession,
    saveElapsed,
  } = useQuizStore();

  // Local timer
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [loading, setLoading] = useState(true);
  const [showExplanation, setShowExplanation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Multi-choice picks are staged locally and only submitted on confirm, so the
  // user can select several options before grading.
  const [multiSelected, setMultiSelected] = useState<string[]>([]);
  const [shortAnswerText, setShortAnswerText] = useState("");

  // Load session on mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: loadSession/ nav stable from store
  useEffect(() => {
    setLoading(true);
    loadSession(sessionId)
      // Resume the clock from the time already spent on this session.
      .then(() => setElapsed(useQuizStore.getState().currentSession?.timeSpent ?? 0))
      .catch((err) => {
        console.error("[QuizPlayer] loadSession:", err);
        Alert.alert(
          t("quiz.errorTitle", "Error"),
          t("quiz.loadQuizFailed", "Failed to load the quiz."),
        );
        nav.goBack();
      })
      .finally(() => setLoading(false));
  }, [sessionId]);

  // Timer
  useEffect(() => {
    if (!isTaking) return;
    timerRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTaking]);

  // Checkpoint the elapsed time so a resumed quiz continues the clock instead
  // of restarting at 0.
  const elapsedRef = useRef(elapsed);
  useEffect(() => {
    elapsedRef.current = elapsed;
  }, [elapsed]);
  useEffect(() => {
    if (!isTaking) return;
    const id = setInterval(() => {
      void saveElapsed(elapsedRef.current);
    }, 15000);
    return () => {
      clearInterval(id);
      void saveElapsed(elapsedRef.current);
    };
  }, [isTaking, saveElapsed]);

  // Reset local answer UI when the question changes.
  // NOTE: this used to run on every render (no dependency array), which
  // immediately cleared the explanation the user had just revealed.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the question changes
  useEffect(() => {
    setShowExplanation(false);
    setMultiSelected([]);
    setShortAnswerText("");
  }, [currentQuestionIndex]);

  // Current question
  const question = currentQuestions[currentQuestionIndex] ?? null;
  const totalQuestions = currentQuestions.length;
  const progress = totalQuestions > 0 ? (currentQuestionIndex + 1) / totalQuestions : 0;

  // Check if current question has been answered
  const hasAnswered = question?.userAnswer !== undefined;

  // -- Handlers -------------------------------------------------------------

  const handleSelectSingle = useCallback(
    (key: string) => {
      if (!question || hasAnswered) return;
      submitAnswer(question.id, key);
      setShowExplanation(true);
    },
    [question, hasAnswered, submitAnswer],
  );

  const handleSelectMulti = useCallback(
    (key: string) => {
      if (!question || hasAnswered) return;
      setMultiSelected((prev) =>
        prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
      );
    },
    [question, hasAnswered],
  );

  const handleConfirmMulti = useCallback(() => {
    if (!question || hasAnswered || multiSelected.length === 0) return;
    submitAnswer(question.id, multiSelected);
    setShowExplanation(true);
  }, [question, hasAnswered, multiSelected, submitAnswer]);

  const handleGoPrev = useCallback(() => {
    if (currentQuestionIndex > 0) {
      useQuizStore.setState({ currentQuestionIndex: currentQuestionIndex - 1 });
    }
  }, [currentQuestionIndex]);

  const handleGoNext = useCallback(() => {
    if (currentQuestionIndex < totalQuestions - 1) {
      useQuizStore.setState({ currentQuestionIndex: currentQuestionIndex + 1 });
    }
  }, [currentQuestionIndex, totalQuestions]);

  const handleComplete = useCallback(async () => {
    const unanswered = currentQuestions.filter((q) => q.userAnswer === undefined);
    if (unanswered.length > 0) {
      Alert.alert(
        t("quiz.incompleteTitle", "Unfinished"),
        t("quiz.incompleteBody", {
          count: unanswered.length,
          defaultValue: `${unanswered.length} question(s) left unanswered. Submit anyway?`,
        }),
        [
          { text: t("quiz.keepAnswering", "Keep answering"), style: "cancel" },
          {
            text: t("quiz.submitAnyway", "Submit anyway"),
            onPress: async () => {
              setSubmitting(true);
              try {
                await completeQuiz(elapsed);
                nav.replace("QuizReport", { sessionId });
              } catch (err) {
                console.error("[QuizPlayer] completeQuiz:", err);
              } finally {
                setSubmitting(false);
              }
            },
          },
        ],
      );
      return;
    }

    setSubmitting(true);
    try {
      await completeQuiz(elapsed);
      nav.replace("QuizReport", { sessionId });
    } catch (err) {
      console.error("[QuizPlayer] completeQuiz:", err);
      Alert.alert(
        t("quiz.errorTitle", "Error"),
        t("quiz.submitFailed", "Failed to submit the quiz."),
      );
    } finally {
      setSubmitting(false);
    }
  }, [currentQuestions, completeQuiz, nav, sessionId, elapsed, t]);

  // -- Render ---------------------------------------------------------------

  if (loading) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: colors.background }]} edges={["top"]}>
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={colors.mutedForeground} />
        </View>
      </SafeAreaView>
    );
  }

  if (!question) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: colors.background }]} edges={["top"]}>
        <View style={s.emptyWrap}>
          <Text style={s.emptyText}>{t("quiz.noQuestionsToShow", "No questions to show")}</Text>
          <TouchableOpacity
            style={[s.showAnswerBtn, { borderColor: colors.primary, marginTop: 16 }]}
            onPress={() => {
              useQuizStore.getState().resetQuiz();
              nav.goBack();
            }}
          >
            <Text style={[s.showAnswerBtnText, { color: colors.primary }]}>
              {t("quiz.backToQuiz", "Back to quiz")}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const typeBadge = TYPE_BADGES[question.type];
  const correctAnswer = question.answer.correct;
  const isMultiChoice = question.type === "multi_choice";
  const selectedKeys = isMultiChoice
    ? hasAnswered
      ? ((question.userAnswer as string[]) ?? [])
      : multiSelected
    : question.userAnswer
      ? [question.userAnswer as string]
      : [];
  const isCorrect = question.isCorrect;

  return (
    <SafeAreaView style={[s.container, { backgroundColor: colors.background }]} edges={["top"]}>
      {/* Header */}
      <View style={s.header}>
        <View style={[s.headerInner, { maxWidth: layout.centeredContentWidth }]}>
          <TouchableOpacity style={s.backBtn} onPress={() => nav.goBack()}>
            <ChevronLeftIcon size={20} color={colors.foreground} />
          </TouchableOpacity>

          <View style={s.headerCenter}>
            {/* Progress bar */}
            <View style={s.progressBarBg}>
              <View
                style={[
                  s.progressBarFill,
                  { width: `${Math.round(progress * 100)}%` as unknown as number },
                ]}
              />
            </View>
            <Text style={s.progressText}>
              {currentQuestionIndex + 1} / {totalQuestions}
            </Text>
          </View>

          {/* Timer */}
          <View style={s.timerWrap}>
            <ClockIcon size={14} color={colors.mutedForeground} />
            <Text style={s.timerText}>{formatTimer(elapsed)}</Text>
          </View>
        </View>
      </View>

      {/* Type badge */}
      <View style={[s.headerInner, { paddingVertical: 8 }]}>
        <View style={[s.typeBadge, { backgroundColor: `${typeBadge.color}20` }]}>
          <Text style={[s.typeBadgeText, { color: typeBadge.color }]}>{t(typeBadge.labelKey)}</Text>
        </View>
      </View>

      {/* Question stem */}
      <ScrollView style={s.stemScroll} contentContainerStyle={s.stemContent}>
        <Text style={s.stemText}>{question.stem}</Text>

        {/* Answer section */}
        {question.type === "short_answer" ? (
          <View style={s.shortAnswerWrap}>
            {hasAnswered ? (
              <>
                <Text style={s.shortAnswerPlaceholder}>
                  {t("quiz.yourAnswer", "Your answer")}: {String(question.userAnswer ?? "")}
                </Text>
                <Text style={[s.shortAnswerPlaceholder, { marginTop: 10 }]}>
                  {t("quiz.referenceAnswer", "Reference answer")}: {String(correctAnswer)}
                </Text>
                <Text style={[s.shortAnswerPlaceholder, { marginTop: 10, opacity: 0.7 }]}>
                  {t("quiz.shortAnswerManual", "Short answers are graded manually.")}
                </Text>
              </>
            ) : (
              <>
                <TextInput
                  value={shortAnswerText}
                  onChangeText={setShortAnswerText}
                  placeholder={t("quiz.shortAnswerPlaceholder", "Type your answer...")}
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                  style={{
                    minHeight: 96,
                    borderWidth: 1,
                    borderRadius: 8,
                    borderColor: colors.border,
                    color: colors.foreground,
                    padding: 12,
                    fontSize: 14,
                    textAlignVertical: "top",
                  }}
                />
                <TouchableOpacity
                  style={[
                    s.showAnswerBtn,
                    { borderColor: colors.primary, opacity: shortAnswerText.trim() ? 1 : 0.5 },
                  ]}
                  disabled={!shortAnswerText.trim()}
                  onPress={() => {
                    submitAnswer(question.id, shortAnswerText.trim());
                    setShowExplanation(true);
                  }}
                >
                  <Text style={[s.showAnswerBtnText, { color: colors.primary }]}>
                    {t("quiz.submitAnswer", "Submit answer")}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : question.type === "true_false" ? (
          <View style={s.optionsWrap}>
            {[
              { key: "true", label: `✓ ${t("quiz.trueLabel", "True")}` },
              { key: "false", label: `✗ ${t("quiz.falseLabel", "False")}` },
            ].map((opt) => {
              const isSelected = selectedKeys.includes(opt.key);
              const isCorrectOpt = answersEqual(question, String(correctAnswer), opt.key);
              let optStyle: StyleProp<ViewStyle> = s.optionBtn;
              let optTextStyle: StyleProp<TextStyle> = s.optionText;

              if (hasAnswered && isSelected) {
                if (isCorrect) {
                  optStyle = [s.optionBtn, s.optionCorrect];
                  optTextStyle = [s.optionText, s.optionTextCorrect];
                } else {
                  optStyle = [s.optionBtn, s.optionWrong];
                  optTextStyle = [s.optionText, s.optionTextWrong];
                }
              } else if (hasAnswered && isCorrectOpt) {
                optStyle = [s.optionBtn, s.optionCorrect];
                optTextStyle = [s.optionText, s.optionTextCorrect];
              }

              return (
                <TouchableOpacity
                  key={opt.key}
                  style={optStyle}
                  onPress={() => handleSelectSingle(opt.key)}
                  disabled={hasAnswered}
                  activeOpacity={0.7}
                >
                  <View style={s.optionRow}>
                    <Text style={optTextStyle}>{opt.label}</Text>
                    {hasAnswered &&
                      isSelected &&
                      (isCorrect ? (
                        <CheckIcon size={16} color="#10b981" />
                      ) : (
                        <OctagonXIcon size={16} color="#ef4444" />
                      ))}
                    {hasAnswered && !isSelected && isCorrectOpt && (
                      <CheckIcon size={16} color="#10b981" />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          /* single_choice / multi_choice */
          <View style={s.optionsWrap}>
            {question.options?.map((opt) => {
              const isSelected = selectedKeys.includes(opt.key);
              const isCorrectOpt = Array.isArray(correctAnswer)
                ? correctAnswer.includes(opt.key)
                : correctAnswer === opt.key;

              let optStyle: StyleProp<ViewStyle> = s.optionBtn;
              let optTextStyle: StyleProp<TextStyle> = s.optionText;

              if (hasAnswered && isSelected) {
                if (isCorrectOpt) {
                  optStyle = [s.optionBtn, s.optionCorrect];
                  optTextStyle = [s.optionText, s.optionTextCorrect];
                } else {
                  optStyle = [s.optionBtn, s.optionWrong];
                  optTextStyle = [s.optionText, s.optionTextWrong];
                }
              } else if (hasAnswered && isCorrectOpt) {
                optStyle = [s.optionBtn, s.optionCorrect];
                optTextStyle = [s.optionText, s.optionTextCorrect];
              }

              return (
                <TouchableOpacity
                  key={opt.key}
                  style={optStyle}
                  onPress={() =>
                    isMultiChoice ? handleSelectMulti(opt.key) : handleSelectSingle(opt.key)
                  }
                  disabled={hasAnswered}
                  activeOpacity={0.7}
                >
                  <View style={s.optionRow}>
                    <View style={s.optionLabelWrap}>
                      <View
                        style={[
                          s.optionDot,
                          isSelected && {
                            backgroundColor: colors.primary,
                            borderColor: colors.primary,
                          },
                        ]}
                      >
                        {isSelected && (
                          <View
                            style={[s.optionDotFill, { backgroundColor: colors.primaryForeground }]}
                          />
                        )}
                      </View>
                      <Text style={optTextStyle}>
                        {opt.key}. {opt.content}
                      </Text>
                    </View>
                    {hasAnswered &&
                      isSelected &&
                      (isCorrectOpt ? (
                        <CheckIcon size={16} color="#10b981" />
                      ) : (
                        <OctagonXIcon size={16} color="#ef4444" />
                      ))}
                    {hasAnswered && !isSelected && isCorrectOpt && (
                      <CheckIcon size={16} color="#10b981" />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
            {isMultiChoice && !hasAnswered && selectedKeys.length > 0 && (
              <TouchableOpacity style={s.confirmMultiBtn} onPress={handleConfirmMulti}>
                <CheckCheckIcon size={16} color={colors.primaryForeground} />
                <Text style={s.confirmMultiText}>
                  {t("quiz.confirmSelection", {
                    count: selectedKeys.length,
                    defaultValue: `Confirm selection (${selectedKeys.length})`,
                  })}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Re-open the explanation for a question answered earlier (resume/revisit). */}
        {hasAnswered && question.type !== "short_answer" && !showExplanation && (
          <TouchableOpacity
            style={[s.showAnswerBtn, { borderColor: colors.border, marginTop: 12 }]}
            onPress={() => setShowExplanation(true)}
          >
            <Text style={[s.showAnswerBtnText, { color: colors.mutedForeground }]}>
              {t("quiz.showExplanation", "查看解析")}
            </Text>
          </TouchableOpacity>
        )}

        {/* Explanation (post-answer). Short answers get the reference answer in the
            answer section instead of a right/wrong badge. */}
        {hasAnswered && showExplanation && question.type !== "short_answer" && (
          <View style={s.explanationWrap}>
            <View
              style={[
                s.explanationBadge,
                { backgroundColor: isCorrect ? "#10b98120" : "#ef444420" },
              ]}
            >
              <Text style={[s.explanationBadgeText, { color: isCorrect ? "#10b981" : "#ef4444" }]}>
                {isCorrect ? t("quiz.answerCorrect") : t("quiz.answerIncorrect")}
              </Text>
            </View>
            <Text style={s.explanationLabel}>{t("quiz.explanation")}</Text>
            <Text style={s.explanationText}>{question.answer.explanation}</Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom navigation */}
      <View style={s.bottomNav}>
        <View style={[s.bottomNavInner, { maxWidth: layout.centeredContentWidth }]}>
          <TouchableOpacity
            style={[s.navBtn, currentQuestionIndex === 0 && s.navBtnDisabled]}
            onPress={handleGoPrev}
            disabled={currentQuestionIndex === 0}
          >
            <ChevronLeftIcon
              size={16}
              color={currentQuestionIndex === 0 ? colors.mutedForeground : colors.foreground}
            />
            <Text
              style={[
                s.navBtnText,
                currentQuestionIndex === 0 && { color: colors.mutedForeground },
              ]}
            >
              {t("quiz.prevQuestion", "Previous")}
            </Text>
          </TouchableOpacity>

          {/* Completing is only offered on the last question: since answers no longer
              auto-advance, a submit button mid-quiz would end the quiz while the
              user just wanted to move on. */}
          {currentQuestionIndex >= totalQuestions - 1 && (
            <TouchableOpacity
              style={[s.completeBtn, submitting && s.navBtnDisabled]}
              onPress={handleComplete}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Text style={s.completeBtnText}>{t("quiz.complete", "Finish Quiz")}</Text>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[s.navBtn, currentQuestionIndex >= totalQuestions - 1 && s.navBtnDisabled]}
            onPress={handleGoNext}
            disabled={currentQuestionIndex >= totalQuestions - 1}
          >
            <Text
              style={[
                s.navBtnText,
                currentQuestionIndex >= totalQuestions - 1 && { color: colors.mutedForeground },
              ]}
            >
              {t("quiz.nextQuestion", "Next")}
            </Text>
            <ChevronRightIcon
              size={16}
              color={
                currentQuestionIndex >= totalQuestions - 1
                  ? colors.mutedForeground
                  : colors.foreground
              }
            />
          </TouchableOpacity>
        </View>
      </View>
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
    emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
    emptyText: { fontSize: fontSize.sm, color: colors.mutedForeground },

    // Header
    header: {
      borderBottomWidth: 0.5,
      borderBottomColor: colors.border,
      paddingVertical: 8,
    },
    headerInner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
    },
    backBtn: { padding: 4 },
    headerCenter: { flex: 1, marginHorizontal: 12 },
    progressBarBg: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.muted,
      overflow: "hidden",
    },
    progressBarFill: {
      height: "100%",
      borderRadius: 3,
      backgroundColor: colors.primary,
    },
    progressText: {
      fontSize: fontSize.xs,
      color: colors.mutedForeground,
      textAlign: "center",
      marginTop: 4,
    },
    timerWrap: { flexDirection: "row", alignItems: "center", gap: 4 },
    timerText: {
      fontSize: fontSize.sm,
      color: colors.mutedForeground,
      fontVariant: ["tabular-nums"],
    },

    // Type badge
    typeBadge: {
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: radius.full,
      marginLeft: 16,
    },
    typeBadgeText: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },

    // Stem
    stemScroll: { flex: 1 },
    stemContent: { padding: 16, paddingBottom: 32 },
    stemText: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.medium,
      color: colors.foreground,
      lineHeight: 26,
      marginBottom: 24,
    },

    // Options
    optionsWrap: { gap: 10 },
    optionBtn: {
      padding: 16,
      borderRadius: radius.xl,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    optionCorrect: {
      borderColor: "#10b981",
      backgroundColor: "#10b98110",
    },
    optionWrong: {
      borderColor: "#ef4444",
      backgroundColor: "#ef444410",
    },
    optionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    optionLabelWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flex: 1,
    },
    optionDot: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: colors.mutedForeground,
      alignItems: "center",
      justifyContent: "center",
    },
    optionDotFill: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    optionText: { fontSize: fontSize.sm, color: colors.foreground, flex: 1 },
    optionTextCorrect: { color: "#10b981", fontWeight: fontWeight.semibold },
    optionTextWrong: { color: "#ef4444", fontWeight: fontWeight.semibold },

    // Multi-choice confirm
    confirmMultiBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginTop: 12,
      padding: 12,
      borderRadius: radius.lg,
      backgroundColor: colors.primary,
    },
    confirmMultiText: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: colors.primaryForeground,
    },

    // Short answer
    shortAnswerWrap: {
      padding: 16,
      borderRadius: radius.xl,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
    },
    shortAnswerPlaceholder: {
      fontSize: fontSize.sm,
      color: colors.mutedForeground,
      textAlign: "center",
      marginBottom: 12,
    },
    showAnswerBtn: {
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: radius.lg,
      borderWidth: 1,
    },
    showAnswerBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },

    // Explanation
    explanationWrap: {
      marginTop: 24,
      padding: 16,
      borderRadius: radius.xl,
      backgroundColor: colors.muted,
    },
    explanationBadge: {
      alignSelf: "flex-start",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radius.full,
      marginBottom: 8,
    },
    explanationBadgeText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
    explanationLabel: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: colors.foreground,
      marginBottom: 6,
    },
    explanationText: {
      fontSize: fontSize.sm,
      color: colors.mutedForeground,
      lineHeight: 22,
    },

    // Bottom nav
    bottomNav: {
      borderTopWidth: 0.5,
      borderTopColor: colors.border,
      paddingVertical: 12,
      paddingBottom: 20,
    },
    bottomNavInner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
    },
    navBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: radius.lg,
    },
    navBtnDisabled: { opacity: 0.4 },
    navBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.foreground },
    completeBtn: {
      paddingHorizontal: 28,
      paddingVertical: 10,
      borderRadius: radius.lg,
      backgroundColor: colors.primary,
    },
    completeBtnText: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: colors.primaryForeground,
    },
  });
