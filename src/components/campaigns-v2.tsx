import { ExternalLink, FolderTree, Search } from "lucide-react";
import Link from "next/link";

import { ContextualEntityLink } from "@/components/ui/contextual-entity-link";
import { CopyIdButton } from "@/components/ui/copy-id-button";
import { EntityDrawer } from "@/components/ui/entity-drawer";
import {
  ReportingContext,
  type ReportingFreshness,
} from "@/components/ui/reporting-context";
import type {
  CampaignInventoryItem,
  CampaignInventoryPage,
} from "@/lib/db";
import {
  formatCompactNumber,
  formatMoney,
  formatNumber,
  formatPercent,
} from "@/lib/presentation/formatters";
import type { ReportingBarModel } from "@/lib/presentation/reporting-bar";
import {
  objectiveLabel,
  summarizeDelivery,
  type DeliveryMetricRow,
  type DynamicResultMetricsModel,
  type DynamicResultTableColumn,
  type ResultKpiCard,
} from "@/lib/reporting";
import {
  NAVIGATION_QUERY_KEYS,
  reportingContextHiddenFields,
} from "@/lib/navigation/query";
import { buildCampaignsRouteHref } from "@/lib/presentation/campaign-navigation";

type Query = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function href(
  pathname: string,
  query: Query,
  overrides: Record<string, string | null | undefined> = {},
) {
  const allowed = new Set<string>([
    ...NAVIGATION_QUERY_KEYS,
    "q",
    "status",
    "page",
    "showInactive",
  ]);
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(query)) {
    if (!allowed.has(key)) continue;
    const value = first(raw);
    if (value) params.set(key, value.slice(0, 500));
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (!allowed.has(key)) continue;
    if (!value) params.delete(key);
    else params.set(key, value);
  }
  return `${pathname}${params.size ? `?${params.toString()}` : ""}`;
}

function status(campaign: CampaignInventoryItem) {
  const raw = (campaign.effectiveStatus ?? campaign.status ?? "UNKNOWN")
    .trim()
    .toUpperCase();
  if (!campaign.isActive) {
    return { label: "Không còn trong dữ liệu mới nhất", tone: "inactive" };
  }
  if (raw === "ACTIVE") return { label: "Đang hoạt động", tone: "active" };
  if (raw.includes("PAUSED")) return { label: "Tạm dừng", tone: "paused" };
  if (
    ["WITH_ISSUES", "DISAPPROVED", "PENDING_REVIEW"].includes(raw)
  ) {
    return { label: "Cần kiểm tra", tone: "issue" };
  }
  if (raw === "ARCHIVED") return { label: "Đã lưu trữ", tone: "inactive" };
  if (raw === "DELETED") return { label: "Đã xóa", tone: "inactive" };
  return { label: "Chưa xác định", tone: "neutral" };
}

function objective(value: string | null) {
  return value ? objectiveLabel(value) : "Chưa xác định";
}

function primaryPerformance(campaign: CampaignInventoryItem) {
  return campaign.performance.length === 1
    ? campaign.performance[0]
    : undefined;
}

function campaignResultValue(
  campaign: CampaignInventoryItem,
  canonicalResultKey: string,
) {
  const performance = primaryPerformance(campaign);
  if (!performance) return null;
  const normalized = performance.resultValues?.[canonicalResultKey];
  return typeof normalized === "number" &&
    Number.isFinite(normalized)
    ? normalized
    : null;
}

function campaignColumnValue(
  campaign: CampaignInventoryItem,
  column: DynamicResultTableColumn,
) {
  const performance = primaryPerformance(campaign);
  if (!performance) return null;
  const result = campaignResultValue(
    campaign,
    column.canonicalResultKey,
  );
  if (column.key.startsWith("result:")) return result;
  if (result === null || result <= 0) return null;
  if (column.valueType === "currency") {
    return performance.spend / result;
  }
  return null;
}

function formatDynamicValue(
  value: number | null,
  valueType: ResultKpiCard["valueType"],
  currency: string | null,
) {
  if (value === null) return "—";
  if (valueType === "currency") {
    return currency ? formatMoney(value, currency) : "—";
  }
  if (valueType === "percent") return formatPercent(value);
  if (valueType === "ratio") {
    return `${value.toLocaleString("vi-VN", {
      maximumFractionDigits: 2,
    })}×`;
  }
  return formatCompactNumber(value);
}

