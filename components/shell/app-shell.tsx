"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { signOutAction } from "@/app/actions/auth";
import { createDemoOrganizationAction, switchOrganizationAction } from "@/app/actions/organization";
import { useToast } from "@/components/ui/toast";
import { NAV_SECTIONS, PAGE_TITLES } from "./nav";

export interface ShellProps {
  user: { displayName: string; email: string };
  role: string;
  organizations: { id: string; name: string; isDemo: boolean }[];
  currentOrganizationId: string;
  workspaceLabel: string;
  analysisBadge: number;
  demoMode?: boolean;
  children: ReactNode;
}

const ROLE_LABELS: Record<string, string> = { owner: "オーナー", admin: "管理者", editor: "編集者", viewer: "閲覧者" };

function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  // Japanese names: family-name initial only (e.g. 山本 花子 → 山)
  if (/[^\x00-\x7F]/.test(trimmed)) return trimmed.slice(0, 1);
  return parts.length > 1 ? `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}` : trimmed.slice(0, 2);
}

export function AppShell(props: ShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const orgRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const [today, setToday] = useState("");

  useEffect(() => {
    setToday(new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "short" }).format(new Date()));
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
    setOrgMenuOpen(false);
    setUserMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (orgRef.current && !orgRef.current.contains(e.target as Node)) setOrgMenuOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const current = props.organizations.find((o) => o.id === props.currentOrganizationId);
  const section = "/" + (pathname.split("/")[1] ?? "");
  const isActive = (href: string) => section === href;

  const switchOrg = (id: string) =>
    startTransition(async () => {
      const result = await switchOrganizationAction(id);
      if (!result.ok) toast(result.error, "error");
      setOrgMenuOpen(false);
      router.refresh();
    });

  const createDemo = () =>
    startTransition(async () => {
      const result = await createDemoOrganizationAction();
      if (result.ok) {
        toast("デモ組織を作成しました");
        router.push("/dashboard");
        router.refresh();
      } else toast(result.error, "error");
    });

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`} id="sidebar">
        <Link className="brand" href="/dashboard" aria-label="NAORU ホーム">
          <span className="brand-mark">N</span>
          <span className="brand-name">
            NAORU<span className="brand-dot">.</span>
          </span>
        </Link>
        <div className="org-menu" ref={orgRef}>
          <button
            className="workspace-switcher"
            aria-haspopup="menu"
            aria-expanded={orgMenuOpen}
            onClick={() => setOrgMenuOpen((v) => !v)}
            disabled={pending}
          >
            <span className="workspace-avatar">{initials(current?.name ?? "N").slice(0, 1)}</span>
            <span className="workspace-info">
              <b>
                {current?.name}
                {current?.isDemo && <span className="demo-badge">DEMO</span>}
              </b>
              <small>ワークスペース</small>
            </span>
            <span className="chevron">⌄</span>
          </button>
          {orgMenuOpen && (
            <div className="org-dropdown" role="menu">
              {props.organizations.map((o) => (
                <button
                  key={o.id}
                  role="menuitem"
                  className={`org-option ${o.id === props.currentOrganizationId ? "active" : ""}`}
                  onClick={() => switchOrg(o.id)}
                >
                  <span className="workspace-avatar">{o.name.slice(0, 1)}</span>
                  <span style={{ flex: 1 }}>{o.name}</span>
                  {o.isDemo && <span className="demo-badge">DEMO</span>}
                </button>
              ))}
              <div className="org-sep" />
              <Link className="org-option" href="/onboarding?new=1" role="menuitem">
                ＋ 新しい組織を作成
              </Link>
              <button className="org-option" role="menuitem" onClick={createDemo}>
                ✳ デモ組織を追加
              </button>
            </div>
          )}
        </div>
        <nav className="main-nav" aria-label="メインナビゲーション">
          {NAV_SECTIONS.map((group, gi) => (
            <div key={gi} style={{ display: "contents" }}>
              {group.label && <div className="nav-label">{group.label}</div>}
              {group.items.map((item) => (
                <Link key={item.href} href={item.href} className={`nav-item ${isActive(item.href) ? "active" : ""}`}>
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                  {item.href === "/analysis" && props.analysisBadge > 0 && (
                    <span className="nav-badge">{props.analysisBadge}</span>
                  )}
                </Link>
              ))}
            </div>
          ))}
          <div className="nav-divider" />
          <Link href="/chat" className={`nav-item ai-nav ${isActive("/chat") ? "active" : ""}`}>
            <span className="nav-icon ai-spark">✳</span>AIマーケター<span className="online-dot" />
          </Link>
          <Link href="/brand" className={`nav-item ${isActive("/brand") ? "active" : ""}`}>
            <span className="nav-icon">◎</span>Brand Brain
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <Link href="/settings" className={`nav-item ${isActive("/settings") ? "active" : ""}`}>
            <span className="nav-icon">⚙</span>設定
          </Link>
          <div className="user-card" ref={userRef}>
            <div className="user-avatar">{initials(props.user.displayName)}</div>
            <div className="user-meta">
              <b>{props.user.displayName}</b>
              <small>{ROLE_LABELS[props.role] ?? props.role}</small>
            </div>
            <button
              className="more-button"
              aria-label="アカウントメニュー"
              aria-expanded={userMenuOpen}
              onClick={() => setUserMenuOpen((v) => !v)}
            >
              ···
            </button>
            {userMenuOpen && (
              <div className="user-menu" role="menu">
                <div className="org-option" style={{ cursor: "default", color: "#9aa0a6" }}>
                  {props.user.email}
                </div>
                <Link className="org-option" href="/settings" role="menuitem">
                  ⚙ 設定
                </Link>
                <form action={signOutAction}>
                  <button className="org-option" type="submit" role="menuitem">
                    ↩ ログアウト
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" aria-label="メニュー" onClick={() => setSidebarOpen((v) => !v)}>
            ☰
          </button>
          <div className="breadcrumbs">
            <span>{props.workspaceLabel}</span>
            <span className="crumb-sep">/</span>
            <b>{PAGE_TITLES[section] ?? ""}</b>
          </div>
          <div className="top-actions">
            {props.demoMode && (
              <span className="demo-mode-pill" title="Supabase・AI APIに接続せず、モックデータで動作しています。データはサーバー再起動で初期状態に戻ります。">
                Demo Mode
              </span>
            )}
            <span className="date-label">{today}</span>
            <Link className="icon-button" aria-label="AIマーケターに相談" href="/chat">
              ✳
            </Link>
            <div className="top-avatar">{initials(props.user.displayName)}</div>
          </div>
        </header>
        <div className="page-content">{props.children}</div>
      </main>
    </div>
  );
}
