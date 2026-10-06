# NAORU AI マーケティングパートナー (SaaS MVP)

## Product overview

サロン・整体・美容事業者向けの **AI SNS / 広告運用プラットフォーム** です。
ユーザーはアカウントを作成し、自社情報（Brand Brain）を登録すると、自社を理解した「専属AIマーケター」に相談し、SNS投稿を生成して投稿カレンダーに登録できます。

```
Sign up / Login → Organization作成 → Business Profile入力（6ステップ）→ Brand Brain保存
→ Dashboard → AI Marketing Chat → AI Post Creator → SNS Plannerへ保存
```

「投稿を1件ずつ作るAIツール」ではなく、**本部が複数店舗のSNSアカウントをAIで企画・管理する運用プラットフォーム**を目指しています。

```
目的を設定（アカウント戦略）→ AIが運用戦略を提案（AI Account Strategist）
→ AIが月間企画を作成（AIで1ヶ月分作成）→ 人が確認・承認（Human-in-the-loop）
→ キャプション生成 → 投稿（※API連携は未実装）→ 結果分析 → 次回企画へ反映（AI Recommendation）
```

- **アカウント戦略**：SNSアカウントごとに目的（集客・採用・ブランディング・エンゲージメント・リピート・カスタム）とターゲット・KPI目標・コンテンツの柱・投稿頻度/曜日/時間・CTA戦略・トーンを設定
- **本部 / 店舗の一括管理**：Organization → 本部アカウント + Location（店舗）→ 各SNSアカウント。ダッシュボードとカレンダーを「全店舗 / 店舗 / アカウント」で切り替え
- **本部テンプレート**：月のテーマ・必須/任意メッセージ・ローカライズのルールを全店舗に配布し、店舗ごとにAIがローカライズ
- **店舗カスタマイズ**：エリア・客層・スタッフ・オファー・ローカルキーワード

外部SNS API（Instagram / Meta広告など）への接続と、広告の自動変更は **まだ行いません**。

## Tech stack

| 領域 | 採用技術 |
|---|---|
| Framework | Next.js 15 (App Router, Server Components, Server Actions) |
| Language | TypeScript (strict, `noUncheckedIndexedAccess`) |
| Styling | 既存デザインシステムのCSS（`app/globals.css`）をそのまま移植 |
| Auth / DB | Supabase (Auth, PostgreSQL, Row Level Security) / `@supabase/ssr` |
| Validation | zod（フォーム入力・Server Action・AI構造化出力） |
| AI | Provider抽象（Anthropic SDK / OpenAI HTTP / Mock） |
| Test | Vitest（unit）, Playwright（E2E）, SQLのRLSテスト |

> Tailwind は使っていません。既存UIのクラス設計（`.panel` `.metric-card` など）が完成度高く、置き換えるとデザインが崩れるリスクが大きいためです。

## Architecture

```
Browser (Client Components)
   │  Server Actions（zodで入力検証）
   ▼
app/actions/*  ──►  lib/auth/context.ts  … ログインユーザー＋所属組織を解決（Cookieは所属組織の中から選ぶだけ）
   │
   ├─► lib/data/repository.ts（DataRepository interface）
   │      ├─ SupabaseRepository … ユーザーのJWTでクエリ → RLSでテナント分離
   │      └─ DemoRepository     … Supabase未設定時。メモリ保存＋明示的なメンバーシップ検証
   │
   └─► lib/ai/*  … AIProvider interface ＋ prompts（buildBrandContext() で共通コンテキスト）
```

- UIは repository / AI SDK を直接呼びません。すべて Server Action 経由です。
- API キーは `server-only` モジュールからのみ参照し、クライアントへ露出しません。
- ルート保護は `middleware.ts`（一次ゲート）＋ 各ページ/Actionでのセッション再検証（二重チェック）。

## Directory structure

```text
app/
  (auth)/login, (auth)/signup   ログイン・新規登録
  auth/callback                 Supabaseのメール確認コールバック
  onboarding/                   6ステップのオンボーディング（/complete で完成画面）
  (app)/                        ログイン必須の製品画面（共通シェル）
    dashboard planner creator posts ads analysis studio chat brand settings
    accounts hq locations       アカウント戦略 / 本部テンプレート / 店舗カスタマイズ
  actions/                      Server Actions（auth, organization, brand, ai, posts, strategy）
components/
  shell/ ui/ auth/ onboarding/ brand/ chat/ creator/ posts/ ads/ studio/ settings/
lib/
  domain/        Domain type・zodスキーマ・ラベル・日付（JST）
  brand/         buildBrandContext(), 業種プリセット
  ai/            provider.ts, anthropic.ts, openai.ts, mock.ts, schemas.ts, prompts/
  data/          Repository interface と Supabase / Demo 実装
  auth/          認証ファサード、組織コンテキスト、Demoセッション
  supabase/      server/middleware クライアント、Database型
  services/      組織（デモ組織作成）、本部→店舗ローカライズ、分析リードモデル、エラー変換
  demo/seed.ts   デモ組織「NAORU整体 渋谷院」データ
supabase/
  migrations/    スキーマ＋RLS＋RPC
  tests/         RLS（テナント分離）テスト
tests/           Vitest
e2e/             Playwright（主要フロー）
middleware.ts    ルート保護
```

## Database schema

`supabase/migrations/` の3ファイル（`20261006000000_init.sql` → `20261007000000_accounts_hq_locations.sql` → `20261008000000_sns_operations_loop.sql` の順に適用）。全テーブル UUID 主キー・`created_at`/`updated_at`（トリガーで自動更新）。

