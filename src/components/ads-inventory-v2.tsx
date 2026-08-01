import { Activity, Layers3, Megaphone, Search } from "lucide-react";
import Link from "next/link";

import {
  ReportingContext,
  type ReportingFreshness,
} from "@/components/ui/reporting-context";
import type { AdInventoryItem, AdInventoryPage } from "@/lib/db";
import {
  buildNavigationHref,
  reportingContextHiddenFields,
} from "@/lib/navigation/query";
import {
  buildCampaignsRouteHref,
  parseCampaignsRouteFilters,
} from "@/lib/presentation/campaign-navigation";
import { formatNumber } from "@/lib/presentation/formatters";
import type { ReportingBarModel } from "@/lib/presentation/reporting-bar";

type Query = Record<string, string | string[] | undefined>;

function statusPresentation(ad: AdInventoryItem) {
  const status = (ad.effectiveStatus ?? ad.status ?? "UNKNOWN")
    .trim()
    .toUpperCase();
  if (!ad.isOperational) {
    return { label: "Tài khoản không hoạt động", tone: "inactive" };
  }
  if (!ad.isActive) {
    return { label: "Không còn trong dữ liệu mới nhất", tone: "inactive" };
  }
  if (status === "ACTIVE") {
    return { label: "Đang bật", tone: "active" };
  }
  if (status.includes("PAUSED")) {
    return { label: "Tạm dừng", tone: "paused" };
  }
  if (["WITH_ISSUES", "DISAPPROVED", "PENDING_REVIEW"].includes(status)) {
    return { label: "Cần kiểm tra", tone: "issue" };
  }
  return { label: "Chưa xác định", tone: "neutral" };
}

function deliveryPresentation(ad: AdInventoryItem) {
  if (ad.deliveryState === "delivering") {
    return { label: "Có delivery gần nhất", tone: "active" };
  }
  if (ad.deliveryState === "missing") {
    return { label: "Bật nhưng chưa delivery", tone: "issue" };
  }
  if (ad.deliveryState === "not_active") {
    return { label: "Không áp dụng", tone: "paused" };
  }
  return { label: "Chưa đủ dữ liệu", tone: "neutral" };
}

function dateLabel(value: string | null) {
  if (!value) return "—";
  const normalized = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return "—";
  const date = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "UTC",
      }).format(date)
    : "—";
}

function pageHref(query: Query, page: number) {
  return buildCampaignsRouteHref(query, { page, tab: "ads" });
}

