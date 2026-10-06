/**
 * Runtime validation for everything that crosses a trust boundary
 * (form submissions, server actions). Never trust client input.
 */
import { z } from "zod";
import { ACCOUNT_GOALS, CONTENT_TYPES, HQ_CAMPAIGN_STATUSES, POST_STATUSES, SOCIAL_PLATFORMS } from "./types";

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
  accountId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).nullable().optional(),
  locationId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).nullable().optional(),
  hqCampaignId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).nullable().optional(),
});
export type SavePostRequest = z.infer<typeof savePostSchema>;

export const updatePostSchema = z.object({
  id: z.string().min(1),
  title: text(200).min(1),
  caption: text(2200),
  cta: text(200).optional(),
  hashtags: z.array(z.string().trim().max(60)).max(30).optional(),
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

// ---------------------------------------------------------------------------
// Account strategy / location customization / HQ templates
// ---------------------------------------------------------------------------
const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "IDが不正です");

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "時刻はHH:MM形式で入力してください");

export const accountStrategySchema = z.object({
  targetAudience: text(500),
  persona: text(500),
  kpiTargets: z
    .array(z.object({ metric: text(80).min(1, "KPI名を入力してください"), target: z.number().min(0).max(1_000_000_000).nullable(), unit: text(20) }))
    .max(10),
  contentPillars: list(12, 60),
  postsPerWeek: z.number().int().min(0).max(50),
  postingFrequencyNote: text(200),
  preferredPostingDays: z.array(z.number().int().min(0).max(6)).max(7).transform((d) => [...new Set(d)].sort()),
  preferredPostingTimes: z.array(timeSchema).max(6).transform((t) => [...new Set(t)].sort()),
  cta: text(300),
  tone: text(300),
  notes: text(1000),
});

export const snsAccountInputSchema = z.object({
  platform: z.enum(SOCIAL_PLATFORMS),
  handle: text(80).min(1, "アカウントIDを入力してください"),
  displayName: text(80),
  locationId: idSchema.nullable(),
  goal: z.enum(ACCOUNT_GOALS),
  customGoal: text(60),
  active: z.boolean(),
  strategy: accountStrategySchema,
});

export const contentPillarInputSchema = z.object({
  goal: z.enum(ACCOUNT_GOALS),
  label: text(60).min(1, "柱の名前を入力してください"),
  description: text(200),
});

export const locationProfileInputSchema = z.object({
  area: text(120),
  demographics: text(500),
  featuredServices: list(20),
  staff: z.array(z.object({ name: text(60).min(1, "スタッフ名を入力してください"), role: text(60), specialty: text(200) })).max(30),
  offers: list(10, 200),
  localKeywords: list(20, 60),
});

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付の形式が正しくありません").nullable();

export const hqCampaignInputSchema = z
  .object({
    name: text(120).min(1, "キャンペーン名を入力してください"),
    status: z.enum(HQ_CAMPAIGN_STATUSES),
    goal: z.enum(ACCOUNT_GOALS),
    startsOn: dateSchema,
    endsOn: dateSchema,
    sharedTheme: text(500).min(1, "共通テーマを入力してください"),
    contentDirections: list(10, 200),
    requiredMessages: list(10, 200),
    optionalMessages: list(10, 200),
    cta: text(200),
    creative: z.object({ headline: text(120), body: text(1000), visual: text(300) }),
    localizationRules: list(15, 200),
    targetLocationIds: z.array(idSchema).max(200),
    targetPlatforms: z.array(z.enum(SOCIAL_PLATFORMS)).max(4),
  })
  .refine((v) => !v.startsOn || !v.endsOn || v.endsOn >= v.startsOn, {
    message: "終了日は開始日以降にしてください",
    path: ["endsOn"],
  });

export const planItemInputSchema = z.object({
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付の形式が正しくありません"),
  scheduledTime: timeSchema,
  platform: z.enum(SOCIAL_PLATFORMS),
  contentType: z.enum(CONTENT_TYPES),
  theme: text(200).min(1, "テーマを入力してください"),
  hook: text(300),
  summary: text(1000),
  goal: z.enum(ACCOUNT_GOALS),
  target: text(300),
  contentPillar: text(60),
  funnelStage: text(30),
  cta: text(300),
});

export const generateMonthlyPlanSchema = z.object({
  accountId: idSchema,
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "対象月が正しくありません"),
  hqCampaignId: idSchema.nullable(),
  notes: text(500),
});