function CampaignDrawer({
  campaign,
  query,
  resultMetrics,
}: {
  campaign: CampaignInventoryItem;
  query: Query;
  resultMetrics: DynamicResultMetricsModel;
}) {
  const performance = primaryPerformance(campaign);
  return (
    <EntityDrawer
      title={campaign.name}
      closeHref={href("/campaigns", query, {
        selected: null,
        tab: null,
      })}
      restoreFocusId={campaign.metaCampaignId}
    >
      <div className="v2-drawer__body">
        <span
          className={`inventory-status inventory-status--${status(campaign).tone}`}
        >
          {status(campaign).label}
        </span>
        <h3 className="v2-issue-title">{campaign.name}</h3>
        <div className="v2-id-line">
          <code>{campaign.metaCampaignId}</code>
          <CopyIdButton value={campaign.metaCampaignId} />
        </div>
        <Link
          className="button button--secondary"
          href={href(`/campaigns/${campaign.metaCampaignId}`, query, {
            selected: null,
          })}
        >
          Mở trang đầy đủ
          <ExternalLink aria-hidden="true" size={15} />
        </Link>
        <section className="v2-drawer__section">
          <h3>Hiệu quả trong kỳ</h3>
          {performance ? (
            <div className="v2-detail-grid">
              <div>
                <span>Spend</span>
                <strong>
                  {formatMoney(performance.spend, performance.currency)}
                </strong>
              </div>
              <div>
                <span>Impressions</span>
                <strong>
                  {formatCompactNumber(performance.impressions)}
                </strong>
              </div>
              {resultMetrics.dynamicTableColumns.map((column) => (
                <div key={column.key}>
                  <span>{column.label}</span>
                  <strong>
                    {formatDynamicValue(
                      campaignColumnValue(campaign, column),
                      column.valueType,
                      performance.currency,
                    )}
                  </strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="v2-muted">
              Chưa có delivery trong khoảng ngày hoặc tiền tệ đang chọn.
            </p>
          )}
        </section>
        <section className="v2-drawer__section">
          <h3>Cấu trúc liên kết</h3>
          <dl className="v2-detail-list">
            <div>
              <dt>Tài khoản quảng cáo</dt>
              <dd>{campaign.adAccountName}</dd>
            </div>
            <div>
              <dt>Ad Sets</dt>
              <dd>{formatNumber(campaign.adSetCount)}</dd>
            </div>
            <div>
              <dt>Ads</dt>
              <dd>{formatNumber(campaign.adCount)}</dd>
            </div>
            <div>
              <dt>Creative Family</dt>
              <dd>{formatNumber(campaign.creativeAssetCount)}</dd>
            </div>
          </dl>
        </section>
      </div>
    </EntityDrawer>
  );
}

export function CampaignsV2({
  data,
  delivery,
  query,
  connected,
  dateFrom,
  dateTo,
  account,
  accounts,
  reportingCurrency,
  currencyOptions,
  compare,
  freshness,
  reportingBar,
  resultMetrics,
}: {
  data: CampaignInventoryPage;
  delivery: readonly DeliveryMetricRow[];
  query: Query;
  connected: boolean;
  dateFrom: string;
  dateTo: string;
  account: string;
  accounts: { id: string; name: string }[];
  reportingCurrency: string;
  currencyOptions: string[];
  compare: "previous_period" | "none";
  freshness: ReportingFreshness;
  reportingBar: ReportingBarModel;
  resultMetrics: DynamicResultMetricsModel;
}) {
  const selectedId = first(query.selected);
  const selected = selectedId
    ? data.items.find((campaign) => campaign.metaCampaignId === selectedId)
    : undefined;
  const page = Math.floor(data.offset / data.limit) + 1;
  const pageCount = Math.max(1, Math.ceil(data.total / data.limit));
  const deliverySummary = summarizeDelivery(delivery);
  const currency = deliverySummary.singleCurrency?.currency ?? null;
  const campaignGridTemplate = [
    "minmax(240px, 1.5fr)",
    "minmax(170px, 1fr)",
    "minmax(130px, 0.75fr)",
    "minmax(145px, 0.85fr)",
    "minmax(125px, 0.8fr)",
    "minmax(115px, 0.75fr)",
    ...resultMetrics.dynamicTableColumns.map(
      () => "minmax(118px, 0.78fr)",
    ),
    "minmax(78px, 0.55fr)",
    "minmax(78px, 0.55fr)",
    "minmax(90px, 0.6fr)",
  ].join(" ");
  const campaignGridStyle = {
    gridTemplateColumns: campaignGridTemplate,
    minWidth: `${1180 + resultMetrics.dynamicTableColumns.length * 118}px`,
  };

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div>
          <h1>Phân phối</h1>
          <p>
            Hiệu quả Campaign cùng cấu trúc Ad Set → Ads → Creative Family,
            không có thao tác chỉnh sửa hoặc ngân sách.
          </p>
        </div>
        <span className="v2-chip v2-chip--success">Chỉ đọc</span>
      </header>
      <ReportingContext
        {...reportingBar}
        action="/campaigns"
        dateFrom={dateFrom}
        dateTo={dateTo}
        account={account}
        accounts={accounts}
        currency={reportingCurrency}
        currencies={currencyOptions}
        compare={compare}
        freshness={freshness}
        preserved={{
          ...reportingContextHiddenFields(query),
          ...(first(query.q) ? { q: first(query.q)! } : {}),
          ...(first(query.status) ? { status: first(query.status)! } : {}),
        }}
      />
      <nav className="v2-tabs" aria-label="Cấp phân phối">
        <Link
          className="v2-tab"
          aria-current="page"
          href={buildCampaignsRouteHref(query, {
            tab: "campaigns",
            delivery: "all",
            page: 1,
          })}
        >
          Campaign
        </Link>
        <Link
          className="v2-tab"
          href={buildCampaignsRouteHref(query, {
            tab: "ads",
            status: "all",
            delivery: "all",
            page: 1,
          })}
        >
          Ads
        </Link>
      </nav>
      <section className="v2-kpi-grid">
        <article className="v2-kpi">
          <span className="v2-kpi__label">Campaigns</span>
          <strong>{formatNumber(data.total)}</strong>
          <small>{data.items.length} trên trang hiện tại</small>
        </article>
        {resultMetrics.kpiCards.map((card) => (
          <article className="v2-kpi" title={card.formula} key={card.key}>
            <span className="v2-kpi__label">{card.label}</span>
            <strong>
              {formatDynamicValue(
                card.value,
                card.valueType,
                currency,
              )}
            </strong>
            <small>
              {card.unavailableReason === "split_currency"
                ? "Chọn một tiền tệ để so sánh"
                : card.attribution === "meta_attributed"
                  ? "Meta-attributed · Chỉ đọc"
                  : card.formula}
            </small>
          </article>
        ))}
      </section>
      <form className="v2-filter-bar v2-campaign-filters" action="/campaigns">
        <input type="hidden" name="from" value={dateFrom} />
        <input type="hidden" name="to" value={dateTo} />
        <input type="hidden" name="compare" value={compare} />
        {reportingCurrency ? (
          <input type="hidden" name="currency" value={reportingCurrency} />
        ) : null}
        <label className="v2-filter-search">
          <Search aria-hidden="true" size={16} />
          <span className="sr-only">Tìm Campaign</span>
          <input
            name="q"
            defaultValue={first(query.q) ?? ""}
            placeholder="Tìm Campaign, ID hoặc tài khoản"
          />
        </label>
        <select name="account" defaultValue={account} aria-label="Tài khoản">
          <option value="">Tất cả tài khoản</option>
          {accounts.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={first(query.status)?.toUpperCase() ?? ""}
          aria-label="Trạng thái Campaign"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="ACTIVE">Đang hoạt động</option>
          <option value="PAUSED">Tạm dừng</option>
          <option value="WITH_ISSUES">Cần kiểm tra</option>
          <option value="ARCHIVED">Đã lưu trữ</option>
          <option value="DELETED">Đã xóa</option>
        </select>
        <button className="button button--primary" type="submit">
          Lọc
        </button>
      </form>
      {data.items.length ? (
        <section
          className="v2-campaign-table"
          role="table"
          aria-label="Danh sách Campaign"
          tabIndex={0}
        >
          <div
            className="v2-campaign-table__head"
            role="row"
            style={campaignGridStyle}
          >
            <span role="columnheader">Campaign</span>
            <span role="columnheader">Tài khoản</span>
            <span role="columnheader">Trạng thái</span>
            <span role="columnheader">Mục tiêu</span>
            <span role="columnheader">Spend</span>
            <span role="columnheader">Impressions</span>
            {resultMetrics.dynamicTableColumns.map((column) => (
              <span
                role="columnheader"
                title={column.formula}
                key={column.key}
              >
                {column.label}
              </span>
            ))}
            <span role="columnheader">Ad Sets</span>
            <span role="columnheader">Ads</span>
            <span role="columnheader">Creative</span>
          </div>
          {data.items.map((campaign) => {
            const performance = primaryPerformance(campaign);
            const full = href(
              `/campaigns/${campaign.metaCampaignId}`,
              query,
              { selected: null },
            );
            const drawer = href("/campaigns", query, {
              selected: campaign.metaCampaignId,
            });
            const presentation = status(campaign);
            return (
              <div
                className="v2-campaign-table__row"
                role="row"
                key={campaign.campaignId}
                style={campaignGridStyle}
              >
                <span role="cell">
                  <ContextualEntityLink
                    href={full}
                    drawerHref={drawer}
                    entityId={campaign.metaCampaignId}
                  >
                    <strong>{campaign.name}</strong>
                    <small>{campaign.metaCampaignId}</small>
                  </ContextualEntityLink>
                </span>
                <span role="cell">
                  <Link
                    className="v2-link"
                    href={href("/sources", query, {
                      tab: "ad-accounts",
                      selected: campaign.metaAdAccountId,
                    })}
                  >
                    {campaign.adAccountName}
                  </Link>
                  <small>{campaign.metaAdAccountId}</small>
                </span>
                <span role="cell">
                  <em
                    className={`inventory-status inventory-status--${presentation.tone}`}
                  >
                    {presentation.label}
                  </em>
                </span>
                <span role="cell">{objective(campaign.objective)}</span>
                <span role="cell">
                  {performance
                    ? formatMoney(performance.spend, performance.currency)
                    : "—"}
                </span>
                <span role="cell">
                  {performance
                    ? formatCompactNumber(performance.impressions)
                    : "—"}
                </span>
                {resultMetrics.dynamicTableColumns.map((column) => (
                  <span
                    role="cell"
                    title={column.formula}
                    key={column.key}
                  >
                    {formatDynamicValue(
                      campaignColumnValue(campaign, column),
                      column.valueType,
                      performance?.currency ?? null,
                    )}
                  </span>
                ))}
                <span role="cell">
                  <Link
                    className="v2-link"
                    href={href(
                      `/campaigns/${campaign.metaCampaignId}`,
                      query,
                      { selected: null, tab: "structure" },
                    )}
                  >
                    {formatNumber(campaign.adSetCount)}
                  </Link>
                </span>
                <span role="cell">
                  <Link
                    className="v2-link"
                    href={href(
                      `/campaigns/${campaign.metaCampaignId}`,
                      query,
                      { selected: null, tab: "structure" },
                    )}
                  >
                    {formatNumber(campaign.adCount)}
                  </Link>
                </span>
                <span role="cell">
                  <Link
                    className="v2-link"
                    href={href(
                      `/campaigns/${campaign.metaCampaignId}`,
                      query,
                      { selected: null, tab: "creatives" },
                    )}
                  >
                    {formatNumber(campaign.creativeAssetCount)}
                  </Link>
                </span>
              </div>
            );
          })}
        </section>
      ) : (
        <section className="v2-panel v2-empty-state">
          <div>
            <FolderTree aria-hidden="true" size={34} />
            <h2>
              {connected ? "Không tìm thấy Campaign" : "Chưa kết nối Meta"}
            </h2>
            <p>
              {connected
                ? "Thử xóa bộ lọc hoặc kiểm tra lần đồng bộ gần nhất."
                : "Kết nối Meta để đồng bộ Campaign và cấu trúc Ads."}
            </p>
            <Link
              className="button button--primary"
              href={
                connected
                  ? href("/data-health", query, {
                      selected: null,
                      tab: null,
                    })
                  : href("/sources", query, {
                      selected: null,
                      tab: "connection",
                    })
              }
            >
              {connected ? "Xem chất lượng dữ liệu" : "Kết nối Meta"}
            </Link>
          </div>
        </section>
      )}
      {data.total > data.limit ? (
        <nav className="v2-pagination" aria-label="Phân trang Campaign">
          <Link
            className="button button--secondary"
            aria-disabled={page <= 1}
            href={href("/campaigns", query, {
              page: String(Math.max(1, page - 1)),
              selected: null,
            })}
          >
            Trang trước
          </Link>
          <span>
            Trang {page} / {pageCount}
          </span>
          <Link
            className="button button--secondary"
            aria-disabled={page >= pageCount}
            href={href("/campaigns", query, {
              page: String(Math.min(pageCount, page + 1)),
              selected: null,
            })}
          >
            Trang sau
          </Link>
        </nav>
      ) : null}
      {selected ? (
        <CampaignDrawer
          campaign={selected}
          query={query}
          resultMetrics={resultMetrics}
        />
      ) : null}
    </div>
  );
}

export {
  objective as campaignObjectiveLabel,
  primaryPerformance as primaryCampaignPerformance,
  status as campaignStatusPresentation,
};
