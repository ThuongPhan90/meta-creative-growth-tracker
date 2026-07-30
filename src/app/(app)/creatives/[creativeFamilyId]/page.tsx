import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  CreativeDrawerContent,
  groupCreativeFamiliesForView,
} from "@/components/creative-performance-v2";
import { CopyIdButton } from "@/components/ui/copy-id-button";
import {
  getApplicationSnapshot,
  getCreativeFamilyRowsForReport,
} from "@/lib/app-data";
import { canonicalDetailId } from "@/lib/detail-api/contracts";
import { resolveReportContext } from "@/lib/reporting";

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
  const context = resolveReportContext({
    query: {
      from: first(query.from),
      to: first(query.to),
      account: first(query.account),
    },
    timeZone: snapshot.settings.timezone,
    lookbackDays: snapshot.settings.lookbackDays,
  });
  const rows = await getCreativeFamilyRowsForReport({
    snapshot,
    creativeFamilyId,
    dateFrom: context.dateFrom,
    dateTo: context.dateTo,
    currency: first(query.currency),
    accountMetaId: context.account || undefined,
    campaignMetaId: first(query.campaign),
  });
  const family = groupCreativeFamiliesForView(rows ?? []).find(
    (item) => item.id === creativeFamilyId,
  );
  if (!family) notFound();

  const backParams = new URLSearchParams();
  for (const [key, raw] of Object.entries(query)) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value && key !== "tab") backParams.set(key, value);
  }
  const backHref = `/creatives${
    backParams.size ? `?${backParams.toString()}` : ""
  }`;

  return (
    <div className="v2-page v2-full-detail">
      <Link className="v2-back-link" href={backHref}>
        <ArrowLeft aria-hidden="true" size={17} />
        Quay lại Hiệu quả Creative
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
        <CreativeDrawerContent family={family} query={query} fullPage />
      </section>
    </div>
  );
}