| 区分 | テーブル |
|---|---|
| ユーザー・組織 | `profiles`, `organizations`(`is_demo`), `organization_members`(role: owner/admin/editor/viewer) |
| Brand Brain | `brands`, `business_profiles`, `locations`, `target_audiences`, `personas`, `services`, `competitors`, `brand_assets`, `social_accounts` |
| SNS Planner | `posts`(status: draft/scheduled/published/failed, `social_account_id`, `hq_campaign_id`, 企画項目 theme/hook/summary/goal/target/content_pillar/funnel_stage, `plan_proposal_item_id`), `post_schedules` |
| アカウント戦略 | `social_accounts`(goal: acquisition/recruitment/branding/engagement/retention/custom, custom_goal, active, 店舗紐付け or 本部, 同一SNSに複数可), `account_strategies`(target_audience, persona, kpi_targets jsonb, content_pillars, posts_per_week, preferred_posting_days, preferred_posting_times, cta, tone, notes) |
| Content Pillar | `content_pillars`(organization_id null = システム標準 / 組織のカスタム柱, goal別) |
| 本部・店舗 | `hq_campaigns`(title, description, goal, 期間, target_location_ids, target_platforms, content_directions, required/optional_messages, cta, status: draft/active/completed/archived, 共通クリエイティブ, localization_rules), `location_profiles`, `location_staff` |
| AI計画 | `ai_plan_proposals`(アカウント×月の企画案, status: pending/partially_approved/approved/rejected), `ai_plan_proposal_items`(日時・形式・テーマ・フック・概要・目的・ターゲット・柱・ファネル段階・CTA, status: pending/approved/rejected, 承認後の post_id) |
| 広告 | `campaigns`, `ad_sets`, `ads`, `creatives`, `metrics` |
| AI | `ai_recommendations`(location/social_account任意, category, severity, observation, insight, hypothesis, recommended_action, expected_impact, confidence, status: pending/approved/rejected/completed), `ai_conversations`, `ai_messages` |

campaign_locations / campaign_social_accounts のような中間テーブルは作らず、`target_location_ids` / `target_platforms` 配列＋同一組織チェックのトリガーで扱っています（テーブルを増やしすぎないため）。

RPC:
- `create_organization(name, is_demo)` — 組織・owner権限・空のBrand Brainを原子的に作成
- `save_brand_brain(brand_id, payload)` — Brand Brain全体を1トランザクションで保存（SECURITY INVOKER = RLS適用）
- `sync_brand_default_accounts(brand_id, social)` — Brand BrainのSNS欄を「ブランド標準アカウント」と同期（店舗・採用アカウントや戦略は保持）

今回アプリが読み書きしているのは ユーザー・組織・Brand Brain・SNS・AI会話 のテーブルです。広告系テーブルは将来の同期先として定義のみ。

## Authentication flow

1. `/signup` → `signUpAction` → Supabase `auth.signUp`（メール確認が有効なら確認メール → `/auth/callback`）
2. `/login` → `signInAction` → `signInWithPassword`。セッションは `@supabase/ssr` のCookieに保存され、`middleware.ts` が毎リクエストでリフレッシュ（Session persistence）
3. 未ログインで保護ページへアクセス → `/login?next=...` へリダイレクト（`next` は同一サイトの相対パスのみ許可）
4. ログイン後、組織がない／オンボーディング未完了 → `/onboarding`
5. ログアウト → `signOutAction`

認証ロジックは `lib/auth/service.ts`（ファサード）に集約し、UIからはServer Actionを呼ぶだけです。

## Multi tenant architecture

- 1ユーザーは `organization_members` を通じて複数組織に所属できます（サイドバーの組織切替）。
- テナントデータはすべて `organization_id` を持ち、RLS ポリシー `is_org_member()` / `can_edit_org()` で分離。
- 子テーブルが別組織の親（brand / location / account / campaign / post / conversation）を参照できないよう、トリガーで同一組織を強制（本部キャンペーンの対象店舗も同様）。
- 「現在の組織」Cookieは、ユーザーの所属組織の中から選ぶためだけに使い、権限の根拠にはしません。
- `supabase/tests/rls_test.sql` / `rls_accounts_test.sql` / `rls_operations_test.sql` で「他組織の閲覧・更新・挿入・Brand Brain保存・異組織への紐付け（店舗・アカウント・キャンペーン）」がすべて拒否されることを検証済み。

## SNS operations loop（アカウント戦略 / 本部 / 月間計画）

```
Organization
├ 本部（HQ）アカウント … locationId なし（例：採用Instagram・ブランドThreads）
├ Location A（渋谷院）… Instagram（集客）/ Threads（集客）
├ Location B（池袋院）… Instagram / Threads
└ Location C（横浜院）… Instagram / Threads
```

