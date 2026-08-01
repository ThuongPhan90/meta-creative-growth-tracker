import {
  CreativeDrawerContent,
  groupCreativeFamiliesForView,
} from "@/components/creative-performance-v2";
import { OverviewV2 } from "@/components/overview-v2";
import { EntityDrawer } from "@/components/ui/entity-drawer";
import {
  getApplicationSnapshot,
  buildApplicationResultMetrics,
  getCanonicalResultsForReport,
  getCreativeRowsForReport,
  getDeliveryForReport,
  getLiveDeliveryForReport,
  getOverviewTrendForReport,
  resolveApplicationReportContext,
} from "@/lib/app-data";
import { addReportDays } from "@/lib/reporting";
import { formatFreshnessFields } from "@/lib/presentation/freshness-presentation";
import { buildReportingBarModel } from "@/lib/presentation/reporting-bar";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const OVERVIEW_FLASH_NOTICE_MESSAGES = {
  result_fallback:
    "Result trong URL không phù hợp với Objective đã chọn; hệ thống đã dùng Result mặc định.",
  result_removed:
    "Result trong URL đã được bỏ vì Tất cả mục tiêu không dùng một Result duy nhất.",
  filters_normalized:
    "Một phần bộ lọc trong URL không hợp lệ và đã được chuẩn hóa về ngữ cảnh báo cáo an toàn.",
} as const;

type OverviewFlashNotice = keyof typeof OVERVIEW_FLASH_NOTICE_MESSAGES;

function readOverviewFlashNotice(
  value: string | string[] | undefined,
): OverviewFlashNotice | null {
  const notice = first(value);
  return notice && notice in OVERVIEW_FLASH_NOTICE_MESSAGES
    ? (notice as OverviewFlashNotice)
    : null;
}

function flashNoticeForWarnings(
  warnings: ReturnType<
    typeof resolveApplicationReportContext
  >["warnings"],
): OverviewFlashNotice | null {
  const resultWarning = warnings.find(
    (warning) => warning.code === "result_not_available_for_objective",
  );
  if (resultWarning) {
    return resultWarning.fallback === undefined
      ? "result_removed"
      : "result_fallback";
  }
  return warnings.length > 0 ? "filters_normalized" : null;
}

function contextWarningMessage(
  warning: ReturnType<
    typeof resolveApplicationReportContext
  >["warnings"][number],
) {
  if (warning.code === "result_not_available_for_objective") {
    if (warning.fallback === undefined) {
      return OVERVIEW_FLASH_NOTICE_MESSAGES.result_removed;
    }
    return OVERVIEW_FLASH_NOTICE_MESSAGES.result_fallback;
  }
  return OVERVIEW_FLASH_NOTICE_MESSAGES.filters_normalized;
}

function canonicalOverviewQuery(
  query: Record<string, string | string[] | undefined>,
  context: ReturnType<
    typeof resolveApplicationReportContext
  >,
) {
  const canonical = { ...query };
  canonical.from = context.dateFrom;
  canonical.to = context.dateTo;
  canonical.compare = context.compareMode;
  canonical.objective = context.objectiveKey;
  canonical.attribution = context.attributionSettingKey;
  canonical.action_report_time = context.actionReportTime;
  canonical.sync_version = context.syncVersion;

  delete canonical.account;
  if (context.businessIds.length) {
    canonical.business_ids = context.businessIds.join(",");
  } else {
    delete canonical.business_ids;
  }
  if (context.adAccountIds.length) {
    canonical.account_ids = context.adAccountIds.join(",");
  } else {
    delete canonical.account_ids;
  }
  if (context.primaryResultKey) {
    canonical.result = context.primaryResultKey;
  } else {
    delete canonical.result;
  }
  if (context.currencyMode === "single" && context.currency) {
    canonical.currency = context.currency;
  } else {
    delete canonical.currency;
  }
  return canonical;
}

function overviewHref(
  query: Record<string, string | string[] | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(query)) {
    const values = Array.isArray(raw) ? raw : [raw];
    for (const value of values) {
      if (value !== undefined) params.append(key, value);
    }
  }
  return `/overview${params.size ? `?${params.toString()}` : ""}`;
}

