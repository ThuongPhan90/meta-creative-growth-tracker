"use client";

import {
  Activity,
  BarChart3,
  Building2,
  ExternalLink,
  Images,
  LayoutDashboard,
  Link2,
  ListTree,
  Menu,
  Settings,
  ShieldCheck,
  TrendingUp,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const navItems = [
  {
    href: "/dashboard",
    label: "Tổng quan",
    icon: LayoutDashboard,
  },
  {
    href: "/connect",
    label: "Kết nối Meta",
    icon: Link2,
  },
  {
    href: "/assets",
    label: "Tài sản Meta",
    icon: Building2,
  },
  {
    href: "/campaigns",
    label: "Campaigns & Ads",
    icon: ListTree,
  },
  {
    href: "/tracker",
    label: "Creative Tracker",
    icon: BarChart3,
  },
  {
    href: "/creatives",
    label: "Thư viện Creative",
    icon: Images,
  },
  {
    href: "/health",
    label: "Sức khỏe dữ liệu",
    icon: Activity,
  },
  {
    href: "/settings",
    label: "Cài đặt",
    icon: Settings,
  },
];

export function AppShell({
  children,
  ownerName = "Donny",
  isConnected = false,
  demoMode = false,
  reportingCurrency = null,
  reportingTimezone = "Asia/Ho_Chi_Minh",
}: {
  children: React.ReactNode;
  ownerName?: string;
  isConnected?: boolean;
  demoMode?: boolean;
  reportingCurrency?: string | null;
  reportingTimezone?: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="app-shell">
      <button
        type="button"
        className="mobile-menu-button"
        aria-label={mobileOpen ? "Đóng menu" : "Mở menu"}
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((current) => !current)}
      >
        {mobileOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
      </button>

      {mobileOpen ? (
        <button
          className="sidebar-backdrop"
          type="button"
          aria-label="Đóng menu"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        className={`sidebar${mobileOpen ? " sidebar--open" : ""}`}
        aria-label="Điều hướng chính"
      >
        <Link className="brand" href="/dashboard" aria-label="Meta Growth Tracker">
          <span className="brand__mark" aria-hidden="true">
            <TrendingUp size={22} strokeWidth={2.3} />
          </span>
          <span>
            <strong>Meta Growth Tracker</strong>
            <small>Personal · Read-only</small>
          </span>
        </Link>

        <nav className="sidebar__nav">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                className={`nav-link${isActive ? " nav-link--active" : ""}`}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                onClick={() => setMobileOpen(false)}
              >
                <Icon aria-hidden="true" size={19} strokeWidth={1.9} />
                <span>{item.label}</span>
                {isActive ? (
                  <span className="nav-link__dot" aria-hidden="true" />
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar__support">
          <span className="support-icon" aria-hidden="true">
            <ShieldCheck size={18} />
          </span>
          <div>
            <strong>Meta read-only</strong>
            <p>Repo không tạo, sửa, pause hoặc thay đổi ngân sách quảng cáo.</p>
            <Link href="/setup">
              Mở Setup Wizard
              <ExternalLink aria-hidden="true" size={14} />
            </Link>
          </div>
        </div>
      </aside>

      <div className="app-frame">
        <header className="topbar">
          <div className="topbar__context">
            <span className="topbar__product">
              Personal command center
              {demoMode ? <em>Demo data</em> : null}
            </span>
            <span className="topbar__meta">
              {reportingCurrency ?? "Per-account currency"} reporting ·{" "}
              {reportingTimezone}
            </span>
          </div>

          <div className="topbar__actions">
            <div className="read-only-indicator">
              <span
                className={`connection-dot${
                  isConnected ? " connection-dot--online" : ""
                }`}
                aria-hidden="true"
              />
              <span>
                <strong>Chỉ đọc</strong>
                <small>{isConnected ? "Meta đã kết nối" : "Chưa kết nối"}</small>
              </span>
            </div>
            <div className="profile">
              <span className="profile__avatar" aria-hidden="true">
                {ownerName.slice(0, 1).toUpperCase()}
              </span>
              <span>
                <strong>{ownerName}</strong>
                <small>Owner</small>
              </span>
            </div>
          </div>
        </header>

        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
