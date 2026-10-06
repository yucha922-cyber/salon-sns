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
      { href: "/publishing", label: "Publish Queue", icon: "◷" },
      { href: "/performance", label: "成果分析", icon: "◔" },
      { href: "/memory", label: "Marketing Memory", icon: "❖" },
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
  {
    label: "本部・店舗",
    items: [
      { href: "/accounts", label: "アカウント戦略", icon: "◈" },
      { href: "/hq", label: "本部テンプレート", icon: "▣" },
      { href: "/locations", label: "店舗カスタマイズ", icon: "⌂" },
    ],
  },
];

export const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "ダッシュボード",
  "/planner": "投稿カレンダー",
  "/creator": "AI投稿作成",
  "/posts": "投稿一覧",
  "/publishing": "Publish Queue",
  "/performance": "成果分析",
  "/memory": "Marketing Memory",
  "/ads": "広告ダッシュボード",
  "/analysis": "AI分析",
  "/studio": "Creative Studio",
  "/chat": "AIマーケター",
  "/brand": "Brand Brain",
  "/settings": "設定",
  "/accounts": "アカウント戦略",
  "/hq": "本部テンプレート",
  "/locations": "店舗カスタマイズ",
};
