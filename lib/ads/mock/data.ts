/**
 * NAORU demo ad account for the MockAdsProvider (deterministic, relative to
 * "today" so the 30-day history never goes stale). Patterns built in:
 *   A  渋谷 Hook「その肩こり、揉むだけ…」 → creative fatigue (Frequency↑ CTR↓ CPC↑, CVR flat)
 *   B  渋谷 Hook「仕事終わり、首肩が限界…」 → strong challenger (running A/B test)
 *   D  池袋「昼休み30分で整える」          → winning creative
 *   E  池袋「腰痛の原因は座り方」          → CTR fine but LP CVR collapsed (LP problem, not creative)
 *   F  横浜 産後骨盤                       → campaign under-delivers its budget
 *   G/H/I 採用（EMPLOYMENT）               → completed angle test (G employee story beat H training)
 */
import { createHash } from "node:crypto";
import type { AdDailyMetrics } from "../types";

export const MOCK_ACCOUNT = {
  externalAccountId: "act_120000000000001",
  name: "NAORU整体 広告アカウント",
  currency: "JPY",
  timezone: "Asia/Tokyo",
  accountStatus: "1",
  businessId: "100000000000009",
  businessName: "NAORU Holdings",
};

export interface MockCampaignDef {
  externalId: string;
  key: "shibuya" | "ikebukuro" | "yokohama" | "recruit";
  name: string;
  objective: string;
  dailyBudget: number;
  specialAdCategories: string[];
  conversionEvent: "Schedule" | "SubmitApplication";
  landingPageUrl: string;
  locationIndex: number | null;
}

export interface MockAdSetDef {
  externalId: string;
  campaignExternalId: string;
  name: string;
  audienceLabel: string;
}

export interface MockAdDef {
  key: string;
  externalId: string;
  creativeExternalId: string;
  adSetExternalId: string;
  campaignExternalId: string;
  name: string;
  headline: string;
  body: string;
  cta: string;
  angle: string;
  hook: string;
  format: "image" | "video";
  /** days before "today" the ad started delivering */
  startedDaysAgo: number;
  /** paused N days ago (null = active) */
  pausedDaysAgo: number | null;
  profile: "fatigue" | "challenger" | "steady" | "winner" | "lp_drop" | "underdeliver" | "recruit_winner" | "recruit_loser" | "recruit_steady";
}

export const MOCK_CAMPAIGNS: MockCampaignDef[] = [
  { externalId: "120000000000101", key: "shibuya", name: "渋谷院 新規集客", objective: "OUTCOME_LEADS", dailyBudget: 9000, specialAdCategories: [], conversionEvent: "Schedule", landingPageUrl: "https://naoru.example.jp/shibuya/first", locationIndex: 0 },
  { externalId: "120000000000102", key: "ikebukuro", name: "池袋院 新規集客", objective: "OUTCOME_LEADS", dailyBudget: 6000, specialAdCategories: [], conversionEvent: "Schedule", landingPageUrl: "https://naoru.example.jp/ikebukuro/first", locationIndex: 1 },
  { externalId: "120000000000103", key: "yokohama", name: "横浜院 産後骨盤ケア", objective: "OUTCOME_LEADS", dailyBudget: 5000, specialAdCategories: [], conversionEvent: "Schedule", landingPageUrl: "https://naoru.example.jp/yokohama/postpartum", locationIndex: 2 },
  { externalId: "120000000000104", key: "recruit", name: "本部 セラピスト採用", objective: "OUTCOME_LEADS", dailyBudget: 4000, specialAdCategories: ["EMPLOYMENT"], conversionEvent: "SubmitApplication", landingPageUrl: "https://naoru.example.jp/careers", locationIndex: null },
];

export const MOCK_AD_SETS: MockAdSetDef[] = [
  { externalId: "120000000000201", campaignExternalId: "120000000000101", name: "30代女性 渋谷勤務 デスクワーク", audienceLabel: "30代女性 / 渋谷勤務 / デスクワーク" },
  { externalId: "120000000000202", campaignExternalId: "120000000000101", name: "渋谷 半径3km 広域", audienceLabel: "渋谷周辺 25〜44歳" },
  { externalId: "120000000000203", campaignExternalId: "120000000000102", name: "池袋 オフィスワーカー", audienceLabel: "池袋勤務の会社員 20〜40代" },
  { externalId: "120000000000204", campaignExternalId: "120000000000103", name: "横浜 子育て世代", audienceLabel: "横浜市 30〜40代 子育て世代" },
  { externalId: "120000000000205", campaignExternalId: "120000000000104", name: "首都圏 セラピスト・有資格者", audienceLabel: "首都圏 / 理学療法士・柔道整復師・セラピスト（EMPLOYMENTカテゴリ）" },
];

