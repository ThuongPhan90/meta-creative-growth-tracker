import { NextRequest, NextResponse } from "next/server";

import {
  canonicalDetailId,
  DetailApiError,
  detailErrorResponse,
  requireOwnerDetailSnapshot,
} from "@/lib/detail-api";
import type {
  CampaignHierarchy,
  CampaignInventoryItem,
  CanonicalCampaignResultTotals,
  TrackerRepository,
} from "@/lib/db";
import { computeResultMappingVersion } from "@/lib/db/result-mapping-version";
import {
  createReportingResponse,
  DEFAULT_OBJECTIVE_REGISTRY,
  objectiveLabel,
  reportingSyncStatus,
  resolveObjective,
  type ReportingContext,
  type ReportingWarning,
  type ResultDefinition,
} from "@/lib/reporting";
import { resolveSnapshotReportingRequest } from "@/lib/reporting/snapshot-reporting-request";

export const dynamic = "force-dynamic";

function secureJson(value: unknown) {
  const response = NextResponse.json(value);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

function resultSource(
  definition: ResultDefinition,
): "action" | "action_value" {
  return definition.unit === "currency"
    ? "action_value"
    : "action";
}

function resultLookupKey({
  accountId,
  campaignId,
  currency,
  objectiveKey,
  canonicalResultKey,
  metricSource,
}: {
  accountId: string;
  campaignId: string;
  currency: string;
  objectiveKey: string;
  canonicalResultKey: string;
  metricSource: "action" | "action_value";
}) {
  return [
    accountId,
    campaignId,
    currency.toUpperCase(),
    objectiveKey,
    canonicalResultKey,
    metricSource,
  ].join("\u0000");
}

async function campaignInScope({
  repository,
  connectionId,
  context,
  campaignId,
}: {
  repository: TrackerRepository;
  connectionId: string;
  context: ReportingContext;
  campaignId: string;
}) {
  const filters = {
    connectionId,
    dateFrom: context.dateFrom,
    dateTo: context.dateTo,
    ...(context.currency ? { currency: context.currency } : {}),
    attributionWindow: context.attributionSettingKey,
    actionReportTime: context.actionReportTime,
    syncVersion: context.syncVersion,
    includeInactiveAccounts: true,
    search: campaignId,
    limit: 20,
    offset: 0,
  } as const;

  for (
    let index = 0;
    index < context.adAccountIds.length;
    index += 8
  ) {
    const accountIds = context.adAccountIds.slice(
      index,
      index + 8,
    );
    const pages = await Promise.all(
      accountIds.map((accountMetaId) =>
        repository.listCampaignInventory({
          ...filters,
          accountMetaId,
        }),
      ),
    );
    for (
      let accountIndex = 0;
      accountIndex < accountIds.length;
      accountIndex += 1
    ) {
      const accountId = accountIds[accountIndex];
      const campaign = pages[accountIndex]?.items.find(
        (item) =>
          item.metaCampaignId === campaignId &&
          item.metaAdAccountId === accountId,
      );
      if (campaign) return campaign;
    }
  }

  return null;
}

function hierarchyContract(hierarchy: CampaignHierarchy) {
  return hierarchy.adSets.map((adSet) => ({
    adSetId: adSet.metaAdSetId,
    internalId: adSet.adSetId,
    name: adSet.name,
    status: adSet.status,
    effectiveStatus: adSet.effectiveStatus,
    ads: adSet.ads.map((ad) => ({
      adId: ad.metaAdId,
      internalId: ad.adId,
      name: ad.name,
      status: ad.status,
      effectiveStatus: ad.effectiveStatus,
      creativeFamilyIds: ad.creativeFamilyIds,
    })),
  }));
}

function campaignContract({
  campaign,
  hierarchy,
  definitions,
  totalsByKey,
  context,
  canonicalTotals,
}: {
  campaign: CampaignInventoryItem;
  hierarchy: CampaignHierarchy;
  definitions: readonly ResultDefinition[];
  totalsByKey: ReadonlyMap<string, number>;
  context: ReportingContext;
  canonicalTotals: CanonicalCampaignResultTotals;
}) {
  const objective = resolveObjective(campaign.objective);
  const objectiveMatchesContext =
    context.objectiveKey === "all" ||
    context.objectiveKey === objective.key;
  const applicableDefinitions = definitions.filter(
    (definition) =>
      definition.enabled &&
      objectiveMatchesContext &&
      definition.objectiveKeys.includes(objective.key),
  );
  const definitionByKey = new Map(
    applicableDefinitions.map((definition) => [
      definition.canonicalKey,
      definition,
    ]),
  );

  return {
    campaignId: campaign.metaCampaignId,
    internalId: campaign.campaignId,
    name: campaign.name,
    objective: {
      key: objective.key,
      rawKey: campaign.objective,
      label: objectiveLabel(campaign.objective),
    },
    status: campaign.status,
    effectiveStatus: campaign.effectiveStatus,
    isActive: campaign.isActive,
    adAccount: {
      id: campaign.metaAdAccountId,
      name: campaign.adAccountName,
    },
    counts: {
      adSets: campaign.adSetCount,
      ads: campaign.adCount,
      creativeFamilies: campaign.creativeAssetCount,
    },
    performanceByCurrency: campaign.performance.map((performance) => {
      const resultValues = Object.fromEntries(
        applicableDefinitions.map((definition) => {
          const value = canonicalTotals.available
            ? (totalsByKey.get(
                resultLookupKey({
                  accountId: campaign.metaAdAccountId,
                  campaignId: campaign.metaCampaignId,
                  currency: performance.currency,
                  objectiveKey: objective.key,
                  canonicalResultKey: definition.canonicalKey,
                  metricSource: resultSource(definition),
                }),
              ) ?? null)
            : null;
          return [definition.canonicalKey, value];
        }),
      );
      const primaryDefinition = context.primaryResultKey
        ? definitionByKey.get(context.primaryResultKey) ?? null
        : null;
      const primaryValue =
        context.primaryResultKey &&
        Object.hasOwn(resultValues, context.primaryResultKey)
          ? resultValues[context.primaryResultKey]
          : null;
      const unavailableReason = !context.primaryResultKey
        ? "primary_result_not_selected"
        : !objectiveMatchesContext
          ? "campaign_objective_context_mismatch"
          : !primaryDefinition
            ? "result_definition_unavailable"
            : !canonicalTotals.available
              ? canonicalTotals.reason
              : primaryValue === null
                ? "canonical_result_not_recorded"
                : null;

      return {
        currency: performance.currency,
        spend: performance.spend,
        impressions: performance.impressions,
        result_values: resultValues,
        primaryResult: context.primaryResultKey
          ? {
              canonicalKey: context.primaryResultKey,
              label: primaryDefinition?.label ?? null,
              metricSource: primaryDefinition
                ? resultSource(primaryDefinition)
                : null,
              value: primaryValue,
              available: unavailableReason === null,
              unavailableReason,
            }
          : null,
        evaluation: {
          available: false,
          reason:
            unavailableReason ??
            "campaign_evaluation_not_published",
          resultKey: context.primaryResultKey ?? null,
          actualValue: null,
          benchmarkValue: null,
        },
      };
    }),
    hierarchy: hierarchyContract(hierarchy),
    lastSeenAt: campaign.lastSeenAt,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { repository, connection, snapshot } =
      await requireOwnerDetailSnapshot(request);
    const id = canonicalDetailId("campaign", (await params).id);
    if (!id) {
      throw new DetailApiError(
        400,
        "INVALID_CAMPAIGN_ID",
        "Campaign ID không hợp lệ.",
      );
    }

    const reporting = resolveSnapshotReportingRequest({
      searchParams: request.nextUrl.searchParams,
      snapshot,
    });
    const context = reporting.context;
    const warnings: ReportingWarning[] = [...reporting.warnings];
    const [campaign, hierarchy, definitions, mappings] =
      await Promise.all([
        campaignInScope({
          repository,
          connectionId: connection.connectionId,
          context,
          campaignId: id,
        }),
        repository.getCampaignHierarchy(
          connection.connectionId,
          id,
        ),
        repository.listResultDefinitions(),
        repository.listResultMappings(),
      ]);
    if (!campaign || !hierarchy) {
      throw new DetailApiError(
        404,
        "CAMPAIGN_NOT_FOUND",
        "Không tìm thấy Campaign trong phạm vi báo cáo của owner hiện tại.",
      );
    }

    const objective = resolveObjective(campaign.objective);
    const resultMappingVersion =
      computeResultMappingVersion(mappings);
    const fetchedCanonicalTotals =
      await repository.getCanonicalCampaignResultTotals({
        connectionId: connection.connectionId,
        dateFrom: context.dateFrom,
        dateTo: context.dateTo,
        adAccountIds: [campaign.metaAdAccountId],
        campaignMetaIds: [id],
        objectiveKeys: [
          context.objectiveKey === "all"
            ? objective.key
            : context.objectiveKey,
        ],
        objectiveMappings: DEFAULT_OBJECTIVE_REGISTRY.map(
          (definition) => ({
            objectiveKey: definition.key,
            rawObjectiveKeys: definition.rawObjectiveKeys,
          }),
        ),
        ...(context.currency
          ? { currency: context.currency }
          : {}),
        attributionWindow: context.attributionSettingKey,
        actionReportTime: context.actionReportTime,
        syncVersion: context.syncVersion,
        resultMappingVersion,
      });
    const canonicalVersionMismatch =
      fetchedCanonicalTotals.available &&
      (fetchedCanonicalTotals.syncVersion !==
        context.syncVersion ||
        fetchedCanonicalTotals.resultMappingVersion !==
          resultMappingVersion);
    const canonicalTotals: CanonicalCampaignResultTotals =
      canonicalVersionMismatch
        ? {
            available: false,
            reason: "reporting_snapshot_stale",
            results: [],
          }
        : fetchedCanonicalTotals;

    if (!canonicalTotals.available) {
      warnings.push({
        code: "NORMALIZED_RESULT_SNAPSHOT_UNAVAILABLE",
        message:
          "Kết quả chuẩn hóa chưa khả dụng cho đúng reporting snapshot; API không dùng số liệu Result legacy để thay thế.",
        severity: "warning",
        source: "coverage",
        details: {
          reason: canonicalTotals.reason,
          syncVersion: context.syncVersion,
        },
      });
    }
    if (
      canonicalVersionMismatch &&
      fetchedCanonicalTotals.available
    ) {
      warnings.push({
        code: "CANONICAL_RESULT_SNAPSHOT_MISMATCH",
        message:
          "Result batch không khớp syncVersion hoặc resultMappingVersion đã pin và đã bị loại bỏ.",
        severity: "warning",
        source: "coverage",
        details: {
          requestedSyncVersion: context.syncVersion,
          receivedSyncVersion:
            fetchedCanonicalTotals.syncVersion,
          requestedResultMappingVersion:
            resultMappingVersion,
          receivedResultMappingVersion:
            fetchedCanonicalTotals.resultMappingVersion,
        },
      });
    }
    if (
      context.objectiveKey !== "all" &&
      context.objectiveKey !== objective.key
    ) {
      warnings.push({
        code: "CAMPAIGN_OBJECTIVE_CONTEXT_MISMATCH",
        message:
          "Objective của Campaign không khớp Objective trong reporting context; Result được giữ ở trạng thái không khả dụng.",
        severity: "warning",
        source: "reporting",
        details: {
          campaignObjectiveKey: objective.key,
          requestedObjectiveKey: context.objectiveKey,
        },
      });
    }

    const enabledDefinitions = definitions.filter(
      (definition) => definition.enabled,
    );
    const definitionByKey = new Map(
      enabledDefinitions.map((definition) => [
        definition.canonicalKey,
        definition,
      ]),
    );
    const performanceCurrencies = new Set(
      campaign.performance.map((performance) =>
        performance.currency.toUpperCase(),
      ),
    );
    const expectedObjectiveKey =
      context.objectiveKey === "all"
        ? objective.key
        : context.objectiveKey;
    const totalsByKey = new Map<string, number>();
    const unknownResultKeys = new Set<string>();
    if (canonicalTotals.available) {
      for (const result of canonicalTotals.results) {
        if (
          result.adAccountMetaId !==
            campaign.metaAdAccountId ||
          result.campaignMetaId !== campaign.metaCampaignId ||
          result.objectiveKey !== expectedObjectiveKey ||
          !performanceCurrencies.has(
            result.currency.toUpperCase(),
          ) ||
          (context.currency &&
            result.currency.toUpperCase() !==
              context.currency.toUpperCase())
        ) {
          continue;
        }
        const definition = definitionByKey.get(
          result.canonicalResultKey,
        );
        if (!definition) {
          unknownResultKeys.add(result.canonicalResultKey);
          continue;
        }
        if (
          !definition.objectiveKeys.includes(
            expectedObjectiveKey,
          ) ||
          resultSource(definition) !== result.metricSource ||
          !Number.isFinite(result.value)
        ) {
          continue;
        }
        const key = resultLookupKey({
          accountId: result.adAccountMetaId,
          campaignId: result.campaignMetaId,
          currency: result.currency,
          objectiveKey: result.objectiveKey,
          canonicalResultKey: result.canonicalResultKey,
          metricSource: result.metricSource,
        });
        totalsByKey.set(
          key,
          (totalsByKey.get(key) ?? 0) + result.value,
        );
      }
    }
    if (unknownResultKeys.size > 0) {
      warnings.push({
        code: "RESULT_DEFINITION_UNAVAILABLE",
        message:
          "Một số Result trong snapshot không có definition đang bật và đã bị loại khỏi Campaign detail.",
        severity: "warning",
        source: "reporting",
        details: {
          canonicalResultKeys: [...unknownResultKeys].sort(),
        },
      });
    }

    const campaignData = campaignContract({
      campaign,
      hierarchy,
      definitions: enabledDefinitions,
      totalsByKey,
      context,
      canonicalTotals,
    });
    const primaryMissingCurrencies = campaignData.performanceByCurrency
      .filter(
        (performance) =>
          context.primaryResultKey &&
          performance.primaryResult?.value === null,
      )
      .map((performance) => performance.currency);
    if (
      canonicalTotals.available &&
      context.primaryResultKey &&
      primaryMissingCurrencies.length > 0
    ) {
      warnings.push({
        code: "PRIMARY_RESULT_VALUE_UNAVAILABLE",
        message:
          "Primary Result không có giá trị canonical trong một hoặc nhiều currency của Campaign.",
        severity: "warning",
        source: "coverage",
        details: {
          canonicalResultKey: context.primaryResultKey,
          currencies: primaryMissingCurrencies,
        },
      });
    }

    return secureJson(
      createReportingResponse(
        {
          campaign: campaignData,
          resultDefinitions: enabledDefinitions.map(
            (definition) => ({
              canonicalKey: definition.canonicalKey,
              label: definition.label,
              shortLabel: definition.shortLabel,
              objectiveKeys: definition.objectiveKeys,
              unit: definition.unit,
              metricSource: resultSource(definition),
              efficiencyMetric: definition.efficiencyMetric,
              direction: definition.direction,
            }),
          ),
          resultSnapshot: {
            available: canonicalTotals.available,
            syncVersion: canonicalTotals.available
              ? canonicalTotals.syncVersion
              : context.syncVersion,
            resultMappingVersion: canonicalTotals.available
              ? canonicalTotals.resultMappingVersion
              : resultMappingVersion,
            unavailableReason: canonicalTotals.available
              ? null
              : canonicalTotals.reason,
          },
          metricSemantics: {
            spend: "canonical_ad_delivery",
            impressions: "canonical_ad_delivery",
            results: canonicalTotals.available
              ? "normalized_meta_attributed_result_facts"
              : `unavailable:${canonicalTotals.reason}`,
            evaluation:
              canonicalTotals.available
                ? "unavailable:campaign_evaluation_not_published"
                : `unavailable:${canonicalTotals.reason}`,
            currency:
              "native_account_currency_no_fx_conversion",
          },
        },
        {
          context,
          dataThrough:
            snapshot.freshness.dataThroughAt?.slice(0, 10) ??
            null,
          lastSuccessfulSyncAt:
            snapshot.freshness.lastSyncedAt,
          syncStatus: reportingSyncStatus({
            lastSuccessfulSyncAt:
              snapshot.freshness.lastSyncedAt,
            syncStatus: snapshot.freshness.syncStatus,
          }),
          coverage: {
            adAccounts: {
              covered: 1,
              total: 1,
              ratio: 1,
              basis: "campaign_account_in_effective_scope",
            },
            campaignHierarchy: {
              covered: 1,
              total: 1,
              ratio: 1,
              basis: "owner_bound_campaign_hierarchy",
            },
            campaignDelivery: {
              covered: campaign.performance.length > 0 ? 1 : 0,
              total: 1,
              ratio: campaign.performance.length > 0 ? 1 : 0,
              basis:
                "campaign_with_exact_context_delivery",
            },
            normalizedResults: {
              covered: canonicalTotals.available ? 1 : 0,
              total: 1,
              ratio: canonicalTotals.available ? 1 : 0,
              basis:
                "campaign_covered_by_exact_result_snapshot",
            },
          },
          warnings,
        },
      ),
    );
  } catch (error) {
    return detailErrorResponse(error);
  }
}
