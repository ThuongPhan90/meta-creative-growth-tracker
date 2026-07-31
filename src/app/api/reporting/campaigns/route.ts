import { NextRequest, NextResponse } from "next/server";

import {
  detailErrorResponse,
  requireOwnerDetailSnapshot,
} from "@/lib/detail-api";
import type {
  CampaignInventoryItem,
  CampaignInventoryPage,
  CanonicalCampaignResultTotals,
  TrackerRepository,
} from "@/lib/db";
import { computeResultMappingVersion } from "@/lib/db/result-mapping-version";
import {
  createBackendFallbackWarning,
  createReportingResponse,
  DEFAULT_OBJECTIVE_REGISTRY,
  objectiveDatabaseKeys,
  objectiveLabel,
  reportingSyncStatus,
  resolveObjective,
  resolveReportingRequest,
  type ReportingContext,
  type ReportingWarning,
  type ResultDefinition,
} from "@/lib/reporting";

export const dynamic = "force-dynamic";

const EMPTY_PAGE: CampaignInventoryPage = {
  items: [],
  total: 0,
  limit: 50,
  offset: 0,
};

function response(value: unknown) {
  const result = NextResponse.json(value);
  result.headers.set("Cache-Control", "private, no-store");
  result.headers.set("Vary", "Cookie");
  return result;
}

function integerParameter(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed)
    ? Math.min(Math.max(parsed, minimum), maximum)
    : fallback;
}

async function listCampaignsForScope({
  repository,
  connectionId,
  context,
  status,
  search,
  includeInactiveAccounts,
  limit,
  offset,
}: {
  repository: TrackerRepository;
  connectionId: string;
  context: ReportingContext;
  status?: string;
  search?: string;
  includeInactiveAccounts: boolean;
  limit: number;
  offset: number;
}): Promise<CampaignInventoryPage> {
  if (context.adAccountIds.length === 0) {
    return { ...EMPTY_PAGE, limit, offset };
  }
  const objectiveRawKeys = objectiveDatabaseKeys(
    context.objectiveKey,
  );
  const filters = {
    connectionId,
    dateFrom: context.dateFrom,
    dateTo: context.dateTo,
    ...(context.currency ? { currency: context.currency } : {}),
    attributionWindow: context.attributionSettingKey,
    actionReportTime: context.actionReportTime,
    syncVersion: context.syncVersion,
    objectiveRawKeys:
      objectiveRawKeys.length ? objectiveRawKeys : undefined,
    status,
    search,
    includeInactiveAccounts,
  } as const;
  if (context.adAccountIds.length === 1) {
    return repository.listCampaignInventory({
      ...filters,
      accountMetaId: context.adAccountIds[0],
      limit,
      offset,
    });
  }

  const pages: CampaignInventoryPage[] = [];
  for (
    let index = 0;
    index < context.adAccountIds.length;
    index += 8
  ) {
    pages.push(
      ...(await Promise.all(
        context.adAccountIds
          .slice(index, index + 8)
          .map((accountMetaId) =>
            repository.listCampaignInventory({
              ...filters,
              accountMetaId,
              limit: 200,
              offset: 0,
            }),
          ),
      )),
    );
  }
  const items = pages
    .flatMap((page) => page.items)
    .sort(
      (left, right) =>
        Number(
          right.isActive &&
            (right.effectiveStatus ?? right.status) === "ACTIVE",
        ) -
          Number(
            left.isActive &&
              (left.effectiveStatus ?? left.status) === "ACTIVE",
          ) ||
        Number(right.isActive) - Number(left.isActive) ||
        right.lastSeenAt.localeCompare(left.lastSeenAt) ||
        left.name.localeCompare(right.name, "vi"),
    );
  return {
    items: items.slice(offset, offset + limit),
    total: pages.reduce((sum, page) => sum + page.total, 0),
    limit,
    offset,
  };
}

function resultSource(
  definition: ResultDefinition,
): "action" | "action_value" {
  return definition.unit === "currency"
    ? "action_value"
    : "action";
}

