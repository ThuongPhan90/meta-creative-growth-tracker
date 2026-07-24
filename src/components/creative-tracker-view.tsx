import { Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import type { CreativeTrackerPage } from "@/lib/db";
import { rateCreativeCpi } from "@/lib/reporting";

type AccountOption = {
  id: string;
  name: string;
  active: boolean;
};

export type TrackerFilters = {
  dateFrom: string;
  dateTo: string;
  query: string;
  account: string;
  campaign: string;
  format: "" | "video" | "image" | "unallocated";
  showInactive: boolean;
  dateRangeChanged: boolean;
  page: number;
};

function number(value: number, digits = 0) {
  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: digits,
  }).format(value);
}

function money(value: number, currency: string) {
  return `${currency} ${number(value, 2)}`;
}

function percent(value: number | null) {
  return value === null ? "—" : `${number(value, 2)}%`;
}

function trackerHref(filters: TrackerFilters, page: number) {
  const query = new URLSearchParams({
    from: filters.dateFrom,
    to: filters.dateTo,
  });
  if (filters.query) query.set("q", filters.query);
  if (filters.account) query.set("account", filters.account);
  if (filters.campaign) query.set("campaign", filters.campaign);
  if (filters.format) query.set("format", filters.format);
  if (filters.showInactive) query.set("showInactive", "1");
  if (page > 1) query.set("page", String(page));
  return `/tracker?${query.toString()}`;
}