function withoutDrawer(
  query: Record<string, string | string[] | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(query)) {
    const value = first(raw);
    if (value && key !== "selected" && key !== "tab") {
      params.set(key, value);
    }
  }
  return `/overview${params.size ? `?${params.toString()}` : ""}`;
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<
    Record<string, string | string[] | undefined>
  >;
}) {
  const [snapshot, query] = await Promise.all([
    getApplicationSnapshot(),
    searchParams,
  ]);
  const context = resolveApplicationReportContext(snapshot, query);
  const requestedNotice = readOverviewFlashNotice(query.notice);
  const normalizationNotice = flashNoticeForWarnings(context.warnings);
  const redirectQuery = canonicalOverviewQuery(query, context);
  const redirectNotice = normalizationNotice ?? requestedNotice;
  if (redirectNotice) {
    redirectQuery.notice = redirectNotice;
  } else {
    delete redirectQuery.notice;
  }
  const canonicalHref = overviewHref(redirectQuery);
  if (overviewHref(query) !== canonicalHref) {
    redirect(canonicalHref);
  }
  const canonicalQuery = { ...redirectQuery };
  delete canonicalQuery.notice;
  const campaignMetaId = first(canonicalQuery.campaign);
  const reportFilters = {
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
  };
  const periodDays =
    Math.round(
      (new Date(`${context.dateTo}T00:00:00.000Z`).getTime() -
        new Date(`${context.dateFrom}T00:00:00.000Z`).getTime()) /
        86_400_000,
    ) + 1;
  const previousDateTo = addReportDays(context.dateFrom, -1);
  const previousDateFrom = addReportDays(
    previousDateTo,
    -(periodDays - 1),
  );
  const [report, trend, previousDelivery, canonicalResults, liveDelivery] =
    await Promise.all([
    getCreativeRowsForReport(reportFilters),
    getOverviewTrendForReport(reportFilters),
    context.compare === "previous_period"
      ? getDeliveryForReport({
          ...reportFilters,
          dateFrom: previousDateFrom,
          dateTo: previousDateTo,
        })
      : Promise.resolve([]),
    getCanonicalResultsForReport({
      snapshot,
      context,
      ...(campaignMetaId
        ? { campaignMetaIds: [campaignMetaId] }
        : {}),
    }),
    getLiveDeliveryForReport({ snapshot, context }),
  ]);
  const previousCanonicalResults =
    context.compare === "previous_period"
      ? await getCanonicalResultsForReport({
          snapshot,
          context: {
            ...context,
            dateFrom: previousDateFrom,
            dateTo: previousDateTo,
          },
          ...(campaignMetaId
            ? { campaignMetaIds: [campaignMetaId] }
            : {}),
        })
      : null;
  const families = groupCreativeFamiliesForView(report.creatives);
  const selectedId = first(canonicalQuery.selected);
  const selected = selectedId
    ? families.find((family) => family.id === selectedId)
    : undefined;
  const connected =
    snapshot.demoMode ||
    (snapshot.authenticated &&
      snapshot.connection?.status === "connected");
  const resultMetrics = buildApplicationResultMetrics({
    context,
    delivery: report.delivery,
    definitions: canonicalResults.definitions,
    objectiveSpendByObjective:
      canonicalResults.objectiveSpendByObjective,
    periodReach: canonicalResults.periodReach,
    ...(canonicalResults.state === "demo_legacy_bridge"
      ? {}
      : { canonicalResults: canonicalResults.values }),
  });
  const previousResultMetrics = previousDelivery.length
    ? buildApplicationResultMetrics({
        context,
        delivery: previousDelivery,
        definitions:
          previousCanonicalResults?.definitions ??
          canonicalResults.definitions,
        objectiveSpendByObjective:
          previousCanonicalResults?.objectiveSpendByObjective ?? {},
        periodReach:
          previousCanonicalResults?.periodReach ?? null,
        ...(previousCanonicalResults?.state ===
        "demo_legacy_bridge"
          ? {}
          : {
              canonicalResults:
                previousCanonicalResults?.values ?? [],
            }),
      })
    : undefined;

  return (
    <OverviewV2
      dashboard={snapshot.dashboard}
      creatives={report.creatives}
      delivery={report.delivery}
      liveDelivery={liveDelivery}
      trend={trend}
      connected={connected}
      query={canonicalQuery}
      dateFrom={context.dateFrom}
      dateTo={context.dateTo}
      account={context.account}
      reportingCurrency={context.currency}
      currencyOptions={[
        ...new Set(
          snapshot.assets.flatMap((asset) =>
            asset.kind === "Ad Account" && asset.currency
              ? [asset.currency]
              : [],
          ),
        ),
      ]}
      compare={context.compareMode}
      accounts={snapshot.assets
        .filter((asset) => asset.kind === "Ad Account")
        .map((asset) => ({ id: asset.id, name: asset.name }))}
      freshness={formatFreshnessFields(
        snapshot.freshness,
        snapshot.settings.timezone,
      )}
      reportingBar={buildReportingBarModel(
        snapshot.reportingScope,
        context,
        {
          persistScope:
            !snapshot.demoMode &&
            snapshot.authenticated &&
            Boolean(snapshot.connection),
        },
        canonicalResults.definitions,
      )}
      resultMetrics={resultMetrics}
      previousResultMetrics={previousResultMetrics}
      reportWarnings={[
        ...new Set([
          ...(requestedNotice
            ? [OVERVIEW_FLASH_NOTICE_MESSAGES[requestedNotice]]
            : []),
          ...context.warnings.map(contextWarningMessage),
          ...(canonicalResults.warning
            ? [canonicalResults.warning]
            : []),
        ]),
      ]}
      selectedDrawer={
        selected ? (
          <EntityDrawer
            title={`Chi tiết ${selected.name}`}
            closeHref={withoutDrawer(canonicalQuery)}
            restoreFocusId={selected.id}
            width="wide"
          >
            <CreativeDrawerContent
              family={selected}
              query={canonicalQuery}
              resultMetrics={resultMetrics}
              originPathname="/overview"
            />
          </EntityDrawer>
        ) : null
      }
    />
  );
}
