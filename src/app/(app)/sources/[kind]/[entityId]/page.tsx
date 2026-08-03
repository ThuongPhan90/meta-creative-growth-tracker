import { ArrowLeft, Database, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CopyIdButton } from "@/components/ui/copy-id-button";
import { V3SurfacePage } from "@/components/ui-v3/surface-page";
import { getApplicationAssetsSnapshot } from "@/lib/app-data";
import {
  sourceAccountCampaignsHref,
  sourceBusinessAccountsHref,
} from "@/lib/presentation/source-navigation";
import {
  formatMetaVerificationStatus,
  sourceAssetStatus,
} from "@/lib/presentation/source-status";
import { isUiV3 } from "@/lib/presentation/ui-version";
import type { MetaAssetKind } from "@/types/view-models";

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
    getApplicationAssetsSnapshot(),
  ]);
  const expectedKind = KIND_BY_SLUG[kind];
  if (!expectedKind || entityId.length > 200) notFound();
  const asset = snapshot.assets.find(
    (item) => item.kind === expectedKind && item.id === entityId,
  );
  if (!asset) notFound();
  const sourceBackHref = backHref(kind, query);

  const content = (
    <div className="v2-page">
      <Link className="v2-back-link" href={sourceBackHref}>
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
          {asset.kind === "Business" ? (
            <Link
              className="button button--primary"
              href={sourceBusinessAccountsHref(asset.id, query)}
            >
              Xem Ad Account thuộc Business
            </Link>
          ) : asset.kind === "Ad Account" ? (
            <Link
              className="button button--primary"
              href={sourceAccountCampaignsHref(asset.id, query)}
            >
              Xem Campaign của tài khoản
            </Link>
          ) : null}
          <dl className="v2-detail-list">
            <div>
              <dt>Trạng thái</dt>
              <dd>{sourceAssetStatus(asset).label}</dd>
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
              <dd>{formatMetaVerificationStatus(asset.verificationStatus)}</dd>
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

  return isUiV3() ? (
    <V3SurfacePage
      surface="sources"
      eyebrow={asset.kind}
      title={asset.name}
      description="Chi tiết tài sản canonical từ lần đồng bộ Meta gần nhất; màn hình chỉ đọc."
      backHref={sourceBackHref}
      backLabel="Quay lại Nguồn dữ liệu"
      meta={
        <>
          <code>{asset.id}</code>
          <CopyIdButton value={asset.id} />
        </>
      }
    >
      {content}
    </V3SurfacePage>
  ) : (
    content
  );
}
