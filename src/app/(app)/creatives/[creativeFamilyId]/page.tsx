import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  CreativeDrawerContent,
  creativeDetailBackHref,
  creativeDetailBackLabel,
  groupCreativeFamiliesForView,
} from "@/components/creative-performance-v2";
import { CopyIdButton } from "@/components/ui/copy-id-button";
import {
  buildApplicationResultMetrics,
  getApplicationSnapshot,
  getCanonicalResultsForReport,
  getCreativeFamilyRowsForReport,
  getDeliveryForReport,
  resolveApplicationReportContext,
} from "@/lib/app-data";
import { canonicalDetailId } from "@/lib/detail-api/contracts";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CreativeFamilyPage({
  params,
  searchParams,
}: {
  params: Promise<{ creativeFamilyId: string }>;
  searchParams: Promise<
    Record<string, string | string[] | undefined>
  >;
}) {
  const [snapshot, route, query] = await Promise.all([
    getApplicationSnapshot(),
    params,
    searchParams,
  ]);
  const creativeFamilyId = canonicalDetailId(
    "creative-family",
    route.creativeFamilyId,
  );
  if (!creativeFamilyId) notFound();
  const context = resolveApplicationReportContext(snapshot, query);
  const campaignMetaId = first(query.campaign);
  const [rows, canonicalResults, delivery] = await Promise.all([
    getCreativeFamilyRowsForReport({
      snapshot,
      creativeFamilyId,
      dateFrom: context.dateFrom,
      dateTo: context.dateTo,
      currency: context.currency || undefined,
      accountMetaIds: context.adAccountIds,
      campaignMetaId,
      attributionWindow: context.attributionSettingKey,
      actionReportTime: context.actionReportTime,
      syncVersion: context.syncVersion,
      reportContext: context,
    }),
    getCanonicalResultsForReport({
      snapshot,
      context,
      ...(campaignMetaId
        ? { campaignMetaIds: [campaignMetaId] }
        : {}),
    }),
    getDeliveryForReport({
      snapshot,
      dateFrom: context.dateFrom,
      dateTo: context.dateTo,
      accountMetaIds: context.adAccountIds,
      campaignMetaId,
      currency: context.currency || null,
      attributionWindow: context.attributionSettingKey,
      actionReportTime: context.actionReportTime,
      syncVersion: context.syncVersion,
      reportContext: context,
    }),
  ]);
  const family = groupCreativeFamiliesForView(rows ?? []).find(
    (item) => item.id === creativeFamilyId,
  );
  if (!family) notFound();

  const backHref = creativeDetailBackHref(query);
  const resultMetrics = buildApplicationResultMetrics({
    context,
    delivery,
    definitions: canonicalResults.definitions,
    periodReach: canonicalResults.periodReach,
    ...(canonicalResults.state === "demo_legacy_bridge"
      ? {}
      : { canonicalResults: canonicalResults.values }),
  });

  return (
    <div className="v2-page v2-full-detail">
      <Link className="v2-back-link" href={backHref}>
        <ArrowLeft aria-hidden="true" size={17} />
        {creativeDetailBackLabel(query)}
      </Link>
      <header className="v2-page-header">
        <div>
          <span className="v2-eyebrow">Creative Family</span>
          <h1>{family.name}</h1>
          <div className="v2-id-line">
            <code>{family.id}</code>
            <CopyIdButton value={family.id} />
          </div>
        </div>
        <span className="v2-chip v2-chip--success">Chỉ đọc</span>
      </header>
      <section className="v2-panel">
        <CreativeDrawerContent
          family={family}
          query={query}
          resultMetrics={resultMetrics}
          fullPage
        />
      </section>
    </div>
  );
}
