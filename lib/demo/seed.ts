/**
 * Demo organization data ("NAORU整体 渋谷院").
 *
 * Used for sales demos and for the "デモ組織で試す" option. Demo data is
 * always written into an organization flagged `is_demo = true`, and mock
 * analytics (SNS reach, ad metrics, campaigns) are only ever shown for
 * demo organizations — production organizations never see fake numbers.
 */
import type {
  BrandBrainInput,
  Campaign,
  HqCampaignInput,
  LocationProfileInput,
  SnsAccountInput,
  MetricSummary,
  NewPostInput,
  Recommendation,
} from "@/lib/domain/types";
import { jstDateKey } from "@/lib/domain/dates";

export const DEMO_ORGANIZATION_NAME = "NAORU整体 渋谷院";

export const DEMO_ACCOUNT = {
  email: "demo@naoru.jp",
  password: "naoru-demo-2026",
  displayName: "山本 花子",
} as const;

export const DEMO_BRAND_BRAIN: BrandBrainInput = {
  companyName: "NAORU 株式会社",
  brandName: "NAORU整体 渋谷院",
  industry: { key: "seitai", label: "整体 / Healthcare / Wellness" },
  businessDescription:
    "渋谷駅徒歩5分の完全個室の整体院。AI姿勢分析と国家資格保有者の施術で、デスクワークによる肩こり・首こり・姿勢の崩れを根本からケアします。",
  website: "naorusalon.jp/shibuya",
  social: {
    instagram: "@naoru_official",
    threads: "@naoru_official",
    tiktok: "@naoru_official",
    facebook: "",
  },
  locations: [
    { name: "NAORU整体 渋谷院", address: "東京都渋谷区渋谷 2-14-13 岡崎ビル 5F" },
    { name: "NAORU整体 新宿院", address: "東京都新宿区西新宿 1-5-2 3F" },
  ],
  services: [
    { name: "全身整体コース", description: "60分。姿勢分析つきの全身調整。", price: 8800 },
    { name: "美容整体コース", description: "75分。骨格バランスとフェイスラインのケア。", price: 11000 },
    { name: "初回カウンセリング", description: "30分。AI姿勢分析とセルフケア指導。", price: 3300 },
  ],
  serviceDescription: "仕事帰りに通える21時まで営業。姿勢分析の結果をもとに、一人ひとりに合わせた施術計画を提案します。",
  strengths: ["AI姿勢分析", "国家資格保有者が担当", "完全個室の落ち着いた空間"],
  features: ["21時まで営業", "渋谷駅徒歩5分", "LINEで簡単予約"],
  competitors: [
    { name: "渋谷整体サロン", note: "低価格・回数券中心" },
    { name: "姿勢ラボ渋谷", note: "ジム併設、トレーニング寄り" },
  ],
  differentiators: ["データで姿勢の変化を可視化", "施術とセルフケア指導をセットで提供"],
  targetAudience: {
    summary: "渋谷・表参道エリアで働くデスクワーカー",
    ageRange: "30代（28〜42歳）",
    gender: "女性 70% / 男性 30%",
    occupation: "渋谷勤務のデスクワーカー",
    painPoints: ["肩こり", "首こり", "姿勢の崩れ", "仕事終わりの疲れ"],
    useCases: ["仕事帰りのリフレッシュ", "月1回の定期メンテナンス"],
  },
  personas: [
    { name: "仕事帰りに通いたい会社員", description: "IT企業勤務・32歳。夕方になると肩が重く、21時まで開いている整体を探している。" },
    { name: "根本から姿勢を整えたい人", description: "マッサージでは戻ってしまうので、原因から改善したい。" },
    { name: "美容と健康を両立したい人", description: "姿勢を整えて見た目の印象も良くしたい。" },
  ],
  brandPersonality: ["清潔感", "専門性", "都会的", "親しみやすい"],
  brandTone: ["やさしく、話しかけるように", "専門用語はわかりやすく説明", "過度な効果保証を避ける"],
  writingTone: "専門家としての信頼感を保ちつつ、友人に話しかけるようなやさしい文体。絵文字は1投稿2つまで。",
  marketingGoals: "新規体験予約を月40件獲得する",
  socialGoals: "Instagramの保存数を増やし、プロフィール経由の予約を伸ばす",
  advertisingGoals: "Meta広告でCPA ¥7,000以下を維持しながら新規予約を獲得する",
  aiContext: "初回カウンセリング（¥3,300）を入口にする。「治る」など医療的な断定表現は使わない。",
};

