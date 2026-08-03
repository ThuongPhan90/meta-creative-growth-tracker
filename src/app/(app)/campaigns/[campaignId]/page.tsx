import {
  ArrowLeft,
  Boxes,
  ChevronRight,
  FolderTree,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  campaignObjectiveLabel,
  campaignStatusPresentation,
} from "@/components/campaigns-v2";
import { CopyIdButton } from "@/components/ui/copy-id-button";
import { V3SurfacePage } from "@/components/ui-v3/surface-page";
import {
  buildApplicationResultMetrics,
  getCanonicalResultsForReport,
  getApplicationSnapshot,
  getDeliveryForReport,
  resolveApplicationReportContext,
} from "@/lib/app-data";
import { createTrackerRepository } from "@/lib/db";
import { getDemoCampaignDetail } from "@/lib/demo-campaigns";
import { canonicalDetailId } from "@/lib/detail-api";
import {
  buildContextHref,
  buildNavigationHref,
} from "@/lib/navigation";
import {
  formatCompactNumber,
  formatMoney,
  formatNumber,
  formatPercent,
} from "@/lib/presentation/formatters";
import { campaignInventoryBackHref } from "@/lib/presentation/campaign-navigation";
import { isUiV3 } from "@/lib/presentation/ui-version";
import type { ResultKpiCard } from "@/lib/reporting";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function queryHref(
  campaignId: string,
  query: Record<string, string | string[] | undefined>,
  tab: string,
) {
  return buildContextHref(`/campaigns/${campaignId}`, query, {
    selected: null,
    tab,
  });
}

