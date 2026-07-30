"use client";

import {
  Activity,
  BarChart3,
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
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  buildNavigationHref,
  isNavigationItemActive,
  PRIMARY_NAVIGATION,
} from "@/lib/navigation";

const navIcons = {
  overview: LayoutDashboard,
  creatives: BarChart3,
  library: Images,
  campaigns: ListTree,
  sources: Link2,
  "data-health": Activity,
  settings: Settings,
} satisfies Record<
  (typeof PRIMARY_NAVIGATION)[number]["id"],
  typeof LayoutDashboard
>;

export function AppShell({
  children,
  ownerName = "Owner",
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
  const searchParams = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);
  const overviewHref = buildNavigationHref("/overview", searchParams);

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
        <Link className="brand" href={overviewHref} aria-label="Meta Growth Tracker">
          <span className="brand__mark" aria-hidden="true">
            <TrendingUp size={22} strokeWidth={2.3} />
          </span>
          <span>
            <strong>Meta Growth Tracker</strong>
            <small>Cá nhân · Chỉ đọc</small>
          </span>
        </Link>

        <nav className="sidebar__nav">
          {PRIMARY_NAVIGATION.map((item) => {
            const isActive = isNavigationItemActive(pathname, item);
            const Icon = navIcons[item.id];
            const href = buildNavigationHref(item.href, searchParams);

            return (
              <Link
                key={item.id}
                className={`nav-link${isActive ? " nav-link--active" : ""}`}
                href={href}
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
            <strong>Chế độ chỉ đọc</strong>
            <p>Không tạo, sửa, tạm dừng hoặc thay đổi ngân sách quảng cáo.</p>
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
              Trung tâm hiệu quả Creative
              {demoMode ? <em>Demo data</em> : null}
            </span>
            <span className="topbar__meta">
              {reportingCurrency ?? "Tiền tệ theo tài khoản"} ·{" "}
              Múi giờ {reportingTimezone}
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
                <small>
                  {demoMode
                    ? "Dữ liệu mẫu"
                    : isConnected
                      ? "Meta đã kết nối"
                      : "Chưa kết nối"}
                </small>
              </span>
            </div>
            <div className="profile">
              <span className="profile__avatar" aria-hidden="true">
                {ownerName.slice(0, 1).toUpperCase()}
              </span>
              <span>
                <strong>{ownerName}</strong>
                <small>Chủ sở hữu</small>
              </span>
            </div>
          </div>
        </header>

        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
