import {
  Boxes,
  Building2,
  CalendarClock,
  CircleDot,
  Flag,
  Link2,
  Megaphone,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

import { CopyIdButton } from "@/components/ui/copy-id-button";
import { EntityDrawer } from "@/components/ui/entity-drawer";
import { StatusPill } from "@/components/ui/status-pill";
import { SyncButton } from "@/components/sync-button";
import { buildNavigationHref } from "@/lib/navigation";
import type {
  DashboardViewModel,
  MetaAssetKind,
  MetaAssetRow,
} from "@/types/view-models";

type Query = Record<string, string | string[] | undefined>;
export type SourceTab =
  | "connection"
  | "businesses"
  | "ad-accounts"
  | "pages"
  | "events";

const TABS: { value: SourceTab; label: string; kind?: MetaAssetKind }[] = [
  { value: "connection", label: "Kết nối" },
  { value: "businesses", label: "Business", kind: "Business" },
  {
    value: "ad-accounts",
    label: "Tài khoản quảng cáo",
    kind: "Ad Account",
  },
  { value: "pages", label: "Page", kind: "Page" },
  { value: "events", label: "Event mapping" },
];

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function href(
  query: Query,
  overrides: Record<string, string | null | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(query)) {
    const value = first(raw);
    if (value) params.set(key, value.slice(0, 500));
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (!value) params.delete(key);
    else params.set(key, value);
  }
  return `/sources${params.size ? `?${params.toString()}` : ""}`;
}

function detailHref(tab: string, id: string, query: Query) {
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(query)) {
    const value = first(raw);
    if (value && key !== "selected") {
      params.set(key, value.slice(0, 500));
    }
  }
  params.set("tab", tab);
  const suffix = params.toString();
  return `/sources/${tab}/${encodeURIComponent(id)}${
    suffix ? `?${suffix}` : ""
  }`;
}

function status(asset: MetaAssetRow) {
  const normalized = asset.status.trim().toUpperCase();
  if (asset.isCurrent === false) {
    return { label: "Không còn trong lần đồng bộ mới nhất", tone: "warning" as const };
  }
  if (normalized === "ACTIVE") {
    return { label: "Đang hoạt động", tone: "ready" as const };
  }
  if (normalized === "INACTIVE") {
    return { label: "Không hoạt động", tone: "pending" as const };
  }
  if (
    asset.kind === "Ad Account" &&
    ["DISABLED", "UNSETTLED", "PENDING_RISK_REVIEW"].includes(normalized)
  ) {
    return { label: "Cần kiểm tra trên Meta", tone: "warning" as const };
  }
  return { label: "Chưa xác định", tone: "pending" as const };
}

function formatSeen(value?: string | null) {
  if (!value) return "Chưa có";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(parsed);
}

