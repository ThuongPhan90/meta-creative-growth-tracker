import {
  Building2,
  Flag,
  Megaphone,
  Smartphone,
  SearchX,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { SyncButton } from "@/components/sync-button";
import type { MetaAssetRow } from "@/types/view-models";

const iconMap = {
  Business: Building2,
  "Ad Account": Megaphone,
  Page: Flag,
  App: Smartphone,
};

export function AssetsView({
  assets,
  connected,
  autoSync = false,
}: {
  assets: MetaAssetRow[];
  connected: boolean;
  autoSync?: boolean;
}) {
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
        <section className="assets-table" aria-label="Tài sản Meta">
          <div className="assets-table__head">
            <span>Tài sản</span>
            <span>Loại</span>
            <span>Thuộc BM</span>
            <span>Tiền tệ</span>
            <span>Timezone</span>
            <span>Trạng thái</span>
          </div>
          {assets.map((asset) => {
            const Icon = iconMap[asset.kind];
            return (
              <div className="assets-table__row" key={`${asset.kind}-${asset.id}`}>
                <span>
                  <i aria-hidden="true">
                    <Icon size={16} />
                  </i>
                  <strong>{asset.name}</strong>
                  <small>{asset.id}</small>
                </span>
                <span>{asset.kind}</span>
                <span>{asset.parentName ?? "—"}</span>
                <span>{asset.currency ?? "—"}</span>
                <span>{asset.timezone ?? "—"}</span>
                <span>{asset.status}</span>
              </div>
            );
          })}
        </section>
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