export function AdsInventoryV2({
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
  reportingBar,
}: {
  data: AdInventoryPage;
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
}) {
  const filters = parseCampaignsRouteFilters(query);
  const page = Math.floor(data.offset / data.limit) + 1;
  const pageCount = Math.max(1, Math.ceil(data.total / data.limit));
  const preservedContext = reportingContextHiddenFields(query);
  const showInactive =
    (Array.isArray(query.showInactive)
      ? query.showInactive[0]
      : query.showInactive) === "1";

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div>
          <h1>Phân phối</h1>
          <p>
            Xem trạng thái Ads theo snapshot Meta hiện tại. Dữ liệu này tách
            khỏi KPI hiệu quả theo khoảng ngày.
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
          ...preservedContext,
          ...(filters.q ? { q: filters.q } : {}),
          ...(filters.tab === "ads" ? { tab: "ads" } : {}),
          ...(filters.delivery !== "all"
            ? { delivery: filters.delivery }
            : filters.status !== "all"
              ? { status: filters.status }
              : {}),
        }}
      />
      <nav className="v2-tabs" aria-label="Cấp phân phối">
        <Link
          className="v2-tab"
          href={buildCampaignsRouteHref(query, {
            tab: "campaigns",
            status: "all",
            delivery: "all",
            page: 1,
          })}
        >
          Campaign
        </Link>
        <Link
          className="v2-tab"
          aria-current="page"
          href={buildCampaignsRouteHref(query, { tab: "ads", page: 1 })}
        >
          Ads
        </Link>
      </nav>
      <section className="v2-ads-toolbar" aria-label="Bộ lọc Ads">
        <div className="v2-segmented">
          {[
            { label: "Tất cả", status: "all", delivery: "all" },
            { label: "Đang bật", status: "active", delivery: "all" },
            {
              label: "Có delivery gần nhất",
              status: "active",
              delivery: "latest",
            },
            {
              label: "Bật nhưng chưa delivery",
              status: "active",
              delivery: "missing",
            },
            { label: "Tạm dừng", status: "paused", delivery: "all" },
          ].map((option) => {
            const active =
              filters.status === option.status &&
              filters.delivery === option.delivery;
            return (
              <Link
                href={buildCampaignsRouteHref(query, {
                  tab: "ads",
                  status: option.status as "all" | "active" | "paused",
                  delivery: option.delivery as "all" | "latest" | "missing",
                  page: 1,
                })}
                aria-current={active ? "page" : undefined}
                key={option.label}
              >
                {option.label}
              </Link>
            );
          })}
        </div>
        <form className="v2-ads-search" action="/campaigns">
          <input type="hidden" name="tab" value="ads" />
          <input type="hidden" name="from" value={dateFrom} />
          <input type="hidden" name="to" value={dateTo} />
          <input type="hidden" name="compare" value={compare} />
          {account ? (
            <input type="hidden" name="account" value={account} />
          ) : null}
          {showInactive ? (
            <input type="hidden" name="showInactive" value="1" />
          ) : null}
          {Object.entries(preservedContext).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          {reportingCurrency ? (
            <input type="hidden" name="currency" value={reportingCurrency} />
          ) : null}
          {filters.delivery !== "all" ? (
            <input type="hidden" name="delivery" value={filters.delivery} />
          ) : filters.status !== "all" ? (
            <input type="hidden" name="status" value={filters.status} />
          ) : null}
          <label>
            <Search aria-hidden="true" size={16} />
            <span className="sr-only">Tìm Ads</span>
            <input
              name="q"
              defaultValue={filters.q ?? ""}
              placeholder="Tìm Ad, Campaign, Ad Set..."
            />
          </label>
          <button className="button button--secondary" type="submit">
            Lọc
          </button>
        </form>
      </section>
      {data.items.length ? (
        <section
          className="v2-ads-table"
          role="table"
          aria-label="Danh sách Ads"
          tabIndex={0}
        >
          <div className="v2-ads-table__head" role="row">
            <span role="columnheader">Ad</span>
            <span role="columnheader">Trạng thái</span>
            <span role="columnheader">Delivery gần nhất</span>
            <span role="columnheader">Campaign</span>
            <span role="columnheader">Ad Set</span>
            <span role="columnheader">Ad Account</span>
            <span role="columnheader">Creative</span>
            <span role="columnheader">Dữ liệu delivery</span>
          </div>
          {data.items.map((ad) => {
            const status = statusPresentation(ad);
            const delivery = deliveryPresentation(ad);
            return (
              <div className="v2-ads-table__row" role="row" key={ad.adId}>
                <span role="cell">
                  <strong>{ad.name}</strong>
                  <small>{ad.metaAdId}</small>
                </span>
                <span role="cell">
                  <em
                    className={`inventory-status inventory-status--${status.tone}`}
                  >
                    {status.label}
                  </em>
                </span>
                <span role="cell">
                  <em
                    className={`inventory-status inventory-status--${delivery.tone}`}
                  >
                    {delivery.label}
                  </em>
                </span>
                <span role="cell">
                  <strong>{ad.campaignName}</strong>
                  <small>{ad.metaCampaignId}</small>
                </span>
                <span role="cell">
                  <strong>{ad.adSetName}</strong>
                  <small>{ad.metaAdSetId}</small>
                </span>
                <span role="cell">
                  <strong>{ad.adAccountName}</strong>
                  <small>{ad.metaAdAccountId}</small>
                </span>
                <span role="cell">
                  {ad.creativeFamilyIds.length ? (
                    `${formatNumber(ad.creativeFamilyIds.length)} Creative`
                  ) : (
                    "Chưa mapping"
                  )}
                </span>
                <span role="cell">
                  <time dateTime={ad.latestMetricDate ?? undefined}>
                    {dateLabel(ad.latestMetricDate)}
                  </time>
                  <small>
                    Inventory: {dateLabel(ad.inventoryObservedAt)}
                  </small>
                </span>
              </div>
            );
          })}
        </section>
      ) : (
        <section className="v2-panel v2-empty-state">
          <div>
            {connected ? (
              <Activity aria-hidden="true" size={34} />
            ) : (
              <Megaphone aria-hidden="true" size={34} />
            )}
            <h2>{connected ? "Không tìm thấy Ads phù hợp" : "Chưa kết nối Meta"}</h2>
            <p>
              {connected
                ? "Thử bỏ bộ lọc, hoặc xem Chất lượng dữ liệu nếu snapshot chưa đủ."
                : "Kết nối Meta để xem phân phối Ads hiện tại."}
            </p>
            <Link
              className="button button--secondary"
              href={
                connected
                  ? buildNavigationHref("/data-health?coverage=ad", query)
                  : buildNavigationHref("/sources?tab=connection", query)
              }
            >
              <Layers3 aria-hidden="true" size={15} />
              {connected ? "Xem chất lượng dữ liệu" : "Kết nối Meta"}
            </Link>
          </div>
        </section>
      )}
      {data.total > data.limit ? (
        <nav className="v2-pagination" aria-label="Phân trang Ads">
          {page > 1 ? (
            <Link
              className="button button--secondary"
              href={pageHref(query, page - 1)}
            >
              Trang trước
            </Link>
          ) : (
            <span className="button button--secondary" aria-disabled="true">
              Trang trước
            </span>
          )}
          <span>
            Trang {page} / {pageCount}
          </span>
          {page < pageCount ? (
            <Link
              className="button button--secondary"
              href={pageHref(query, page + 1)}
            >
              Trang sau
            </Link>
          ) : (
            <span className="button button--secondary" aria-disabled="true">
              Trang sau
            </span>
          )}
        </nav>
      ) : null}
    </div>
  );
}

export {
  deliveryPresentation as adDeliveryPresentation,
  statusPresentation as adStatusPresentation,
};
