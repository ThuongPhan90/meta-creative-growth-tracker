import { NextRequest } from "next/server";

import { createFreshness } from "@/lib/data-contract";
import {
  canonicalDetailId,
  DetailApiError,
  detailErrorResponse,
  detailSuccess,
  freshnessContract,
  requireOwnerDetailContext,
} from "@/lib/detail-api";

export const dynamic = "force-dynamic";

function dateParameter(value: string | null) {
  if (value === null) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
    ? value
    : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = canonicalDetailId("campaign", (await params).id);
    if (!id) {
      throw new DetailApiError(
        400,
        "INVALID_CAMPAIGN_ID",
        "Campaign ID không hợp lệ.",
      );
    }

    const from = dateParameter(
      request.nextUrl.searchParams.get("from"),
    );
    const to = dateParameter(request.nextUrl.searchParams.get("to"));
    const currency =
      request.nextUrl.searchParams.get("currency")?.trim() || undefined;
    if (
      from === null ||
      to === null ||
      (from && to && from > to) ||
      (currency && !/^[A-Z]{3}$/.test(currency))
    ) {
      throw new DetailApiError(
        400,
        "INVALID_REPORTING_FILTER",
        "Khoảng ngày hoặc currency của Campaign không hợp lệ.",
      );
    }

    const { repository, connection } =
      await requireOwnerDetailContext(request);
    const [inventory, hierarchy, rawFreshness] = await Promise.all([
      repository.listCampaignInventory({
        connectionId: connection.connectionId,
        search: id,
        includeInactiveAccounts: true,
        dateFrom: from,
        dateTo: to,
        currency,
        limit: 20,
        offset: 0,
      }),
      repository.getCampaignHierarchy(connection.connectionId, id),
      repository.getInsightsFreshness(connection.connectionId),
    ]);
    const campaign = inventory.items.find(
      (item) => item.metaCampaignId === id,
    );
    if (!campaign || !hierarchy) {
      throw new DetailApiError(
        404,
        "CAMPAIGN_NOT_FOUND",
        "Không tìm thấy Campaign trong dữ liệu của owner hiện tại.",
      );
    }

    const freshness = createFreshness(rawFreshness);
    return detailSuccess({
      campaign_id: campaign.metaCampaignId,
      internal_id: campaign.campaignId,
      name: campaign.name,
      objective: campaign.objective,
      status: campaign.status,
      effective_status: campaign.effectiveStatus,
      is_active: campaign.isActive,
      ad_account: {
        ad_account_id: campaign.metaAdAccountId,
        name: campaign.adAccountName,
      },
      counts: {
        ad_sets: campaign.adSetCount,
        ads: campaign.adCount,
        creative_families: campaign.creativeAssetCount,
      },
      performance_by_currency: campaign.performance.map((row) => ({
        currency: row.currency,
        spend: row.spend,
        impressions: row.impressions,
        installs: row.installs,
        registrations: row.registrations,
        cpi: row.cpi,
        cost_per_registration: row.costPerRegistration,
      })),
      hierarchy: hierarchy.adSets.map((adSet) => ({
        ad_set_id: adSet.metaAdSetId,
        internal_id: adSet.adSetId,
        name: adSet.name,
        status: adSet.status,
        effective_status: adSet.effectiveStatus,
        ads: adSet.ads.map((ad) => ({
          ad_id: ad.metaAdId,
          internal_id: ad.adId,
          name: ad.name,
          status: ad.status,
          effective_status: ad.effectiveStatus,
          creative_family_ids: ad.creativeFamilyIds,
        })),
      })),
      reporting_context: {
        from: from ?? null,
        to: to ?? null,
        currency: currency ?? null,
      },
      last_seen_at: campaign.lastSeenAt,
      freshness: freshnessContract(freshness),
    });
  } catch (error) {
    return detailErrorResponse(error);
  }
}
