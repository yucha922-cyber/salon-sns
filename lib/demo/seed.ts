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
  companyName: "NAORU Demo HQ",
  brandName: "NAORU整体",
  industry: { key: "seitai", label: "整体 / Healthcare / Wellness" },
  businessDescription:
    "渋谷駅徒歩5分の完全個室の整体院。AI姿勢分析と国家資格保有者の施術で、デスクワークによる肩こり・首こり・姿勢の崩れを根本からケアします。",
  website: "naorusalon.jp/shibuya",
  social: {
    instagram: "@naoru_recruit",
    threads: "@naoru_careers",
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
  strengths: ["AI姿勢分析", "国家資格者が担当", "原因分析", "清潔感のある完全個室"],
  features: ["21時まで営業", "渋谷駅徒歩5分", "LINEで簡単予約"],
  competitors: [
    { name: "渋谷整体サロン", note: "低価格・回数券中心" },
    { name: "姿勢ラボ渋谷", note: "ジム併設、トレーニング寄り" },
  ],
  differentiators: ["データで姿勢の変化を可視化", "施術とセルフケア指導をセットで提供"],
  targetAudience: {
    summary: "30代女性 / 渋谷勤務 / デスクワーク",
    ageRange: "30代",
    gender: "女性中心（約70%）",
    occupation: "渋谷勤務のデスクワーカー",
    painPoints: ["肩こり", "首こり", "姿勢", "疲労"],
    useCases: ["仕事帰りのリフレッシュ", "月1回の定期メンテナンス"],
  },
  personas: [
    { name: "仕事帰りに通いたい会社員", description: "IT企業勤務・32歳。夕方になると肩が重く、21時まで開いている整体を探している。" },
    { name: "根本から姿勢を整えたい人", description: "マッサージでは戻ってしまうので、原因から改善したい。" },
    { name: "美容と健康を両立したい人", description: "姿勢を整えて見た目の印象も良くしたい。" },
  ],
  brandPersonality: ["専門的", "親しみやすい", "都会的", "清潔感"],
  brandTone: ["やさしく、話しかけるように", "専門用語はわかりやすく説明", "過度な効果保証を避ける"],
  writingTone: "専門家としての信頼感を保ちつつ、友人に話しかけるようなやさしい文体。絵文字は1投稿2つまで。",
  marketingGoals: "新規体験予約を月40件獲得する",
  socialGoals: "Instagramの保存数を増やし、プロフィール経由の予約を伸ばす",
  advertisingGoals: "Meta広告でCPA ¥7,000以下を維持しながら新規予約を獲得する",
  aiContext: "初回カウンセリング（¥3,300）を入口にする。「治る」など医療的な断定表現は使わない。",
};

/**
 * Demo planner posts spread over the current month (Japan time): past days are
 * "published", upcoming ones "scheduled" or "draft". Acquisition and
 * recruitment posts across stores and HQ accounts.
 */
export type DemoPost = NewPostInput & { accountHandle: string };

