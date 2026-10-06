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
  RecommendationInput,
  SnsAccountInput,
  MetricSummary,
  NewPostInput,
} from "@/lib/domain/types";
import { jstDateKey } from "@/lib/domain/dates";

export const DEMO_ORGANIZATION_NAME = "NAORU Demo HQ";

export const DEMO_ACCOUNT = {
  email: "demo@naoru.jp",
  password: "naoru-demo-2026",
  displayName: "山本 花子",
} as const;

export const DEMO_BRAND_BRAIN: BrandBrainInput = {
  companyName: "NAORU 株式会社",
  brandName: "NAORU整体",
  industry: { key: "seitai", label: "整体 / Healthcare / Wellness" },
  businessDescription:
    "渋谷駅徒歩5分の完全個室の整体院。AI姿勢分析と国家資格保有者の施術で、デスクワークによる肩こり・首こり・姿勢の崩れを根本からケアします。",
  website: "naorusalon.jp/shibuya",
  social: {
    instagram: "",
    threads: "@naoru_official",
    tiktok: "",
    facebook: "",
  },
  locations: [
    { name: "NAORU整体 渋谷院", address: "東京都渋谷区渋谷 2-14-13 岡崎ビル 5F" },
    { name: "NAORU整体 池袋院", address: "東京都豊島区南池袋 1-20-5 4F" },
    { name: "NAORU整体 横浜院", address: "神奈川県横浜市西区北幸 2-8-4 2F" },
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

// ---------------------------------------------------------------------------
// HQ operations demo: 3 locations × (Instagram + Threads) + HQ accounts.
// locationIndex refers to DEMO_BRAND_BRAIN.locations (0 渋谷院, 1 池袋院, 2 横浜院),
// null = HQ account.
// ---------------------------------------------------------------------------

type DemoAccount = Omit<SnsAccountInput, "locationId"> & { locationIndex: number | null };

const acquisitionPillars = ["problem_awareness", "education", "selfcare", "before_after", "testimonial", "offer"];

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    platform: "instagram",
    handle: "@naoru_shibuya",
    displayName: "渋谷院 Instagram",
    locationIndex: 0,
    goal: "acquisition",
    customGoal: "",
    active: true,
    strategy: {
      targetAudience: "30代女性 / 渋谷勤務 / デスクワーク",
      persona: "IT企業勤務・32歳。夕方になると肩と首が重く、仕事帰りに通える整体を探している。",
      kpiTargets: [
        { metric: "プロフィールアクセス", target: 1500, unit: "回/月" },
        { metric: "LINE登録", target: 60, unit: "件/月" },
        { metric: "予約数", target: 40, unit: "件/月" },
      ],
      contentPillars: acquisitionPillars,
      postsPerWeek: 4,
      postingFrequencyNote: "Reel2本・カルーセル2本",
      preferredPostingDays: [0, 1, 3, 5],
      preferredPostingTimes: ["20:00"],
      cta: "LINE予約（主導線）/ プロフィールリンク",
      tone: "やさしく、話しかけるように",
      notes: "肩こり・姿勢・セルフケアを中心に。Before/Afterと口コミは許諾済みのみ。",
    },
  },
  {
    platform: "threads",
    handle: "@naoru_shibuya_threads",
    displayName: "渋谷院 Threads",
    locationIndex: 0,
    goal: "acquisition",
    customGoal: "",
    active: true,
    strategy: {
      targetAudience: "30代女性 / 渋谷勤務 / デスクワーク",
      persona: "お昼休みにスマホを見る会社員。共感できる短い言葉に反応する。",
      kpiTargets: [
        { metric: "プロフィールアクセス", target: 400, unit: "回/月" },
        { metric: "LINE登録", target: 15, unit: "件/月" },
      ],
      contentPillars: ["problem_awareness", "selfcare", "faq"],
      postsPerWeek: 5,
      postingFrequencyNote: "平日のお昼に短文",
      preferredPostingDays: [1, 2, 3, 4, 5],
      preferredPostingTimes: ["12:00"],
      cta: "プロフィールのLINEから予約",
      tone: "友だちに話すような短い言葉",
      notes: "",
    },
  },
  {
    platform: "instagram",
    handle: "@naoru_ikebukuro",
    displayName: "池袋院 Instagram",
    locationIndex: 1,
    goal: "acquisition",
    customGoal: "",
    active: true,
    strategy: {
      targetAudience: "池袋勤務の会社員 / 20〜40代 / 男女",
      persona: "池袋の営業職・38歳。腰痛と目の疲れがあり、昼休みや仕事帰りに短時間でケアしたい。",
      kpiTargets: [
        { metric: "プロフィールアクセス", target: 1000, unit: "回/月" },
        { metric: "予約数", target: 30, unit: "件/月" },
      ],
      contentPillars: ["problem_awareness", "education", "staff_expertise", "offer"],
      postsPerWeek: 3,
      postingFrequencyNote: "Reel1本・フィード2本",
      preferredPostingDays: [1, 3, 5],
      preferredPostingTimes: ["19:00"],
      cta: "ホットペッパー・LINEから予約",
      tone: "テキパキと頼れるトーン",
      notes: "",
    },
  },
  {
    platform: "threads",
    handle: "@naoru_ikebukuro_threads",
    displayName: "池袋院 Threads",
    locationIndex: 1,
    goal: "acquisition",
    customGoal: "",
    active: true,
    strategy: {
      targetAudience: "池袋勤務の会社員",
      persona: "",
      kpiTargets: [{ metric: "プロフィールアクセス", target: 300, unit: "回/月" }],
      contentPillars: ["problem_awareness", "selfcare"],
      postsPerWeek: 3,
      postingFrequencyNote: "",
      preferredPostingDays: [2, 4, 6],
      preferredPostingTimes: ["12:00"],
      cta: "プロフィールから予約",
      tone: "テキパキと頼れるトーン",
      notes: "",
    },
  },
  {
    platform: "instagram",
    handle: "@naoru_yokohama",
    displayName: "横浜院 Instagram",
    locationIndex: 2,
    goal: "acquisition",
    customGoal: "",
    active: true,
    strategy: {
      targetAudience: "地域住民 / 30〜50代 / 子育て世代・主婦層",
      persona: "横浜在住・44歳。家事と子育てで腰と肩がつらく、土日や日中に通える近所の整体を探している。",
      kpiTargets: [
        { metric: "プロフィールアクセス", target: 800, unit: "回/月" },
        { metric: "予約数", target: 25, unit: "件/月" },
      ],
      contentPillars: ["problem_awareness", "selfcare", "testimonial", "faq"],
      postsPerWeek: 3,
      postingFrequencyNote: "フィード中心",
      preferredPostingDays: [2, 4, 6],
      preferredPostingTimes: ["10:00"],
      cta: "お電話・LINEで予約",
      tone: "あたたかく、ご近所の安心感",
      notes: "",
    },
  },
  {
    platform: "threads",
    handle: "@naoru_yokohama_threads",
    displayName: "横浜院 Threads",
    locationIndex: 2,
    goal: "retention",
    customGoal: "",
    active: true,
    strategy: {
      targetAudience: "横浜院に来店したことのあるお客様",
      persona: "",
      kpiTargets: [{ metric: "再来店率", target: 60, unit: "%" }],
      contentPillars: ["aftercare", "selfcare", "member_info"],
      postsPerWeek: 3,
      postingFrequencyNote: "",
      preferredPostingDays: [1, 3, 5],
      preferredPostingTimes: ["09:00"],
      cta: "次回のご予約はLINEから",
      tone: "あたたかく、寄り添うように",
      notes: "",
    },
  },
  {
    platform: "instagram",
    handle: "@naoru_recruit",
    displayName: "NAORU 採用（本部）",
    locationIndex: null,
    goal: "recruitment",
    customGoal: "",
    active: true,
    strategy: {
      targetAudience: "20〜30代 / 理学療法士・柔道整復師・セラピスト",
      persona: "臨床経験3年の理学療法士・27歳。技術を伸ばしたいが、今の職場では教育体制や将来像が見えない。",
      kpiTargets: [
        { metric: "採用ページクリック", target: 80, unit: "回/月" },
        { metric: "DM", target: 10, unit: "件/月" },
        { metric: "応募数", target: 4, unit: "件/月" },
      ],
      contentPillars: ["staff_story", "day_in_the_life", "training", "career", "benefits", "culture"],
      postsPerWeek: 2,
      postingFrequencyNote: "Reel1本・カルーセル1本",
      preferredPostingDays: [2, 6],
      preferredPostingTimes: ["21:00"],
      cta: "採用ページ / DMでカジュアル面談",
      tone: "等身大で誠実に、スタッフ本人の言葉で",
      notes: "給与・休日は本部人事の確認済みの情報のみ使う。",
    },
  },
  {
    platform: "threads",
    handle: "@naoru_official",
    displayName: "NAORU 本部",
    locationIndex: null,
    goal: "branding",
    customGoal: "",
    active: true,
    strategy: {
      targetAudience: "体のケアに関心がある20〜50代",
      persona: "",
      kpiTargets: [{ metric: "フォロワー数", target: null, unit: "人" }],
      contentPillars: ["brand_story", "expertise_column", "network"],
      postsPerWeek: 3,
      postingFrequencyNote: "",
      preferredPostingDays: [1, 3, 5],
      preferredPostingTimes: ["08:00"],
      cta: "お近くの店舗はプロフィールから",
      tone: "上品で信頼感のある専門家トーン",
      notes: "",
    },
  },
];

