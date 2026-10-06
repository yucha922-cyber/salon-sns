# nao — AI Marketing Partner (Frontend MVP)

サロン・整体・美容事業者を最初の対象にした、AI SNS / 広告運用プラットフォームのデモです。ビジネスプロフィール（Brand Brain）をもとに、SNS運用、広告分析、クリエイティブ制作を支援する体験を、外部APIなしで操作できます。

## 起動方法

依存パッケージ不要の静的フロントエンドです。`index.html` をブラウザで開くか、リポジトリのルートで簡易HTTPサーバーを起動してください。

```sh
python3 -m http.server 8000
```

ブラウザで `http://localhost:8000` を開くと、NAORU 渋谷店のデモデータで操作できます。Google Fontsの接続がない環境ではシステムフォントにフォールバックします。

## 実装した機能

- **ダッシュボード** — SNS投稿数、フォロワー増加、リーチ、エンゲージメント、広告費、CTR、CPA、ROAS、推移グラフ、AIの今日の提案、直近投稿とキャンペーン。
- **投稿カレンダー** — 月表示、月移動、投稿イベント表示、日付から投稿作成、AIによる1ヶ月分の投稿案作成フロー。
- **AI投稿作成** — SNS、形式、テーマ、目的、対象、トーンの設定、SNS投稿プレビュー、生成・下書き・カレンダー追加操作。
- **投稿一覧** — 予約済み・下書き・確認待ちのフィルター、投稿情報一覧。
- **広告ダッシュボード** — Campaign / Ad Set / Creativeのタブ、費用・表示・CTR・CV・CPA・ROAS、推移グラフ、AI分析。
- **AI分析** — 広告のクリエイティブ疲労やSNS投稿の成長機会、Human-in-the-loopの改善提案と承認UI。
- **Creative Studio** — 目的・サービス・ターゲット・悩み・媒体・ニュアンスを選び、4つの広告コンセプトから選択してCreative生成に進むUI。
- **AIマーケター** — Brand Brainと今月の運用データを参照する想定のチャット。投稿相談やCPA分析などのデモ応答。
- **Brand Brain** — 会社・店舗、業種、所在地、サービス価格、強み、競合、ペルソナ、ブランドイメージ、投稿トーン、参考素材、業種ガイド。
- **設定** — 業種やワークスペース、承認ワークフローの設定UI。
- **レスポンシブ** — PCを主軸に、モバイルではサイドバーと主要コンテンツを最適化。

ナビゲーション、フィルター、カレンダー移動、フォーム選択、モーダル、トースト、チャット、コンセプト選択などを操作できます。広告の承認UIは、承認しただけで配信設定や広告費を変更しないデモ動作です。

## ディレクトリ構成

```text
.
├── index.html       # アプリシェル、サイドバー、ヘッダー
├── styles.css       # デザインシステムとレスポンシブレイアウト
├── app.js           # 画面、モックドメインデータ、ナビゲーション、操作
├── README.md        # 機能・構成・API接続・ロードマップ
├── naoru_shibuya_video.html # 既存の独立した動画デモ（変更なし）
└── NAORU_Shibuya.imovielibrary/ # 既存素材（変更なし）
```

このリポジトリにはアプリ用の既存フレームワークや依存関係がなかったため、今回のデモは追加依存なしで即時起動できるSPAとして作成しています。規模拡大時はNext.js App Router / TypeScript / Tailwind CSSへ段階的に移行できます。

## データモデルと拡張性

モックは `app.js` の `brand`、`campaigns`、`posts` を起点にしています。`brand.industry` は `key`、画面表示名、業種別のAIガイドを分け、業種でAIの挙動を変える構造です。サロン固有の文言・データをUIロジックに埋め込みすぎないよう、将来は以下の概念に分割します。

- `Organization` → `User` / `Membership`
- `Brand` → `IndustryProfile` / `AudiencePersona` / `BrandAsset`
- `Location` → `SocialAccount`
- `Post` → `PostVariant` / `PostMetric`
- `Campaign` → `AdSet` → `Ad` → `Creative`
- `Metric` — 対象、期間、指標名、値、取得元を保持
- `AIRecommendation` — 根拠、提案、影響範囲、状態（draft / pending_approval / approved / dismissed / applied）を保持

複数店舗を持つOrganizationで、Brandを共有しつつ店舗・SNSアカウント・キャンペーンをLocationに紐付けられる構成を想定します。

## Backend / API接続が必要な箇所

1. **認証・テナント境界** — Supabase Auth、Organization/Membership、ロール、店舗切り替え、Row Level Security。
2. **Brand Brain永続化** — PostgreSQLのBrand/Location/Service/Persona、参考素材ストレージ、業種別システム指示とブランド更新履歴。
3. **SNS連携** — Instagram / Threads / TikTok / Facebook OAuth、投稿予約・公開状態、インサイト取得。APIごとの権限・審査要件も確認が必要。
4. **広告連携** — Meta Marketing API等からCampaign/AdSet/Ad/Creative/Metricを同期。通貨、アトリビューション窓、取得時刻を明示。
5. **AI provider abstraction** — `MarketingAssistant`、`PostGenerator`、`AdAnalyst`、`CreativeProvider` の境界を設け、OpenAI / Anthropic等を環境設定で差し替える。Brand Brainと業種ガイドはprovider共通コンテキストにする。
6. **画像・動画生成** — Creative Studioの生成キュー、provider、アセット保存、再生成、利用枠を接続。
7. **人の承認フロー** — Recommendationの提案・承認・適用を分離。承認者、対象の変更差分、監査ログ、取り消し方法をサーバー側で保持し、MVPは承認なしで広告変更を行わない。
8. **計測とレポート** — SNS/広告/予約システムの指標定義、同期ジョブ、失敗表示、レポート生成。

## 次に実装する優先順位

1. **Next.js / TypeScriptへの移行とコンポーネント分割** — 画面ルーティング、共通UI、型付きdomain/API層を整備。
2. **Supabase Auth + マルチテナントDB** — Organization / Location / Brand、初回オンボーディングと権限を実装。
3. **Brand Brainの保存・編集・参考素材** — 実データが各AI機能に一貫して流れる基盤を作る。
4. **AI投稿作成とMarketing Chat** — provider adapter、構造化出力、業種ガードレール、生成履歴。
5. **SNSアカウント接続と投稿予約** — まずInstagram/Threadsから対象APIと審査条件を確定し、手動承認付きで公開。
6. **Meta広告データ同期と分析** — 読み取り専用から始め、指標の期間比較とAI Recommendationの根拠を実装。
7. **承認ワークフローとCreative生成** — 監査可能な承認後の操作として段階リリースし、自動変更を最後に検討。

## デモデータについて

画面の店舗、投稿、広告成果、チャット回答はすべてフロントエンド内のモックです。生成、接続、保存、承認、エクスポートの一部はUI上のデモ応答で、外部サービスに対する操作や永続化は行いません。