/** Demo posts, scheduled relative to "today" so the planner always looks alive. */
export function buildDemoPosts(now: Date = new Date()): NewPostInput[] {
  // Times are Japan time regardless of the server's timezone.
  const [y, m, d] = jstDateKey(now).split("-").map(Number) as [number, number, number];
  const at = (dayOffset: number, hour: number, minute = 0): string =>
    new Date(Date.UTC(y, m - 1, d + dayOffset, hour - 9, minute)).toISOString();
  return [
    {
      platform: "instagram",
      contentType: "reel",
      title: "肩こりを招くデスクワークのNG習慣3選",
      caption: "デスクワーク中、無意識にやっていませんか？肩こりにつながる習慣と、今日からできる小さな工夫をご紹介します。",
      cta: "保存して、あとで見返してくださいね",
      hashtags: ["#渋谷整体", "#姿勢改善", "#肩こりケア"],
      status: "scheduled",
      scheduledAt: at(0, 20),
      source: "demo",
    },
    {
      platform: "threads",
      contentType: "text",
      title: "夕方になると肩が重くなる理由",
      caption: "夕方の肩の重さは、座り姿勢の「前のめり」が積み重なったサインかもしれません。",
      cta: "気になる方はプロフィールから相談を",
      hashtags: ["#デスクワーク"],
      status: "draft",
      scheduledAt: at(1, 12),
      source: "demo",
    },
    {
      platform: "instagram",
      contentType: "carousel",
      title: "1分でできる姿勢リセット習慣",
      caption: "椅子に座ったままできる、1分間の姿勢リセット。仕事の合間にどうぞ。",
      cta: "保存してデスクで試してみてください",
      hashtags: ["#姿勢リセット", "#渋谷整体"],
      status: "draft",
      scheduledAt: at(2, 19, 30),
      source: "demo",
    },
    {
      platform: "tiktok",
      contentType: "short_video",
      title: "施術前後の姿勢チェック",
      caption: "AI姿勢分析で、施術前後の変化を見てみましょう。",
      cta: "初回カウンセリングはプロフィールから",
      hashtags: ["#姿勢分析"],
      status: "draft",
      scheduledAt: at(4, 20),
      source: "demo",
    },
    {
      platform: "instagram",
      contentType: "feed",
      title: "初回カウンセリングの流れをご紹介",
      caption: "はじめての方も安心。カウンセリングから施術、セルフケア指導までの流れをご紹介します。",
      cta: "ご予約はプロフィールのリンクから",
      hashtags: ["#渋谷整体", "#初回カウンセリング"],
      status: "scheduled",
      scheduledAt: at(6, 12),
      source: "demo",
    },
    {
      platform: "instagram",
      contentType: "reel",
      title: "首こりに効く、デスクでできるストレッチ",
      caption: "首まわりが固まりやすい方へ。30秒でできるストレッチです。",
      cta: "保存して毎日の習慣に",
      hashtags: ["#首こり", "#ストレッチ"],
      status: "published",
      scheduledAt: at(-3, 20),
      source: "demo",
    },
  ];
}

export const DEMO_METRICS: { sns: MetricSummary[]; ads: MetricSummary[] } = {
  sns: [
    { label: "SNS投稿数", value: "18本", change: "+4.2%", glyph: "▤", positive: true },
    { label: "フォロワー増加", value: "+284", change: "+12.8%", glyph: "♧", positive: true },
    { label: "合計リーチ", value: "24.8k", change: "+18.6%", glyph: "◉", positive: true },
    { label: "エンゲージメント率", value: "4.82%", change: "+0.6pt", glyph: "↗", positive: true },
  ],
  ads: [
    { label: "広告費", value: "¥674k", change: "+6.3%", glyph: "￥", positive: true },
    { label: "広告CTR", value: "1.86%", change: "+0.24pt", glyph: "⌁", positive: true },
    { label: "獲得CPA", value: "¥8,429", change: "−12.4%", glyph: "◎", positive: false },
    { label: "ROAS", value: "3.42x", change: "+0.38x", glyph: "↗", positive: true },
  ],
};