function SourceAssetPanel({
  assets,
  tab,
  query,
  connected,
}: {
  assets: MetaAssetRow[];
  tab: Exclude<SourceTab, "connection" | "events">;
  query: Query;
  connected: boolean;
}) {
  const tabDefinition = TABS.find((item) => item.value === tab);
  const rows = assets.filter((asset) => asset.kind === tabDefinition?.kind);
  const selectedId = first(query.selected);
  const selected = selectedId
    ? rows.find((asset) => asset.id === selectedId)
    : undefined;

  return (
    <>
      <section className="v2-panel">
        <div className="v2-panel__header">
          <div>
            <h2>{tabDefinition?.label}</h2>
            <p>
              {rows.length} thực thể theo quyền truy cập hiện tại; ID Meta là
              định danh điều hướng.
            </p>
          </div>
          <span className="v2-chip">
            {rows.filter((asset) => status(asset).tone === "ready").length} đang
            hoạt động
          </span>
        </div>
        {rows.length ? (
          <div
            className="v2-source-table"
            role="table"
            aria-label={`Danh sách ${tabDefinition?.label}`}
            tabIndex={0}
          >
            <div className="v2-source-table__head" role="row">
              <span role="columnheader">Tên / ID</span>
              <span role="columnheader">
                {tab === "pages"
                  ? "Danh mục"
                  : tab === "businesses"
                    ? "Xác minh"
                    : "Business"}
              </span>
              <span role="columnheader">Tiền tệ</span>
              <span role="columnheader">Múi giờ</span>
              <span role="columnheader">Lần thấy gần nhất</span>
              <span role="columnheader">Trạng thái</span>
            </div>
            {rows.map((asset) => {
              const presentation = status(asset);
              return (
                <div className="v2-source-table__row" role="row" key={asset.id}>
                  <span role="cell">
                    <Link
                      className="v2-source-identity"
                      href={href(query, {
                        tab,
                        selected: asset.id,
                      })}
                      aria-haspopup="dialog"
                    >
                      <strong>{asset.name}</strong>
                      <small>{asset.id}</small>
                    </Link>
                  </span>
                  <span role="cell">
                    {tab === "pages"
                      ? asset.category ?? "Chưa có danh mục"
                      : tab === "businesses"
                        ? asset.verificationStatus
                          ? asset.verificationStatus
                              .toLocaleLowerCase("vi-VN")
                              .replaceAll("_", " ")
                          : "Meta chưa trả trạng thái xác minh"
                        : asset.parentName ?? "Không thuộc Business đã đồng bộ"}
                  </span>
                  <span role="cell">{asset.currency ?? "—"}</span>
                  <span role="cell">{asset.timezone ?? "—"}</span>
                  <span role="cell">{formatSeen(asset.lastSeenAt)}</span>
                  <span role="cell">
                    <StatusPill status={presentation.tone} compact />
                    <small>{presentation.label}</small>
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="v2-compact-empty">
            <Boxes aria-hidden="true" size={22} />
            <p>
              {connected
                ? "Chưa phát hiện thực thể trong lần đồng bộ gần nhất."
                : "Kết nối Meta để quét nguồn dữ liệu."}
            </p>
          </div>
        )}
      </section>
      {selected ? (
        <EntityDrawer
          title={selected.name}
          closeHref={href(query, { tab, selected: null })}
          restoreFocusId={selected.id}
        >
          <div className="v2-drawer__body">
            <span className="v2-chip v2-chip--accent">{selected.kind}</span>
            <div className="v2-id-line">
              <code>{selected.id}</code>
              <CopyIdButton value={selected.id} />
            </div>
            <Link
              className="button button--secondary"
              href={detailHref(tab, selected.id, query)}
            >
              Mở trang đầy đủ
            </Link>
            <section className="v2-drawer__section">
              <h3>Thông tin nguồn</h3>
              <dl className="v2-detail-list">
                <div>
                  <dt>Trạng thái</dt>
                  <dd>{status(selected).label}</dd>
                </div>
                <div>
                  <dt>Business</dt>
                  <dd>{selected.parentName ?? "—"}</dd>
                </div>
                <div>
                  <dt>Danh mục Page</dt>
                  <dd>{selected.category ?? "—"}</dd>
                </div>
                <div>
                  <dt>Trạng thái xác minh</dt>
                  <dd>{selected.verificationStatus ?? "—"}</dd>
                </div>
                <div>
                  <dt>Tiền tệ</dt>
                  <dd>{selected.currency ?? "—"}</dd>
                </div>
                <div>
                  <dt>Múi giờ</dt>
                  <dd>{selected.timezone ?? "—"}</dd>
                </div>
                <div>
                  <dt>Lần thấy gần nhất</dt>
                  <dd>{formatSeen(selected.lastSeenAt)}</dd>
                </div>
              </dl>
            </section>
          </div>
        </EntityDrawer>
      ) : null}
    </>
  );
}

function EventMappingPanel({
  dashboard,
  query,
}: {
  dashboard: DashboardViewModel;
  query: Query;
}) {
  return (
    <section className="v2-panel">
      <div className="v2-panel__header">
        <div>
          <h2>Event mapping</h2>
          <p>
            Các conversion action dùng để tính Install và Registration trong
            báo cáo.
          </p>
        </div>
        <CircleDot aria-hidden="true" size={18} />
      </div>
      <div className="v2-event-map">
        {dashboard.events.map((event) => (
          <article key={event.name}>
            <div>
              <span className="v2-event-map__icon" aria-hidden="true">
                <CircleDot size={17} />
              </span>
              <div>
                <strong>{event.name}</strong>
                <small>
                  {event.name === "Install"
                    ? "Lượt cài đặt được Meta quy gán"
                    : "Đăng ký hoàn tất được Meta quy gán"}
                </small>
              </div>
            </div>
            <dl>
              <div>
                <dt>Android</dt>
                <dd>
                  <StatusPill status={event.android} compact />
                </dd>
              </div>
              <div>
                <dt>iOS</dt>
                <dd>
                  <StatusPill status={event.ios} compact />
                </dd>
              </div>
              <div>
                <dt>Tổng trong kỳ</dt>
                <dd>{event.total?.toLocaleString("vi-VN") ?? "Chưa có"}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
      <div className="v2-source-note">
        <ShieldCheck aria-hidden="true" size={18} />
        <div>
          <strong>Hợp đồng chỉ đọc</strong>
          <p>
            Mapping chỉ quyết định cách đọc action trong Insights; ứng dụng
            không gửi event và không sửa cấu hình trong Meta.
          </p>
        </div>
        <Link
          className="v2-link"
          href={buildNavigationHref("/settings?tab=events", query)}
        >
          Mở cài đặt event
        </Link>
      </div>
    </section>
  );
}

export function SourcesV2({
  activeTab,
  query,
  assets,
  dashboard,
  connected,
  connectionContent,
}: {
  activeTab: SourceTab;
  query: Query;
  assets: MetaAssetRow[];
  dashboard: DashboardViewModel;
  connected: boolean;
  connectionContent: React.ReactNode;
}) {
  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div>
          <h1>Nguồn dữ liệu</h1>
          <p>
            Một nơi duy nhất cho kết nối, tài sản được cấp quyền và mapping sự
            kiện; không trộn danh mục Page với trạng thái hoạt động.
          </p>
        </div>
        {connected ? (
          <SyncButton kind="incremental" />
        ) : (
          <span className="v2-chip v2-chip--warning">Chưa kết nối</span>
        )}
      </header>
      <section className="v2-source-summary">
        <article>
          <Link2 aria-hidden="true" size={18} />
          <span>Kết nối</span>
          <strong>{connected ? "Đang hoạt động" : "Chưa sẵn sàng"}</strong>
        </article>
        <article>
          <Building2 aria-hidden="true" size={18} />
          <span>Business</span>
          <strong>{dashboard.counts.businesses}</strong>
        </article>
        <article>
          <Megaphone aria-hidden="true" size={18} />
          <span>Tài khoản quảng cáo</span>
          <strong>{dashboard.counts.adAccounts}</strong>
        </article>
        <article>
          <Flag aria-hidden="true" size={18} />
          <span>Pages</span>
          <strong>{dashboard.counts.pages}</strong>
        </article>
        <article>
          <CalendarClock aria-hidden="true" size={18} />
          <span>Lần đồng bộ cuối</span>
          <strong>{dashboard.lastSyncAt ?? "Chưa có"}</strong>
        </article>
      </section>
      <nav className="v2-tabs" aria-label="Nhóm nguồn dữ liệu">
        {TABS.map((tab) => (
          <Link
            className="v2-tab"
            key={tab.value}
            href={href(query, { tab: tab.value, selected: null })}
            aria-current={activeTab === tab.value ? "page" : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {activeTab === "connection" ? connectionContent : null}
      {activeTab === "events" ? (
        <EventMappingPanel dashboard={dashboard} query={query} />
      ) : null}
      {activeTab !== "connection" && activeTab !== "events" ? (
        <SourceAssetPanel
          assets={assets}
          tab={activeTab}
          query={query}
          connected={connected}
        />
      ) : null}
    </div>
  );
}