export const MOCK_ADS: MockAdDef[] = [
  { key: "A", externalId: "120000000000301", creativeExternalId: "120000000000401", adSetExternalId: "120000000000201", campaignExternalId: "120000000000101", name: "A｜その肩こり、揉むだけ", headline: "その肩こり、揉むだけになっていませんか？", body: "マッサージでその場は楽になっても、すぐ戻る。原因は姿勢と体の使い方かもしれません。AI姿勢分析で原因から整えます。", cta: "BOOK_NOW", angle: "problem", hook: "その肩こり、揉むだけになっていませんか？", format: "image", startedDaysAgo: 42, pausedDaysAgo: null, profile: "fatigue" },
  { key: "B", externalId: "120000000000302", creativeExternalId: "120000000000402", adSetExternalId: "120000000000201", campaignExternalId: "120000000000101", name: "B｜仕事終わり、首肩が限界", headline: "仕事終わり、首肩が限界になるあなたへ", body: "PC作業8時間のあと、首と肩がずっしり重い。渋谷駅から徒歩4分、仕事帰りに寄れる姿勢ケア。", cta: "BOOK_NOW", angle: "lifestyle", hook: "仕事終わり、首肩が限界になるあなたへ", format: "image", startedDaysAgo: 9, pausedDaysAgo: null, profile: "challenger" },
  { key: "C", externalId: "120000000000303", creativeExternalId: "120000000000403", adSetExternalId: "120000000000202", campaignExternalId: "120000000000101", name: "C｜AI姿勢分析で原因を見える化", headline: "AI姿勢分析で、不調の原因を見える化", body: "国家資格者がAI姿勢分析の結果をもとに施術。清潔感のある完全個室です。", cta: "LEARN_MORE", angle: "expertise", hook: "AI姿勢分析で、不調の原因を見える化", format: "image", startedDaysAgo: 35, pausedDaysAgo: null, profile: "steady" },
  { key: "D", externalId: "120000000000304", creativeExternalId: "120000000000404", adSetExternalId: "120000000000203", campaignExternalId: "120000000000102", name: "D｜昼休み30分で整える", headline: "昼休み30分で、午後の体を軽く", body: "池袋駅徒歩3分。昼休みに寄れる30分の姿勢ケアコース。", cta: "BOOK_NOW", angle: "lifestyle", hook: "昼休み30分で、午後の体を軽く", format: "video", startedDaysAgo: 24, pausedDaysAgo: null, profile: "winner" },
  { key: "E", externalId: "120000000000305", creativeExternalId: "120000000000405", adSetExternalId: "120000000000203", campaignExternalId: "120000000000102", name: "E｜腰痛の原因は座り方", headline: "腰の重さ、座り方が原因かもしれません", body: "座り方のクセを姿勢分析でチェック。原因に合わせたケアをご提案します。", cta: "BOOK_NOW", angle: "expertise", hook: "腰の重さ、座り方が原因かもしれません", format: "image", startedDaysAgo: 30, pausedDaysAgo: null, profile: "lp_drop" },
  { key: "F", externalId: "120000000000306", creativeExternalId: "120000000000406", adSetExternalId: "120000000000204", campaignExternalId: "120000000000103", name: "F｜産後の骨盤ケア", headline: "産後の体、ひとりで抱えこまないで", body: "キッズスペースあり。横浜院の産後骨盤ケア。", cta: "BOOK_NOW", angle: "problem", hook: "産後の体、ひとりで抱えこまないで", format: "image", startedDaysAgo: 28, pausedDaysAgo: null, profile: "underdeliver" },
  { key: "G", externalId: "120000000000307", creativeExternalId: "120000000000407", adSetExternalId: "120000000000205", campaignExternalId: "120000000000104", name: "G｜セラピストの1日", headline: "NAORUで働くセラピストの1日", body: "9:45出勤、ミーティング、施術、研修。リアルな1日を動画で。", cta: "APPLY_NOW", angle: "employee_story", hook: "NAORUで働くセラピストの1日", format: "video", startedDaysAgo: 34, pausedDaysAgo: null, profile: "recruit_winner" },
  { key: "H", externalId: "120000000000308", creativeExternalId: "120000000000408", adSetExternalId: "120000000000205", campaignExternalId: "120000000000104", name: "H｜研修制度で未経験からプロへ", headline: "研修制度で、未経験からプロへ", body: "3ヶ月の研修カリキュラムで現場デビュー。", cta: "APPLY_NOW", angle: "training", hook: "研修制度で、未経験からプロへ", format: "image", startedDaysAgo: 34, pausedDaysAgo: 12, profile: "recruit_loser" },
  { key: "I", externalId: "120000000000309", creativeExternalId: "120000000000409", adSetExternalId: "120000000000205", campaignExternalId: "120000000000104", name: "I｜給与・福利厚生", headline: "月給28万円〜、完全週休2日", body: "社会保険完備・資格手当あり。", cta: "APPLY_NOW", angle: "salary", hook: "月給28万円〜、完全週休2日", format: "image", startedDaysAgo: 20, pausedDaysAgo: null, profile: "recruit_steady" },
];

