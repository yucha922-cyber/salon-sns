export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export const NAV_SECTIONS: { label?: string; items: NavItem[] }[] = [
  { items: [{ href: "/dashboard", label: "ダッシュボード", icon: "◫" }] },
  {
    label: "SNS",
    items: [
      { href: "/planner", label: "投稿カレンダー", icon: "▦" },
      { href: "/creator", label: "AI投稿作成", icon: "✎" },
      { href: "/posts", label: "投稿一覧", icon: "▤" },
    ],
  },
  {
    label: "広告",
    items: [
      { href: "/ads", label: "広告ダッシュボード", icon: "⌁" },
      { href: "/analysis", label: "AI分析", icon: "◉" },
      { href: "/studio", label: "Creative Studio", icon: "✧" },
    ],
  },
];

export const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "ダッシュボード",
  "/planner": "投稿カレンダー",
  "/creator": "AI投稿作成",
  "/posts": "投稿一覧",
  "/ads": "広告ダッシュボード",
  "/analysis": "AI分析",
  "/studio": "Creative Studio",
  "/chat": "AIマーケター",
  "/brand": "Brand Brain",
  "/settings": "設定",
};
