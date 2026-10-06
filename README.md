# NAORU AI マーケティングパートナー (SaaS MVP)

## Product overview

サロン・整体・美容事業者向けの **AI SNS / 広告運用プラットフォーム** です。
ユーザーはアカウントを作成し、自社情報（Brand Brain）を登録すると、自社を理解した「専属AIマーケター」に相談し、SNS投稿を生成して投稿カレンダーに登録できます。

```
Sign up / Login → Organization作成 → Business Profile入力（6ステップ）→ Brand Brain保存
→ Dashboard → AI Marketing Chat → AI Post Creator → SNS Plannerへ保存
```

複数店舗を持つ事業者向けに、**アカウント戦略**（集客・採用・ブランディング）、**本部テンプレート**（本部キャンペーンを各店舗向けにローカライズ）、**店舗カスタマイズ**（エリア・客層・スタッフ・オファー・ローカルキーワード）も備えています。

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

`supabase/migrations/20261006000000_init.sql` と `20261007000000_accounts_hq_locations.sql`。全テーブル UUID 主キー・`created_at`/`updated_at`（トリガーで自動更新）。

| 区分 | テーブル |
|---|---|
| ユーザー・組織 | `profiles`, `organizations`(`is_demo`), `organization_members`(role: owner/admin/editor/viewer) |
| Brand Brain | `brands`, `business_profiles`, `locations`, `target_audiences`, `personas`, `services`, `competitors`, `brand_assets`, `social_accounts` |
| SNS | `posts`(status: draft/scheduled/published/failed, `social_account_id`, `hq_campaign_id`), `post_schedules` |
| アカウント戦略 | `social_accounts`(goal: acquisition/recruitment/branding, 店舗紐付け, 同一SNSに複数可), `account_strategies`(persona, kpis, content_pillars, posts_per_week, cta, tone) |
| 本部・店舗 | `hq_campaigns`(共通テーマ・共通クリエイティブ・localization_rules・対象店舗), `location_profiles`(area, demographics, featured_services, offers, local_keywords), `location_staff` |
| 広告 | `campaigns`, `ad_sets`, `ads`, `creatives`, `metrics` |
| AI | `ai_recommendations`(承認ステータス), `ai_conversations`, `ai_messages` |

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
- `supabase/tests/rls_test.sql` / `rls_accounts_test.sql` で「他組織の閲覧・更新・挿入・Brand Brain保存・異組織への紐付け（店舗・アカウント・キャンペーン）」がすべて拒否されることを検証済み。

## Account strategy / HQ template / Location customization

```
Brand Brain（ブランド共通の事実）
  ├─ Account Strategy  … アカウントごとの目的（集客/採用/ブランディング）・ペルソナ・KPI・柱・頻度・CTA・トーン
  ├─ Location Customization … 店舗ごとのエリア・客層・注力サービス・スタッフ・オファー・ローカルキーワード
  └─ HQ Template … 本部キャンペーン・共通テーマ・共通クリエイティブ・ローカライズのルール
```

- **アカウント戦略**（`/accounts`）: 目的別にアカウントを管理。目的ごとのテンプレート適用、または「AIで提案」でBrand Brainと店舗情報から戦略を生成。
- **店舗カスタマイズ**（`/locations`）: Brand Brainの各店舗に追加情報を設定。
- **本部テンプレート**（`/hq`）: 共通テーマ・クリエイティブ・ルールを決め、「全店舗の下書きを生成」で対象店舗ごとにAIがローカライズした下書きを作成（各店舗の集客アカウントを自動選択、キャンペーン開始日20時に仮置き、人の確認後に予約）。
- **AI投稿作成**: アカウント・本部キャンペーンを選ぶと、その戦略・店舗情報・ローカライズルールが自動で反映。
- AIへの優先順位: Brand Brain（事実・表現ルール）＜ アカウント戦略 ＜ 店舗情報。ローカライズのルールは必ず守る制約として渡します。

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
  schemas.ts         AI出力のzodスキーマ（投稿・広告コンセプト・広告分析）
  prompts/
    marketing-chat.ts  post-creator.ts（本部ローカライズにも使用）  account-strategy.ts
    creative-studio.ts  ad-analysis.ts
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
- デモ組織には渋谷院・新宿院の2店舗、4つのアカウント（本部ブランディング・渋谷集客・新宿集客・採用）、店舗カスタマイズ、本部キャンペーン「秋の姿勢改善キャンペーン」が入っています。
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
- アカウント戦略（集客・採用・ブランディング別、ペルソナ・KPI・柱・頻度・CTA・トーン、テンプレート適用・AI提案）
- 本部テンプレート（本部キャンペーン・共通テーマ・共通クリエイティブ・ローカライズルール・対象店舗、全店舗分の下書きを一括生成）
- 店舗カスタマイズ（エリア・客層・注力サービス・スタッフ・オファー・ローカルキーワード）
- 広告ダッシュボード / AI分析（デモ組織のみデータ表示、AI再分析、承認UIは記録のみで広告は変更しない）
- Loading（Skeleton）/ Empty / Error state、Toast、フォームバリデーション、Disabled state

## 未実装機能

- SNS・広告アカウントのOAuth連携、投稿の自動公開、インサイト・広告実績の同期
- 参考素材アップロード（Supabase Storage）、画像・動画生成
- メンバー招待・権限管理UI（店舗スタッフに担当店舗だけを編集させる店舗単位の権限）、通知、プラン・請求
- 本部キャンペーンの承認フロー（店舗の下書き → 本部承認 → 予約）、KPIの実績計測（SNS連携後）
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
