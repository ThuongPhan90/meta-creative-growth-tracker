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
  primaryCampaignPerformance,
} from "@/components/campaigns-v2";
import { CopyIdButton } from "@/components/ui/copy-id-button";
import { getApplicationSnapshot } from "@/lib/app-data";
import { createTrackerRepository } from "@/lib/db";
import { getDemoCampaignDetail } from "@/lib/demo-campaigns";
import { canonicalDetailId } from "@/lib/detail-api";
import { buildNavigationHref } from "@/lib/navigation";
import {
  formatMoney,
  formatNumber,
} from "@/lib/presentation/formatters";
import { campaignInventoryBackHref } from "@/lib/presentation/campaign-navigation";
import { resolveReportContext } from "@/lib/reporting";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function queryHref(
  campaignId: string,
  query: Record<string, string | string[] | undefined>,
  tab: string,
) {
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(query)) {
    const value = first(raw);
    if (value && key !== "selected") params.set(key, value);
  }
  params.set("tab", tab);
  return `/campaigns/${campaignId}?${params.toString()}`;
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

  const context = resolveReportContext({
    query: {
      from: first(query.from),
      to: first(query.to),
      account: first(query.account),
      currency: first(query.currency),
      compare: first(query.compare),
    },
    timeZone: snapshot.settings.timezone,
    lookbackDays: snapshot.settings.lookbackDays,
    reportingCurrency: snapshot.settings.currency,
    compareDefault: snapshot.settings.compareDefault,
  });
  const connection = snapshot.connection;
  const detail = snapshot.demoMode
    ? getDemoCampaignDetail(campaignId)
    : connection?.status === "connected"
      ? await (async () => {
          const repository = await createTrackerRepository();
          const [inventory, hierarchy] = await Promise.all([
            repository.listCampaignInventory({
              connectionId: connection.connectionId,
              dateFrom: context.dateFrom,
              dateTo: context.dateTo,
              currency: context.currency || undefined,
              search: campaignId,
              includeInactiveAccounts: true,
              limit: 20,
              offset: 0,
            }),
            repository.getCampaignHierarchy(
              connection.connectionId,
              campaignId,
            ),
          ]);
          const campaign = inventory.items.find(
            (item) => item.metaCampaignId === campaignId,
          );

          return campaign && hierarchy ? { campaign, hierarchy } : null;
        })()
      : null;
  if (!detail) notFound();
  const { campaign, hierarchy } = detail;

  const tab = ["summary", "structure", "creatives"].includes(
    first(query.tab) ?? "",
  )
    ? first(query.tab)!
    : "summary";
  const performance = primaryCampaignPerformance(campaign);
  const presentation = campaignStatusPresentation(campaign);
  const creativeIds = [
    ...new Set(
      hierarchy.adSets.flatMap((adSet) =>
        adSet.ads.flatMap((ad) => ad.creativeFamilyIds),
      ),
    ),
  ];
  const backHref = campaignInventoryBackHref(query);

  return (
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
        <article className="v2-kpi">
          <span className="v2-kpi__label">Spend</span>
          <strong>
            {performance
              ? formatMoney(performance.spend, performance.currency)
              : "—"}
          </strong>
          <small>{context.dateFrom} – {context.dateTo}</small>
        </article>
        <article className="v2-kpi">
          <span className="v2-kpi__label">Install</span>
          <strong>{formatNumber(performance?.installs ?? 0)}</strong>
          <small>Meta-attributed</small>
        </article>
        <article className="v2-kpi">
          <span className="v2-kpi__label">Registration</span>
          <strong>{formatNumber(performance?.registrations ?? 0)}</strong>
          <small>Meta-attributed</small>
        </article>
        <article className="v2-kpi">
          <span className="v2-kpi__label">CPI</span>
          <strong>
            {performance
              ? formatMoney(performance.cpi, performance.currency)
              : "—"}
          </strong>
          <small>Spend / Install</small>
        </article>
        <article className="v2-kpi">
          <span className="v2-kpi__label">CPA Registration</span>
          <strong>
            {performance
              ? formatMoney(
                  performance.costPerRegistration,
                  performance.currency,
                )
              : "—"}
          </strong>
          <small>Spend / Registration</small>
        </article>
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
}
