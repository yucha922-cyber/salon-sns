import { expect, test, type Page } from "@playwright/test";

async function loginDemo(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: /デモアカウントで試す/ }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("account strategy: goals, edit with AI suggestion", async ({ page }) => {
  await loginDemo(page);
  await page.getByRole("link", { name: "◈ アカウント戦略", exact: true }).click();
  for (const goal of ["集客", "採用", "ブランディング"]) {
    await expect(page.getByRole("heading", { name: goal, exact: true })).toBeVisible();
  }
  await expect(page.getByText("@naoru_recruit")).toBeVisible();

  // Add a TikTok recruiting account using the AI suggestion
  await page.locator(".goal-section").filter({ hasText: "採用" }).getByRole("button", { name: "＋ 追加" }).click();
  await page.getByRole("radio", { name: "TikTok" }).click();
  await page.getByLabel("アカウントID").fill("@naoru_recruit_tt");
  await page.getByRole("button", { name: /AIで提案/ }).click();
  await expect(page.getByLabel("ペルソナ")).toHaveValue(/セラピスト/);
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(page.getByText("アカウント戦略を保存しました")).toBeVisible();
  await expect(page.locator(".account-card").filter({ hasText: "@naoru_recruit_tt" })).toContainText("応募数");
});

test("location customization saves per location", async ({ page }) => {
  await loginDemo(page);
  await page.getByRole("link", { name: "⌂ 店舗カスタマイズ", exact: true }).click();
  await page.getByRole("button", { name: /NAORU整体 新宿院/ }).click();
  await page.getByLabel("エリア").fill("西新宿・都庁前");
  await page.getByLabel("店舗独自のオファー").fill("都庁勤務の方は初回10%オフ");
  await page.getByLabel("店舗独自のオファー").press("Enter");
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(page.getByText("NAORU整体 新宿院の店舗情報を保存しました")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /NAORU整体 新宿院/ }).click();
  await expect(page.getByLabel("エリア")).toHaveValue("西新宿・都庁前");
  await expect(page.getByText("都庁勤務の方は初回10%オフ")).toBeVisible();
});

test("HQ template → localized drafts for every location → posts list", async ({ page }) => {
  await loginDemo(page);
  await page.getByRole("link", { name: "▣ 本部テンプレート", exact: true }).click();
  await expect(page.getByRole("heading", { name: "秋の姿勢改善キャンペーン" })).toBeVisible();
  await page.getByRole("button", { name: "✳ 全店舗の下書きを生成" }).click();
  await expect(page.getByText("2店舗分の下書きを作成しました")).toBeVisible();
  const results = page.locator(".result-item");
  await expect(results.filter({ hasText: "NAORU整体 渋谷院" }).first()).toContainText("#渋谷整体");
  await expect(results.filter({ hasText: "NAORU整体 新宿院" }).first()).toContainText("#新宿整体");

  await page.getByRole("link", { name: "▤ 投稿一覧", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: "本部ローカライズ" })).toHaveCount(2);
  await expect(page.getByRole("row").filter({ hasText: "@naoru_shinjuku" }).first()).toContainText("下書き");
});

test("post creator applies the selected account and HQ campaign", async ({ page }) => {
  await loginDemo(page);
  await page.goto("/accounts");
  await page.locator(".account-card").filter({ hasText: "@naoru_shinjuku" }).getByRole("link", { name: /このアカウントで投稿作成/ }).click();
  await expect(page.getByLabel("投稿するアカウント")).toHaveValue(/.+/);
  await page.getByLabel("本部キャンペーン").selectOption({ label: "秋の姿勢改善キャンペーン" });
  await page.getByRole("button", { name: "✳ AIで投稿を生成" }).click();
  await expect(page.getByLabel("キャプション")).toContainText("昼休み30分クイックコース");
  await expect(page.getByLabel("CTA")).toHaveValue("ご予約はプロフィールのリンクから");
  await page.getByRole("button", { name: "SNS Plannerへ追加 →" }).click();
  await expect(page).toHaveURL(/\/planner/);
});
