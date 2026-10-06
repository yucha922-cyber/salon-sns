/** Platform dispatch for content validation (pure; usable from client components). */
import { validateInstagram } from "./instagram/rules";
import { validateThreads } from "./threads/rules";
import type { ValidationInput, ValidationResult } from "./types";

export function validateForPlatform(input: ValidationInput): ValidationResult {
  return input.platform === "instagram" ? validateInstagram(input) : validateThreads(input);
}

export const PUBLISH_FORMAT_LABELS: Record<string, string> = {
  IG_IMAGE: "Instagram 画像",
  IG_CAROUSEL: "Instagram カルーセル",
  IG_REEL: "Instagram Reel",
  THREADS_TEXT: "Threads テキスト",
  THREADS_IMAGE: "Threads 画像付き",
  THREADS_VIDEO: "Threads 動画付き",
  THREADS_CAROUSEL: "Threads カルーセル",
};