export const DEMO_LOCATION_PROFILES: LocationProfileInput[] = [
  {
    area: "渋谷",
    demographics: "渋谷・表参道で働く20代後半〜40代のオフィスワーカー。女性比率が高く、仕事帰り（18〜21時）の来店が多い。",
    featuredServices: ["美容整体コース", "初回カウンセリング"],
    staff: [
      { name: "佐藤 結衣", role: "院長", specialty: "姿勢分析・美容整体" },
      { name: "高橋 健", role: "施術スタッフ", specialty: "肩こり・首こり" },
    ],
    offers: ["平日19時以降のご予約で+10分延長"],
    localKeywords: ["渋谷整体", "渋谷肩こり", "表参道整体"],
  },
  {
    area: "池袋",
    demographics: "池袋駅周辺で働く20〜40代の会社員。男性比率がやや高く、昼休みと平日夜の短時間利用が中心。",
    featuredServices: ["全身整体コース"],
    staff: [{ name: "中村 大輔", role: "院長", specialty: "腰痛・骨盤調整" }],
    offers: ["昼休み30分クイックコース ¥4,400"],
    localKeywords: ["池袋整体", "池袋腰痛"],
  },
  {
    area: "横浜",
    demographics: "横浜駅周辺に住む30〜50代の地域住民。子育て世代・主婦層が多く、平日日中と土日の来店が中心。",
    featuredServices: ["全身整体コース", "初回カウンセリング"],
    staff: [{ name: "山田 美穂", role: "院長", specialty: "産後ケア・骨盤調整" }],
    offers: ["お子さま連れOK（キッズスペースあり）"],
    localKeywords: ["横浜整体", "横浜駅整体", "産後骨盤矯正横浜"],
  },
];

