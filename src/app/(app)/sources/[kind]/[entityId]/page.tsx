import { ArrowLeft, Database, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CopyIdButton } from "@/components/ui/copy-id-button";
import { getApplicationSnapshot } from "@/lib/app-data";
import type { MetaAssetKind, MetaAssetRow } from "@/types/view-models";

export const dynamic = "force-dynamic";

const KIND_BY_SLUG: Record<string, MetaAssetKind> = {
  businesses: "Business",
  "ad-accounts": "Ad Account",
  pages: "Page",
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function backHref(
  tab: string,
  query: Record<string, string | string[] | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(query)) {
    const value = first(raw);
    if (value && key !== "selected") {
      params.set(key, value.slice(0, 500));
    }
  }
  params.set("tab", tab);
  return `/sources?${params.toString()}`;
}

function statusLabel(asset: MetaAssetRow) {
  const status = asset.status.trim().toUpperCase();
  if (asset.isCurrent === false) {
    return "Không còn trong lần đồng bộ mới nhất";
  }
  if (status === "ACTIVE") return "Đang hoạt động";
  if (status === "INACTIVE") return "Không hoạt động";
  return "Cần kiểm tra trên Meta";
}

function seenLabel(value?: string | null) {
  if (!value) return "Chưa có";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(date);
}

export default async function SourceEntityPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string; entityId: string }>;
  searchParams: Promise<
    Record<string, string | string[] | undefined>
  >;
}) {
  const [{ kind, entityId }, query, snapshot] = await Promise.all([
    params,
    searchParams,
    getApplicationSnapshot(),
  ]);
  const expectedKind = KIND_BY_SLUG[kind];
  if (!expectedKind || entityId.length > 200) notFound();
  const asset = snapshot.assets.find(
    (item) => item.kind === expectedKind && item.id === entityId,
  );
  if (!asset) notFound();

  return (
    <div className="v2-page">
      <Link className="v2-back-link" href={backHref(kind, query)}>
        <ArrowLeft aria-hidden="true" size={16} />
        Quay lại Nguồn dữ liệu
      </Link>
      <header className="v2-page-header">
        <div>
          <span className="v2-chip v2-chip--accent">{asset.kind}</span>
          <h1>{asset.name}</h1>
          <p>
            Chi tiết canonical từ lần đồng bộ Meta gần nhất. Màn hình chỉ đọc.
          </p>
        </div>
        <span className="v2-chip v2-chip--success">
          <ShieldCheck aria-hidden="true" size={14} />
          Chỉ đọc
        </span>
      </header>
      <section className="v2-panel">
        <div className="v2-panel__header">
          <div>
            <h2>Thông tin nguồn</h2>
            <p>ID này được dùng cho deep-link và đối chiếu dữ liệu.</p>
          </div>
          <Database aria-hidden="true" size={18} />
        </div>
        <div className="v2-drawer__body">
          <div className="v2-id-line">
            <code>{asset.id}</code>
            <CopyIdButton value={asset.id} />
          </div>
          <dl className="v2-detail-list">
            <div>
              <dt>Trạng thái</dt>
              <dd>{statusLabel(asset)}</dd>
            </div>
            <div>
              <dt>Business</dt>
              <dd>{asset.parentName ?? "—"}</dd>
            </div>
            <div>
              <dt>Danh mục Page</dt>
              <dd>{asset.category ?? "—"}</dd>
            </div>
            <div>
              <dt>Trạng thái xác minh</dt>
              <dd>{asset.verificationStatus ?? "—"}</dd>
            </div>
            <div>
              <dt>Tiền tệ</dt>
              <dd>{asset.currency ?? "—"}</dd>
            </div>
            <div>
              <dt>Múi giờ</dt>
              <dd>{asset.timezone ?? "—"}</dd>
            </div>
            <div>
              <dt>Lần thấy gần nhất</dt>
              <dd>{seenLabel(asset.lastSeenAt)}</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}
