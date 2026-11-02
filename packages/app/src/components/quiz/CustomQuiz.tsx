/**
 * CustomQuiz — configurable quiz creation form.
 */
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useLibraryStore } from "@/stores/library-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useQuizStore } from "@readany/core/stores/quiz-store";
import type { QuestionType, QuizConfig } from "@readany/core/types";
import { Play, Settings2 } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getQuizErrorMessage, hasUsableAIConfig } from "./quiz-error";

const QUESTION_TYPES: { key: QuestionType; label: string }[] = [
  { key: "single_choice", label: "quiz.singleChoice" },
  { key: "multi_choice", label: "quiz.multiChoice" },
  { key: "true_false", label: "quiz.trueFalse" },
  { key: "short_answer", label: "quiz.shortAnswer" },
];

export function CustomQuiz() {
  const { t } = useTranslation();
  const books = useLibraryStore((s) => s.books);
  const startQuiz = useQuizStore((s) => s.startQuiz);
  const isGenerating = useQuizStore((s) => s.isGenerating);

  const [quizType, setQuizType] = useState<QuizConfig["type"]>("custom");
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState<1 | 2 | 3>(2);
  const [bankRatio, setBankRatio] = useState(0.3);
  const [wrongRatio, setWrongRatio] = useState(0.1);
  const [selectedBookId, setSelectedBookId] = useState<string>("all");
  const [rangeDays, setRangeDays] = useState<number>(30);
  const [typeDistribution, setTypeDistribution] = useState<Partial<Record<QuestionType, number>>>(
    {},
  );

  const handleTypeChange = (type: QuestionType, count: number) => {
    setTypeDistribution((prev) => ({
      ...prev,
      [type]: count > 0 ? count : undefined,
    }));
  };

  // Preset the reading window when the quiz type changes (7 / 30 / 90 days).
  const handleQuizTypeChange = (value: QuizConfig["type"]) => {
    setQuizType(value);
    if (value === "daily") setRangeDays(7);
    else if (value === "monthly") setRangeDays(30);
    else if (value === "quarterly") setRangeDays(90);
  };

  const handleStart = useCallback(async () => {
    try {
      const { aiConfig } = useSettingsStore.getState();
      if (!hasUsableAIConfig(aiConfig)) {
        toast.error(
          t("quiz.errorNoAIConfig", "Configure an AI endpoint and model in Settings first."),
        );
        return;
      }

      const now = Date.now();
      const config: QuizConfig = {
        type: quizType,
        questionCount,
        difficulty,
        bankRatio,
        wrongRatio,
        bookIds: selectedBookId && selectedBookId !== "all" ? [selectedBookId] : undefined,
        typeDistribution: Object.keys(typeDistribution).length > 0 ? typeDistribution : undefined,
        // Without a range the generator would quiz the entire reading history,
        // so "monthly"/"quarterly" would behave like "all time".
        timeRange:
          rangeDays > 0 ? { start: now - rangeDays * 24 * 60 * 60 * 1000, end: now } : undefined,
      };

      // Pass the active AIConfig through, otherwise the generator cannot call
      // the model and returns zero questions.
      await startQuiz(config, aiConfig);
    } catch (err) {
      console.error("[CustomQuiz] Failed to start quiz:", err);
      toast.error(getQuizErrorMessage(err, t));
    }
  }, [
    quizType,
    questionCount,
    difficulty,
    bankRatio,
    wrongRatio,
    selectedBookId,
    rangeDays,
    typeDistribution,
    startQuiz,
    t,
  ]);

  return (
    <div className="flex flex-col gap-6 py-2">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Settings2 className="h-5 w-5 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">{t("quiz.customConfig")}</span>
      </div>

      {/* Quiz type */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">{t("quiz.quizType")}</span>
        <Select
          value={quizType}
          onValueChange={(v) => handleQuizTypeChange(v as QuizConfig["type"])}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">{t("quiz.daily")}</SelectItem>
            <SelectItem value="monthly">{t("quiz.monthly")}</SelectItem>
            <SelectItem value="quarterly">{t("quiz.quarterly")}</SelectItem>
            <SelectItem value="custom">{t("quiz.custom")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Reading window */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          {t("quiz.timeRange", "Reading window")}
        </span>
        <Select value={String(rangeDays)} onValueChange={(v) => setRangeDays(Number(v))}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">{t("quiz.range7", "Last 7 days")}</SelectItem>
            <SelectItem value="30">{t("quiz.range30", "Last 30 days")}</SelectItem>
            <SelectItem value="90">{t("quiz.range90", "Last 90 days")}</SelectItem>
            <SelectItem value="0">{t("quiz.rangeAll", "All reading history")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Book scope */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">{t("quiz.bookScope")}</span>
        <Select value={selectedBookId} onValueChange={setSelectedBookId}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("quiz.allBooks")}</SelectItem>
            {books.map((book) => (
              <SelectItem key={book.id} value={String(book.id)}>
                {book.meta.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Question count */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="quiz-question-count" className="text-xs font-medium text-muted-foreground">
          {t("quiz.questionCount")}: {questionCount}
        </label>
        <Input
          id="quiz-question-count"
          type="number"
          min={3}
          max={50}
          value={questionCount}
          onChange={(e) => setQuestionCount(Math.max(3, Math.min(50, Number(e.target.value) || 3)))}
          className="w-32"
        />
      </div>

      {/* Difficulty */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          {t("quiz.difficulty")}: {difficultyLabel(difficulty)}
        </span>
        <div className="flex gap-1">
          {([1, 2, 3] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDifficulty(d)}
              className={`h-9 w-12 rounded-md border text-sm font-medium transition-colors ${
                difficulty === d
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {d === 1 ? t("quiz.easy") : d === 2 ? t("quiz.medium") : t("quiz.hard")}
            </button>
          ))}
        </div>
      </div>

      {/* Type distribution */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          {t("quiz.typeDistribution")}
        </span>
        <div className="grid grid-cols-2 gap-2">
          {QUESTION_TYPES.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-2">
              <span className="w-24 text-xs text-muted-foreground">{t(label)}</span>
              <Input
                type="number"
                min={0}
                max={questionCount}
                value={typeDistribution[key] ?? 0}
                onChange={(e) => handleTypeChange(key, Math.max(0, Number(e.target.value) || 0))}
                className="h-8 w-16 text-xs"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Bank ratio */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          {t("quiz.bankRatio")}: {Math.round(bankRatio * 100)}%
        </span>
        <Slider
          value={[bankRatio]}
          onValueChange={([v]) => setBankRatio(v)}
          min={0}
          max={1}
          step={0.1}
          className="w-48"
        />
      </div>

      {/* Wrong ratio */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          {t("quiz.wrongRatio")}: {Math.round(wrongRatio * 100)}%
        </span>
        <Slider
          value={[wrongRatio]}
          onValueChange={([v]) => setWrongRatio(v)}
          min={0}
          max={1}
          step={0.1}
          className="w-48"
        />
      </div>

      {/* Start button */}
      <Button onClick={handleStart} disabled={isGenerating} className="w-fit gap-2" size="lg">
        {isGenerating ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <Play className="h-4 w-4" />
        )}
        {isGenerating ? t("quiz.generating") : t("quiz.start")}
      </Button>
    </div>
  );
}

function difficultyLabel(d: number): string {
  if (d === 1) return "⭐";
  if (d === 2) return "⭐⭐";
  return "⭐⭐⭐";
}