export function buildDemoPosts(now: Date = new Date()): DemoPost[] {
  const [y, m, today] = jstDateKey(now).split("-").map(Number) as [number, number, number];
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const at = (day: number, hour: number, minute = 0): string =>
    new Date(Date.UTC(y, m - 1, Math.min(day, lastDay), hour - 9, minute)).toISOString();
  const statusFor = (day: number, draft = false): NewPostInput["status"] =>
    Math.min(day, lastDay) < today ? "published" : draft ? "draft" : "scheduled";
  const p = (
    accountHandle: string,
    platform: NewPostInput["platform"],
    contentType: NewPostInput["contentType"],
    day: number,
    hour: number,
    title: string,
    caption: string,
    cta: string,
    hashtags: string[],
    draft = false,
  ): DemoPost => ({ accountHandle, platform, contentType, title, caption, cta, hashtags, status: statusFor(day, draft), scheduledAt: at(day, hour), source: "demo" });

  return [
    p("@naoru_shibuya", "instagram", "reel", 2, 20, "肩こりが治らない人のNG習慣3選", "マッサージしても肩こりが戻るのは、毎日の習慣が原因かもしれません。デスクワーク中にやりがちなNG習慣を3つ紹介します。", "保存して、あとで見返してくださいね", ["#渋谷整体", "#肩こり", "#デスクワーク"]),
    p("@naoru_shibuya_threads", "threads", "threads_text", 3, 12, "首こりがひどい人、実は肩だけ揉んでも改善しません", "首こりがひどい人、実は肩だけ揉んでも改善しません。原因は「頭の位置」にあることが多いんです。", "気になる方はプロフィールのLINEから", ["#首こり"]),
    p("@naoru_shibuya", "instagram", "carousel", 5, 20, "デスクワーク中の正しい姿勢", "モニターの高さ、椅子の深さ、足の置き方。今日から変えられる3つのポイントをまとめました。", "保存してデスクで試してみてください", ["#渋谷整体", "#姿勢改善", "#デスクワーク"]),
    p("@naoru_recruit", "instagram", "reel", 6, 21, "NAORUで働くセラピストの1日", "9:45出勤、ミーティング、施術、研修。渋谷院スタッフの1日をのぞいてみませんか？", "見学・カジュアル面談はDMから", ["#セラピスト求人", "#理学療法士", "#整体師募集"]),
    p("@naoru_ikebukuro", "instagram", "educational", 8, 19, "腰痛の原因は座り方にあった", "池袋で働く会社員に多い腰痛。座り方の癖と、昼休みにできるリセット方法を解説します。", "昼休み30分コースはプロフィールから", ["#池袋整体", "#腰痛"]),
    p("@naoru_shibuya", "instagram", "before_after", 9, 20, "姿勢分析でわかる施術前後の変化（許諾済み）", "AI姿勢分析で、施術前後の姿勢を比べました。※効果には個人差があります。", "初回姿勢チェックはLINEから", ["#姿勢分析", "#渋谷整体"]),
    p("@naoru_careers", "threads", "threads_text", 10, 21, "病院勤務から整体に転職して変わったこと", "病院勤務から整体院に転職して一番変わったのは、患者さん一人ひとりと向き合える時間でした。", "気になったらDMで気軽に質問を", ["#理学療法士"]),
    p("@naoru_yokohama", "instagram", "testimonial", 12, 10, "お客様の声「子育て中でも通いやすい」（許諾済み）", "キッズスペースがあるので、子どもを連れて通えるのが助かります。（30代・横浜市在住）", "ご予約はお電話・LINEで", ["#横浜整体", "#産後骨盤矯正横浜"]),
    p("@naoru_shibuya", "instagram", "staff", 13, 20, "スタッフ紹介：院長 佐藤（姿勢分析の専門家）", "国家資格を持つ院長の佐藤が、施術で大切にしていることをお話しします。", "ご予約はプロフィールのLINEから", ["#渋谷整体", "#スタッフ紹介"]),
    p("@naoru_shibuya_threads", "threads", "threads_text", 15, 12, "夕方になると肩が重くなる理由", "夕方の肩の重さは、座り姿勢の「前のめり」が積み重なったサインかもしれません。", "プロフィールのLINEから相談できます", ["#肩こり"]),
    p("@naoru_recruit", "instagram", "carousel", 16, 21, "入社1年目で身につく技術と研修", "未経験の手技も3ヶ月で現場デビュー。研修カリキュラムをまとめました。", "採用ページはプロフィールから", ["#セラピスト求人", "#整体師募集"], true),
    p("@naoru_ikebukuro_threads", "threads", "threads_text", 17, 12, "昼休み30分で整える、という選択肢", "昼休みの30分で体を整える人が増えています。池袋駅から徒歩3分です。", "プロフィールから予約", ["#池袋整体"]),
    p("@naoru_shibuya", "instagram", "reel", 19, 20, "1分でできる首こりセルフケア", "仕事の合間に、座ったままできる首まわりのストレッチを紹介します。", "保存して毎日の習慣に", ["#首こり", "#セルフケア", "#渋谷整体"], true),
    p("@naoru_yokohama_threads", "threads", "threads_text", 20, 9, "施術後3日間の過ごし方", "施術後は水分をしっかりとって、湯船で体を温めてください。体の軽さが長持ちします。", "次回のご予約はLINEから", ["#横浜整体"]),
    p("@naoru_shibuya", "instagram", "offer", 22, 20, "今月限定：初回姿勢チェック無料", "デスクワーク×姿勢改善キャンペーン。今月は初回の姿勢チェックが無料です。", "LINEから初回予約", ["#渋谷整体", "#初回無料"]),
    p("@naoru_recruit", "instagram", "staff", 24, 21, "社員インタビュー：3年目セラピストのキャリア", "教育担当になった3年目スタッフに、キャリアの選び方を聞きました。", "見学・カジュアル面談はDMから", ["#理学療法士", "#キャリア"], true),
    p("@naoru_ikebukuro", "instagram", "carousel", 26, 19, "よくある質問：初めての整体Q&A", "服装は？時間は？痛くない？はじめての方からよくある質問にお答えします。", "ご予約はプロフィールから", ["#池袋整体", "#整体初めて"], true),
    p("@naoru_shibuya", "instagram", "feed", 28, 20, "初回カウンセリングの流れ", "カウンセリング→AI姿勢分析→施術→セルフケア指導。はじめての方の流れをご紹介します。", "ご予約はプロフィールのリンクから", ["#渋谷整体", "#初回カウンセリング"], true),
  ];
}

