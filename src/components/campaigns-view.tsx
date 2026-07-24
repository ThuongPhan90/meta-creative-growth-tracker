import { FolderSearch, Search } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import type { CampaignInventoryItem, CampaignInventoryPage } from "@/lib/db";

type AccountOption = {
  id: string;
  name: string;
  active: boolean;
};

type CampaignFilters = {
  query: string;
  account: string;
  status: string;
  showInactive: boolean;
  page: number;
};

type CampaignStatusTone =
  | "active"
  | "paused"
  | "issue"
  | "inactive"
  | "neutral";

export function getCampaignStatusPresentation(
  campaign: Pick<
    CampaignInventoryItem,
    "effectiveStatus" | "status" | "isActive"
  >,
): {
  inventoryNote: string | null;
  label: string;
  raw: string;
  tone: CampaignStatusTone;
} {
  const raw = (campaign.effectiveStatus ?? campaign.status ?? "UNKNOWN")
    .trim()
    .toUpperCase();

  let presentation: {
    label: string;
    tone: CampaignStatusTone;
  };
  if (raw === "ACTIVE") {
    presentation = { label: "Đang hoạt động", tone: "active" };
  } else if (
    raw === "PAUSED" ||
    raw === "CAMPAIGN_PAUSED" ||
    raw === "ADSET_PAUSED"
  ) {
    presentation = { label: "Tạm dừng", tone: "paused" };
  } else if (
    raw === "WITH_ISSUES" ||
    raw === "DISAPPROVED" ||
    raw === "PENDING_REVIEW"
  ) {
    presentation = { label: "Cần kiểm tra", tone: "issue" };
  } else if (raw === "ARCHIVED") {
    presentation = { label: "Đã lưu trữ", tone: "inactive" };
  } else if (raw === "DELETED") {
    presentation = { label: "Đã xóa", tone: "inactive" };
  } else {
    presentation = {
      label: raw === "UNKNOWN" ? "Chưa xác định" : raw.replaceAll("_", " "),
      tone: "neutral",
    };
  }

  if (!campaign.isActive) {
    return {
      inventoryNote: "Không còn trong dữ liệu mới nhất",
      label: `Meta gần nhất: ${presentation.label}`,
      raw,
      tone: "inactive",
    };
  }

  return {
    inventoryNote: null,
    label: presentation.label,
    raw,
    tone: presentation.tone,
  };
}

function pageHref(filters: CampaignFilters, page: number) {
  const query = new URLSearchParams();
  if (filters.query) query.set("q", filters.query);
  if (filters.account) query.set("account", filters.account);
  if (filters.status) query.set("status", filters.status);
  if (filters.showInactive) query.set("showInactive", "1");
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
              {account.active ? "" : " · Không hoạt động"}
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
          filters.status ||
          filters.showInactive
        ) && (
          <Link className="button button--secondary" href="/campaigns">
            Xóa lọc
          </Link>
        )}
      </form>

      {data.items.length ? (
        <section
          className="campaign-table"
          aria-label="Bảng danh sách campaign, có thể cuộn ngang"
          role="table"
          tabIndex={0}
        >
          <div className="campaign-table__head" role="row">
            <span role="columnheader">Campaign</span>
            <span role="columnheader">Ad Account</span>
            <span role="columnheader">Trạng thái</span>
            <span role="columnheader">Objective</span>
            <span role="columnheader">Ad Sets</span>
            <span role="columnheader">Ads</span>
            <span role="columnheader">Creative</span>
          </div>
          {data.items.map((campaign) => {
            const status = getCampaignStatusPresentation(campaign);
            return (
              <div
                className="campaign-table__row"
                key={campaign.campaignId}
                role="row"
              >
                <span role="cell">
                  <strong>{campaign.name}</strong>
                  <small>{campaign.metaCampaignId}</small>
                </span>
                <span role="cell">
                  <strong>{campaign.adAccountName}</strong>
                  <small>{campaign.metaAdAccountId}</small>
                </span>
                <span role="cell">
                  <em
                    className={`inventory-status inventory-status--${status.tone}`}
                    title={`Trạng thái Meta gần nhất: ${status.raw}`}
                  >
                    {status.label}
                  </em>
                  {status.inventoryNote ? (
                    <small>{status.inventoryNote}</small>
                  ) : null}
                </span>
                <span role="cell">{campaign.objective ?? "—"}</span>
                <span role="cell">
                  {campaign.adSetCount.toLocaleString("vi-VN")}
                </span>
                <span role="cell">
                  {campaign.adCount.toLocaleString("vi-VN")}
                </span>
                <span role="cell">
                  {campaign.creativeAssetCount.toLocaleString("vi-VN")}
                </span>
              </div>
            );
          })}
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
          {currentPage <= 1 ? (
            <span
              className="button button--secondary button--disabled"
              aria-disabled="true"
            >
              Trang trước
            </span>
          ) : (
            <Link
              className="button button--secondary"
              href={pageHref(filters, currentPage - 1)}
            >
              Trang trước
            </Link>
          )}
          <span>
            Trang {currentPage.toLocaleString("vi-VN")} /{" "}
            {pageCount.toLocaleString("vi-VN")}
          </span>
          {currentPage >= pageCount ? (
            <span
              className="button button--secondary button--disabled"
              aria-disabled="true"
            >
              Trang sau
            </span>
          ) : (
            <Link
              className="button button--secondary"
              href={pageHref(filters, currentPage + 1)}
            >
              Trang sau
            </Link>
          )}
        </nav>
      ) : null}
    </div>
  );
}