export const hashNum = (s: string) => parseInt(createHash("sha1").update(s).digest("hex").slice(0, 8), 16);
const noise = (key: string, amp: number) => 1 + (((hashNum(key) % 1000) / 1000) * 2 - 1) * amp;

/**
 * Daily metrics for a demo ad. `age` = days since the ad started (0 = first day),
 * `daysAgo` = days before the reference "today" (1 = yesterday).
 */
export function mockAdDay(ad: Pick<MockAdDef, "key" | "profile">, age: number, daysAgo: number): AdDailyMetrics {
  const n = (k: string, amp = 0.08) => noise(`${ad.key}:${daysAgo}:${k}`, amp);
  let impressions = 1500;
  let ctr = 0.013;
  let cpm = 1350;
  const lpvRate = 0.86;
  let lpCvr = 0.075;
  let frequency = 1.3 + age * 0.03;
  let revenuePerCv = 8000;
  switch (ad.profile) {
    case "fatigue": {
      // Fine for ~4 weeks, then the last two weeks wear out.
      const wear = Math.max(0, Math.min(1, (14 - daysAgo) / 14));
      impressions = 2100;
      frequency = 1.8 + wear * 1.4;
      ctr = 0.0165 * (1 - 0.38 * wear);
      cpm = 1300 * (1 + 0.08 * wear);
      lpCvr = 0.078;
      break;
    }
    case "challenger":
      impressions = 1500;
      frequency = 1.2 + age * 0.04;
      ctr = 0.0205;
      lpCvr = 0.088;
      break;
    case "steady":
      impressions = 1100;
      ctr = 0.0118;
      lpCvr = 0.06;
      frequency = 1.4 + age * 0.02;
      break;
    case "winner":
      impressions = 1300;
      ctr = 0.017;
      lpCvr = 0.105;
      frequency = 1.4 + age * 0.02;
      break;
    case "lp_drop":
      impressions = 1200;
      ctr = 0.0155;
      lpCvr = daysAgo <= 7 ? 0.024 : 0.074; // LP changed a week ago
      break;
    case "underdeliver":
      impressions = 650;
      ctr = 0.012;
      cpm = 2200;
      lpCvr = 0.07;
      break;
    case "recruit_winner":
      impressions = 1300;
      ctr = 0.0145;
      lpCvr = 0.07;
      revenuePerCv = 0;
      break;
    case "recruit_loser":
      impressions = 1200;
      ctr = 0.0138;
      lpCvr = 0.04;
      revenuePerCv = 0;
      break;
    case "recruit_steady":
      impressions = 900;
      ctr = 0.0105;
      lpCvr = 0.05;
      revenuePerCv = 0;
      break;
  }
  const imp = Math.round(impressions * n("imp"));
  const clicks = Math.round(imp * ctr * n("ctr", 0.1));
  const lpv = Math.round(clicks * lpvRate * n("lpv", 0.04));
  const convRaw = lpv * lpCvr * n("cv", 0.25);
  const conversions = Math.floor(convRaw + ((hashNum(`${ad.key}:${daysAgo}:r`) % 100) / 100));
  const spend = Math.round((imp / 1000) * cpm * n("cpm", 0.05));
  return {
    spend,
    impressions: imp,
    reach: Math.round(imp / Math.max(1, frequency)),
    frequency: Math.round(frequency * 100) / 100,
    clicks,
    landingPageViews: lpv,
    conversions,
    revenue: revenuePerCv ? conversions * revenuePerCv : null,
    video3sViews: null,
    thruplays: null,
  };
}
