import { expect, test, type Page } from "@playwright/test";

/**
 * Meta ads loop in Demo Mode (MockAdsProvider: nothing reaches Meta):
 * 問題検知 → 仮説 → Creative案 → 人のApprove → A/Bテスト → 最終確認 → 実施中.
 */
async function loginDemo(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: /Demoで試す/ }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("dashboard shows what to do next: KPIs, fatigue on A, running test, recommendations", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await loginDemo(page);
  await page.goto("/ads");
  await expect(page.getByTestId("ads-kpis")).toContainText("CPA");
  await expect(page.getByTestId("finding-creative_fatigue")).toContainText("その肩こり、揉むだけ");
  await expect(page.getByTestId("finding-creative_fatigue")).toContainText("Frequency");
  await expect(page.getByTestId("finding-lp_cvr_drop")).toContainText("LP");
  await expect(page.getByTestId("running-tests")).toContainText("渋谷院 新規集客");
  await expect(page.getByTestId("running-tests")).toContainText("データ不足");

  // Recruitment has its own evaluation axis.
  await page.getByRole("tab", { name: "採用（応募）" }).click();
  await expect(page.getByTestId("ads-kpis")).toContainText("応募単価");

  await page.goto("/ads/creatives");
  await expect(page.getByTestId("creative-table")).toContainText("仕事終わり、首肩が限界になるあなたへ");
  await expect(page.getByTestId("creative-table")).toContainText("ポリシー注意");

  await page.goto("/ads/experiments");
  await page.getByRole("link", { name: /本部 セラピスト採用/ }).click();
  await expect(page.getByTestId("evaluation")).toContainText("勝者: B");
  expect(errors).toEqual([]);
});

test("recommendation → Creative Studio (prefilled) → approve → test → final confirmation → running", async ({ page }) => {
  await loginDemo(page);
  await page.goto("/ads");
  const rec = page.getByTestId("ai-recommendations").locator(".rec-item").filter({ hasText: "D｜昼休み30分で整える" });
  await rec.getByRole("link", { name: /Creative案を作る/ }).click();
  await expect(page).toHaveURL(/\/studio\?hypothesis=/);
  const context = page.getByTestId("hypothesis-context");
  await expect(context).toContainText("池袋院 新規集客");
  await expect(context).toContainText("昼休み30分で、午後の体を軽く");

  await page.getByTestId("generate-drafts").click();
  await expect(page.getByTestId("creative-brief")).toBeVisible();
  await expect(page.getByTestId("draft-card")).toHaveCount(2);
  await expect(page.getByTestId("draft-card").first()).toContainText("レビュー待ち");

  await page.getByTestId("draft-card").first().getByTestId("approve-draft").click();
  await expect(page.getByTestId("draft-card").first()).toContainText("承認済み");
  await page.getByTestId("draft-card").first().getByTestId("pick-draft").check();
  await page.getByTestId("create-experiment").click();
  await expect(page).toHaveURL(/\/ads\/experiments\//);
  await expect(page.getByTestId("variant-table")).toContainText("Control");

  await page.getByRole("button", { name: "✓ テストプランを承認" }).click();
  await page.getByTestId("open-launch").click();
  await expect(page.getByRole("dialog")).toContainText("予算・ターゲティング・入札・既存広告の設定は変更しません");
  await expect(page.getByTestId("confirm-launch")).toBeDisabled();
  await page.getByTestId("confirm-check").check();
  await page.getByTestId("confirm-launch").click();
  await expect(page.locator(".status-pill").filter({ hasText: "実施中" }).first()).toBeVisible();
  await expect(page.getByTestId("variant-table")).toContainText("Meta広告ID mockad_");
});

test("connect another ad account via mock OAuth and record first-party conversions", async ({ page }) => {
  await loginDemo(page);
  await page.goto("/ads/connect");
  await expect(page.getByText("NAORU整体 広告アカウント").first()).toBeVisible();
  await page.getByTestId("connect-ad-account").click();
  await expect(page).toHaveURL(/\/ads\/mock-authorize/);
  await expect(page.getByText("ads_management（承認済みテスト広告の作成・停止）")).toBeVisible();
  await page.getByRole("button", { name: "許可する" }).click();
  await expect(page).toHaveURL(/\/ads\/connect\?select=1/);
  await expect(page.getByTestId("ad-account-selection")).toContainText("act_120000000000001");
  await page.getByTestId("complete-connection").click();
  await expect(page).toHaveURL(/\/ads$/);

  await page.goto("/ads/conversions");
  await page.getByPlaceholder(/date,kind,count/).fill("date,kind,count,campaign\n2026-10-01,予約,4,渋谷院 新規集客");
  await page.getByRole("button", { name: "取り込む" }).click();
  await expect(page.locator("table").last()).toContainText("CSV");
});