- **アカウント戦略**（`/accounts`）：店舗別ツリー / 目的別で表示。編集画面で目的・ターゲット・ペルソナ・KPI目標・コンテンツの柱（ライブラリ + カスタム）・投稿頻度/曜日/時間・CTA戦略・トーン・メモ・運用中/停止を設定。
- **AI Account Strategist**：Brand Brain・店舗・業種・SNS・目的・既存戦略から、Goal / Target Persona / Primary・Secondary KPI / 推奨Content Pillars / 投稿頻度・曜日・時間 / CTA戦略 / Tone / Monthly Content Mix / Risks / Suggestions を構造化出力（zod検証）。**提案をフォームに適用してから人が保存**します。
- **AIで1ヶ月分作成**（`/planner`）：投稿枠はコードが「週あたり投稿数 × 優先曜日・時間」から算出（例：Instagram週4本、Threads週5本）。AIは各枠に企画（形式・テーマ・フック・概要・ターゲット・柱・CTA）を入れます。結果はまず **AI Proposal**（`/planner/proposals/[id]`）として表示し、すべて承認 / 個別承認 / 却下 / 編集 / 再生成ができ、**承認した企画だけ**が投稿カレンダーに「企画」として入ります。そこから「AIでキャプションを作成」で本文を作り、予約します。
- **集客と採用は別ロジック**：集客は「認知→悩み→教育→信頼→来店→予約」、採用は「認知→興味→共感→職場理解→キャリア理解→応募」。プロンプトのルール・使える形式（採用では Before/After・口コミ・オファーを使わない）・モックの企画バンクも完全に分けています。月の前半は上流、後半はコンバージョンに近い段階を割り当てます。
- **本部テンプレート**（`/hq`）：「今月は全店舗で肩こり訴求」のような本部テーマを、対象店舗・対象SNSへ配布。月間計画で本部テーマを選ぶか、「全店舗の下書きを生成」で店舗×SNSごとにローカライズ（渋谷院=渋谷勤務の女性、池袋院=池袋勤務の会社員、横浜院=地域住民）。必須メッセージは必ず含めます。
- **Dashboard**：「全店舗 / 店舗 / アカウント」切替。運用店舗数・運用アカウント数・集客/採用アカウント数・今月の予定/承認済み/下書き投稿数・店舗別ステータス（投稿頻度に対する計画進捗）・AI Recommendation・本部キャンペーン。
- **AI Recommendation**（`/analysis`・Dashboard）：「AIで運用レビュー」で計画状況から改善案（観測→示唆→仮説→推奨アクション）を作成。人が承認・却下・完了にします。承認しても自動では何も実行しません。
- AIへの優先順位: Brand Brain（事実・表現ルール）＜ アカウント戦略 ＜ 店舗情報。本部の必須メッセージとローカライズのルールは必ず守る制約として渡します。

## Brand Brain architecture

- 保存項目：会社名 / ブランド名 / 業種（プリセット or 自由入力）/ 事業説明 / Web / SNS（Instagram・Threads・TikTok・Facebook）/ 店舗（複数）/ サービス・説明・価格 / 強み / 特徴 / 競合 / 差別化 / ターゲット（年齢・性別・職業・悩み・利用シーン）/ ペルソナ / ブランドイメージ / トーン / 文章スタイル / 事業・SNS・広告目標 / AIへの補足メモ
- 業種は `industry_key`（自由なslug）＋表示名で保存。`restaurant` `clinic` `real_estate` なども、コード・スキーマ変更なしで追加可能（`lib/brand/industries.ts` にプリセットとAIガイド）。
- オンボーディングとBrand Brain編集画面は同じフォーム部品（`components/brand/sections.tsx`）を使い、同じ形で保存します。
- **`buildBrandContext()`**（`lib/brand/context.ts`）が Business / Brand / Industry / Locations / Services / Target Audience / Personas / Pain Points / Differentiators / Brand Tone / Marketing Goals を構造化し、`formatBrandContext()` が固定順のテキストにします。AI機能はすべてここを通ります。

## AI architecture

```
lib/ai/
  provider.ts        AIProvider interface（generateText / generateStructuredObject）
  anthropic.ts       Anthropic SDK（構造化出力 + サーバー側リフューザルフォールバック）
  openai.ts          OpenAI Chat Completions（json_schema）
  mock.ts            APIキーなしで動くMock（各機能のBrand Brain連動モック）
  schemas.ts         AI出力のzodスキーマ（投稿・Account Strategist・月間計画・運用レビュー・広告コンセプト・広告分析）
  prompts/
    marketing-chat.ts   post-creator.ts（本部ローカライズにも使用）
    account-strategy.ts（AI Account Strategist）  monthly-plan.ts（集客/採用で別ルール）
    operations-review.ts（AI Recommendation）  creative-studio.ts  ad-analysis.ts
lib/planning/slots.ts  投稿頻度・曜日・時間から月の投稿枠とファネル段階を決定（AIは枠を変えない）
lib/services/planning.ts  提案 → 承認/却下/編集/再生成 → 承認分だけ投稿化
```

- Provider選択：`AI_PROVIDER`（`anthropic` / `openai` / `mock`）。未指定ならキーがあるものを自動選択、なければ Mock。Anthropic のデフォルトモデルは `claude-opus-5-5`（`ANTHROPIC_MODEL` で変更可）。
- 構造化出力はすべて zod で検証。ユーザー入力は `<user_input>` で囲み、指示の上書きを防止。
- 共通ガードレール：実績の捏造禁止、効果の断定禁止、広告を自動変更したと言わない。
- AIマーケターの会話は `ai_conversations` / `ai_messages` に保存し、直近20件を履歴として送信。

## SNS連携：Instagram / Threads（Publish → Measure → Learn）

AIで企画 → 人間がApprove → Publish Queueに予約 → 自動投稿 → Insights取得 → AI Performance Review → Marketing Memory → 次の企画、までを1つのループとして実装しています。

```
Plan(Monthly Planner) → Create(Post Creator) → Approve(人) → Publish Queue → Publish(Meta API)
   ↑                                                                         ↓
Next Plan ← Learn(Marketing Memory) ← Analyze(AI Performance Review) ← Measure(Insights snapshots)
```

### 仕様の確認について（2026-10時点）

