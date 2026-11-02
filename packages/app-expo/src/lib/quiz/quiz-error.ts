import { QuizGenerationError } from "@readany/core/stores/quiz-store";
import type { AIConfig } from "@readany/core/types";
import type { TFunction } from "i18next";

/** True when the settings store has an active endpoint + model to talk to. */
export function hasUsableAIConfig(aiConfig: AIConfig | undefined | null): aiConfig is AIConfig {
  if (!aiConfig) return false;
  if (!aiConfig.activeModel) return false;
  return aiConfig.endpoints.some((endpoint) => endpoint.id === aiConfig.activeEndpointId);
}

/** Turn a quiz-generation failure into a localized, actionable message. */
export function getQuizFailureMessage(err: unknown, t: TFunction): string {
  if (err instanceof QuizGenerationError) {
    switch (err.code) {
      case "NO_AI_CONFIG":
        return t("quiz.errorNoAIConfig", {
          defaultValue: "Configure an AI endpoint and model in Settings first.",
        });
      case "NO_QUESTIONS":
        return t("quiz.errorNoQuestions", {
          defaultValue:
            "No material to build questions from. Make sure the book is vectorized and you have recent reading activity.",
        });
      case "GENERATION_FAILED":
        return t("quiz.errorGenerationFailed", {
          defaultValue: "AI question generation failed. Please try again.",
        });
    }
  }
  return err instanceof Error ? err.message : String(err);
}