export const DEMO_AD_METRICS: MetricSummary[] = [
  { label: "広告費", value: "¥674,600", change: "+6.3%", glyph: "￥", positive: true },
  { label: "インプレッション", value: "128.9k", change: "+14.2%", glyph: "◉", positive: true },
  { label: "平均 CTR", value: "1.86%", change: "+0.24pt", glyph: "⌁", positive: true },
  { label: "コンバージョン", value: "105件", change: "+18.0%", glyph: "◎", positive: true },
  { label: "平均 CPM", value: "¥5,234", change: "−4.1%", glyph: "▤", positive: true },
  { label: "平均 CPC", value: "¥1,246", change: "−9.3%", glyph: "↘", positive: true },
  { label: "平均 CPA", value: "¥6,425", change: "−12.4%", glyph: "◎", positive: true },
  { label: "ROAS", value: "3.42x", change: "+0.38x", glyph: "↗", positive: true },
];

export const DEMO_CAMPAIGNS: Campaign[] = [
  { id: "demo-c1", name: "秋の姿勢改善キャンペーン", status: "active", spend: 284600, impressions: 48320, ctr: 1.82, clicks: 880, conversions: 42, roas: 3.4 },
  { id: "demo-c2", name: "仕事帰りの整体体験", status: "active", spend: 198400, impressions: 36710, ctr: 2.16, clicks: 792, conversions: 36, roas: 4.1 },
  { id: "demo-c3", name: "美容整体 Before/After", status: "needs_review", spend: 126800, impressions: 29450, ctr: 1.12, clicks: 330, conversions: 14, roas: 2.2 },
  { id: "demo-c4", name: "初回カウンセリング訴求", status: "paused", spend: 64800, impressions: 14520, ctr: 1.94, clicks: 282, conversions: 13, roas: 3.0 },
];

export const DEMO_RECOMMENDATIONS: Recommendation[] = [
  {
    id: "demo-r1",
    kind: "creative_fatigue",
    title: "クリエイティブのCTRが低下しています",
    body: "「美容整体 Before/After」のCTRが過去7日平均から28%低下しました。LPのCVRは維持されているため、ファーストビューの差し替えをおすすめします。",
    meta: "美容整体 Before/After · 2時間前 · 影響度 中",
    metric: "CTR −28%",
    tone: "warning",
  },
  {
    id: "demo-r2",
    kind: "content_opportunity",
    title: "保存率の高い投稿テーマが見つかりました",
    body: "「姿勢リセット」の保存率が平均比+32%。デスクワーカー向けのHow-toシリーズを継続し、プロフィールリンクへのCTAを加えてみましょう。",
    meta: "Instagram · 昨日 · 成長機会",
    metric: "保存 +32%",
    tone: "positive",
  },
  {
    id: "demo-r3",
    kind: "budget_allocation",
    title: "広告費を効率よく配分できそうです",
    body: "「仕事帰りの整体体験」はROAS 4.1xで安定。低調なクリエイティブの予算を段階的に配分する案を作成しました。",
    meta: "Meta広告 · 3日前 · 最適化案",
    metric: "ROAS 4.1x",
    tone: "positive",
  },
];

// ---------------------------------------------------------------------------
// Accounts / location customization / HQ template (indexes refer to
// DEMO_BRAND_BRAIN.locations: 0 = 渋谷院, 1 = 新宿院, null = HQ)
// ---------------------------------------------------------------------------

