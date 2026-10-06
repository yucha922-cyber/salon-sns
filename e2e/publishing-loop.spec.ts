import { expect, test, type Page } from "@playwright/test";

/**
 * Plan → Create → Approve → Publish → Measure → Analyze → Learn, through the UI,
 * in Demo Mode (MockSocialProvider: nothing is posted to real SNS).
 */
async function loginDemo(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: /Demoで試す/ }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("connect Instagram via OAuth (mock consent) → choose location & goal → Connected", async ({ page }) => {
  await loginDemo(page);
  await page.goto("/accounts");
  await expect(page.locator(".conn-badge.reconnect").first()).toBeVisible();
  await page.getByRole("link", { name: /Instagramを接続/ }).first().click();
  await expect(page).toHaveURL(/\/social\/mock-authorize/);
  await expect(page.getByText("instagram_business_content_publish（投稿）")).toBeVisible();
  await page.getByLabel(/ユーザーネーム/).fill("naoru_shinjuku");
  await page.getByRole("button", { name: "許可する" }).click();
  await expect(page).toHaveURL(/\/accounts\/connect\?pending=/);
  await expect(page.getByText("@naoru_shinjuku").first()).toBeVisible();
  await page.getByRole("button", { name: /新しいアカウントとして追加/ }).click();
  await page.getByLabel("店舗").selectOption({ label: "NAORU整体 渋谷院" });
  await page.getByLabel("目的").selectOption({ label: "集客" });
  await page.getByLabel("表示名（任意）").fill("新宿院 Instagram（テスト）");
  await page.getByRole("button", { name: "この内容で接続する" }).click();
  await expect(page).toHaveURL(/\/accounts\?connected=/);
  await expect(page.getByText("@naoru_shinjuku を接続しました")).toBeVisible();
  const card = page.locator(".account-card").filter({ hasText: "@naoru_shinjuku" });
  await expect(card.locator(".conn-badge.connected")).toBeVisible();

  // Denied consent comes back with an explanation, nothing is connected.
  await page.getByRole("link", { name: /Threadsを接続/ }).first().click();
  await page.getByRole("button", { name: "キャンセル" }).click();
  await expect(page).toHaveURL(/\/accounts\?social_error=/);
  await expect(page.locator(".form-error")).toContainText("連携がキャンセルされました");
});