export function CreativeTrackerView({
  data,
  accounts,
  filters,
  connected,
  minimumInstalls,
}: {
  data: CreativeTrackerPage;
  accounts: AccountOption[];
  filters: TrackerFilters;
  connected: boolean;
  minimumInstalls: number;
}) {
  const currentPage = Math.floor(data.offset / data.limit) + 1;
  const pageCount = Math.max(1, Math.ceil(data.total / data.limit));

  return (
    <div className="tracker-page">
      <PageHeader
        title="Creative Tracker"
        description="Báo cáo theo đúng grain OS × mã creative chuẩn hóa; số liệu conversion là Meta-attributed."
      />

      <form className="tracker-filters" action="/tracker" method="get">
        <label className="tracker-filters__search">
          <span className="sr-only">Tìm creative</span>
          <Search aria-hidden="true" size={17} />
          <input
            name="q"
            defaultValue={filters.query}
            placeholder="Tìm mã creative, Ads hoặc campaign"
          />
        </label>
        <label>
          <span>Từ ngày</span>
          <input
            type="date"
            name="from"
            defaultValue={filters.dateFrom}
          />
        </label>
        <label>
          <span>Đến ngày</span>
          <input type="date" name="to" defaultValue={filters.dateTo} />
        </label>
        <label>
          <span>Ad Account</span>
          <select name="account" defaultValue={filters.account}>
            <option value="">Tất cả</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
                {account.active ? "" : " · Không hoạt động"}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Campaign ID</span>
          <input
            name="campaign"
            defaultValue={filters.campaign}
            placeholder="Tất cả"
          />
        </label>
        <label>
          <span>Format / scope</span>
          <select name="format" defaultValue={filters.format}>
            <option value="">Tất cả</option>
            <option value="video">Video</option>
            <option value="image">Banner</option>
            <option value="unallocated">Dynamic chưa phân bổ</option>
          </select>
        </label>
        <button className="button button--primary" type="submit">
          <SlidersHorizontal aria-hidden="true" size={15} />
          Áp dụng
        </button>
        <label className="account-visibility-toggle">
          <input
            type="checkbox"
            name="showInactive"
            value="1"
            defaultChecked={filters.showInactive}
          />
          <span>Hiện tài khoản không hoạt động</span>
        </label>
        {(
          filters.query ||
          filters.account ||
          filters.campaign ||
          filters.format ||
          filters.showInactive ||
          filters.dateRangeChanged
        ) && (
          <Link className="button button--secondary" href="/tracker">
            Xóa lọc
          </Link>
        )}
      </form>

      <div className="tracker-disclosure">
        <strong>{data.total.toLocaleString("vi-VN")} dòng báo cáo</strong>
        <span>
          Reach là tổng reach Meta báo theo ngày, không phải unique reach cho
          toàn khoảng. Dynamic chỉ xuống asset khi Meta trả identity và tổng
          delivery dimensions cùng các KPI cộng dồn đối soát khớp.
        </span>
      </div>

      {data.items.length ? (
        <section className="tracker-table" aria-label="Creative tracker">
          <div className="tracker-table__head">
            <span>Mã creative</span>
            <span>OS / Format</span>
            <span>Spend</span>
            <span>Impressions</span>
            <span>Reach*</span>
            <span>Link CTR</span>
            <span>Install</span>
            <span>Registration</span>
            <span>CPI</span>
            <span>CPA Reg.</span>
            <span>Hook</span>
            <span>Hold</span>
            <span>Rating</span>
          </div>
          {data.items.map((item) => {
            const cpi =
              item.installs > 0 ? item.spend / item.installs : null;
            const cpa =
              item.registrations > 0
                ? item.spend / item.registrations
                : null;
            const linkCtr =
              item.impressions > 0
                ? (item.linkClicks / item.impressions) * 100
                : null;
            const hook =
              item.format !== "image" && item.impressions > 0
                ? (item.video3sViews / item.impressions) * 100
                : null;
            const hold =
              item.format !== "image" && item.video3sViews > 0
                ? (item.video100Views / item.video3sViews) * 100
                : null;
            const rating = rateCreativeCpi({
              installs: item.installs,
              cpi,
              osBaselineCpi: item.osBaselineCpi,
              minimumInstalls,
            });
            return (
              <div
                className="tracker-table__row"
                key={`${item.creativeCode}:${item.operatingSystem}:${item.currency}`}
              >
                <span>
                  <strong>{item.creativeCode}</strong>
                  <small>
                    {item.adCount} Ads · {item.assetCount} assets
                  </small>
                </span>
                <span>
                  <strong>{item.operatingSystem}</strong>
                  <small>
                    {item.format}
                    {item.hasUnallocatedDelivery
                      ? " · ad scope"
                      : " · asset scope"}
                  </small>
                </span>
                <span>{money(item.spend, item.currency)}</span>
                <span>{number(item.impressions)}</span>
                <span>{number(item.dailyReachSum)}</span>
                <span>{percent(linkCtr)}</span>
                <span>{number(item.installs, 2)}</span>
                <span>{number(item.registrations, 2)}</span>
                <span>{cpi === null ? "—" : money(cpi, item.currency)}</span>
                <span>{cpa === null ? "—" : money(cpa, item.currency)}</span>
                <span>{percent(hook)}</span>
                <span>{percent(hold)}</span>
                <span>
                  <em className="tracker-rating">
                    {rating}
                  </em>
                  <small>
                    Baseline{" "}
                    {item.osBaselineCpi === null
                      ? "—"
                      : money(item.osBaselineCpi, item.currency)}
                  </small>
                </span>
              </div>
            );
          })}
        </section>
      ) : (
        <section className="standard-empty-state">
          <span aria-hidden="true">
            <SlidersHorizontal size={23} />
          </span>
          <h2>
            {connected
              ? "Chưa có dữ liệu phù hợp"
              : "Chưa kết nối Meta"}
          </h2>
          <p>
            {connected
              ? "Thử mở rộng ngày, xóa bộ lọc hoặc chạy Insights sync."
              : "Kết nối owner Meta để bắt đầu báo cáo creative."}
          </p>
          <Link
            className="button button--primary"
            href={connected ? "/health" : "/connect"}
          >
            {connected ? "Mở sức khỏe dữ liệu" : "Kết nối Meta"}
          </Link>
        </section>
      )}

      {data.total > data.limit ? (
        <nav className="table-pagination" aria-label="Phân trang tracker">
          <Link
            className={`button button--secondary${
              currentPage <= 1 ? " button--disabled" : ""
            }`}
            aria-disabled={currentPage <= 1}
            href={trackerHref(filters, Math.max(1, currentPage - 1))}
          >
            Trang trước
          </Link>
          <span>
            Trang {currentPage} / {pageCount}
          </span>
          <Link
            className={`button button--secondary${
              currentPage >= pageCount ? " button--disabled" : ""
            }`}
            aria-disabled={currentPage >= pageCount}
            href={trackerHref(
              filters,
              Math.min(pageCount, currentPage + 1),
            )}
          >
            Trang sau
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
