import { ExternalLink, FolderTree, Search } from "lucide-react";
import Link from "next/link";

import { ContextualEntityLink } from "@/components/ui/contextual-entity-link";
import { CopyIdButton } from "@/components/ui/copy-id-button";
import { EntityDrawer } from "@/components/ui/entity-drawer";
import { ReportingContext } from "@/components/ui/reporting-context";
import type {
  CampaignInventoryItem,
  CampaignInventoryPage,
} from "@/lib/db";
import {
  formatCompactNumber,
  formatMoney,
  formatNumber,
} from "@/lib/presentation/formatters";

type Query = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function href(
  pathname: string,
  query: Query,
  overrides: Record<string, string | null | undefined> = {},
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
  const raw = value?.trim().toUpperCase();
  if (!raw) return "Chưa xác định";
  const labels: Record<string, string> = {
    OUTCOME_APP_PROMOTION: "Quảng bá ứng dụng",
    APP_INSTALLS: "Lượt cài đặt ứng dụng",
    OUTCOME_SALES: "Doanh số",
    OUTCOME_TRAFFIC: "Lưu lượng truy cập",
    OUTCOME_LEADS: "Khách hàng tiềm năng",
    OUTCOME_ENGAGEMENT: "Tương tác",
    LINK_CLICKS: "Lượt nhấp liên kết",
    CONVERSIONS: "Chuyển đổi",
  };
  return labels[raw] ?? "Mục tiêu khác";
}

function primaryPerformance(campaign: CampaignInventoryItem) {
  return [...campaign.performance].sort(
    (left, right) => right.spend - left.spend,
  )[0];
}

function CampaignDrawer({
  campaign,
  query,
}: {
  campaign: CampaignInventoryItem;
  query: Query;
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
                <span>Install</span>
                <strong>{formatNumber(performance.installs)}</strong>
              </div>
              <div>
                <span>Registration</span>
                <strong>{formatNumber(performance.registrations)}</strong>
              </div>
              <div>
                <span>CPI</span>
                <strong>
                  {formatMoney(performance.cpi, performance.currency)}
                </strong>
              </div>
              <div>
                <span>CPA Registration</span>
                <strong>
                  {formatMoney(
                    performance.costPerRegistration,
                    performance.currency,
                  )}
                </strong>
              </div>
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
}: {
  data: CampaignInventoryPage;
  query: Query;
  connected: boolean;
  dateFrom: string;
  dateTo: string;
  account: string;
  accounts: { id: string; name: string }[];
  reportingCurrency: string;
  currencyOptions: string[];
  compare: "previous_period" | "none";
  freshness: string;
}) {
  const selectedId = first(query.selected);
  const selected = selectedId
    ? data.items.find((campaign) => campaign.metaCampaignId === selectedId)
    : undefined;
  const page = Math.floor(data.offset / data.limit) + 1;
  const pageCount = Math.max(1, Math.ceil(data.total / data.limit));
  const performances = data.items.flatMap((campaign) => campaign.performance);
  const currencies = [...new Set(performances.map((item) => item.currency))];
  const currency = currencies.length === 1 ? currencies[0] : null;
  const spend = currency
    ? performances.reduce((sum, item) => sum + item.spend, 0)
    : null;
  const installs = performances.reduce((sum, item) => sum + item.installs, 0);
  const registrations = performances.reduce(
    (sum, item) => sum + item.registrations,
    0,
  );

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div>
          <h1>Chiến dịch</h1>
          <p>
            Hiệu quả Campaign cùng cấu trúc Ad Set → Ads → Creative Family,
            không có thao tác chỉnh sửa hoặc ngân sách.
          </p>
        </div>
        <span className="v2-chip v2-chip--success">Chỉ đọc</span>
      </header>
      <ReportingContext
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
          ...(first(query.q) ? { q: first(query.q)! } : {}),
          ...(first(query.status) ? { status: first(query.status)! } : {}),
        }}
      />
      <section className="v2-kpi-grid">
        <article className="v2-kpi">
          <span className="v2-kpi__label">Campaigns</span>
          <strong>{formatNumber(data.total)}</strong>
          <small>{data.items.length} trên trang hiện tại</small>
        </article>
        <article className="v2-kpi">
          <span className="v2-kpi__label">Spend</span>
          <strong>
            {currency
              ? formatMoney(spend, currency)
              : currencies.length
                ? "Nhiều tiền tệ"
                : "—"}
          </strong>
          <small>
            {currencies.length > 1 ? "Không cộng gộp tiền tệ" : "Trong kỳ"}
          </small>
        </article>
        <article className="v2-kpi">
          <span className="v2-kpi__label">Install</span>
          <strong>{formatCompactNumber(installs)}</strong>
          <small>Meta-attributed</small>
        </article>
        <article className="v2-kpi">
          <span className="v2-kpi__label">Registration</span>
          <strong>{formatCompactNumber(registrations)}</strong>
          <small>Meta-attributed</small>
        </article>
        <article className="v2-kpi">
          <span className="v2-kpi__label">CPI</span>
          <strong>
            {currency && installs > 0
              ? formatMoney((spend ?? 0) / installs, currency)
              : "—"}
          </strong>
          <small>Spend / Install</small>
        </article>
        <article className="v2-kpi">
          <span className="v2-kpi__label">CPA Registration</span>
          <strong>
            {currency && registrations > 0
              ? formatMoney((spend ?? 0) / registrations, currency)
              : "—"}
          </strong>
          <small>Spend / Registration</small>
        </article>
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
          defaultValue={first(query.status) ?? ""}
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
          <div className="v2-campaign-table__head" role="row">
            <span role="columnheader">Campaign</span>
            <span role="columnheader">Tài khoản</span>
            <span role="columnheader">Trạng thái</span>
            <span role="columnheader">Mục tiêu</span>
            <span role="columnheader">Spend</span>
            <span role="columnheader">Install</span>
            <span role="columnheader">Registration</span>
            <span role="columnheader">CPI</span>
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
                  {formatNumber(performance?.installs ?? 0)}
                </span>
                <span role="cell">
                  {formatNumber(performance?.registrations ?? 0)}
                </span>
                <span role="cell">
                  {performance
                    ? formatMoney(performance.cpi, performance.currency)
                    : "—"}
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
      {selected ? <CampaignDrawer campaign={selected} query={query} /> : null}
    </div>
  );
}

export {
  objective as campaignObjectiveLabel,
  primaryPerformance as primaryCampaignPerformance,
  status as campaignStatusPresentation,
};
