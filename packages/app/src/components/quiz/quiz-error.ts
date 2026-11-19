import { QuizAnswerPersistenceError, QuizGenerationError } from "@readany/core/quiz/quiz-helpers";
import type { AIConfig } from "@readany/core/types";
import type { TFunction } from "i18next";

/** True when the settings store has an active endpoint + model to talk to. */
export function hasUsableAIConfig(aiConfig: AIConfig | undefined | null): aiConfig is AIConfig {
  if (!aiConfig) return false;
  if (!aiConfig.activeModel) return false;
  return aiConfig.endpoints.some((endpoint) => endpoint.id === aiConfig.activeEndpointId);
}

/**
 * Turn a quiz-generation failure into an actionable, localized message.
 * Falls back to the raw error message for unexpected failures.
 */
export function getQuizErrorMessage(err: unknown, t: TFunction): string {
  if (err instanceof QuizAnswerPersistenceError) {
    return t("quiz.errorAnswerSaveFailed", {
      defaultValue: "答案保存失败，请重试后再提交测验。",
    });
  }
  if (err instanceof QuizGenerationError) {
    switch (err.code) {
      case "NO_AI_CONFIG":
        return t("quiz.errorNoAIConfig", {
          defaultValue: "请先在设置中配置 AI 端点与模型。",
        });
      case "NO_QUESTIONS":
        return t("quiz.errorNoQuestions", {
          defaultValue: "没有可出题的素材：请确认书籍已完成向量化，且最近有阅读记录。",
        });
      case "GENERATION_FAILED":
        return t("quiz.errorGenerationFailed", {
          defaultValue: "AI 生成题目失败，请稍后重试。",
        });
    }
  }
  return err instanceof Error ? err.message : String(err);
}