実装前にMetaの公式情報を確認しました。確認経路と未確定事項は [docs/meta-integration-notes.md](docs/meta-integration-notes.md) にまとめています。開発環境から developers.facebook.com を直接開けなかったため、公式ドキュメントの検索抜粋・Meta公式サンプル（fbsamples/threads_api）・Threads API公式チェンジログを使っています。ホスト・バージョンは環境変数で変更できるようにしています。

### Instagram Integration

- 方式：**Instagram API with Instagram Login**（`graph.instagram.com/v26.0`）。Facebookページが不要なため、店舗アカウントでもすぐ接続できます。Instagram側は **プロアカウント（ビジネス / クリエイター）が必要**です。
- 対応形式（MVP）：**画像（JPEG）**、**カルーセル（画像2〜10枚）**、**Reel（MP4/MOV、3秒〜15分、300MB以下、9:16推奨）**。
- 未対応：ストーリーズ、動画を含むカルーセル、商品タグ・ユーザータグ・コラボ投稿、ハッシュタグ検索（Facebook Login方式のみ）。
- 投稿フロー：コンテナ作成 `POST /{ig-user-id}/media` → `GET /{container}?fields=status_code`（FINISHEDまで待つ）→ `POST /{ig-user-id}/media_publish`。動画の処理待ちはブロッキングせず、ワーカーの次回実行で再開します（コンテナIDを先に保存し、二重投稿を防止）。
- 主な制約：キャプション2,200文字・ハッシュタグ30個・メンション20件、画像8MB・縦横比4:5〜1.91:1、24時間あたり100投稿（API公開分）。投稿前にこれらを検証し、**直し方**も表示します。
- Insights：`reach, views, likes, comments, shares, saved, total_interactions, follows, profile_visits`（Reelは `ig_reels_avg_watch_time` も）。**廃止済みの `impressions` / `plays` / `video_views` は使いません**。アカウント単位は `reach, views, total_interactions, accounts_engaged, profile_links_taps`（`metric_type=total_value`）とフォロワー数。

### Threads Integration

- `graph.threads.com/v1.0` / 認可 `www.threads.com/oauth/authorize`（Meta公式サンプルが2026-03に.netから移行。`THREADS_GRAPH_BASE_URL`で変更可）。Instagramアカウントとの連携は不要（ただしフォロワー数指標はInstagram連携プロフィールのみ）。
- 対応形式（MVP）：**テキスト**、**テキスト＋画像1枚（JPEG/PNG・8MB）**、**テキスト＋動画1本（MP4/MOV・5分・1GB）**。
- 未対応：カルーセル、投票、リンク添付カード、位置情報、返信管理。
- 制約：500文字（絵文字はUTF-8バイト数で計算。日本語の数え方は公式未記載のため、上限付近で警告）、リンク5件まで、トピックタグは1つ（最初のハッシュタグのみ投稿）、24時間あたり250投稿。
- Insights：`views, likes, replies, reposts, quotes, shares`（Threadsにはリーチ・保存はありません）。アカウント単位は `views, likes, replies, reposts, quotes, clicks` と（取得可能なら）`followers_count`。

### OAuth Flow

```
「Instagramを接続」/「Threadsを接続」（アカウント戦略画面）
 → GET /api/social/connect/{platform}   … 権限チェック、state生成（httpOnly・署名付きCookieに紐付け）
 → Metaの認可画面（Demo Modeでは /social/mock-authorize のモック画面）
 → GET /api/social/callback/{platform}  … stateを照合（CSRF対策：値・ユーザー・プラットフォーム・期限）
      code → 短期トークン → 長期トークン（60日） → プロフィール取得
      → 暗号化して「接続待ち」に保存（15分・1回限り）
 → /accounts/connect                     … ユーザーが「どの店舗・どの目的のアカウントか」を選択
 → 接続を保存（social_account_credentials に暗号化保存、social_accounts に公開情報のみ）
```

- アクセストークンは **ブラウザに一切返しません**。DBでは `social_account_credentials`（RLS有効・ポリシーなし・grant剥奪＝service roleのみ）にAES-256-GCMで暗号化保存します。
- 長期トークンは期限7日前から自動更新（作成から24時間以上経過が条件）。失敗すると `reauthorization_required`（画面表示：Reconnect Required）。
- 状態表示：Connected / Token Expiring / Reconnect Required / Error / Disconnected / 未接続。

### Permissions（要求するscope）

| Platform | scope | 用途 |
|---|---|---|
| Instagram | `instagram_business_basic` | プロフィール・メディア一覧 |
| Instagram | `instagram_business_content_publish` | 投稿 |
| Instagram | `instagram_business_manage_insights` | インサイト |
| Threads | `threads_basic` | プロフィール（全エンドポイントで必須） |
| Threads | `threads_content_publish` | 投稿 |
| Threads | `threads_manage_insights` | インサイト |

旧scope名（`business_basic` など、2025-01-27廃止）やFacebook Login方式のscope（`instagram_basic` 等）は使いません。

### Social Provider Architecture

```
lib/social/
  provider.ts          SocialProvider interface（connectAccount / refreshConnection / publishPost /
                       getPostStatus / getPostInsights / getAccountInsights / validateContent / disconnectAccount）
  registry.ts          組織ごとに Meta / Mock を選択（将来 TikTok / X を追加する場所）
  instagram/  client.ts auth.ts publisher.ts insights.ts mapper.ts rules.ts index.ts
  threads/    client.ts auth.ts publisher.ts insights.ts mapper.ts rules.ts index.ts
  mock/       MockSocialProvider（Demo Mode・デモ組織・テスト。Metaに一切接続しない）
  publish-queue.ts     承認 → 予約（schedulePost）→ ワーカー → 投稿 / 再試行 / 失敗
  insights-sync.ts     チェックポイント同期（時系列スナップショット）+ 自動AIレビュー
  performance.ts       AI Performance Review → Marketing Memory / Recommendation
  analytics.ts         成果分析・本部の要対応リスト・店舗横断テーブル
  store.ts             SocialStore（demo-store.ts / supabase-store.ts）
  access.ts            権限・店舗スコープ・service role の使い分け
```

