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

## Environment variables

`.env.example` を `.env.local` にコピーして設定します（`.env.local` はコミットしない）。

| 変数 | 用途 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 設定するとSupabaseモード。未設定ならDemoモード |
| `NEXT_PUBLIC_SITE_URL` | メール確認リンクの戻り先 |
| `DEMO_SESSION_SECRET` | Demoモードのセッション署名（16文字以上） |
| `AI_PROVIDER` | `anthropic` / `openai` / `mock` |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Anthropic（サーバーのみ） |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | OpenAI（サーバーのみ） |

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
cat supabase/tests/auth_stub.sql supabase/migrations/*.sql supabase/tests/rls_test.sql | psql -d <scratch_db>
```

## Demo mode

- Supabase未設定時は **Demoモード**：サーバー内メモリ（開発時は `.demo-data/store.json` に保存）＋署名付きCookie認証。全フローが動作します。
- デモ組織 **NAORU Demo HQ**：渋谷院・池袋院・横浜院の3店舗。各店舗に Instagram + Threads（渋谷院Instagram＝集客／30代女性・渋谷勤務・デスクワーク、横浜院Threads＝リピート）、本部に採用Instagram（20〜30代 PT・柔道整復師・セラピスト）とブランドThreads。店舗カスタマイズ、今月の本部テーマ「デスクワーク×姿勢改善」、承認待ちのAI Recommendationも入っています。
- ログイン画面の「デモアカウントで試す」で、デモ組織 **NAORU整体 渋谷院**（整体 / Healthcare / Wellness、30代女性・渋谷勤務のデスクワーカー、肩こり・首こり・姿勢・仕事終わりの疲れ、清潔感・専門性・都会的・親しみやすい）にすぐ入れます。
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
- Loading（Skeleton）/ Empty / Error state、Toast、フォームバリデーション、Disabled state

## 未実装機能

- SNS・広告アカウントのOAuth連携、投稿の自動公開、インサイト・広告実績の同期
- 参考素材アップロード（Supabase Storage）、画像・動画生成
- メンバー招待・権限管理UI（店舗スタッフに担当店舗だけを編集させる店舗単位の権限）、通知、プラン・請求
- 本部キャンペーンの承認フロー（店舗の下書き → 本部承認 → 予約）、KPIの実績計測と「結果分析 → 次回企画へ反映」の自動化（SNS連携後）
- 承認済みRecommendationの実行（例：自動で計画を作り直す）。現状は人が実行して完了にします
- AI応答のストリーミング、AI利用量の上限・レート制限
- パスワードリセット、ソーシャルログイン

## 今後必要な external API

| API | 用途 |
|---|---|
| Meta Marketing API | Campaign / AdSet / Ad / Creative / 指標の同期（読み取り→承認付き変更） |
| Instagram Graph API | 投稿の予約公開、インサイト取得 |
| Threads API | 投稿公開、インサイト |
| TikTok API (Content Posting / Business) | 動画投稿、広告データ |
| Facebook Pages API | ページ投稿 |
| Image generation API | 広告・投稿画像の生成 |
| Video generation API | Reel / ショート動画の生成 |
| 予約システム連携（ホットペッパー等） | 予約・CV計測 |

## 旧プロトタイプ

移行前の静的HTML/JSプロトタイプ（`index.html` / `app.js` / `styles.css`）は Git 履歴（commit `562a620` 以降）に残っています。デザインは `app/globals.css` にそのまま移植しています。
