import {
  AlertTriangle,
  Boxes,
  Building2,
  CalendarClock,
  CircleDot,
  Flag,
  ListChecks,
  Layers3,
  Link2,
  Megaphone,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

import { CopyIdButton } from "@/components/ui/copy-id-button";
import { ContextualEntityLink } from "@/components/ui/contextual-entity-link";
import { EntityDrawer } from "@/components/ui/entity-drawer";
import { ReportingScopeSelector } from "@/components/ui/reporting-scope-selector";
import { StatusPill } from "@/components/ui/status-pill";
import { SyncButton } from "@/components/sync-button";
import { buildNavigationHref } from "@/lib/navigation";
import {
  sourceAccountCampaignsHref,
  sourceBusinessAccountsHref,
  sourceBusinessFilterId,
} from "@/lib/presentation/source-navigation";
import {
  formatMetaVerificationStatus,
  sourceAssetStatus,
} from "@/lib/presentation/source-status";
import type {
  CanonicalReportingScope,
  PersistedResultMapping,
  ResultDefinition,
} from "@/lib/reporting";
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
  | "events"
  | "reporting-scope"
  | "results";

export type SourcesResultRegistry = {
  definitions: ResultDefinition[];
  mappings: PersistedResultMapping[];
  source: "database" | "built_in_defaults";
  warning: string | null;
};

const TABS: { value: SourceTab; label: string; kind?: MetaAssetKind }[] = [
  { value: "connection", label: "Kết nối" },
  { value: "businesses", label: "Business", kind: "Business" },
  {
    value: "ad-accounts",
    label: "Tài khoản quảng cáo",
    kind: "Ad Account",
  },
  { value: "pages", label: "Page", kind: "Page" },
  { value: "reporting-scope", label: "Phạm vi báo cáo" },
  { value: "results", label: "Kết quả & Mapping" },
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
  reportingScope,
}: {
  assets: MetaAssetRow[];
  tab: Extract<SourceTab, "businesses" | "ad-accounts" | "pages">;
  query: Query;
  connected: boolean;
  reportingScope: CanonicalReportingScope | null;
}) {
  const tabDefinition = TABS.find((item) => item.value === tab);
  const businessFilterId =
    tab === "ad-accounts" ? sourceBusinessFilterId(query) : null;
  const businessFilter = businessFilterId
    ? assets.find(
        (asset) =>
          asset.kind === "Business" &&
          asset.id === businessFilterId,
      )
    : undefined;
  const accountScopeById = new Map(
    (reportingScope?.available.adAccounts ?? []).map((account) => [
      account.id,
      account,
    ]),
  );
  const rows = assets
    .filter((asset) => asset.kind === tabDefinition?.kind)
    .filter((asset) => {
      if (!businessFilterId || asset.kind !== "Ad Account") {
        return true;
      }
      const scopedAccount = accountScopeById.get(asset.id);
      if (scopedAccount) {
        return scopedAccount.businessIds.includes(businessFilterId);
      }
      return Boolean(
        businessFilter &&
          asset.parentName?.trim() === businessFilter.name.trim(),
      );
    });
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
              {businessFilter
                ? `${rows.length} thực thể thuộc ${businessFilter.name}.`
                : `${rows.length} thực thể theo quyền truy cập hiện tại.`}{" "}
              ID Meta là định danh điều hướng.
            </p>
          </div>
          <div className="v2-chip-row">
            <span className="v2-chip">
              {tab === "pages"
                ? `${rows.length} đã phát hiện`
                : `${rows.filter((asset) => sourceAssetStatus(asset).tone === "ready").length} đang hoạt động`}
            </span>
            {businessFilterId ? (
              <Link
                className="v2-link"
                href={href(query, {
                  source_business: null,
                  selected: null,
                })}
              >
                Xóa lọc Business
              </Link>
            ) : null}
          </div>
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
              const presentation = sourceAssetStatus(asset);
              return (
                <div className="v2-source-table__row" role="row" key={asset.id}>
                  <span role="cell">
                    <ContextualEntityLink
                      className="v2-source-identity"
                      href={detailHref(tab, asset.id, query)}
                      drawerHref={href(query, {
                        tab,
                        selected: asset.id,
                      })}
                      entityId={asset.id}
                    >
                      <strong>{asset.name}</strong>
                      <small>{asset.id}</small>
                    </ContextualEntityLink>
                  </span>
                  <span role="cell">
                    {tab === "pages"
                      ? asset.category ?? "Chưa có danh mục"
                      : tab === "businesses"
                        ? formatMetaVerificationStatus(
                            asset.verificationStatus,
                          )
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
            <div className="v2-chip-row">
              {selected.kind === "Business" ? (
                <Link
                  className="button button--primary"
                  href={sourceBusinessAccountsHref(
                    selected.id,
                    query,
                  )}
                >
                  Xem Ad Account thuộc Business
                </Link>
              ) : selected.kind === "Ad Account" ? (
                <Link
                  className="button button--primary"
                  href={sourceAccountCampaignsHref(
                    selected.id,
                    query,
                  )}
                >
                  Xem Campaign của tài khoản
                </Link>
              ) : null}
              <Link
                className="button button--secondary"
                href={detailHref(tab, selected.id, query)}
              >
                Mở trang đầy đủ
              </Link>
            </div>
            <section className="v2-drawer__section">
              <h3>Thông tin nguồn</h3>
              <dl className="v2-detail-list">
                <div>
                  <dt>Trạng thái</dt>
                  <dd>{sourceAssetStatus(selected).label}</dd>
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
                  <dd>
                    {formatMetaVerificationStatus(
                      selected.verificationStatus,
                    )}
                  </dd>
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

function isAssetTab(
  tab: SourceTab,
): tab is Extract<
  SourceTab,
  "businesses" | "ad-accounts" | "pages"
> {
  return ["businesses", "ad-accounts", "pages"].includes(tab);
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
          <h2>Kết quả &amp; Mapping tương thích</h2>
          <p>
            Nhóm action tương thích ngược cho các báo cáo cũ. Kết quả chính
            mới được xác định theo Objective và Result Registry, không mặc
            định toàn hệ thống là Install.
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
                  Nhóm action được Meta quy gán; chỉ áp dụng khi Result tương
                  ứng được chọn.
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
          href={buildNavigationHref("/settings?tab=results", query)}
        >
          Mở Kết quả &amp; Mapping
        </Link>
      </div>
    </section>
  );
}

function scopeStateLabel(
  value: CanonicalReportingScope["selected"]["businessState"],
) {
  if (value === "all") return "Chọn toàn bộ";
  if (value === "partial") return "Chọn một phần";
  return "Không chọn";
}

function ReportingScopePanel({
  scope,
  persistEnabled,
  query,
}: {
  scope: CanonicalReportingScope | null;
  persistEnabled: boolean;
  query: Query;
}) {
  if (!scope) {
    return (
      <section className="v2-panel">
        <div className="v2-compact-empty">
          <Layers3 aria-hidden="true" size={22} />
          <p>
            Chưa có inventory để xác nhận phạm vi. Hãy kết nối Meta và đồng bộ
            tài sản trước.
          </p>
        </div>
      </section>
    );
  }

  const selectedAccounts = new Set(scope.selected.adAccountIds);
  const orphanAccounts = scope.available.adAccounts.filter(
    (account) => account.isOrphan,
  );
  const inactiveAccounts = scope.available.adAccounts.filter(
    (account) => !account.isActive,
  );
  const selectedOrphans = orphanAccounts.filter((account) =>
    selectedAccounts.has(account.id),
  );
  const selectedInactive = inactiveAccounts.filter((account) =>
    selectedAccounts.has(account.id),
  );

  return (
    <section className="v2-panel">
      <div className="v2-panel__header">
        <div>
          <h2>Phạm vi báo cáo</h2>
          <p>
            Tài sản được Meta cấp quyền không tự động đồng nghĩa với tài sản
            được đưa vào báo cáo.
          </p>
        </div>
        <span className="v2-chip">
          {scopeStateLabel(scope.selected.adAccountState)}
        </span>
      </div>
      <div className="v2-event-map">
        <article>
          <div>
            <span className="v2-event-map__icon" aria-hidden="true">
              <Layers3 size={17} />
            </span>
            <div>
              <strong>Chỉnh và lưu phạm vi</strong>
              <small>
                Checkbox Business hỗ trợ chọn toàn bộ, một phần hoặc không
                chọn.
              </small>
            </div>
          </div>
          <ReportingScopeSelector
            businesses={scope.available.businesses}
            accounts={scope.available.adAccounts}
            selectedBusinessIds={scope.selected.businessIds}
            selectedAccountIds={scope.selected.adAccountIds}
            persistEnabled={persistEnabled}
          />
        </article>
        <article>
          <div>
            <span className="v2-event-map__icon" aria-hidden="true">
              <Building2 size={17} />
            </span>
            <div>
              <strong>Business</strong>
              <small>
                {scope.selected.businessIds.length}/
                {scope.available.businesses.length} trong báo cáo
              </small>
            </div>
          </div>
          <dl>
            <div>
              <dt>Trạng thái</dt>
              <dd>{scopeStateLabel(scope.selected.businessState)}</dd>
            </div>
            <div>
              <dt>Đã chọn</dt>
              <dd>{scope.selected.businessIds.length}</dd>
            </div>
            <div>
              <dt>Khả dụng</dt>
              <dd>{scope.available.businesses.length}</dd>
            </div>
          </dl>
        </article>
        <article>
          <div>
            <span className="v2-event-map__icon" aria-hidden="true">
              <Megaphone size={17} />
            </span>
            <div>
              <strong>Ad Account</strong>
              <small>
                {scope.selected.adAccountIds.length}/
                {scope.available.adAccounts.length} trong báo cáo
              </small>
            </div>
          </div>
          <dl>
            <div>
              <dt>Trạng thái</dt>
              <dd>{scopeStateLabel(scope.selected.adAccountState)}</dd>
            </div>
            <div>
              <dt>Đã chọn</dt>
              <dd>{scope.selected.adAccountIds.length}</dd>
            </div>
            <div>
              <dt>Khả dụng</dt>
              <dd>{scope.available.adAccounts.length}</dd>
            </div>
          </dl>
        </article>
        <article>
          <div>
            <span className="v2-event-map__icon" aria-hidden="true">
              <AlertTriangle size={17} />
            </span>
            <div>
              <strong>Không xác định Business</strong>
              <small>
                {orphanAccounts.length
                  ? orphanAccounts.map((account) => account.name).join(", ")
                  : "Không có Ad Account orphan"}
              </small>
            </div>
          </div>
          <dl>
            <div>
              <dt>Đã chọn</dt>
              <dd>{selectedOrphans.length}</dd>
            </div>
            <div>
              <dt>Khả dụng</dt>
              <dd>{orphanAccounts.length}</dd>
            </div>
            <div>
              <dt>Cách xử lý</dt>
              <dd>Chọn trực tiếp</dd>
            </div>
          </dl>
        </article>
        <article>
          <div>
            <span className="v2-event-map__icon" aria-hidden="true">
              <CircleDot size={17} />
            </span>
            <div>
              <strong>Tài khoản không hoạt động</strong>
              <small>
                {inactiveAccounts.length
                  ? inactiveAccounts
                      .map((account) => account.name)
                      .join(", ")
                  : "Không có"}
              </small>
            </div>
          </div>
          <dl>
            <div>
              <dt>Vẫn được chọn</dt>
              <dd>{selectedInactive.length}</dd>
            </div>
            <div>
              <dt>Tổng inactive</dt>
              <dd>{inactiveAccounts.length}</dd>
            </div>
            <div>
              <dt>Xác nhận gần nhất</dt>
              <dd>{formatSeen(scope.confirmedAt)}</dd>
            </div>
          </dl>
        </article>
      </div>
      <div className="v2-source-note">
        <ShieldCheck aria-hidden="true" size={18} />
        <div>
          <strong>Scope đã lưu và URL là hai lớp khác nhau</strong>
          <p>
            Nút “Lưu mặc định” ghi vào API scope nội bộ. Khi URL có
            business_ids hoặc account_ids, URL vẫn là nguồn ưu tiên cho lần
            xem hiện tại.
          </p>
        </div>
        <Link
          className="v2-link"
          href={href(query, {
            tab: "scope",
            selected: null,
          })}
        >
          Chỉnh phạm vi
        </Link>
      </div>
    </section>
  );
}

function mappingSourceLabel(
  mapping: PersistedResultMapping | undefined,
  registrySource: SourcesResultRegistry["source"],
) {
  if (mapping?.mappingSource === "owner") return "Owner override";
  if (mapping?.mappingSource === "system") return "Seed hệ thống";
  return registrySource === "database"
    ? "Chưa có mapping"
    : "Built-in fallback";
}

function ResultMappingPanel({
  registry,
  query,
}: {
  registry: SourcesResultRegistry;
  query: Query;
}) {
  const mappingByAlias = new Map(
    registry.mappings.map((mapping) => [
      [
        mapping.canonicalResultKey,
        mapping.metricSource,
        mapping.rawActionType,
      ].join(":"),
      mapping,
    ]),
  );

  return (
    <section className="v2-panel">
      <div className="v2-panel__header">
        <div>
          <h2>Kết quả &amp; Mapping</h2>
          <p>
            Result Registry xác định kết quả theo Objective. Các conversion
            result được ghi rõ là Meta-attributed và không có Result mặc định
            chung cho mọi ngành.
          </p>
        </div>
        <span className="v2-chip">
          {registry.source === "database"
            ? "Registry đã lưu"
            : "Built-in fallback"}
        </span>
      </div>
      {registry.warning ? (
        <div className="v2-source-note" role="status">
          <AlertTriangle aria-hidden="true" size={18} />
          <div>
            <strong>Đang dùng fallback</strong>
            <p>{registry.warning}</p>
          </div>
        </div>
      ) : null}
      <div className="v2-event-map">
        {registry.definitions.map((definition) => {
          const aliases = [
            ...definition.rawActionTypes.map((rawActionType) => ({
              rawActionType,
              metricSource: "action" as const,
            })),
            ...(definition.rawValueActionTypes ?? []).map(
              (rawActionType) => ({
                rawActionType,
                metricSource: "action_value" as const,
              }),
            ),
          ];
          const sourceLabels = [
            ...new Set(
              aliases.map((alias) =>
                mappingSourceLabel(
                  mappingByAlias.get(
                    [
                      definition.canonicalKey,
                      alias.metricSource,
                      alias.rawActionType,
                    ].join(":"),
                  ),
                  registry.source,
                ),
              ),
            ),
          ];
          return (
            <article key={definition.id}>
              <div>
                <span className="v2-event-map__icon" aria-hidden="true">
                  <ListChecks size={17} />
                </span>
                <div>
                  <strong>{definition.label}</strong>
                  <small>
                    {definition.canonicalKey} ·{" "}
                    {definition.objectiveKeys.join(", ") || "Không giới hạn"}
                  </small>
                </div>
              </div>
              <dl>
                <div>
                  <dt>Raw aliases</dt>
                  <dd>{aliases.length || "Chưa có"}</dd>
                </div>
                <div>
                  <dt>Nguồn mapping</dt>
                  <dd>{sourceLabels.join(", ") || "Chưa có"}</dd>
                </div>
                <div>
                  <dt>Benchmark</dt>
                  <dd>
                    {definition.direction === "lower_is_better"
                      ? "Thấp hơn tốt hơn"
                      : "Cao hơn tốt hơn"}
                  </dd>
                </div>
              </dl>
              <small>
                {aliases.length
                  ? aliases
                      .map(
                        (alias) =>
                          `${alias.metricSource}:${alias.rawActionType}`,
                      )
                      .join(" · ")
                  : "Không đọc raw action cho Result này."}
              </small>
            </article>
          );
        })}
      </div>
      <div className="v2-source-note">
        <ShieldCheck aria-hidden="true" size={18} />
        <div>
          <strong>Meta-attributed · Chỉ đọc</strong>
          <p>
            Mapping chỉ thay đổi cách hệ thống đọc Insights và benchmark cục
            bộ; không tạo event, không chỉnh Campaign và không ghi dữ liệu về
            Meta.
          </p>
        </div>
        <Link
          className="v2-link"
          href={buildNavigationHref("/settings?tab=results", query)}
        >
          Mở cài đặt Result
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
  reportingScope,
  resultRegistry,
  scopePersistEnabled,
  connectionContent,
}: {
  activeTab: SourceTab;
  query: Query;
  assets: MetaAssetRow[];
  dashboard: DashboardViewModel;
  connected: boolean;
  reportingScope: CanonicalReportingScope | null;
  resultRegistry: SourcesResultRegistry;
  scopePersistEnabled: boolean;
  connectionContent: React.ReactNode;
}) {
  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div>
          <h1>Nguồn dữ liệu</h1>
          <p>
            Kết nối, tài sản được cấp quyền, phạm vi đưa vào báo cáo và Result
            Mapping chỉ đọc được quản lý tại một nơi.
          </p>
        </div>
        {connected ? (
          <SyncButton kind="incremental" />
        ) : (
          <span className="v2-chip v2-chip--warning">Chưa kết nối</span>
        )}
      </header>
      <section className="v2-source-summary">
        <Link
          href={buildNavigationHref("/sources?tab=connection", query)}
          aria-label="Mở trạng thái kết nối Meta"
          aria-current={activeTab === "connection" ? "page" : undefined}
        >
          <Link2 aria-hidden="true" size={18} />
          <span>Kết nối</span>
          <strong>{connected ? "Đang hoạt động" : "Chưa sẵn sàng"}</strong>
        </Link>
        <Link
          href={buildNavigationHref("/sources?tab=businesses", query)}
          aria-label={`Mở ${dashboard.counts.businesses} Business`}
          aria-current={activeTab === "businesses" ? "page" : undefined}
        >
          <Building2 aria-hidden="true" size={18} />
          <span>Business</span>
          <strong>{dashboard.counts.businesses}</strong>
        </Link>
        <Link
          href={buildNavigationHref("/sources?tab=ad-accounts", query)}
          aria-label={`Mở ${dashboard.counts.adAccounts} tài khoản quảng cáo`}
          aria-current={activeTab === "ad-accounts" ? "page" : undefined}
        >
          <Megaphone aria-hidden="true" size={18} />
          <span>Tài khoản quảng cáo</span>
          <strong>{dashboard.counts.adAccounts}</strong>
        </Link>
        <Link
          href={buildNavigationHref("/sources?tab=pages", query)}
          aria-label={`Mở ${dashboard.counts.pages} Pages`}
          aria-current={activeTab === "pages" ? "page" : undefined}
        >
          <Flag aria-hidden="true" size={18} />
          <span>Pages</span>
          <strong>{dashboard.counts.pages}</strong>
        </Link>
        <Link
          href={buildNavigationHref(
            "/sources?tab=scope",
            query,
          )}
          aria-label="Mở phạm vi Business và Ad Account được đưa vào báo cáo"
          aria-current={
            activeTab === "reporting-scope" ? "page" : undefined
          }
        >
          <Layers3 aria-hidden="true" size={18} />
          <span>Phạm vi báo cáo</span>
          <strong>
            {reportingScope
              ? `${reportingScope.selected.businessIds.length} Business · ${reportingScope.selected.adAccountIds.length} Account`
              : "Chưa xác nhận"}
          </strong>
        </Link>
        <Link
          href={buildNavigationHref("/sources?tab=results", query)}
          aria-label="Mở Result Registry và raw action mapping"
          aria-current={activeTab === "results" ? "page" : undefined}
        >
          <ListChecks aria-hidden="true" size={18} />
          <span>Kết quả &amp; Mapping</span>
          <strong>{resultRegistry.definitions.length} Result</strong>
        </Link>
        <Link
          href={buildNavigationHref("/data-health", query)}
          aria-label="Mở lịch sử đồng bộ trong Chất lượng dữ liệu"
        >
          <CalendarClock aria-hidden="true" size={18} />
          <span>Lần đồng bộ cuối</span>
          <strong>{dashboard.lastSyncAt ?? "Chưa có"}</strong>
        </Link>
      </section>
      <nav className="v2-tabs" aria-label="Nhóm nguồn dữ liệu">
        {TABS.map((tab) => (
          <Link
            className="v2-tab"
            key={tab.value}
            href={href(query, {
              tab: tab.value === "reporting-scope" ? "scope" : tab.value,
              selected: null,
            })}
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
      {activeTab === "reporting-scope" ? (
        <ReportingScopePanel
          scope={reportingScope}
          persistEnabled={scopePersistEnabled}
          query={query}
        />
      ) : null}
      {activeTab === "results" ? (
        <ResultMappingPanel registry={resultRegistry} query={query} />
      ) : null}
      {isAssetTab(activeTab) ? (
        <SourceAssetPanel
          assets={assets}
          tab={activeTab}
          query={query}
          connected={connected}
          reportingScope={reportingScope}
        />
      ) : null}
    </div>
  );
}