UIはproviderを直接呼びません（Server Action → service → provider）。

### Publish Queue

- 投稿ステータス：`draft` → `scheduled`（予定・計画）→ `approved`（**投稿内容を人が承認**）→ `queued`（Publish Queue）→ `publishing` → `published` / `failed`（AI計画の「Proposed」は月間計画の提案アイテム）。
- `publish_jobs`：id / organization / location / social account / post / provider / format / mode(scheduled|immediate) / scheduledAt / status(queued|publishing|retrying|published|failed|cancelled) / attemptCount / maxAttempts(3) / nextAttemptAt / lockedUntil / **content_snapshot（承認した文面とメディアをそのまま投稿）** / providerContainerId / providerPostId / permalink / providerResponse（サニタイズ済み）/ lastError / publishedAt。
- 承認・予約の条件：検証エラーなし、接続済みアカウント、未来の日時（予約時）。承認後に内容・投稿先・メディアを変更すると承認は取り消されます。予約中の投稿は編集できません（DBトリガーでも保護）。
- 「今すぐ投稿」：承認済み＋検証通過のみ。確認モーダル（アカウント・プラットフォーム・店舗・内容・日時・チェックボックス）を必ず挟みます。即時でもキューを経由します。
- 再試行：レート制限・一時障害・メディア処理エラーは 5分 → 15分 → 60分（またはRetry-After）で最大3回。トークン切れ・権限不足・内容不備は再試行せず即失敗（トークン系はアカウントを要再接続に）。無限リトライはしません。
- 1投稿につき有効なジョブは1つ（ユニークインデックス）。ジョブの取得は条件付きUPDATEでロックするため、複数ワーカーが同時に動いても二重投稿しません。

### Scheduler

- 実行本体：`/api/cron/social`（`Authorization: Bearer $CRON_SECRET`、`?task=publish|insights|tokens|all`）。特定のホスティングに依存しません。
- **推奨：Supabase Cron（pg_cron + pg_net）で毎分実行** → [supabase/scheduler/publish_cron.sql](supabase/scheduler/publish_cron.sql)。
- `vercel.json` の Vercel Cron は1日1回の保険（Vercel Hobbyは1日1回まで。Proなら `* * * * *` に変更可）。
- Demo Mode：サーバーレスの各インスタンスはメモリが別のため、ページ表示時（組織ごと30秒間隔）にキューとInsightsを処理します。Publish Queue画面の「今すぐキューを処理」でも実行できます。
- タイムゾーン：DBは`timestamptz`（UTC）。入力・表示は組織/店舗のタイムゾーン（日本の店舗は`Asia/Tokyo`、`organizations.timezone` / `locations.timezone`）。

### Insights Sync / Metrics

- 投稿ごとに公開後 **1時間・24時間・3日・7日・14日・30日** の時点でスナップショットを保存（上書きしない時系列：`metric_snapshots`）。API呼び出しは1投稿あたり最大6回。アカウント単位は約1日1回。
- 正規化レイヤー（`NormalizedMetrics`）：impressions / reach / views / engagements / likes / comments / shares / saves / clicks / follows / profileVisits / conversions / followers + platformSpecific。**取得できない指標は作りません**（例：Threadsのreach・saves、Instagramの投稿単位リンククリック）。
- 目的別の評価軸：集客＝保存率・プロフィールアクセス・リンククリック（DM・LINE・予約は「手動/今後連携」と明示）、採用＝プロフィール遷移・採用ページクリック（応募は今後連携）、ブランド＝リーチ・閲覧・ER・フォロワー。
- 計測済み投稿が3本未満の場合は比較やグラフを出さず「insufficient data」と表示します。

### Marketing Memory / AI Performance Review

- 公開から3日経過した投稿はAIが自動で振り返ります（入力：Brand Brain・アカウント戦略・目的・投稿・柱・投稿時間・時系列指標・アカウント平均・店舗）。出力：Performance Summary / What Worked / What Did Not Work / Possible Reasons / Key Learning / Recommended Next Action / Next Creative Hypothesis / Confidence。
- 学びは `content_learnings`（**Marketing Memory**）に確度つきで保存。Brand Brain（会社について知っていること）とは分離し、「実際に運用して学んだこと」として **Monthly Planner・AI Post Creator・Creative Studio・AIマーケター** のプロンプトに入ります（同じアカウント > 同じ店舗 > 同じSNS の順に優先）。古い学びはアーカイブできます。
- 改善提案は AI Recommendation（Observation / Insight / Hypothesis / Recommended Action / Expected Impact / Confidence、「実績データ」ラベル）として作成。**承認するとSNS Plannerに下書きが追加**され、却下も可能。AIが勝手に運用を変えることはありません。
- 本部向け：ダッシュボードの「要対応（問題・チャンス）」（再接続が必要／投稿失敗／指標低下／高パフォーマンス／投稿間隔）と「店舗横断パフォーマンス」（店舗・Platform・目的・投稿・Reach・ER・Growth・Top Content・Warnings・AI提案）。

### イベントログ（監査）