function resultKey({
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

function campaignContract({
  campaign,
  definitions,
  totalsByKey,
  context,
  canonicalAvailable,
}: {
  campaign: CampaignInventoryItem;
  definitions: readonly ResultDefinition[];
  totalsByKey: ReadonlyMap<string, number>;
  context: ReportingContext;
  canonicalAvailable: boolean;
}) {
  const objective = resolveObjective(campaign.objective);
  const applicableDefinitions = definitions.filter(
    (definition) =>
      definition.enabled &&
      definition.objectiveKeys.includes(objective.key) &&
      (context.objectiveKey === "all" ||
        context.objectiveKey === objective.key),
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
      const canonicalResults = applicableDefinitions.map(
        (definition) => {
          const metricSource = resultSource(definition);
          const value = canonicalAvailable
            ? (totalsByKey.get(
                resultKey({
                  accountId: campaign.metaAdAccountId,
                  campaignId: campaign.metaCampaignId,
                  currency: performance.currency,
                  objectiveKey: objective.key,
                  canonicalResultKey: definition.canonicalKey,
                  metricSource,
                }),
              ) ?? null)
            : null;
          return {
            canonicalKey: definition.canonicalKey,
            label: definition.label,
            objectiveKey: objective.key,
            metricSource,
            value,
          };
        },
      );
      const primaryResult = context.primaryResultKey
        ? (canonicalResults.find(
            (result) =>
              result.canonicalKey === context.primaryResultKey,
          ) ?? {
            canonicalKey: context.primaryResultKey,
            label: null,
            objectiveKey: objective.key,
            metricSource: null,
            value: null,
          })
        : null;
      return {
        currency: performance.currency,
        spend: performance.spend,
        impressions: performance.impressions,
        canonicalResults,
        primaryResult,
      };
    }),
    lastSeenAt: campaign.lastSeenAt,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { repository, connection, snapshot } =
      await requireOwnerDetailSnapshot(request);
    const latestSyncVersion =
      snapshot.freshness.syncVersion ??
      snapshot.syncRuns.find((run) =>
        ["success", "partial"].includes(run.status),
      )?.id ??
      "never";
    const scope = snapshot.reportingScope;
    const scopedCurrencies = new Set(
      (scope?.available.adAccounts ?? [])
        .filter((account) =>
          scope?.selected.adAccountIds.includes(account.id),
        )
        .map((account) => account.currency.trim().toUpperCase())
        .filter((currency) => /^[A-Z]{3}$/.test(currency)),
    );
    const defaultScopeCurrency =
      scopedCurrencies.size === 1
        ? [...scopedCurrencies][0]
        : undefined;
    const reporting = resolveReportingRequest({
      searchParams: request.nextUrl.searchParams,
      timeZone: snapshot.settings.timezone,
      lookbackDays: snapshot.settings.lookbackDays,
      reportingCurrency:
        scopedCurrencies.size > 1
          ? null
          : defaultScopeCurrency ?? snapshot.settings.currency,
      compareDefault: snapshot.settings.compareDefault,
      defaults: {
        businessIds: scope?.selected.businessIds ?? [],
        adAccountIds: scope?.selected.adAccountIds ?? [],
        currencyMode:
          request.nextUrl.searchParams.has("currency") ||
          scopedCurrencies.size === 1
            ? "single"
            : "split",
        ...(defaultScopeCurrency
          ? { currency: defaultScopeCurrency }
          : {}),
        syncVersion: latestSyncVersion,
      },
    });
    const context = reporting.context;
    const warnings: ReportingWarning[] = [...reporting.warnings];
    if (
      scope &&
      (scope.unavailableSelected.businessIds.length ||
        scope.unavailableSelected.adAccountIds.length)
    ) {
      warnings.push(
        createBackendFallbackWarning({
          message:
            "Một phần phạm vi đã lưu không còn khả dụng và đã bị loại khỏi báo cáo.",
          fallbacks: [
            {
              field: "adAccountIds",
              requested: scope.unavailableSelected.adAccountIds,
              applied: context.adAccountIds,
              reason: "saved_scope_no_longer_accessible",
            },
          ],
        }),
      );
    }

    const limit = integerParameter(
      request.nextUrl.searchParams.get("limit"),
      50,
      1,
      200,
    );
    const pageNumber = integerParameter(
      request.nextUrl.searchParams.get("page"),
      1,
      1,
      100_000,
    );
    const offset = (pageNumber - 1) * limit;
    const [campaignPage, definitions, mappings] =
      await Promise.all([
        listCampaignsForScope({
          repository,
          connectionId: connection.connectionId,
          context,
          status:
            request.nextUrl.searchParams
              .get("status")
              ?.trim()
              .slice(0, 64) || undefined,
          search:
            request.nextUrl.searchParams
              .get("q")
              ?.trim()
              .slice(0, 200) || undefined,
          includeInactiveAccounts:
            request.nextUrl.searchParams.get("show_inactive") ===
              "1" ||
            request.nextUrl.searchParams.get("showInactive") ===
              "1",
          limit,
          offset,
        }),
        repository.listResultDefinitions(),
        repository.listResultMappings(),
      ]);
    const enabledDefinitions = definitions.filter(
      (definition) => definition.enabled,
    );
    const campaignMetaIds = [
      ...new Set(
        campaignPage.items.map(
          (campaign) => campaign.metaCampaignId,
        ),
      ),
    ];
    let canonicalTotals: CanonicalCampaignResultTotals | null =
      null;
    if (campaignMetaIds.length > 0) {
      canonicalTotals =
        await repository.getCanonicalCampaignResultTotals({
          connectionId: connection.connectionId,
          dateFrom: context.dateFrom,
          dateTo: context.dateTo,
          adAccountIds: context.adAccountIds,
          campaignMetaIds,
          ...(context.objectiveKey === "all"
            ? {}
            : { objectiveKeys: [context.objectiveKey] }),
          objectiveMappings: DEFAULT_OBJECTIVE_REGISTRY.map(
            (objective) => ({
              objectiveKey: objective.key,
              rawObjectiveKeys: objective.rawObjectiveKeys,
            }),
          ),
          ...(context.currency
            ? { currency: context.currency }
            : {}),
          attributionWindow: context.attributionSettingKey,
          actionReportTime: context.actionReportTime,
          syncVersion: context.syncVersion,
          resultMappingVersion:
            computeResultMappingVersion(mappings),
        });
    }

    if (canonicalTotals && !canonicalTotals.available) {
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
    const definitionByKey = new Map(
      enabledDefinitions.map((definition) => [
        definition.canonicalKey,
        definition,
      ]),
    );
    const totalsByKey = new Map<string, number>();
    const unknownResultKeys = new Set<string>();
    if (canonicalTotals?.available) {
      for (const result of canonicalTotals.results) {
        const definition = definitionByKey.get(
          result.canonicalResultKey,
        );
        if (!definition) {
          unknownResultKeys.add(result.canonicalResultKey);
          continue;
        }
        if (
          resultSource(definition) !== result.metricSource ||
          (context.objectiveKey !== "all" &&
            context.objectiveKey !== result.objectiveKey)
        ) {
          continue;
        }
        const key = resultKey({
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
          "Một số Result trong snapshot không còn definition đang bật và đã được giữ ở trạng thái không khả dụng.",
        severity: "warning",
        source: "reporting",
        details: {
          canonicalResultKeys: [...unknownResultKeys].sort(),
        },
      });
    }

    const campaigns = campaignPage.items.map((campaign) =>
      campaignContract({
        campaign,
        definitions: enabledDefinitions,
        totalsByKey,
        context,
        canonicalAvailable:
          canonicalTotals?.available === true,
      }),
    );
    const campaignsWithDelivery = campaignPage.items.filter(
      (campaign) => campaign.performance.length > 0,
    ).length;
    const canonicalCovered =
      canonicalTotals?.available === true
        ? campaignPage.items.length
        : 0;
    const canonicalState =
      campaignPage.items.length === 0
        ? "empty_page"
        : canonicalTotals?.available
          ? "normalized_meta_attributed_result_facts"
          : `unavailable:${canonicalTotals?.reason ?? "exact_snapshot_unavailable"}`;

    return response(
      createReportingResponse(
        {
          campaigns,
          pagination: {
            page: pageNumber,
            limit: campaignPage.limit,
            offset: campaignPage.offset,
            total: campaignPage.total,
          },
          resultDefinitions: enabledDefinitions.map(
            (definition) => ({
              canonicalKey: definition.canonicalKey,
              label: definition.label,
              shortLabel: definition.shortLabel,
              objectiveKeys: definition.objectiveKeys,
              unit: definition.unit,
              metricSource: resultSource(definition),
            }),
          ),
          resultSnapshot: {
            available:
              canonicalTotals?.available === true ||
              campaignPage.items.length === 0,
            syncVersion:
              canonicalTotals?.available === true
                ? canonicalTotals.syncVersion
                : context.syncVersion,
            resultMappingVersion:
              canonicalTotals?.available === true
                ? canonicalTotals.resultMappingVersion
                : computeResultMappingVersion(mappings),
            unavailableReason:
              canonicalTotals &&
              !canonicalTotals.available
                ? canonicalTotals.reason
                : null,
          },
          metricSemantics: {
            spend: "canonical_ad_delivery",
            impressions: "canonical_ad_delivery",
            results: canonicalState,
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
              covered: context.adAccountIds.length,
              total: context.adAccountIds.length,
              ratio: context.adAccountIds.length ? 1 : 0,
              basis: "effective_ad_account_scope",
            },
            campaignDelivery: {
              covered: campaignsWithDelivery,
              total: campaignPage.items.length,
              ratio: campaignPage.items.length
                ? campaignsWithDelivery /
                  campaignPage.items.length
                : 0,
              basis: "campaigns_on_page_with_delivery",
            },
            normalizedResults: {
              covered: canonicalCovered,
              total: campaignPage.items.length,
              ratio: campaignPage.items.length
                ? canonicalCovered / campaignPage.items.length
                : 0,
              basis:
                "campaigns_on_page_covered_by_exact_result_snapshot",
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
