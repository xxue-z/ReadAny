import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuizStore } from "@readany/core/stores";
/**
 * QuizPage — main quiz entry point with 3 sub-tabs.
 * Shows QuizPlayer when actively taking a quiz, and QuizReport on completion.
 */
import { Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { CustomQuiz } from "./CustomQuiz";
import { DailyQuiz } from "./DailyQuiz";
import { QuestionBank } from "./QuestionBank";
import { QuizPlayer } from "./QuizPlayer";
import { QuizReport } from "./QuizReport";

export function QuizPage() {
  const { t } = useTranslation();
  const isTaking = useQuizStore((s) => s.isTaking);
  const isGenerating = useQuizStore((s) => s.isGenerating);
  const report = useQuizStore((s) => s.report);
  const currentSession = useQuizStore((s) => s.currentSession);
  const cancelGeneration = useQuizStore((s) => s.cancelGeneration);

  // -------------------------------------------------------------------
  // QuizReport — show after completing a quiz
  // -------------------------------------------------------------------

  if (report && currentSession) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-11 shrink-0 items-center border-b px-4">
          <h2 className="text-sm font-semibold text-foreground">{t("quiz.title")}</h2>
        </div>
        <div className="flex-1 overflow-hidden">
          <QuizReport />
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------
  // QuizPlayer — actively answering questions
  // -------------------------------------------------------------------

  if (isTaking) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-11 shrink-0 items-center border-b px-4">
          <h2 className="text-sm font-semibold text-foreground">{t("quiz.title")}</h2>
        </div>
        <div className="flex-1 overflow-hidden">
          <QuizPlayer />
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------
  // Generating — LLM is building questions
  // -------------------------------------------------------------------

  if (isGenerating) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-11 shrink-0 items-center border-b px-4">
          <h2 className="text-sm font-semibold text-foreground">{t("quiz.title")}</h2>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-8 animate-spin" />
          <p className="text-sm">{t("quiz.generating")}</p>
          <Button variant="outline" size="sm" className="mt-2 gap-1.5" onClick={cancelGeneration}>
            <X className="size-3.5" />
            {t("quiz.cancelGeneration", "取消生成")}
          </Button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------
  // Default — quiz setup tabs
  // -------------------------------------------------------------------

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-11 shrink-0 items-center border-b px-4">
        <h2 className="text-sm font-semibold text-foreground">{t("quiz.title")}</h2>
      </div>

      {/* Content with tabs */}
      <div className="flex-1 overflow-hidden p-4">
        <Tabs defaultValue="daily" className="flex h-full flex-col">
          <TabsList className="w-fit shrink-0">
            <TabsTrigger value="daily">{t("quiz.daily")}</TabsTrigger>
            <TabsTrigger value="custom">{t("quiz.custom")}</TabsTrigger>
            <TabsTrigger value="bank">{t("quiz.questionBank")}</TabsTrigger>
          </TabsList>

          <TabsContent value="daily" className="flex-1 overflow-auto">
            <DailyQuiz />
          </TabsContent>

          <TabsContent value="custom" className="flex-1 overflow-auto">
            <CustomQuiz />
          </TabsContent>

          <TabsContent value="bank" className="flex-1 overflow-auto">
            <QuestionBank />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
