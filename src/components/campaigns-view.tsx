import { FolderSearch, Search } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import type { CampaignInventoryPage } from "@/lib/db";

type AccountOption = {
  id: string;
  name: string;
};

type CampaignFilters = {
  query: string;
  account: string;
  status: string;
  page: number;
};

function pageHref(filters: CampaignFilters, page: number) {
  const query = new URLSearchParams();
  if (filters.query) query.set("q", filters.query);
  if (filters.account) query.set("account", filters.account);
  if (filters.status) query.set("status", filters.status);
  if (page > 1) query.set("page", String(page));
  const suffix = query.toString();
  return suffix ? `/campaigns?${suffix}` : "/campaigns";
}

export function CampaignsView({
  data,
  accounts,
  filters,
  connected,
}: {
  data: CampaignInventoryPage;
  accounts: AccountOption[];
  filters: CampaignFilters;
  connected: boolean;
}) {
  const currentPage = Math.floor(data.offset / data.limit) + 1;
  const pageCount = Math.max(1, Math.ceil(data.total / data.limit));
  const adSetCount = data.items.reduce(
    (total, item) => total + item.adSetCount,
    0,
  );
  const adCount = data.items.reduce(
    (total, item) => total + item.adCount,
    0,
  );

  return (
    <div className="campaigns-page">
      <PageHeader
        title="Campaigns & Ads"
        description="Toàn bộ campaign đã được Meta cấp quyền, cùng số Ad Set, Ads và creative vật lý liên kết."
      />

      <section className="campaign-summary" aria-label="Tóm tắt campaign">
        <div>
          <span>Campaigns phù hợp</span>
          <strong>{data.total.toLocaleString("vi-VN")}</strong>
        </div>
        <div>
          <span>Ad Sets trên trang</span>
          <strong>{adSetCount.toLocaleString("vi-VN")}</strong>
        </div>
        <div>
          <span>Ads trên trang</span>
          <strong>{adCount.toLocaleString("vi-VN")}</strong>
        </div>
      </section>

      <form className="campaign-filters" action="/campaigns" method="get">
        <label>
          <span className="sr-only">Tìm campaign</span>
          <Search aria-hidden="true" size={17} />
          <input
            name="q"
            defaultValue={filters.query}
            placeholder="Tìm tên campaign, ID hoặc tài khoản"
          />
        </label>
        <select
          name="account"
          defaultValue={filters.account}
          aria-label="Tài khoản quảng cáo"
        >
          <option value="">Tất cả Ad Accounts</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={filters.status}
          aria-label="Trạng thái campaign"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="PAUSED">PAUSED</option>
          <option value="ARCHIVED">ARCHIVED</option>
          <option value="DELETED">DELETED</option>
          <option value="WITH_ISSUES">WITH_ISSUES</option>
        </select>
        <button className="button button--primary" type="submit">
          Áp dụng
        </button>
        {(filters.query || filters.account || filters.status) && (
          <Link className="button button--secondary" href="/campaigns">
            Xóa lọc
          </Link>
        )}
      </form>

      {data.items.length ? (
        <section
          className="campaign-table"
          aria-label="Danh sách campaign"
        >
          <div className="campaign-table__head">
            <span>Campaign</span>
            <span>Ad Account</span>
            <span>Trạng thái</span>
            <span>Objective</span>
            <span>Ad Sets</span>
            <span>Ads</span>
            <span>Creative</span>
          </div>
          {data.items.map((campaign) => (
            <div
              className="campaign-table__row"
              key={campaign.campaignId}
            >
              <span>
                <strong>{campaign.name}</strong>
                <small>{campaign.metaCampaignId}</small>
              </span>
              <span>
                <strong>{campaign.adAccountName}</strong>
                <small>{campaign.metaAdAccountId}</small>
              </span>
              <span>
                <em
                  className={`inventory-status${
                    campaign.isActive
                      ? " inventory-status--active"
                      : ""
                  }`}
                >
                  {campaign.effectiveStatus ??
                    campaign.status ??
                    "UNKNOWN"}
                </em>
              </span>
              <span>{campaign.objective ?? "—"}</span>
              <span>{campaign.adSetCount.toLocaleString("vi-VN")}</span>
              <span>{campaign.adCount.toLocaleString("vi-VN")}</span>
              <span>
                {campaign.creativeAssetCount.toLocaleString("vi-VN")}
              </span>
            </div>
          ))}
        </section>
      ) : (
        <section className="standard-empty-state">
          <span aria-hidden="true">
            <FolderSearch size={23} />
          </span>
          <h2>
            {connected
              ? "Không tìm thấy campaign"
              : "Chưa kết nối Meta"}
          </h2>
          <p>
            {connected
              ? "Thử xóa bộ lọc hoặc chạy đồng bộ lại."
              : "Kết nối owner Meta để quét campaign và Ads."}
          </p>
          <Link
            className="button button--primary"
            href={connected ? "/assets" : "/connect"}
          >
            {connected ? "Mở tài sản Meta" : "Kết nối Meta"}
          </Link>
        </section>
      )}

      {data.total > data.limit ? (
        <nav className="table-pagination" aria-label="Phân trang campaign">
          <Link
            className={`button button--secondary${
              currentPage <= 1 ? " button--disabled" : ""
            }`}
            aria-disabled={currentPage <= 1}
            href={pageHref(filters, Math.max(1, currentPage - 1))}
          >
            Trang trước
          </Link>
          <span>
            Trang {currentPage.toLocaleString("vi-VN")} /{" "}
            {pageCount.toLocaleString("vi-VN")}
          </span>
          <Link
            className={`button button--secondary${
              currentPage >= pageCount ? " button--disabled" : ""
            }`}
            aria-disabled={currentPage >= pageCount}
            href={pageHref(
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
