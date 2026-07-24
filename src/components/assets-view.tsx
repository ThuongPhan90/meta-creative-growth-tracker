"use client";

import {
  Building2,
  Eye,
  EyeOff,
  Flag,
  Megaphone,
  Smartphone,
  SearchX,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { SyncButton } from "@/components/sync-button";
import type { MetaAssetRow } from "@/types/view-models";

const iconMap = {
  Business: Building2,
  "Ad Account": Megaphone,
  Page: Flag,
  App: Smartphone,
};

type AssetStatusPresentation = {
  label: string;
  tone: "active" | "inactive" | "neutral";
};

const inactiveAdAccountStatusLabels: Readonly<Record<string, string>> = {
  CLOSED: "Không hoạt động · Đã đóng",
  DISABLED: "Không hoạt động · Đã vô hiệu hóa",
  UNSETTLED: "Không hoạt động · Chưa thanh toán",
  PENDING_RISK_REVIEW: "Không hoạt động · Chờ đánh giá rủi ro",
  PENDING_SETTLEMENT: "Không hoạt động · Chờ thanh toán",
  PENDING_CLOSURE: "Không hoạt động · Chờ đóng",
  IN_GRACE_PERIOD: "Không hoạt động · Trong thời gian gia hạn",
};

export function isInactiveAdAccount(asset: MetaAssetRow) {
  return (
    asset.kind === "Ad Account" &&
    asset.status.trim().toUpperCase() !== "ACTIVE"
  );
}

export function filterMetaAssets(
  assets: readonly MetaAssetRow[],
  showInactiveAdAccounts: boolean,
) {
  const visible: MetaAssetRow[] = [];
  let activeAdAccountCount = 0;
  let inactiveAdAccountCount = 0;

  for (const asset of assets) {
    if (asset.kind === "Ad Account") {
      if (isInactiveAdAccount(asset)) {
        inactiveAdAccountCount += 1;
        if (!showInactiveAdAccounts) continue;
      } else {
        activeAdAccountCount += 1;
      }
    }
    visible.push(asset);
  }

  return {
    visible,
    activeAdAccountCount,
    inactiveAdAccountCount,
  };
}

export function getAssetStatusPresentation(
  asset: MetaAssetRow,
): AssetStatusPresentation {
  const rawStatus = asset.status.trim();
  const normalizedStatus = rawStatus.toUpperCase();

  if (normalizedStatus === "ACTIVE") {
    return { label: "Hoạt động", tone: "active" };
  }
  if (normalizedStatus === "INACTIVE") {
    return { label: "Không hoạt động", tone: "inactive" };
  }
  if (asset.kind === "Ad Account") {
    const knownInactiveLabel =
      inactiveAdAccountStatusLabels[normalizedStatus];
    if (knownInactiveLabel) {
      return { label: knownInactiveLabel, tone: "inactive" };
    }
    if (normalizedStatus.startsWith("PENDING")) {
      return {
        label: "Không hoạt động · Đang chờ Meta xử lý",
        tone: "inactive",
      };
    }
    if (normalizedStatus.startsWith("STATUS ")) {
      return {
        label: `Không hoạt động · Meta ${rawStatus.slice(7).trim() || "không rõ"}`,
        tone: "inactive",
      };
    }
    return {
      label: rawStatus
        ? `Không hoạt động · Meta ${rawStatus}`
        : "Không hoạt động · Chưa xác định",
      tone: "inactive",
    };
  }

  return {
    label: rawStatus || "Chưa xác định",
    tone: "neutral",
  };
}

export function AssetsView({
  assets,
  connected,
  autoSync = false,
}: {
  assets: MetaAssetRow[];
  connected: boolean;
  autoSync?: boolean;
}) {
  const [showInactiveAdAccounts, setShowInactiveAdAccounts] = useState(false);
  const {
    visible,
    activeAdAccountCount,
    inactiveAdAccountCount,
  } = filterMetaAssets(assets, showInactiveAdAccounts);
  const hiddenAdAccountCount = showInactiveAdAccounts
    ? 0
    : inactiveAdAccountCount;

  return (
    <div className="assets-page">
      <PageHeader
        title="Tài sản Meta"
        description="Phạm vi BM, tài khoản quảng cáo và Trang mà chủ sở hữu được cấp quyền."
        actions={
          connected ? (
            <SyncButton
              autoStart={autoSync}
              kind={autoSync ? "full" : "incremental"}
            />
          ) : null
        }
      />

      {assets.length ? (
        <>
          <section className="assets-controls" aria-label="Hiển thị tài sản Meta">
            <div className="assets-controls__summary">
              <strong>{visible.length} tài sản đang hiển thị</strong>
              <span>
                {activeAdAccountCount} tài khoản quảng cáo hoạt động
                {inactiveAdAccountCount > 0
                  ? ` · ${inactiveAdAccountCount} không hoạt động`
                  : ""}
              </span>
            </div>
            {inactiveAdAccountCount > 0 ? (
              <button
                aria-controls="meta-assets-results"
                aria-pressed={showInactiveAdAccounts}
                className="button button--secondary assets-visibility-toggle"
                onClick={() =>
                  setShowInactiveAdAccounts((current) => !current)
                }
                type="button"
              >
                {showInactiveAdAccounts ? (
                  <EyeOff aria-hidden="true" size={17} />
                ) : (
                  <Eye aria-hidden="true" size={17} />
                )}
                {showInactiveAdAccounts
                  ? `Ẩn ${inactiveAdAccountCount} tài khoản không hoạt động`
                  : `Hiện ${inactiveAdAccountCount} tài khoản không hoạt động`}
              </button>
            ) : activeAdAccountCount > 0 ? (
              <span className="assets-controls__all-active">
                Tất cả tài khoản quảng cáo đang hoạt động
              </span>
            ) : (
              <span className="assets-controls__no-accounts">
                Chưa phát hiện tài khoản quảng cáo
              </span>
            )}
            <span className="sr-only" aria-live="polite">
              {hiddenAdAccountCount > 0
                ? `Đang ẩn ${hiddenAdAccountCount} tài khoản quảng cáo không hoạt động.`
                : "Đang hiển thị tất cả tài khoản quảng cáo."}
            </span>
          </section>

          <div id="meta-assets-results">
            {visible.length ? (
              <section
                aria-label="Tài sản Meta"
                className="assets-table"
                role="table"
              >
                <div className="assets-table__head" role="row">
                  <span role="columnheader">Tài sản</span>
                  <span role="columnheader">Loại</span>
                  <span role="columnheader">Thuộc BM</span>
                  <span role="columnheader">Tiền tệ</span>
                  <span role="columnheader">Timezone</span>
                  <span role="columnheader">Trạng thái</span>
                </div>
                <div className="assets-table__body" role="rowgroup">
                  {visible.map((asset) => {
                    const Icon = iconMap[asset.kind];
                    const status = getAssetStatusPresentation(asset);
                    return (
                      <div
                        className="assets-table__row"
                        key={`${asset.kind}-${asset.id}`}
                        role="row"
                      >
                        <span data-label="Tài sản" role="cell">
                          <i aria-hidden="true">
                            <Icon size={16} />
                          </i>
                          <strong>{asset.name}</strong>
                          <small>{asset.id}</small>
                        </span>
                        <span data-label="Loại" role="cell">
                          {asset.kind}
                        </span>
                        <span data-label="Thuộc BM" role="cell">
                          {asset.parentName ?? "—"}
                        </span>
                        <span data-label="Tiền tệ" role="cell">
                          {asset.currency ?? "—"}
                        </span>
                        <span data-label="Timezone" role="cell">
                          {asset.timezone ?? "—"}
                        </span>
                        <span data-label="Trạng thái" role="cell">
                          <em
                            className={`assets-status assets-status--${status.tone}`}
                            title={`Trạng thái Meta gốc: ${asset.status || "không có"}`}
                          >
                            {status.label}
                          </em>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : (
              <section className="standard-empty-state">
                <span aria-hidden="true">
                  <SearchX size={23} />
                </span>
                <h2>Không có tài sản đang hoạt động</h2>
                <p>
                  {inactiveAdAccountCount} tài khoản quảng cáo không hoạt động đang
                  được ẩn. Dùng nút phía trên để xem lại.
                </p>
              </section>
            )}
          </div>
        </>
      ) : (
        <section className="standard-empty-state">
          <span aria-hidden="true">
            <SearchX size={23} />
          </span>
          <h2>{connected ? "Chưa tìm thấy tài sản" : "Chưa kết nối Meta"}</h2>
          <p>
            {connected
              ? "Chạy đồng bộ lại hoặc kiểm tra quyền truy cập trên Meta Business."
              : "Kết nối tài khoản chủ sở hữu để bắt đầu quét tài sản."}
          </p>
          <Link className="button button--primary" href="/connect">
            {connected ? "Kiểm tra kết nối" : "Kết nối Meta"}
          </Link>
        </section>
      )}
    </div>
  );
}
