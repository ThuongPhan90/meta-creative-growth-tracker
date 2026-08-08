"use client";

import {
  Activity,
  BarChart3,
  Clock3,
  Images,
  LayoutDashboard,
  Link2,
  ListTree,
  Menu,
  Moon,
  Settings,
  ShieldCheck,
  Sun,
  TrendingUp,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  buildNavigationHref,
  isNavigationItemActive,
} from "@/lib/navigation";

const NAVIGATION_ITEMS = [
  {
    id: "overview",
    href: "/overview",
    matchPath: "/overview",
    label: "Tổng quan",
    section: "overview",
  },
  {
    id: "creatives",
    href: "/creatives",
    matchPath: "/creatives",
    label: "Creative Tracker",
    section: "creative",
  },
  {
    id: "library",
    href: "/library",
    matchPath: "/library",
    label: "Thư viện Creative",
    section: "creative",
  },
  {
    id: "campaigns",
    href: "/campaigns",
    matchPath: "/campaigns",
    label: "Phân phối",
    section: "creative",
  },
  {
    id: "sources",
    href: "/sources",
    matchPath: "/sources",
    label: "Nguồn dữ liệu",
    section: "data",
  },
  {
    id: "data-health",
    href: "/data-health",
    matchPath: "/data-health",
    label: "Chất lượng dữ liệu",
    section: "data",
  },
  {
    id: "settings",
    href: "/settings",
    matchPath: "/settings",
    label: "Cài đặt",
    section: "settings",
  },
] as const;

type NavigationItem = (typeof NAVIGATION_ITEMS)[number];

const NAVIGATION_SECTIONS = [
  { id: "overview", label: "Tổng quan", section: "overview" },
  { id: "creative", label: "Creative", section: "creative" },
  { id: "data", label: "Dữ liệu", section: "data" },
  { id: "settings", label: "Cài đặt", section: "settings" },
] as const;

const navIcons = {
  overview: LayoutDashboard,
  creatives: BarChart3,
  library: Images,
  campaigns: ListTree,
  sources: Link2,
  "data-health": Activity,
  settings: Settings,
} satisfies Record<NavigationItem["id"], typeof LayoutDashboard>;

function countSelectedValues(value: string | null) {
  return value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean).length ?? 0;
}

function scopeSummary(
  searchParams: Pick<URLSearchParams, "get">,
  reportingCurrency: string | null,
  reportingTimezone: string,
) {
  const accountCount = countSelectedValues(searchParams.get("account_ids"));
  const businessCount = countSelectedValues(searchParams.get("business_ids"));

  const selectedScope = accountCount
    ? `${accountCount} Ad Account đã chọn`
    : businessCount
      ? `${businessCount} Business đã chọn`
      : "Phạm vi báo cáo mặc định";
  const metadata = reportingCurrency
    ? `${reportingCurrency} · ${reportingTimezone}`
    : reportingTimezone;

  return `${selectedScope} · ${metadata}`;
}

function pageTitle(pathname: string) {
  return NAVIGATION_ITEMS.find((item) =>
    isNavigationItemActive(pathname, item),
  )?.label ?? "Meta Growth Tracker";
}

function compactFreshnessLabel(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "Chưa xác định";

  const lower = normalized.toLocaleLowerCase("vi-VN");
  if (lower.includes("dữ liệu mẫu") || lower.includes("chưa xác định")) {
    return normalized;
  }

  const date = normalized.match(/\b\d{2}\/\d{2}(?:\/\d{4})?\b/)?.[0];
  const age = normalized.match(/\b\d+\s+(?:phút|giờ|ngày)\s+trước\b/i)?.[0];
  const status = /một phần|cảnh báo/i.test(normalized) ? "Cảnh báo" : age;

  return [date?.slice(0, 5), status].filter(Boolean).join(" · ") || normalized;
}

export type AppShellV3Props = {
  children: React.ReactNode;
  ownerName?: string;
  isConnected?: boolean;
  demoMode?: boolean;
  reportingCurrency?: string | null;
  reportingTimezone?: string;
  /** Optional real freshness label supplied by the server layout. */
  freshnessLabel?: string | null;
  /** Optional human-readable reporting scope supplied by the server layout. */
  scopeLabel?: string | null;
  /** Lets a detail route provide a concise title instead of the nav label. */
  pageTitle?: string;
};

type ShellTheme = "dark" | "light";