function formatDynamicValue(
  card: ResultKpiCard,
  currency: string | null,
) {
  if (card.value === null) return "—";
  if (card.valueType === "currency") {
    return currency ? formatMoney(card.value, currency) : "—";
  }
  if (card.valueType === "percent") {
    return formatPercent(card.value);
  }
  if (card.valueType === "ratio") {
    return `${card.value.toLocaleString("vi-VN", {
      maximumFractionDigits: 2,
    })}×`;
  }
  return formatCompactNumber(card.value);
}

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<
    Record<string, string | string[] | undefined>
  >;
}) {
  const [snapshot, route, query] = await Promise.all([
    getApplicationSnapshot(),
    params,
    searchParams,
  ]);
  const campaignId = canonicalDetailId("campaign", route.campaignId);
  if (!campaignId) notFound();

  const context = resolveApplicationReportContext(snapshot, query);
  const connection = snapshot.connection;
  const detailPromise = snapshot.demoMode
    ? Promise.resolve(getDemoCampaignDetail(campaignId))
    : connection?.status === "connected" &&
        context.adAccountIds.length
      ? (async () => {
          const repository = await createTrackerRepository();
          const [inventories, hierarchy] = await Promise.all([
            Promise.all(
              context.adAccountIds.map((accountMetaId) =>
                repository.listCampaignInventory({
                  connectionId: connection.connectionId,
                  dateFrom: context.dateFrom,
                  dateTo: context.dateTo,
                  currency: context.currency || undefined,
                  attributionWindow: context.attributionSettingKey,
                  actionReportTime: context.actionReportTime,
                  syncVersion: context.syncVersion,
                  accountMetaId,
                  search: campaignId,
                  includeInactiveAccounts: true,
                  limit: 20,
                  offset: 0,
                }),
              ),
            ),
            repository.getCampaignHierarchy(
              connection.connectionId,
              campaignId,
            ),
          ]);
          const campaign = inventories
            .flatMap((inventory) => inventory.items)
            .find((item) => item.metaCampaignId === campaignId);

          return campaign && hierarchy
            ? { campaign, hierarchy }
            : null;
        })()
      : Promise.resolve(null);
  const [detail, delivery, canonicalResults] = await Promise.all([
    detailPromise,
    getDeliveryForReport({
      snapshot,
      dateFrom: context.dateFrom,
      dateTo: context.dateTo,
      accountMetaIds: context.adAccountIds,
      campaignMetaId: campaignId,
      currency: context.currency || null,
      attributionWindow: context.attributionSettingKey,
      actionReportTime: context.actionReportTime,
      syncVersion: context.syncVersion,
      reportContext: context,
    }),
    getCanonicalResultsForReport({
      snapshot,
      context,
      campaignMetaIds: [campaignId],
    }),
  ]);
  if (
    !detail ||
    !context.adAccountIds.includes(
      detail.campaign.metaAdAccountId,
    )
  ) {
    notFound();
  }
  const { campaign, hierarchy } = detail;

  const tab = ["summary", "structure", "creatives"].includes(
    first(query.tab) ?? "",
  )
    ? first(query.tab)!
    : "summary";
  const resultMetrics = buildApplicationResultMetrics({
    context,
    delivery,
    definitions: canonicalResults.definitions,
    periodReach: canonicalResults.periodReach,
    ...(canonicalResults.state === "demo_legacy_bridge"
      ? {}
      : { canonicalResults: canonicalResults.values }),
  });
  const currency =
    resultMetrics.metadata.currencyMode === "single"
      ? context.currency || campaign.performance[0]?.currency || null
      : null;
  const presentation = campaignStatusPresentation(campaign);
  const creativeIds = [
    ...new Set(
      hierarchy.adSets.flatMap((adSet) =>
        adSet.ads.flatMap((ad) => ad.creativeFamilyIds),
      ),
    ),
  ];
  const backHref = campaignInventoryBackHref(query);

  const content = (
    <div className="v2-page">
      <Link
        className="v2-back-link"
        href={backHref}
      >
        <ArrowLeft aria-hidden="true" size={17} />
        Quay lại Chiến dịch
      </Link>
      <header className="v2-page-header">
        <div>
          <span className="v2-eyebrow">Campaign</span>
          <h1>{campaign.name}</h1>
          <div className="v2-id-line">
            <code>{campaign.metaCampaignId}</code>
            <CopyIdButton value={campaign.metaCampaignId} />
          </div>
        </div>
        <div className="v2-chip-row">
          <span
            className={`inventory-status inventory-status--${presentation.tone}`}
          >
            {presentation.label}
          </span>
          <span className="v2-chip v2-chip--success">Chỉ đọc</span>
        </div>
      </header>
      <section className="v2-kpi-grid">
        {resultMetrics.kpiCards.map((card) => (
          <article className="v2-kpi" title={card.formula} key={card.key}>
            <span className="v2-kpi__label">{card.label}</span>
            <strong>{formatDynamicValue(card, currency)}</strong>
            <small>
              {card.unavailableReason === "split_currency"
                ? "Chọn một tiền tệ để so sánh"
                : card.attribution === "meta_attributed"
                  ? "Meta-attributed · Chỉ đọc"
                  : card.formula}
            </small>
          </article>
        ))}
        <article className="v2-kpi">
          <span className="v2-kpi__label">Creative Family</span>
          <strong>{formatNumber(creativeIds.length)}</strong>
          <small>{campaign.adCount} Ads trong cấu trúc</small>
        </article>
      </section>
      <nav className="v2-tabs" aria-label="Chi tiết Campaign">
        {[
          { value: "summary", label: "Tổng quan" },
          { value: "structure", label: "Cấu trúc Ads" },
          { value: "creatives", label: "Creative đang dùng" },
        ].map((item) => (
          <Link
            className="v2-tab"
            href={queryHref(campaign.metaCampaignId, query, item.value)}
            aria-current={tab === item.value ? "page" : undefined}
            key={item.value}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {tab === "summary" ? (
        <section className="v2-panel v2-campaign-summary-detail">
          <div className="v2-panel__header">
            <div>
              <h2>Thông tin Campaign</h2>
              <p>Canonical IDs và quan hệ từ snapshot Meta mới nhất.</p>
            </div>
            <FolderTree aria-hidden="true" size={18} />
          </div>
          <dl className="v2-detail-list">
            <div>
              <dt>Mục tiêu</dt>
              <dd>{campaignObjectiveLabel(campaign.objective)}</dd>
            </div>
            <div>
              <dt>Tài khoản quảng cáo</dt>
              <dd>
                <Link
                  className="v2-link"
                  href={buildNavigationHref(
                    `/sources?tab=ad-accounts&selected=${encodeURIComponent(
                      campaign.metaAdAccountId,
                    )}`,
                    query,
                  )}
                >
                  {campaign.adAccountName}
                </Link>
              </dd>
            </div>
            <div>
              <dt>Ad Sets</dt>
              <dd>{formatNumber(hierarchy.adSets.length)}</dd>
            </div>
            <div>
              <dt>Ads</dt>
              <dd>
                {formatNumber(
                  hierarchy.adSets.reduce(
                    (sum, adSet) => sum + adSet.ads.length,
                    0,
                  ),
                )}
              </dd>
            </div>
            <div>
              <dt>Creative Family</dt>
              <dd>{formatNumber(creativeIds.length)}</dd>
            </div>
            <div>
              <dt>Lần thấy gần nhất</dt>
              <dd>{campaign.lastSeenAt}</dd>
            </div>
          </dl>
        </section>
      ) : null}
      {tab === "structure" ? (
        <section className="v2-panel">
          <div className="v2-panel__header">
            <div>
              <h2>Ad Set → Ads → Creative Family</h2>
              <p>Mỗi nút dùng canonical ID, không route bằng tên.</p>
            </div>
            <FolderTree aria-hidden="true" size={18} />
          </div>
          <div className="v2-campaign-tree">
            {hierarchy.adSets.map((adSet) => (
              <details key={adSet.adSetId} open>
                <summary>
                  <span className="v2-chip">Ad Set</span>
                  <strong>{adSet.name}</strong>
                  <small>{adSet.metaAdSetId}</small>
                  <span>{adSet.ads.length} Ads</span>
                </summary>
                <div>
                  {adSet.ads.map((ad) => (
                    <article key={ad.adId}>
                      <ChevronRight aria-hidden="true" size={16} />
                      <div>
                        <strong>{ad.name}</strong>
                        <small>{ad.metaAdId}</small>
                      </div>
                      <span className="v2-chip">
                        {ad.effectiveStatus === "ACTIVE"
                          ? "Đang hoạt động"
                          : ad.effectiveStatus?.includes("PAUSED")
                            ? "Tạm dừng"
                            : "Trạng thái khác"}
                      </span>
                      <div className="v2-chip-row">
                        {ad.creativeFamilyIds.map((id) => (
                          <Link
                            className="v2-chip v2-chip--accent"
                            href={buildNavigationHref(
                              `/creatives/${encodeURIComponent(id)}?tab=usage`,
                              query,
                            )}
                            key={id}
                          >
                            {id}
                          </Link>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </section>
      ) : null}
      {tab === "creatives" ? (
        <section className="v2-panel">
          <div className="v2-panel__header">
            <div>
              <h2>Creative Family đang sử dụng</h2>
              <p>Click để mở trang Creative đầy đủ.</p>
            </div>
            <Boxes aria-hidden="true" size={18} />
          </div>
          {creativeIds.length ? (
            <div className="v2-campaign-creative-list">
              {creativeIds.map((id) => (
                <Link
                  href={buildNavigationHref(
                    `/creatives/${encodeURIComponent(id)}?tab=usage`,
                    query,
                  )}
                  key={id}
                >
                  <span className="v2-chip v2-chip--accent">
                    Creative Family
                  </span>
                  <strong>{id}</strong>
                  <ChevronRight aria-hidden="true" size={17} />
                </Link>
              ))}
            </div>
          ) : (
            <div className="v2-compact-empty">
              <Boxes aria-hidden="true" size={22} />
              <p>
                Không có Creative Family được phân bổ an toàn trong snapshot
                hiện tại.
              </p>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );

  return isUiV3() ? (
    <V3SurfacePage
      surface="campaigns"
      eyebrow="Campaign"
      title={campaign.name}
      description="Chi tiết Campaign và cấu trúc phân phối từ snapshot Meta gần nhất trong Reporting Context hiện tại."
      backHref={backHref}
      backLabel="Quay lại Phân phối"
      meta={
        <>
          <code>{campaign.metaCampaignId}</code>
          <CopyIdButton value={campaign.metaCampaignId} />
        </>
      }
      actions={
        <span
          className={`inventory-status inventory-status--${presentation.tone}`}
        >
          {presentation.label}
        </span>
      }
    >
      {content}
    </V3SurfacePage>
  ) : (
    content
  );
}