export const DEMO_METRICS: { sns: MetricSummary[]; ads: MetricSummary[] } = {
  sns: [
    { label: "今月の投稿数", value: "18本", change: "+4.2%", glyph: "▤", positive: true },
    { label: "フォロワー増加", value: "+284", change: "+12.8%", glyph: "♧", positive: true },
    { label: "リーチ", value: "24.8k", change: "+18.6%", glyph: "◉", positive: true },
    { label: "エンゲージメント率", value: "4.82%", change: "+0.6pt", glyph: "↗", positive: true },
  ],
  ads: [
    { label: "広告費", value: "¥674k", change: "+6.3%", glyph: "￥", positive: true },
    { label: "CTR", value: "1.86%", change: "+0.24pt", glyph: "⌁", positive: true },
    { label: "CVR", value: "3.4%", change: "+0.3pt", glyph: "◎", positive: true },
    { label: "CPA", value: "¥6,425", change: "−12.4%", glyph: "◎", positive: true },
    { label: "ROAS", value: "3.42x", change: "+0.38x", glyph: "↗", positive: true },
    { label: "CV", value: "105件", change: "+18.0%", glyph: "✓", positive: true },
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
    handle: "@naoru_careers",
    displayName: "NAORU 採用 Threads（本部）",
    locationIndex: null,
    goal: "recruitment",
    customGoal: "",
    active: true,
    strategy: {
      targetAudience: "20〜30代 / 理学療法士・柔道整復師・セラピスト",
      persona: "転職をぼんやり考えている若手セラピスト。働く人の本音や職場のリアルを短い言葉で知りたい。",
      kpiTargets: [
        { metric: "プロフィールアクセス", target: 300, unit: "回/月" },
        { metric: "DM", target: 5, unit: "件/月" },
      ],
      contentPillars: ["employee_voice", "culture", "day_in_the_life", "career"],
      postsPerWeek: 3,
      postingFrequencyNote: "スタッフの本音を短文で",
      preferredPostingDays: [1, 3, 5],
      preferredPostingTimes: ["21:00"],
      cta: "気になったらDMで気軽に質問を",
      tone: "等身大で、働く人の言葉で",
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
    accountHandle: "@naoru_shibuya",
    category: "social",
    severity: "medium",
    title: "渋谷院InstagramのReel保存率が高いため、今週はHow-to系投稿を2本増やすことをおすすめします",
    observation: "直近のReel投稿の保存率が平均より32%高く、特に「肩こりセルフケア」系の保存が伸びています。",
    insight: "保存は「あとで試したい」という意図の表れで、予約前の比較検討につながりやすい行動です。",
    hypothesis: "How-to系Reelを週2本追加すると、プロフィールアクセスとLINE登録が増える可能性があります。",
    recommendedAction: "今週の投稿計画に「1分でできるセルフケア」系Reelを2本追加してください。",
    expectedImpact: "保存数・プロフィールアクセスの増加",
    confidence: 0.8,
  },
  {
    accountHandle: null,
    category: "creative",
    severity: "high",
    title: "肩こり訴求CreativeのCTRが直近7日平均より18%低下しています",
    observation: "Meta広告の肩こり訴求クリエイティブで、CTRが直近7日平均から18%低下しました。LPのCVRは維持されています。",
    insight: "同じクリエイティブの配信が続き、広告疲労が起きている可能性があります。",
    hypothesis: "ファーストビューを「デスクワーク中の姿勢」に変えた新案でCTRが回復する可能性があります。",
    recommendedAction: "Creative Studioで新しいコンセプトを2案作り、現行広告と並行テストしてください（予算変更はしません）。",
    expectedImpact: "CTRの回復・CPAの維持",
    confidence: 0.7,
  },
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