const SHELL_THEME_STORAGE_KEY = "meta-growth-tracker-v3-theme";

function persistedShellTheme(): ShellTheme {
  if (typeof window === "undefined") return "dark";

  const persistedTheme = window.localStorage.getItem(SHELL_THEME_STORAGE_KEY);
  return persistedTheme === "light" || persistedTheme === "dark"
    ? persistedTheme
    : "dark";
}

function subscribeToShellTheme(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("v3-theme-change", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("v3-theme-change", onChange);
  };
}

/**
 * Presentation-only V3 application shell. It deliberately keeps the existing
 * navigation query contract and carries no mutation controls.
 */
export function AppShellV3({
  children,
  ownerName = "Owner",
  isConnected = false,
  demoMode = false,
  reportingCurrency = null,
  reportingTimezone = "Asia/Ho_Chi_Minh",
  freshnessLabel,
  scopeLabel,
  pageTitle: explicitPageTitle,
}: AppShellV3Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);
  const theme = useSyncExternalStore(
    subscribeToShellTheme,
    persistedShellTheme,
    () => "dark",
  );
  const mobileMenuRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const resolvedOwnerName = ownerName.trim() || "Owner";
  const ownerInitial = resolvedOwnerName.slice(0, 1).toLocaleUpperCase("vi");
  const resolvedScope =
    scopeLabel?.trim() ||
    scopeSummary(searchParams, reportingCurrency, reportingTimezone);
  const resolvedFreshness =
    freshnessLabel?.trim() || (demoMode ? "Dữ liệu mẫu" : "Chưa xác định");
  const compactFreshness = compactFreshnessLabel(resolvedFreshness);
  const resolvedPageTitle = explicitPageTitle?.trim() || pageTitle(pathname);
  const connectionStatus = demoMode
    ? "demo"
    : isConnected
      ? "connected"
      : "disconnected";
  const connectionLabel = demoMode
    ? "Dữ liệu mẫu"
    : isConnected
      ? "Meta đã kết nối"
      : "Meta chưa kết nối";

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    window.localStorage.setItem(SHELL_THEME_STORAGE_KEY, next);
    window.dispatchEvent(new Event("v3-theme-change"));
  };

  useEffect(() => {
    if (!mobileOpen) {
      if (restoreFocusRef.current?.isConnected) {
        restoreFocusRef.current.focus();
      }
      restoreFocusRef.current = null;
      return;
    }

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : mobileMenuRef.current;
    const focusable = () =>
      Array.from(
        sidebarRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => !element.hasAttribute("disabled"));
    const focusInitial = window.requestAnimationFrame(() => {
      focusable()[0]?.focus();
    });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusInitial);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  return (
    <div className="v3-app-shell" data-theme={theme}>
      <button
        ref={mobileMenuRef}
        className="v3-app-shell__mobile-menu"
        type="button"
        aria-label={mobileOpen ? "Đóng menu" : "Mở menu"}
        aria-expanded={mobileOpen}
        aria-controls="v3-primary-navigation"
        onClick={() => setMobileOpen((current) => !current)}
      >
        {mobileOpen ? <X aria-hidden="true" size={19} /> : <Menu aria-hidden="true" size={19} />}
      </button>

      {mobileOpen ? (
        <button
          className="v3-app-shell__backdrop"
          type="button"
          aria-label="Đóng menu"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        ref={sidebarRef}
        className={`v3-app-shell__sidebar${
          mobileOpen ? " v3-app-shell__sidebar--open" : ""
        }`}
        aria-label="Điều hướng chính"
        role={mobileOpen ? "dialog" : undefined}
        aria-modal={mobileOpen || undefined}
      >
        <Link
          className="v3-app-shell__brand"
          href={buildNavigationHref("/overview", searchParams)}
          aria-label="Meta Growth Tracker"
          onClick={() => setMobileOpen(false)}
        >
          <span className="v3-app-shell__brand-mark" aria-hidden="true">
            <TrendingUp size={18} strokeWidth={2} />
          </span>
          <span className="v3-app-shell__brand-copy">
            <strong className="v3-app-shell__brand-name">Meta Growth Tracker</strong>
            <small className="v3-app-shell__brand-byline">by DonHub</small>
          </span>
        </Link>

        <nav id="v3-primary-navigation" className="v3-app-shell__nav">
          {NAVIGATION_SECTIONS.map((section) => (
            <div
              key={section.id}
              className="v3-app-shell__nav-section"
              role="group"
              aria-label={section.label}
            >
              {NAVIGATION_ITEMS.filter(
                (item) => item.section === section.section,
              ).map((item) => {
                const Icon = navIcons[item.id];
                const active = isNavigationItemActive(pathname, item);

                return (
                  <Link
                    key={item.id}
                    className={`v3-app-shell__nav-link${
                      active ? " v3-app-shell__nav-link--active" : ""
                    }`}
                    href={buildNavigationHref(item.href, searchParams)}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMobileOpen(false)}
                  >
                    <Icon aria-hidden="true" size={17} strokeWidth={1.9} />
                    <span className="v3-truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <footer className="v3-app-shell__sidebar-footer">
          <section className="v3-app-shell__read-only" aria-label="Chế độ chỉ đọc">
            <strong className="v3-app-shell__read-only-title">
              <ShieldCheck aria-hidden="true" size={16} />
              Chế độ chỉ đọc
            </strong>
            <p className="v3-app-shell__read-only-copy">
              Không tạo, sửa, tạm dừng hoặc thay đổi ngân sách quảng cáo.
            </p>
          </section>

          <section className="v3-app-shell__scope" aria-label="Phạm vi báo cáo">
            <strong className="v3-app-shell__scope-title">Phạm vi hiện tại</strong>
            <p className="v3-app-shell__scope-copy">{resolvedScope}</p>
          </section>

          <div className="v3-app-shell__owner" aria-label={`Chủ sở hữu: ${resolvedOwnerName}`}>
            <span className="v3-app-shell__owner-avatar" aria-hidden="true">
              {ownerInitial}
            </span>
            <span className="v3-app-shell__owner-copy">
              <strong className="v3-app-shell__owner-name v3-truncate">{resolvedOwnerName}</strong>
              <small className="v3-app-shell__owner-role">Chủ sở hữu</small>
            </span>
          </div>
        </footer>
      </aside>

      <div className="v3-app-shell__frame" aria-hidden={mobileOpen || undefined}>
        <header className="v3-app-shell__topbar">
          <p className="v3-app-shell__page-title v3-truncate">{resolvedPageTitle}</p>

          <div className="v3-app-shell__topbar-actions">
            <span
              className="v3-app-shell__connection"
              data-status={connectionStatus}
              aria-label={`Trạng thái kết nối: ${connectionLabel}`}
            >
              <Activity aria-hidden="true" size={14} />
              <span>{connectionLabel}</span>
            </span>
            <span
              className="v3-app-shell__freshness"
              aria-label={`Dữ liệu mới nhất: ${resolvedFreshness}`}
            >
              <Clock3 aria-hidden="true" size={14} />
              <span>Dữ liệu</span>
              <span
                className="v3-app-shell__freshness-compact"
                aria-hidden="true"
              >
                {compactFreshness}
              </span>
              <strong>{resolvedFreshness}</strong>
            </span>
            <span className="v3-app-shell__read-only-badge" title="Ứng dụng chỉ đọc">
              <ShieldCheck aria-hidden="true" size={14} />
              <span>Chỉ đọc</span>
            </span>
            <button
              className="v3-app-shell__theme-toggle"
              type="button"
              aria-label={theme === "dark" ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối"}
              aria-pressed={theme === "light"}
              title={theme === "dark" ? "Chế độ sáng" : "Chế độ tối"}
              onClick={toggleTheme}
            >
              {theme === "dark" ? (
                <Sun aria-hidden="true" size={14} />
              ) : (
                <Moon aria-hidden="true" size={14} />
              )}
              <span className="v3-app-shell__theme-toggle-label">
                {theme === "dark" ? "Sáng" : "Tối"}
              </span>
            </button>
            <span
              className="v3-app-shell__topbar-owner"
              aria-label={`Chủ sở hữu: ${resolvedOwnerName}`}
            >
              <span className="v3-app-shell__topbar-owner-avatar" aria-hidden="true">
                {ownerInitial}
              </span>
              <span className="v3-truncate">{resolvedOwnerName}</span>
            </span>
          </div>
        </header>

        <main className="v3-app-shell__main">{children}</main>
      </div>
    </div>
  );
}

/** Alias for the future layout swap; the V2 shell remains untouched for now. */
export { AppShellV3 as AppShell };
