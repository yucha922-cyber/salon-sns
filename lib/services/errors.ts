import "server-only";
import { AIProviderError } from "@/lib/ai/provider";
import { RepositoryError } from "@/lib/data/repository";

/** Maps internal errors to safe, user-facing Japanese messages (no internals leak). */
export function toUserMessage(error: unknown, fallback = "処理に失敗しました。時間をおいて再度お試しください"): string {
  if (error instanceof AIProviderError) {
    switch (error.kind) {
      case "rate_limited":
        return "AIへのリクエストが混み合っています。少し待ってから再度お試しください";
      case "auth":
        return "AIプロバイダーの設定に問題があります（APIキーを確認してください）";
      case "refusal":
        return "この内容ではAIが回答できませんでした。表現を変えて再度お試しください";
      case "invalid_output":
        return "AIの出力を読み取れませんでした。もう一度生成してください";
      default:
        return "AIサービスに接続できませんでした。時間をおいて再度お試しください";
    }
  }
  if (error instanceof RepositoryError) {
    if (error.code === "forbidden") return "この操作を行う権限がありません";
    if (error.code === "not_found") return "対象のデータが見つかりませんでした";
  }
  console.error(error);
  return fallback;
}