`social_event_logs`：account_connected / account_disconnected / account_reauthorization_required / token_refreshed / token_refresh_failed / post_approved / publish_queued / publish_cancelled / publish_started / publish_success / publish_failed / publish_retry_scheduled / insights_synced / insights_failed / review_generated / learning_saved / recommendation_generated / recommendation_approved / recommendation_rejected / webhook_received。Publish Queue画面に表示します。メッセージ・エラーはトークンを除去してから保存します。

### 権限（将来のロールを見据えた構造）

| 製品上のロール | 現在の実装 |
|---|---|
| HQ Admin | `owner` |
| Organization Admin | `admin` |
| Location Manager | `editor` ＋ `organization_members.location_ids`（担当店舗のみ閲覧・操作。HQアカウントは見えない） |
| Editor | `editor`（投稿作成・承認・予約。SNS接続は不可） |
| Viewer | `viewer`（閲覧のみ） |

新しいテーブルのRLSは `can_access_location()` で店舗スコープを強制します（既存テーブルの店舗スコープ化は今後の課題）。

### Security

- OAuth：state＋署名付きhttpOnly Cookie（ユーザー・組織・プラットフォーム・10分期限・1回限り）、モック認可のリダイレクト先は自サイトのコールバックのみ。
- トークン：サーバーのみ・AES-256-GCM暗号化・service roleのみアクセス可能なテーブル。画面・ログ・エラー・APIレスポンスに出しません。
- RLS：組織・店舗の分離。パイプライン（ジョブ・指標・ログ・接続状態・公開結果）はユーザーのキーでは書き込めません（DBトリガーで保護）。
- Webhook：`X-Hub-Signature-256`（App Secret HMAC）を検証、`hub.verify_token` による購読確認。Deauthorize / Data Deletion callback は `signed_request` を検証。
- 入力検証：zod（Server Action）、メディアの種類・サイズはサーバー側でも確認（Storageのオブジェクトサイズを信頼）。
- レート制限：今すぐ投稿・Insights取得・AI分析・接続開始・キュー実行にユーザー単位の制限。Meta側の制限はキューの再試行・日次上限チェックで対応。
- エラー：Metaのエラーはコードで分類し、ユーザーには日本語の安全なメッセージのみ表示。

### Media Storage

- Supabase Storage の非公開バケット `social-media`、パス：`organizationId/locationId|hq/posts/postId/assetId.ext`。
- アップロード：サーバーが署名付きアップロードURLを発行 → ブラウザからStorageへ直接（大きな動画がサーバーレス関数を通らない）→ サーバーが実サイズを確認。
- Metaへの受け渡し：6時間有効の署名付きURL。プレビュー：10分有効の署名付きURL。
- 投稿前にファイル形式・サイズ・縦横（ブラウザで計測）・動画の長さを検証し、SNSごとの制限に合わない場合は警告します。

### Required Environment Variables（SNS連携）

| 変数 | 用途 |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | ワーカー・トークン保管庫・Storage（サーバー専用） |
| `NEXT_PUBLIC_APP_URL`（または `NEXT_PUBLIC_SITE_URL`） | OAuthリダイレクトURIの基準 |
| `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` / `INSTAGRAM_REDIRECT_URI` | Instagram Login用のInstagram App（Meta App IDとは別の値） |
| `THREADS_APP_ID` / `THREADS_APP_SECRET` / `THREADS_REDIRECT_URI` | Threads用のApp ID/Secret（Threadsユースケースの値） |
| `INSTAGRAM_GRAPH_API_VERSION` / `THREADS_GRAPH_API_VERSION` / `THREADS_GRAPH_BASE_URL` | API変更への追従 |
| `SOCIAL_TOKEN_ENCRYPTION_KEY` | トークン暗号化（`openssl rand -base64 32`、Supabase本番で必須） |
| `CRON_SECRET` | `/api/cron/social` の認証 |
| `META_WEBHOOK_VERIFY_TOKEN` | Webhook購読確認 |
| `SOCIAL_PROVIDER_MODE=mock` | 実組織でもMockを使う（ステージング・E2E） |

### Meta App Setup（手動設定）

1. developers.facebook.com でアプリを作成し、ユースケース **「Instagram APIでメッセージとコンテンツを管理」（Instagram Login）** と **「Threads APIにアクセス」** を追加。
2. Instagram：API setup with Instagram login → Business login settings
   - Valid OAuth Redirect URIs：`https://<APP_URL>/api/social/callback/instagram`
   - Deauthorize callback URL：`https://<APP_URL>/api/social/meta/deauthorize`
   - Data deletion request URL：`https://<APP_URL>/api/social/meta/data-deletion`
   - 表示される **Instagram app ID / secret** を `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` に設定。
3. Threads：ユースケースの設定で Redirect Callback URL：`https://<APP_URL>/api/social/callback/threads`、Uninstall Callback URL：`…/api/social/meta/deauthorize`、Delete Callback URL：`…/api/social/meta/data-deletion`（3つとも入力しないと保存できません）。**Threads app ID / secret** を設定。
4. Webhooks（任意）：Callback URL `https://<APP_URL>/api/webhooks/meta`、Verify Token に `META_WEBHOOK_VERIFY_TOKEN`。現在は受信・検証・記録のみ（コメント等の処理は今後）。
5. App roles：テスト用に **Instagram Tester / Threads Tester** を追加し、相手側で承認（Instagram：設定 → アプリとウェブサイト → テスター招待、Threads：設定 → アカウント → ウェブサイトのアクセス許可 → 招待）。Threadsのテスターは公開アカウントである必要があります。
6. Supabase：`supabase/migrations/*.sql` を適用 → `supabase/scheduler/publish_cron.sql` で毎分のスケジューラーを登録 → Vercelに環境変数を設定。
7. プライバシーポリシーURL・アプリアイコン・データ削除の説明をApp設定に登録（Live化に必要）。