export const DEMO_ACCOUNTS: (Omit<SnsAccountInput, "locationId"> & { locationIndex: number | null })[] = [
  {
    platform: "instagram",
    handle: "@naoru_official",
    displayName: "NAORU 本部",
    locationIndex: null,
    goal: "branding",
    strategy: {
      persona: "姿勢や体のケアに関心がある28〜42歳。整体院を比較検討していて、信頼できるブランドかを確かめたい。",
      kpis: ["フォロワー数", "エンゲージメント率", "指名検索数"],
      contentPillars: ["姿勢の専門コラム", "NAORUの想い", "店舗ネットワーク紹介", "季節キャンペーン"],
      postsPerWeek: 3,
      postingFrequencyNote: "世界観を揃えたフィード中心",
      cta: "お近くの店舗はプロフィールから",
      tone: "上品で信頼感のある専門家トーン",
    },
  },
  {
    platform: "instagram",
    handle: "@naoru_shibuya",
    displayName: "渋谷院",
    locationIndex: 0,
    goal: "acquisition",
    strategy: {
      persona: "渋谷勤務の30代女性デスクワーカー。夕方の肩こりがつらく、仕事帰りに通える整体を探している。",
      kpis: ["プロフィール経由の予約数", "保存数", "プロフィールアクセス数"],
      contentPillars: ["デスクでできるセルフケア", "AI姿勢分析の紹介", "スタッフ紹介", "渋谷院限定オファー"],
      postsPerWeek: 4,
      postingFrequencyNote: "Reel2本・フィード2本",
      cta: "LINEで24時間予約受付中",
      tone: "やさしく、話しかけるように",
    },
  },
  {
    platform: "instagram",
    handle: "@naoru_shinjuku",
    displayName: "新宿院",
    locationIndex: 1,
    goal: "acquisition",
    strategy: {
      persona: "西新宿のオフィスで働く30〜40代。腰痛と眼精疲労に悩み、昼休みや仕事帰りの短時間ケアを求めている。",
      kpis: ["プロフィール経由の予約数", "保存数"],
      contentPillars: ["腰痛・眼精疲労ケア", "昼休み30分コース", "スタッフ紹介"],
      postsPerWeek: 3,
      postingFrequencyNote: "Reel1本・フィード2本",
      cta: "ご予約はプロフィールのリンクから",
      tone: "テキパキと頼れるトーン",
    },
  },
  {
    platform: "instagram",
    handle: "@naoru_recruit",
    displayName: "NAORU 採用",
    locationIndex: null,
    goal: "recruitment",
    strategy: {
      persona: "技術を伸ばしたい20〜30代の柔道整復師・理学療法士。働きやすさと教育体制を重視している。",
      kpis: ["応募数", "見学申込数"],
      contentPillars: ["スタッフの1日", "教育・研修制度", "働く環境", "代表メッセージ"],
      postsPerWeek: 2,
      postingFrequencyNote: "Reel1本・フィード1本",
      cta: "見学・カジュアル面談はDMから",
      tone: "等身大で誠実に",
    },
  },
];

export const DEMO_LOCATION_PROFILES: LocationProfileInput[] = [
  {
    area: "渋谷・表参道",
    demographics: "20代後半〜40代のオフィスワーカー。女性比率が高く、仕事帰り（18〜21時）の来店が多い。",
    featuredServices: ["美容整体コース", "初回カウンセリング"],
    staff: [
      { name: "佐藤 結衣", role: "院長", specialty: "姿勢分析・美容整体" },
      { name: "高橋 健", role: "施術スタッフ", specialty: "肩こり・首こり" },
    ],
    offers: ["平日19時以降のご予約で+10分延長"],
    localKeywords: ["渋谷整体", "表参道整体", "渋谷肩こり"],
  },
  {
    area: "西新宿",
    demographics: "30〜40代の男女オフィスワーカー。昼休みと平日夜の短時間利用が中心。",
    featuredServices: ["全身整体コース"],
    staff: [{ name: "中村 大輔", role: "院長", specialty: "腰痛・骨盤調整" }],
    offers: ["昼休み30分クイックコース ¥4,400"],
    localKeywords: ["新宿整体", "西新宿腰痛"],
  },
];

export function buildDemoHqCampaign(now: Date = new Date()): Omit<HqCampaignInput, "targetLocationIds"> {
  const [y, m, d] = jstDateKey(now).split("-").map(Number) as [number, number, number];
  const day = (offset: number) => new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
  return {
    name: "秋の姿勢改善キャンペーン",
    status: "active",
    startsOn: day(3),
    endsOn: day(33),
    sharedTheme: "季節の変わり目の不調を、姿勢から整える。初回姿勢チェック無料",
    creative: {
      headline: "その不調、姿勢からかもしれません。",
      body: "AI姿勢分析で今の姿勢を見える化。秋のキャンペーン期間中は初回姿勢チェックが無料です。",
      visual: "白背景・自然光。姿勢分析の画面と施術シーン。ブランドカラーのグリーンを1点だけ使う",
    },
    localizationRules: [
      "見出しとキャンペーン名は本部の表記を変えない",
      "冒頭に店舗のエリア名を入れる",
      "店舗独自のオファーがあれば最後に1つだけ追記する",
      "ハッシュタグに店舗のローカルキーワードを必ず含める",
      "「治る」「必ず改善」などの断定表現は使わない",
    ],
  };
}
