import { expect, test } from "@playwright/test";

/**
 * The review tour requested for Demo Mode:
 * Login → Demoで試す → Dashboard → 渋谷院 → Planner → AIで1ヶ月分作成 → Proposal → Approve
 * → Planner → AI Post Creator → 生成 → Planner追加 → AI Marketing Chat → Creative Studio → Brand Brain
 */
test("demo tour: every main screen works without Supabase / AI keys", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole("button", { name: /Demoで試す/ }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText("Demo Mode")).toBeVisible();

  // Dashboard KPIs + AI recommendation
  for (const label of ["今月の投稿数", "フォロワー増加", "リーチ", "エンゲージメント率", "広告費", "CTR", "CVR", "CPA", "ROAS", "CV"]) {
    await expect(page.locator(".metric-card .metric-top").filter({ hasText: new RegExp(`^${label}`) }).first()).toBeVisible();
  }
  await expect(page.getByText(/Reel保存率が高いため/).first()).toBeVisible();

  // Switch to 渋谷院
  await page.getByLabel("表示範囲").selectOption({ label: "NAORU整体 渋谷院（店舗全体）" });
  await expect(page).toHaveURL(/scope=loc/);
  await expect(page.getByRole("cell", { name: "NAORU整体 池袋院" })).toHaveCount(0);

  // Planner: 10–20 posts, acquisition + recruitment
  await page.getByRole("link", { name: "▦ 投稿カレンダー", exact: true }).click();
  await expect(page).toHaveURL(/\/planner/);
  const events = page.locator(".calendar-event");
  await expect(events.first()).toBeVisible();
  expect(await events.count()).toBeGreaterThanOrEqual(10);
  await expect(events.filter({ hasText: "肩こりが治らない人のNG習慣3選" })).toBeVisible();
  await expect(events.filter({ hasText: "NAORUで働くセラピストの1日" })).toBeVisible();

  // AI monthly plan → proposal → approve all → planner
  await page.getByRole("button", { name: "✳ AIで1ヶ月分作成" }).click();
  await page.getByLabel("SNSアカウント").selectOption({ label: "NAORU整体 渋谷院 / Instagram @naoru_shibuya（集客）" });
  const monthSelect = page.getByLabel("対象月");
  await monthSelect.selectOption((await monthSelect.locator("option").nth(1).getAttribute("value")) ?? "");
  await page.getByRole("button", { name: "企画案を作成" }).click();
  await expect(page).toHaveURL(/\/planner\/proposals\//);
  const items = await page.getByTestId("plan-item").count();
  expect(items).toBeGreaterThan(10);
  await page.getByRole("button", { name: /すべて承認/ }).click();
  await expect(page.getByText(`${items}件中 承認 ${items}件`)).toBeVisible();
  await page.getByRole("link", { name: "投稿カレンダーへ →" }).click();
  await page.getByRole("link", { name: "次の月" }).click();
  await expect(page.locator(".calendar-event .plan-badge").first()).toBeVisible();

  // AI Post Creator → generate → edit → add to planner
  await page.getByRole("link", { name: "✎ AI投稿作成", exact: true }).click();
  await page.getByLabel("投稿テーマ").fill("デスクワーク中の正しい姿勢");
  await page.getByRole("button", { name: "✳ AIで投稿を生成" }).click();
  for (const label of ["タイトル", "フック（冒頭の一言）", "キャプション", "CTA", "ハッシュタグ"]) {
    await expect(page.getByLabel(label, { exact: true })).not.toHaveValue("");
  }
  await page.getByLabel("タイトル", { exact: true }).fill("デスクワーク中の正しい姿勢（デモ確認）");
  await page.getByRole("button", { name: "SNS Plannerへ追加 →" }).click();
  await expect(page).toHaveURL(/\/planner\?month=/);
  await expect(page.locator(".calendar-event").filter({ hasText: "デスクワーク中の正しい姿勢（デモ確認）" })).toBeVisible();

  // AI Marketing Chat
  await page.getByRole("link", { name: "✳ AIマーケター", exact: true }).click();
  await page.getByLabel("メッセージ").fill("今月Instagram何投稿したらいい？");
  await page.getByRole("button", { name: "送信" }).click();
  const answer = page.locator(".bubble").last();
  for (const word of ["肩こりHow-to", "Before / After", "スタッフの専門性", "口コミ", "セルフケア"]) {
    await expect(answer).toContainText(word);
  }

  // Creative Studio
  await page.getByRole("link", { name: "✧ Creative Studio", exact: true }).click();
  await expect(page.getByLabel("ターゲット")).toHaveValue("30代女性 / 渋谷勤務 / デスクワーク");
  await expect(page.getByLabel("悩み")).toHaveValue("肩こり");
  await page.getByRole("button", { name: "✳ AIに企画させる" }).click();
  for (const angle of ["悩み訴求", "Before / After", "専門性", "口コミ"]) {
    await expect(page.locator(".concept-label").filter({ hasText: angle })).toBeVisible();
  }

  // Brand Brain
  await page.getByRole("link", { name: "◎ Brand Brain", exact: true }).click();
  await expect(page.getByText("NAORU Demo HQ").first()).toBeVisible();
  await expect(page.getByText("NAORU整体 渋谷院").first()).toBeVisible();
  await page.getByRole("button", { name: /ターゲット/ }).click();
  for (const pain of ["肩こり", "首こり", "姿勢", "疲労"]) await expect(page.locator(".brand-tag", { hasText: new RegExp(`^${pain}$`) })).toBeVisible();

  expect(errors).toEqual([]);
});

test("every sidebar item opens a working page", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /Demoで試す/ }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  const links = await page.locator("nav.main-nav a, .sidebar-bottom a").evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href")));
  expect(links.length).toBeGreaterThanOrEqual(13);
  for (const href of links) {
    const res = await page.goto(href ?? "/");
    expect(res?.status(), href ?? "").toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.getByText("ページを表示できませんでした")).toHaveCount(0);
  }
});