### App Review requirements

- 開発モード（Standard Access）では、アプリのロールを持つユーザー（管理者・開発者・テスター）のアカウントにしか接続できません。**NAORUの新店舗アカウントを自社で運用する範囲であれば、テスターとして追加して開発モードのまま運用テストできます**。
- 他社（顧客サロン）のアカウントを接続するSaaSとして提供するには、**Advanced Access のための App Review ＋ ビジネス認証** が必要です：`instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_insights`, `threads_basic`, `threads_content_publish`, `threads_manage_insights`。審査には各権限の利用目的と操作の画面録画（接続 → 予約 → 投稿 → インサイト表示）が必要です。

### Development / Production difference

| | Demo Mode / デモ組織 | Production（Supabase＋実組織） |
|---|---|---|
| Provider | MockSocialProvider（実SNSに投稿しない） | Instagram / Threads（Meta API） |
| 認可画面 | `/social/mock-authorize` | Meta |
| 保存先 | サーバーメモリ（インスタンスごと） | Supabase（RLS＋service role） |
| メディア | メモリ（4MBまで） | Supabase Storage（非公開・署名付きURL） |
| スケジューラー | ページ表示時の処理 / 手動 | Supabase Cron → `/api/cron/social` |
| 失敗テスト | 本文に `[fail:rate_limit]` `[fail-once:rate_limit]` `[fail:token]` `[fail:invalid]` `[fail:media]` を含めると再現（Mockのみ） | — |

最初の本番投稿は、**テスターに追加したテスト用アカウント**を新しいアカウントとして接続し、「今すぐ投稿」の確認モーダルで投稿先を確認してから行ってください。

### Current limitations

- Instagram：ストーリーズ・動画カルーセル・タグ付け未対応。Threads：カルーセル・投票・リンクカード未対応。
- 予約・応募・DM・LINE登録などのCV指標はSNS APIでは取得できないため未計測（予約システム・採用管理との連携が必要）。
- Webhookは検証と記録のみ。コメント返信・メンション管理は未対応。
- 公開済み投稿の削除・編集はSNSアプリで行います（API削除は未実装）。
- Demo Modeのデータはサーバーレスのインスタンスごとのメモリのため、時間が経つと初期状態に戻ります。
- 既存テーブル（投稿・アカウントなど）のRLSは組織単位。店舗単位のRLSは新テーブルのみで、既存テーブルはアプリ側で絞り込み。


## Environment variables

`.env.example` を `.env.local` にコピーして設定します（`.env.local` はコミットしない）。

| 変数 | 用途 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 設定するとSupabaseモード。未設定ならDemoモード |
| `NEXT_PUBLIC_DEMO_MODE` | `true` でSupabase設定に関わらず強制Demoモード（Preview確認用）。本番は未設定 |
| `NEXT_PUBLIC_SITE_URL` | メール確認リンクの戻り先 |
| `DEMO_SESSION_SECRET` | Demoモードのセッション署名（16文字以上） |
| `AI_PROVIDER` | `anthropic` / `openai` / `mock` |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Anthropic（サーバーのみ） |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | OpenAI（サーバーのみ） |
| SNS連携の変数 | 上の「Required Environment Variables（SNS連携）」を参照 |

## Local setup

```sh
npm install
cp .env.example .env.local   # 何も設定しなくてもDemoモードで起動します
npm run dev                  # http://localhost:3000
```

Supabaseを使う場合：

1. Supabaseプロジェクトを作成し、`supabase/migrations/*.sql` を SQL Editor で実行（または `supabase db push`）
2. `.env.local` に URL と anon key を設定
3. Auth の Site URL / Redirect URL に `http://localhost:3000/auth/callback` を追加

チェック：

```sh
npm run lint && npm run typecheck && npm test && npm run build
npm run test:e2e   # ビルド後に実行（Demoモードで起動して主要フローを検証）
# RLSテスト（ローカルPostgreSQL）
for t in rls_test rls_accounts_test rls_operations_test rls_publishing_test; do
  cat supabase/tests/auth_stub.sql supabase/migrations/*.sql supabase/tests/$t.sql | psql -d <scratch_db>
done
```

## Demo mode

- Supabase未設定時は **Demoモード**：サーバー内メモリ（開発時は `.demo-data/store.json` に保存）＋署名付きCookie認証。全フローが動作します。
- デモ組織 **NAORU Demo HQ**：渋谷院・池袋院・横浜院の3店舗。各店舗に Instagram + Threads（渋谷院Instagram＝集客／30代女性・渋谷勤務・デスクワーク、横浜院Threads＝リピート）、本部に採用Instagram（20〜30代 PT・柔道整復師・セラピスト）と採用Threads（@naoru_careers）。今月の投稿18本（集客・採用の両方）、店舗カスタマイズ、今月の本部テーマ「デスクワーク×姿勢改善」、承認待ちのAI Recommendationも入っています。
- ログイン画面の「✳ Demoで試す（NAORU Demo HQ）」で、デモ組織 **NAORU Demo HQ**（渋谷院・池袋院・横浜院／整体 / Healthcare / Wellness、30代女性・渋谷勤務・デスクワーク、肩こり・首こり・姿勢・疲労、AI姿勢分析・国家資格者・原因分析・清潔感、専門的・親しみやすい・都会的・清潔感）にすぐ入れます。Demo中は上部バーに「Demo Mode」と表示されます。
- Demoのユーザー・組織IDは決定的に生成されるため、サーバー再起動やサーバーレスの別インスタンスでもログイン状態・URLが有効です。ただし **Demo中に追加・編集したデータはインスタンスのメモリ上のみ** で、再起動（コールドスタート）で初期状態に戻ります。
- セッションが無効な場合は `/auth/reset` でCookieを消去して `/login?expired=1` に戻るため、リダイレクトループは起きません。

