import { QuizGenerationError } from "@readany/core/stores/quiz-store";
import type { AIConfig } from "@readany/core/types";

/** True when the settings store has an active endpoint + model to talk to. */
export function hasUsableAIConfig(aiConfig: AIConfig | undefined | null): aiConfig is AIConfig {
  if (!aiConfig) return false;
  if (!aiConfig.activeModel) return false;
  return aiConfig.endpoints.some((endpoint) => endpoint.id === aiConfig.activeEndpointId);
}

/** Localized (zh) failure message for quiz generation. */
export function getQuizFailureMessage(err: unknown): string {
  if (err instanceof QuizGenerationError) {
    switch (err.code) {
      case "NO_AI_CONFIG":
        return "请先在设置中配置 AI 端点与模型。";
      case "NO_QUESTIONS":
        return "没有可出题的素材：请确认书籍已完成向量化，且最近有阅读记录。";
      case "GENERATION_FAILED":
        return "AI 生成题目失败，请稍后重试。";
    }
  }
  return err instanceof Error ? err.message : String(err);
}