export function buildDemoHqCampaign(now: Date = new Date()): Omit<HqCampaignInput, "targetLocationIds"> {
  const [y, m] = jstDateKey(now).split("-").map(Number) as [number, number, number];
  const first = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return {
    name: `${m}月テーマ「デスクワーク×姿勢改善」`,
    status: "active",
    goal: "acquisition",
    startsOn: first,
    endsOn: last,
    sharedTheme: "デスクワークで崩れた姿勢を整え、肩こり・首こりを根本からケアする。今月は全店舗で肩こり訴求",
    contentDirections: ["デスクワーク中のNG姿勢", "1分でできるセルフケア", "AI姿勢分析で変化を見える化"],
    requiredMessages: ["初回姿勢チェック無料"],
    optionalMessages: ["仕事帰りに通える", "国家資格保有者が担当"],
    cta: "LINEから初回予約",
    creative: {
      headline: "その肩こり、姿勢からかもしれません。",
      body: "AI姿勢分析で今の姿勢を見える化。今月は初回姿勢チェックが無料です。",
      visual: "白背景・自然光。デスクワーク中の姿勢と施術シーン。ブランドカラーのグリーンを1点だけ使う",
    },
    localizationRules: [
      "見出しとキャンペーン名は本部の表記を変えない",
      "冒頭に店舗のエリアとターゲットの働き方・暮らし方を入れる（渋谷=渋谷勤務の女性、池袋=池袋勤務の会社員、横浜=地域住民）",
      "店舗独自のオファーがあれば最後に1つだけ追記する",
      "ハッシュタグに店舗のローカルキーワードを必ず含める",
      "「治る」「必ず改善」などの断定表現は使わない",
    ],
    targetPlatforms: ["instagram", "threads"],
  };
}