### Vercel で Preview を公開する手順

1. https://vercel.com/new で GitHub リポジトリ `salon-sns` を Import（Framework: Next.js は自動検出）
2. Environment Variables に `NEXT_PUBLIC_DEMO_MODE=true` と `DEMO_SESSION_SECRET=<32文字以上のランダム値>` を設定（Supabase / AI のキーは不要）
3. Deploy → 発行された URL の `/login` で「Demoで試す」をクリック
4. 以後 main への push で Production、ブランチ push で Preview が自動デプロイされます

※ GitHub Pages は静的ホスティングのため、このNext.jsアプリ（サーバー処理あり）は表示できません（READMEが表示されます）。
- 新規ユーザーもオンボーディングやサイドバーから「デモ組織」を追加できます（Supabaseモードでも可）。
- デモ組織は `organizations.is_demo = true`。SNSリーチや広告成果などのモック数値は **デモ組織にだけ** 表示し、本番組織には未連携の空状態を表示します。
- AIはAPIキーがなければ Mock Provider が Brand Brain を使ったモック応答を返します。

## 現在実装済み機能

- Sign up / Login / Logout / セッション維持 / 保護ルート / メール確認コールバック
- Organization作成・複数組織の切替・組織名変更、デモ組織作成
- 6ステップのオンボーディング（進捗表示・ステップ単位で保存・再開可能）→ Brand Brain完成画面
- Brand Brain 閲覧・タブ別編集・保存・完成度表示
- AIマーケター（Brand Brain参照、会話の保存・履歴表示、サジェスト）
- AI投稿作成（platform / 形式 / テーマ / ターゲット / 目的 / トーン → タイトル・キャプション・CTA・ハッシュタグ生成 → 編集 → 予約/下書きで SNS Planner に保存）
- 投稿カレンダー（月移動・SNS絞り込み・日付から作成・投稿編集）、投稿一覧（ステータス別）
- Creative Studio（Brand Brainから4つの広告コンセプトを生成）
- アカウント戦略（6つの目的、ターゲット・ペルソナ・KPI目標・コンテンツの柱ライブラリ・頻度/曜日/時間・CTA戦略・トーン・メモ・運用中/停止、店舗別ツリー/目的別表示）
- AI Account Strategist（構造化出力・提案の適用）
- AIで1ヶ月分作成 → AI Proposal 確認（すべて承認・個別承認・却下・編集・再生成）→ 承認分だけ投稿カレンダーへ → キャプション作成
- 本部テンプレート（目的・対象店舗・対象SNS・コンテンツ方針・必須/任意メッセージ・CTA・ステータス、店舗×SNSごとの下書き一括生成）
- ダッシュボードの本部運用ビュー（全店舗/店舗/アカウント切替、店舗別ステータス、AI Recommendation の承認）
- 店舗カスタマイズ（エリア・客層・注力サービス・スタッフ・オファー・ローカルキーワード）
- 広告ダッシュボード / AI分析（デモ組織のみデータ表示、AI再分析、承認UIは記録のみで広告は変更しない）
- Instagram / Threads の接続（OAuth・アカウント選択・接続状態・再接続・解除）、投稿前の検証、投稿内容の承認、Publish Queue（予約・今すぐ投稿・取り消し・再試行）、メディアアップロード
- Insightsの時系列保存、成果分析（目的別KPI・Top/Worst・柱/SNS/店舗/目的別）、AI Performance Review、Marketing Memory、実績ベースのRecommendation → Planner反映、本部の要対応リストと店舗横断テーブル、イベントログ
- Loading（Skeleton）/ Empty / Error state、Toast、フォームバリデーション、Disabled state

## 未実装機能

- 広告アカウント（Meta Marketing API）の連携・広告実績の同期、TikTok / X / YouTube / LINE / Facebookページ投稿
- 画像・動画生成
- メンバー招待・権限管理UI（店舗スタッフに担当店舗だけを編集させる店舗単位の権限）、通知、プラン・請求
- 本部キャンペーンの承認フロー（店舗の下書き → 本部承認 → 予約）、予約・応募などCV実績の連携
- 承認済みRecommendationの実行（例：自動で計画を作り直す）。現状は人が実行して完了にします
- AI応答のストリーミング、AI利用量の上限・レート制限
- パスワードリセット、ソーシャルログイン

## 今後必要な external API

| API | 用途 |
|---|---|
| Meta Marketing API | Campaign / AdSet / Ad / Creative / 指標の同期（読み取り→承認付き変更） |
| TikTok API (Content Posting / Business) | 動画投稿、広告データ |
| Facebook Pages API | ページ投稿 |
| Image generation API | 広告・投稿画像の生成 |
| Video generation API | Reel / ショート動画の生成 |
| 予約システム連携（ホットペッパー等） | 予約・CV計測 |

## 旧プロトタイプ

移行前の静的HTML/JSプロトタイプ（`index.html` / `app.js` / `styles.css`）は Git 履歴（commit `562a620` 以降）に残っています。デザインは `app/globals.css` にそのまま移植しています。
