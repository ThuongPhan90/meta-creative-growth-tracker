import { NextRequest, NextResponse } from "next/server";

import { GET as legacyCreativeDetail } from "../../../creative-families/[id]/route";
import {
  createReportingResponse,
  type ReportingContext,
  type ReportingSyncStatus,
} from "@/lib/reporting";

export const dynamic = "force-dynamic";

type LegacyReportingContext = {
  business_ids: string[];
  ad_account_ids: string[];
  date_from: string;
  date_to: string;
  compare_mode: ReportingContext["compareMode"];
  objective_key: ReportingContext["objectiveKey"];
  primary_result_key: string | null;
  currency: string | null;
  currency_mode: ReportingContext["currencyMode"];
  reporting_timezone_mode: ReportingContext["reportingTimezoneMode"];
  attribution_setting_key: string;
  action_report_time: ReportingContext["actionReportTime"];
  sync_version: string;
};

type LegacyFreshness = {
  last_synced_at: string | null;
  data_through_at: string | null;
  sync_status: "healthy" | "warning" | "partial" | "error";
};

type LegacyCreativeDetail = {
  reporting_context: LegacyReportingContext;
  freshness: LegacyFreshness;
  usage_summary?: {
    linked_ads?: number;
  };
  entity_links?: {
    campaign_ids?: string[];
  } | null;
  [key: string]: unknown;
};

function reportingSyncStatus(
  status: LegacyFreshness["sync_status"],
): ReportingSyncStatus {
  if (status === "healthy") return "completed";
  if (status === "warning") return "completed_with_warnings";
  if (status === "partial") return "partial";
  return "failed";
}

function reportingContext(
  context: LegacyReportingContext,
): ReportingContext {
  return {
    businessIds: context.business_ids,
    adAccountIds: context.ad_account_ids,
    dateFrom: context.date_from,
    dateTo: context.date_to,
    compareMode: context.compare_mode,
    objectiveKey: context.objective_key,
    ...(context.primary_result_key
      ? { primaryResultKey: context.primary_result_key }
      : {}),
    ...(context.currency ? { currency: context.currency } : {}),
    currencyMode: context.currency_mode,
    reportingTimezoneMode: context.reporting_timezone_mode,
    attributionSettingKey: context.attribution_setting_key,
    actionReportTime: context.action_report_time,
    syncVersion: context.sync_version,
  };
}

export function reportingCreativeDetailEnvelope(
  data: LegacyCreativeDetail,
) {
  const linkedAds = Math.max(
    0,
    Math.floor(data.usage_summary?.linked_ads ?? 0),
  );
  const linkedCampaigns = data.entity_links?.campaign_ids?.length ?? 0;
  return createReportingResponse(data, {
    context: reportingContext(data.reporting_context),
    dataThrough: data.freshness.data_through_at?.slice(0, 10) ?? null,
    lastSuccessfulSyncAt: data.freshness.last_synced_at,
    syncStatus: reportingSyncStatus(data.freshness.sync_status),
    coverage: {
      creativeFamily: {
        covered: 1,
        total: 1,
        ratio: 1,
        basis: "owner-bound Creative Family detail",
      },
      adLinkage: {
        covered: linkedAds > 0 ? 1 : 0,
        total: 1,
        ratio: linkedAds > 0 ? 1 : 0,
        basis: `${linkedAds} linked Ads`,
      },
      campaignLinkage: {
        covered: linkedCampaigns > 0 ? 1 : 0,
        total: 1,
        ratio: linkedCampaigns > 0 ? 1 : 0,
        basis: `${linkedCampaigns} linked Campaigns`,
      },
    },
    warnings:
      linkedAds > 0 && linkedCampaigns > 0
        ? []
        : [
            {
              code: "CREATIVE_DETAIL_LINKAGE_GAP",
              message:
                "Creative Family chưa có đủ liên kết Ads/Campaign trong snapshot hiện tại.",
              severity: "warning",
              source: "coverage",
            },
          ],
  });
}

function secureJson(value: unknown) {
  return NextResponse.json(value, {
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Cookie",
    },
  });
}

export async function GET(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string }> },
) {
  const response = await legacyCreativeDetail(request, routeContext);
  if (!response.ok) return response;

  const body = (await response.json()) as {
    ok: true;
    data: LegacyCreativeDetail;
  };
  return secureJson(reportingCreativeDetailEnvelope(body.data));
}
