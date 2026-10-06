# Meta API 仕様確認メモ（2026-10-06）

実装前に Instagram / Threads の現行仕様を確認した結果と、その根拠の確かさをまとめます。

**確認方法の制約**：開発環境のネットワーク制限で developers.facebook.com を直接開けませんでした。そのため次の情報源を使っています。

- **[公式抜粋]** 公式ドキュメントの検索エンジン抜粋（ページそのものは未読）
- **[公式サンプル]** Meta公式リポジトリ `github.com/fbsamples/threads_api` のソース（直接確認）
- **[公式CL]** Threads API公式チェンジログアカウント `@threadsapi.changelog` の抜粋
- **[第三者]** 第三者の資料のみ。実装では安全側の扱いにしています

本番投入前に、下の「要再確認」の項目を公式ページで確認してください。ホスト・APIバージョン・上限値は環境変数やコード定数で変更できます。

## Instagram（Instagram API with Instagram Login）

| 項目 | 採用した仕様 | 根拠 |
|---|---|---|
| 方式 | Instagram Login（`graph.instagram.com`）。Facebookページ不要、プロアカウント必須 | 公式抜粋（overview の比較表） |
| 認可 | `www.instagram.com/oauth/authorize`（client_id=Instagram App ID, redirect_uri, response_type=code, scope, state, force_reauth） | 公式抜粋 |
| code | 末尾の `#_` を除去、1時間・1回限り | 公式抜粋 |
| トークン | `POST api.instagram.com/oauth/access_token` → `GET /access_token?grant_type=ig_exchange_token`（60日）→ `GET /refresh_access_token?grant_type=ig_refresh_token`（24時間以上経過・未失効） | 公式抜粋 |
| scope | `instagram_business_basic / _content_publish / _manage_insights`（旧 `business_*` は 2025-01-27 廃止） | 公式抜粋 |
| APIバージョン | v26.0（2026-07-29 リリース） | 公式抜粋（changelog） |
| 公開 | `/media` → `status_code` → `/media_publish`。コンテナ有効期限24h。`VIDEO` は廃止で動画は `REELS` | 公式抜粋、廃止エラー文は第三者 |
| カルーセル | 最大10件、1投稿としてカウント | 公式抜粋 |
| 上限 | 24時間あたり100投稿（`content_publishing_limit`） | 公式抜粋（50と書かれたページも残る） |
| 画像 | JPEGのみ・8MB・4:5〜1.91:1・幅320〜1440 | 公式抜粋 |
| Reel | MOV/MP4・3秒〜15分・300MB・9:16推奨 | 公式抜粋（コーデック等は第三者） |
| Insights | `views` を使用。`impressions / plays / clips_replays_count / ig_reels_aggregated_all_plays_count` は v22.0（2025-04-21）で廃止 | 公式（v22 changelog）＋第三者 |
| Webhook | comments / mentions / story_insights 等。投稿完了・インサイトのWebhookはない。`X-Hub-Signature-256` | 公式抜粋 |
| 審査 | 他者のアカウントには Advanced Access（App Review＋ビジネス認証）が必要 | 公式抜粋 |

## Threads

| 項目 | 採用した仕様 | 根拠 |
|---|---|---|
| ホスト | `graph.threads.com/v1.0`、認可 `www.threads.com/oauth/authorize`（2026-03に公式サンプルが .net から移行。.net は廃止告知なし） | 公式サンプル |
| アカウント | Instagram連携は不要（2025-09〜）。ただし `followers_count` などは連携プロフィールのみ | 公式CL |
| App ID | Threadsユースケース専用の App ID / Secret（Meta App IDとは別） | 公式サンプル README |
| トークン | `POST /oauth/access_token` → `th_exchange_token`（60日）→ `th_refresh_token` | 公式サンプル＋公式抜粋 |
| scope | `threads_basic / threads_content_publish / threads_manage_insights` | 公式サンプル＋公式抜粋 |
| 公開 | `POST /{id}/threads`（TEXT / IMAGE / VIDEO / CAROUSEL）→ `status`（IN_PROGRESS / FINISHED / PUBLISHED / ERROR / EXPIRED）→ `threads_publish` | 公式サンプル＋公式抜粋 |
| 文字数・リンク | 500文字（絵文字はUTF-8バイト数）、リンク5件まで（2025-12-22〜） | 公式抜粋＋公式CL |
| トピックタグ | 1投稿1つ | 公式抜粋 |
| メディア | 画像 JPEG/PNG・8MB、動画 MOV/MP4・5分・1GB | 公式抜粋 |
| 上限 | 24時間あたり250投稿・1000返信（`threads_publishing_limit`） | 公式抜粋 |
| Insights | 投稿 `views, likes, replies, reposts, quotes, shares`。アカウント `views, likes, replies, reposts, quotes, clicks, followers_count`。since/until は 2024-04-13 以降のみ | 公式サンプル＋公式CL |

## 要再確認（本番前に公式ページで確認）

1. Instagram の投稿単位の `follows` / `profile_visits` がメディア種別ごとに使えるか。拒否された場合は、コアの指標だけで自動的に再試行する実装にしています。
2. `content_publishing_limit` の上限値（100か50か）。
3. Threads で日本語の文字数がどう数えられるか（上限付近では警告を出しています）。
4. Threads の Webhook フィールド名と、署名に使うシークレット。
5. Threads の uninstall / delete callback の payload 形式。Meta共通の `signed_request` を前提にしています。
6. 2207xxx 系エラーコードの公式一覧。現在はコード範囲で分類しています。
7. v26 で予定されている 2026-10-27 の変更が、Instagram の投稿・インサイトに影響するか。