/** Recommendations seeded for the demo (handles are resolved to account ids). */
export const DEMO_RECOMMENDATIONS: (Omit<RecommendationInput, "locationId" | "socialAccountId"> & { accountHandle: string | null })[] = [
  {
    accountHandle: "@naoru_ikebukuro",
    category: "acquisition",
    severity: "high",
    title: "池袋院Instagramの今月の投稿計画が不足しています",
    observation: "今月の予定投稿が0本で、戦略上の目標（週3本）に届いていません。",
    insight: "池袋の会社員は昼休みの閲覧が多く、投稿が途切れると来店検討の接点がなくなります。",
    hypothesis: "腰痛セルフケアと昼休み30分コースの投稿で、プロフィールアクセスが回復する可能性があります。",
    recommendedAction: "SNS Plannerの「AIで1ヶ月分作成」で池袋院Instagramの企画を作り、確認・承認してください。",
    expectedImpact: "予約導線への流入増加",
    confidence: 0.75,
  },
  {
    accountHandle: "@naoru_recruit",
    category: "recruitment",
    severity: "medium",
    title: "採用アカウントで「キャリア理解」の投稿が不足しています",
    observation: "直近の採用投稿は「1日の仕事」に偏り、キャリアパスや研修の発信がありません。",
    insight: "応募前の求職者は「3年後どうなれるか」を重視します。",
    hypothesis: "キャリアパスと研修のカルーセルを追加すると、採用ページクリックが伸びる可能性があります。",
    recommendedAction: "採用アカウントの月間計画で、後半に「キャリア理解」「応募」の投稿を入れてください。",
    expectedImpact: "採用ページクリック・DMの増加",
    confidence: 0.7,
  },
  {
    accountHandle: null,
    category: "strategy",
    severity: "low",
    title: "本部テーマ「デスクワーク×姿勢改善」を横浜院向けにローカライズしましょう",
    observation: "横浜院のターゲットは地域住民（子育て世代）で、デスクワーク訴求とずれがあります。",
    insight: "同じテーマでも、横浜院は「家事・育児の姿勢」に置き換えると共感が得やすくなります。",
    hypothesis: "ローカライズルールに沿って生活シーンを置き換えると、保存数が維持できる可能性があります。",
    recommendedAction: "本部テンプレートの「全店舗の下書きを生成」で横浜院の案を確認し、表現を調整してください。",
    expectedImpact: "全店舗で一貫したキャンペーン訴求",
    confidence: 0.6,
  },
];
