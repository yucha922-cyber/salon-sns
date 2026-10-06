import { expect, test, type Page } from "@playwright/test";

async function loginDemo(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: /デモアカウントで試す/ }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("account strategy: HQ / store tree, AI Account Strategist, save", async ({ page }) => {
  await loginDemo(page);
  await page.getByRole("link", { name: "◈ アカウント戦略", exact: true }).click();
  for (const group of ["本部（HQ）", "NAORU整体 渋谷院", "NAORU整体 池袋院", "NAORU整体 横浜院"]) {
    await expect(page.getByRole("heading", { name: group, exact: true })).toBeVisible();
  }
  await expect(page.locator(".account-card").filter({ hasText: "@naoru_shibuya" }).first()).toContainText("30代女性 / 渋谷勤務 / デスクワーク");

  // Add an HQ recruitment Threads account with the AI Account Strategist
  await page.locator(".tree-group").filter({ hasText: "本部（HQ）" }).getByRole("button", { name: "＋ 追加" }).click();
  await page.getByRole("radio", { name: "Threads" }).click();
  await page.getByLabel("アカウントID").fill("@naoru_recruit_threads");
  await page.getByRole("radio", { name: /^採用/ }).click();
  await page.getByRole("button", { name: "AIに戦略を提案してもらう" }).click();
  const proposal = page.getByLabel("AIの戦略提案");
  await expect(proposal).toContainText("応募数");
  await expect(proposal).toContainText("Monthly Mix");
  await page.getByRole("button", { name: "この提案をフォームに適用" }).click();
  await expect(page.getByLabel("ターゲット", { exact: true })).toHaveValue(/理学療法士/);
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(page.getByText("アカウント戦略を保存しました")).toBeVisible();
  const card = page.locator(".account-card").filter({ hasText: "@naoru_recruit_threads" });
  await expect(card).toContainText("採用");
  await expect(card).toContainText("応募数");

  // Goal view
  await page.getByRole("tab", { name: "目的別" }).click();
  await expect(page.getByRole("heading", { name: "採用", exact: true })).toBeVisible();
});

