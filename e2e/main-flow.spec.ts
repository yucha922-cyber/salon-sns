import { expect, test } from "@playwright/test";

test("unauthenticated users are redirected to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
  await expect(page.getByRole("heading", { name: "おかえりなさい" })).toBeVisible();
});

test("sign up → onboarding → Brand Brain → chat → post → planner", async ({ page }) => {
  const email = `owner+${Date.now()}@example.com`;

  // Sign up
  await page.goto("/signup");
  await page.getByLabel("お名前").fill("佐藤 美咲");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill("password123");
  await page.getByRole("button", { name: "アカウントを作成" }).click();
  await expect(page).toHaveURL(/\/onboarding/);

  // Step 1: company (validation first)
  await page.getByRole("button", { name: "次へ →" }).click();
  await expect(page.locator(".form-error")).toContainText("会社名またはブランド名");
  await page.getByLabel("会社名・屋号").fill("SAKURA 株式会社");
  await page.getByLabel("ブランド名・店舗ブランド").fill("SAKURA整体");
  await page.getByRole("button", { name: "次へ →" }).click();

  // Step 2: location
  await expect(page.getByRole("heading", { name: "店舗" })).toBeVisible();
  await page.getByLabel("店舗名").first().fill("SAKURA整体 新宿院");
  await page.getByLabel("住所").first().fill("東京都新宿区");
  await page.getByRole("button", { name: "次へ →" }).click();

  // Step 3: services
  await expect(page.getByRole("heading", { name: "サービス" })).toBeVisible();
  await page.getByLabel("サービス名").first().fill("骨盤調整コース");
  await page.getByLabel("価格（円）").first().fill("7700");
  await page.getByRole("button", { name: "＋ 完全個室" }).click();
  await page.getByRole("button", { name: "次へ →" }).click();

  // Step 4: audience
  await expect(page.getByRole("heading", { name: "ターゲット" })).toBeVisible();
  await page.getByLabel("年齢層").fill("30代");
  await page.getByLabel("職業・ライフスタイル").fill("新宿勤務のデスクワーカー");
  await page.getByRole("button", { name: "＋ 腰痛" }).click();
  await page.getByRole("button", { name: "次へ →" }).click();

  // Step 5: tone
  await expect(page.getByRole("heading", { name: "ブランドトーン" })).toBeVisible();
  await page.getByRole("button", { name: "＋ 清潔感" }).click();
  await page.getByRole("button", { name: "次へ →" }).click();

  // Step 6: goals → complete
  await page.getByLabel("事業・集客の目標").fill("新規予約を月30件");
  await page.getByRole("button", { name: "Brand Brainを完成させる" }).click();
  await expect(page.getByRole("heading", { name: "AIマーケターがあなたのお店を理解しました" })).toBeVisible();
  await page.getByRole("link", { name: "ダッシュボードへ →" }).click();

  // Dashboard (real org: no fake metrics)
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText("美咲さん")).toBeVisible();
  await expect(page.getByText("SNS・広告アカウントは未連携です")).toBeVisible();

  // Brand Brain edit + save persists
  await page.getByRole("link", { name: "◎ Brand Brain", exact: true }).click();
  await expect(page.getByText("骨盤調整コース")).toHaveCount(0); // basic tab first
  await page.getByRole("button", { name: "編集する" }).click();
  await page.getByLabel("事業の説明").fill("新宿駅近くの整体院です。");
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(page.getByText("Brand Brainを保存しました")).toBeVisible();
  await page.reload();
  await expect(page.getByText("新宿駅近くの整体院です。")).toBeVisible();

  // AI chat uses the Brand Brain and persists
  await page.getByRole("link", { name: "✳ AIマーケター", exact: true }).click();
  await page.getByLabel("メッセージ").fill("今月Instagram何投稿したらいい？");
  await page.getByRole("button", { name: "送信" }).click();
  await expect(page.locator(".bubble").filter({ hasText: "腰痛" }).last()).toBeVisible();
  await expect(page).toHaveURL(/\/chat\?c=/);
  await page.reload();
  await expect(page.locator(".bubble").filter({ hasText: "今月Instagram何投稿したらいい？" })).toBeVisible();

  // Post creator → planner
  await page.getByRole("link", { name: "✎ AI投稿作成", exact: true }).click();
  await page.getByLabel("投稿テーマ").fill("デスクでできる腰痛ケア");
  await page.getByRole("button", { name: "✳ AIで投稿を生成" }).click();
  await expect(page.getByLabel("キャプション")).toContainText("腰痛");
  await page.getByLabel("タイトル").fill("デスクでできる腰痛ケア3選");
  await page.getByRole("button", { name: "SNS Plannerへ追加 →" }).click();
  await expect(page).toHaveURL(/\/planner\?month=/);
  await expect(page.locator(".calendar-event").filter({ hasText: "デスクでできる腰痛ケア3選" })).toBeVisible();

  // Posts list shows it as scheduled
  await page.getByRole("link", { name: "▤ 投稿一覧", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: "デスクでできる腰痛ケア3選" })).toContainText("予約済み");

  // Logout → login again
  await page.getByRole("button", { name: "アカウントメニュー" }).click();
  await page.getByRole("menuitem", { name: "↩ ログアウト" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill("password123");
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

test("demo account shows the NAORU demo organization", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /デモアカウントで試す/ }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText("DEMO").first()).toBeVisible();
  await expect(page.getByText("合計リーチ")).toBeVisible();
  await page.getByRole("link", { name: "⌁ 広告ダッシュボード", exact: true }).click();
  await expect(page.getByText("秋の姿勢改善キャンペーン")).toBeVisible();
});
