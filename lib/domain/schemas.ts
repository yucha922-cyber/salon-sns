/**
 * Runtime validation for everything that crosses a trust boundary
 * (form submissions, server actions). Never trust client input.
 */
import { z } from "zod";
import { CONTENT_TYPES, POST_STATUSES, SOCIAL_PLATFORMS } from "./types";

const text = (max: number) => z.string().trim().max(max, `${max}文字以内で入力してください`);
const list = (maxItems: number, maxLen = 120) =>
  z
    .array(z.string().trim().max(maxLen))
    .max(maxItems)
    .transform((items) => items.filter((v) => v.length > 0));

const handle = text(80);

export const brandBrainInputSchema = z.object({
  companyName: text(120),
  brandName: text(120),
  industry: z.object({
    key: z
      .string()
      .trim()
      .max(40)
      .regex(/^[a-z0-9_]+$/, "業種キーが不正です"),
    label: text(60),
  }),
  businessDescription: text(1000),
  website: text(300),
  social: z.object({
    instagram: handle,
    threads: handle,
    tiktok: handle,
    facebook: handle,
  }),
  locations: z
    .array(
      z.object({
        id: z
          .string()
          .regex(/^[A-Za-z0-9_-]{1,64}$/)
          .optional(),
        name: text(120).min(1, "店舗名を入力してください"),
        address: text(300),
      }),
    )
    .max(50),
  services: z
    .array(
      z.object({
        name: text(120).min(1, "サービス名を入力してください"),
        description: text(500),
        price: z.number().int().min(0).max(100_000_000).nullable(),
      }),
    )
    .max(50),
  serviceDescription: text(1000),
  strengths: list(20),
  features: list(20),
  competitors: z
    .array(z.object({ name: text(120).min(1), note: text(300) }))
    .max(20),
  differentiators: list(20),
  targetAudience: z.object({
    summary: text(500),
    ageRange: text(60),
    gender: text(60),
    occupation: text(200),
    painPoints: list(20),
    useCases: list(20),
  }),
  personas: z.array(z.object({ name: text(120).min(1), description: text(500) })).max(10),
  brandPersonality: list(12, 40),
  brandTone: list(12, 80),
  writingTone: text(500),
  marketingGoals: text(500),
  socialGoals: text(500),
  advertisingGoals: text(500),
  aiContext: text(2000),
});

export type BrandBrainInputParsed = z.infer<typeof brandBrainInputSchema>;

export const createOrganizationSchema = z.object({
  name: text(120).min(1, "会社名・屋号を入力してください"),
});

export const generatePostRequestSchema = z.object({
  platform: z.enum(SOCIAL_PLATFORMS),
  contentType: z.enum(CONTENT_TYPES),
  theme: text(300).min(1, "投稿テーマを入力してください"),
  target: text(200),
  goal: text(200),
  tone: text(200),
  notes: text(500),
});
export type GeneratePostRequest = z.infer<typeof generatePostRequestSchema>;

export const savePostSchema = z.object({
  platform: z.enum(SOCIAL_PLATFORMS),
  contentType: z.enum(CONTENT_TYPES),
  title: text(200).min(1, "タイトルを入力してください"),
  caption: text(2200),
  cta: text(200),
  hashtags: z.array(z.string().trim().max(60)).max(30),
  status: z.enum(POST_STATUSES),
  scheduledAt: z.string().datetime({ offset: true }).nullable(),
  generationInput: z.record(z.string(), z.string().max(500)).optional(),
});
export type SavePostRequest = z.infer<typeof savePostSchema>;

export const updatePostSchema = z.object({
  id: z.string().min(1),
  title: text(200).min(1),
  caption: text(2200),
  status: z.enum(POST_STATUSES),
  scheduledAt: z.string().datetime({ offset: true }).nullable(),
});

export const chatMessageSchema = z.object({
  conversationId: z.string().min(1).nullable(),
  content: text(4000).min(1, "メッセージを入力してください"),
});

export const authCredentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("メールアドレスの形式が正しくありません"),
  password: z.string().min(8, "パスワードは8文字以上で入力してください").max(72),
});

export const signUpSchema = authCredentialsSchema.extend({
  displayName: text(60).min(1, "お名前を入力してください"),
});