test("monthly plan: AI proposal → edit / regenerate / reject / approve → planner → caption", async ({ page }) => {
  await loginDemo(page);
  await page.getByRole("link", { name: "▦ 投稿カレンダー", exact: true }).click();
  await page.getByRole("button", { name: "✳ AIで1ヶ月分作成" }).click();
  await page.getByLabel("SNSアカウント").selectOption({ label: "NAORU整体 渋谷院 / Instagram @naoru_shibuya（集客）" });
  const monthSelect = page.getByLabel("対象月");
  const nextMonth = await monthSelect.locator("option").nth(1).getAttribute("value");
  await monthSelect.selectOption(nextMonth ?? "");
  await expect(page.getByText("ファネル：認知→悩み→教育→信頼→来店→予約")).toBeVisible();
  await page.getByRole("button", { name: "企画案を作成" }).click();

  await expect(page).toHaveURL(/\/planner\/proposals\//);
  const rows = page.getByTestId("plan-item");
  const count = await rows.count();
  expect(count).toBeGreaterThanOrEqual(15);
  expect(count).toBeLessThanOrEqual(19);
  // nothing in the planner yet
  await expect(page.getByText(`${count}件中 承認 0件`)).toBeVisible();

  // Edit the first item
  await rows.nth(0).getByRole("button", { name: "編集" }).click();
  await page.getByLabel("テーマ").fill("渋谷OLの肩こりあるある（編集済み）");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(rows.nth(0)).toContainText("渋谷OLの肩こりあるある（編集済み）");
  // Regenerate the second
  const before = await rows.nth(1).locator(".theme-cell b").textContent();
  await rows.nth(1).getByRole("button", { name: /を再生成/ }).click();
  await expect(rows.nth(1).locator(".theme-cell b")).not.toHaveText(before ?? "");
  // Reject the third
  await rows.nth(2).getByRole("button", { name: /を却下/ }).click();
  await expect(rows.nth(2)).toContainText("却下");
  // Approve the first only
  await rows.nth(0).getByRole("button", { name: /を承認/ }).click();
  await expect(page.getByText(`${count}件中 承認 1件`)).toBeVisible();
  // Approve all remaining
  await page.getByRole("button", { name: /すべて承認/ }).click();
  await expect(page.getByText(`${count}件中 承認 ${count - 1}件`)).toBeVisible();

  // Caption step for the edited item
  await rows.nth(0).getByRole("link", { name: "キャプション作成 →" }).click();
  await expect(page.getByRole("heading", { name: "キャプション作成" })).toBeVisible();
  await expect(page.getByLabel("投稿テーマ")).toHaveValue("渋谷OLの肩こりあるある（編集済み）");
  await page.getByRole("button", { name: "✳ AIで投稿を生成" }).click();
  await expect(page.getByLabel("CTA")).toHaveValue("LINE予約（主導線）/ プロフィールリンク");
  await page.getByRole("button", { name: "キャプションを保存 →" }).click();
  await expect(page).toHaveURL(/\/planner\?month=/);
  await expect(page.locator(".calendar-event").filter({ hasText: "渋谷OLの肩こりあるある（編集済み）" })).toBeVisible();
  // other approved items are in the planner as plans
  await expect(page.locator(".calendar-event .plan-badge").first()).toBeVisible();
});

test("dashboard: HQ overview with store / account scope and AI recommendations", async ({ page }) => {
  await loginDemo(page);
  await expect(page.getByLabel("本部運用サマリー")).toContainText("採用アカウント");
  await expect(page.getByRole("cell", { name: "NAORU整体 池袋院" })).toBeVisible();
  await page.getByLabel("表示範囲").selectOption({ label: "NAORU整体 池袋院（店舗全体）" });
  await expect(page).toHaveURL(/scope=loc%3A|scope=loc:/);
  await expect(page.getByRole("cell", { name: "NAORU整体 渋谷院" })).toHaveCount(0);
  const rec = page.locator(".rec-item").filter({ hasText: "池袋院Instagram" });
  await rec.getByRole("button", { name: /を承認/ }).click();
  await expect(page.getByText(/承認済みにしました/)).toBeVisible();

  await page.getByRole("link", { name: /◉ AI分析/ }).click();
  await page.getByRole("tab", { name: /承認済み/ }).click();
  await expect(page.locator(".rec-item").filter({ hasText: "池袋院Instagram" })).toBeVisible();
  await page.getByRole("button", { name: /AIで運用レビュー/ }).click();
  await expect(page.getByText(/件の提案を作成しました|新しい提案はありませんでした/)).toBeVisible();
});

test("HQ campaign → localized drafts for every store and platform", async ({ page }) => {
  await loginDemo(page);
  await page.getByRole("link", { name: "▣ 本部テンプレート", exact: true }).click();
  await expect(page.getByRole("heading", { name: /デスクワーク×姿勢改善/ })).toBeVisible();
  await expect(page.getByLabel("必須メッセージ")).toBeVisible();
  await page.getByRole("button", { name: "✳ 全店舗の下書きを生成" }).click();
  await expect(page.getByText("6店舗分の下書きを作成しました")).toBeVisible();
  const results = page.locator(".result-item");
  await expect(results.filter({ hasText: "NAORU整体 池袋院" }).first()).toContainText("#池袋整体");
  await expect(results.filter({ hasText: "NAORU整体 渋谷院" }).first()).toContainText("初回姿勢チェック無料");

  await page.getByRole("link", { name: "▤ 投稿一覧", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: "本部ローカライズ" })).toHaveCount(6);
});

test("location customization saves per location", async ({ page }) => {
  await loginDemo(page);
  await page.getByRole("link", { name: "⌂ 店舗カスタマイズ", exact: true }).click();
  await page.getByRole("button", { name: /NAORU整体 池袋院/ }).click();
  await page.getByLabel("エリア").fill("池袋・東池袋");
  await page.getByLabel("店舗独自のオファー").fill("サンシャイン勤務の方は初回10%オフ");
  await page.getByLabel("店舗独自のオファー").press("Enter");
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(page.getByText("NAORU整体 池袋院の店舗情報を保存しました")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /NAORU整体 池袋院/ }).click();
  await expect(page.getByLabel("エリア")).toHaveValue("池袋・東池袋");
});