test("create → approve → schedule → cancel → publish now (confirm) → insights → AI review → memory", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await loginDemo(page);

  // Create (AI Post Creator → planner)
  await page.goto("/creator");
  const accountSelect = page.getByLabel("投稿するアカウント");
  const shibuya = await accountSelect.locator("option", { hasText: "@naoru_shibuya" }).filter({ hasNotText: "threads" }).first().getAttribute("value");
  await accountSelect.selectOption(shibuya ?? "");
  await page.getByLabel("投稿テーマ").fill("デスクワーク中の首こりセルフケア");
  await page.getByRole("button", { name: "✳ AIで投稿を生成" }).click();
  await expect(page.getByLabel("キャプション", { exact: true })).not.toHaveValue("");
  await page.getByLabel("タイトル", { exact: true }).fill("E2E 予約投稿テスト");
  await page.getByRole("button", { name: "SNS Plannerへ追加 →" }).click();
  await expect(page).toHaveURL(/\/planner\?month=/);
  await page.locator(".calendar-event").filter({ hasText: "E2E 予約投稿テスト" }).click();
  await expect(page.getByRole("heading", { name: "投稿の詳細" })).toBeVisible();

  // Validation explains what to fix (Instagram needs media)
  await expect(page.locator(".issue.error").filter({ hasText: "画像または動画が必須" })).toBeVisible();
  await expect(page.getByRole("button", { name: "✓ 投稿内容を承認" })).toHaveCount(0);
  await page.getByRole("button", { name: "サンプル画像を使う" }).click();
  await expect(page.getByText("Instagramの投稿ルールを満たしています")).toBeVisible();

  // Approve → schedule (confirmation shows account / platform / location / content / time)
  await page.getByRole("button", { name: "✓ 投稿内容を承認" }).click();
  await expect(page.getByRole("button", { name: "◷ 予約投稿に登録" })).toBeEnabled();
  await page.getByRole("button", { name: "◷ 予約投稿に登録" }).click();
  await expect(page.getByRole("heading", { name: "この内容で予約しますか？" })).toBeVisible();
  const confirm = page.locator(".confirm-grid");
  await expect(confirm).toContainText("@naoru_shibuya");
  await expect(confirm).toContainText("Instagram");
  await expect(confirm).toContainText("NAORU整体 渋谷院");
  await expect(confirm).toContainText("Asia/Tokyo");
  await expect(page.getByRole("button", { name: "予約を確定する" })).toBeDisabled();
  await page.getByLabel(/内容を確認しました/).check();
  await page.getByRole("button", { name: "予約を確定する" }).click();
  await expect(page.getByText("Publish Queueに登録しました")).toBeVisible();
  await expect(page.locator(".publish-panel").getByText("予約済み", { exact: false }).first()).toBeVisible();
  await expect(page.getByLabel("キャプション")).toBeDisabled();

  // Cancel → back to approved → publish now (confirm modal required)
  await page.getByRole("button", { name: "予約を取り消す" }).click();
  await expect(page.getByText("予約を取り消しました")).toBeVisible();
  await page.getByRole("button", { name: "▶ 今すぐ投稿" }).click();
  await expect(page.getByRole("heading", { name: "今すぐ投稿しますか？" })).toBeVisible();
  await expect(page.getByText("モック投稿のため、実際のSNSには公開されません")).toBeVisible();
  await page.getByLabel(/内容を確認しました/).check();
  await page.getByRole("button", { name: "今すぐ投稿する" }).click();
  await expect(page.getByText("投稿しました").first()).toBeVisible();
  await expect(page.getByText(/に公開されました/)).toBeVisible();

  // Measure → Analyze → Learn
  await page.getByRole("button", { name: "Insightsを今すぐ取得" }).click();
  await expect(page.getByText("Insightsを取得しました")).toBeVisible();
  await page.getByRole("button", { name: "✳ AIで成果を分析" }).click();
  await expect(page.locator(".review-box").filter({ hasText: "AI Performance Review" })).toBeVisible();

  // Queue + audit log
  await page.goto("/publishing?status=done");
  await expect(page.locator("tr").filter({ hasText: "E2E 予約投稿テスト" }).getByText("公開済み")).toBeVisible();
  await expect(page.locator(".event-log")).toContainText("@naoru_shibuya に投稿しました");
  await expect(page.locator(".event-log")).toContainText("予約を取り消しました");

  // Performance & Marketing Memory & HQ attention
  await page.goto("/performance?goal=acquisition");
  await expect(page.getByText("Top Posts")).toBeVisible();
  await expect(page.getByText("予約・来店").first()).toBeVisible();
  await page.goto("/memory");
  await expect(page.locator(".memory-card").first()).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.locator(".attention-item.problem").first()).toContainText("再接続");
  await expect(page.getByText("店舗横断パフォーマンス（直近30日）")).toBeVisible();

  expect(errors).toEqual([]);
});

test("insight-based recommendation → approve → planner draft", async ({ page }) => {
  await loginDemo(page);
  await page.goto("/analysis");
  const rec = page.locator(".rec-item").filter({ hasText: "実績データ" }).first();
  await expect(rec).toBeVisible();
  await rec.getByRole("button", { name: /を承認$/ }).click();
  await expect(page.getByText("SNS Plannerに下書きを追加").first()).toBeVisible();
  await page.goto("/posts");
  await expect(page.getByText(/【AI提案】/).first()).toBeVisible();
});
