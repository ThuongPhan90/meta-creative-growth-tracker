import "server-only";

import { Suspense } from "react";

import {
  CreativeDrawerContent,
  groupCreativeFamiliesForView,
} from "@/components/creative-performance-v2";
import { EntityDrawer } from "@/components/ui/entity-drawer";
import {
  buildApplicationResultMetrics,
  getApplicationContextSnapshot,
  getCanonicalResultsForReport,
  getCreativeRowsForReport,
  getDeliveryForReport,
  getLiveDeliveryForReport,
  getMetaBreakdownForReport,
  getOverviewTrendForReport,
  resolveApplicationReportContext,
} from "@/lib/app-data";
import { buildReportingBarModel } from "@/lib/presentation/reporting-bar";

import { CreativeWatchlistV3 } from "./creative-watchlist";
import { buildOverviewCreativeWatchlistModel } from "./creative-watchlist-model";
import { DataQualityCompactV3 } from "./data-quality-compact";
import { LiveDeliveryStripV3 } from "./live-delivery-strip";
import { MetaBreakdownV3 } from "./meta-breakdown";
import {
  OverviewBreakdownSkeleton,
  OverviewCoreSkeleton,
  OverviewCreativeSkeleton,
  OverviewDataQualitySkeleton,
  OverviewLiveDeliverySkeleton,
} from "./overview-loading";
import { OverviewMetricsV3 } from "./overview-metrics";
import type { OverviewV3Query } from "./types";

type OverviewSnapshot = Awaited<
  ReturnType<typeof getApplicationContextSnapshot>
>;
type OverviewContext = ReturnType<
  typeof resolveApplicationReportContext
>;
type CreativeReportFilters = Parameters<
  typeof getCreativeRowsForReport
>[0];

function loadOverviewV3Core({
  snapshot,
  context,
  reportFilters,
  campaignMetaId,
  previousDateFrom,
  previousDateTo,
}: {
  snapshot: OverviewSnapshot;
  context: OverviewContext;
  reportFilters: CreativeReportFilters;
  campaignMetaId?: string;
  previousDateFrom: string;
  previousDateTo: string;
}) {
  const canonicalResultsPromise = getCanonicalResultsForReport({
    snapshot,
    context,
    ...(campaignMetaId
      ? { campaignMetaIds: [campaignMetaId] }
      : {}),
  });
  const previousCanonicalResultsPromise =
    context.compare === "previous_period"
      ? getCanonicalResultsForReport({
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
      : Promise.resolve(null);

  return Promise.all([
    getDeliveryForReport(reportFilters),
    getOverviewTrendForReport(reportFilters),
    context.compare === "previous_period"
      ? getDeliveryForReport({
          ...reportFilters,
          dateFrom: previousDateFrom,
          dateTo: previousDateTo,
        })
      : Promise.resolve([]),
    canonicalResultsPromise,
    previousCanonicalResultsPromise,
  ]).then(
    ([
      delivery,
      trend,
      previousDelivery,
      canonicalResults,
      previousCanonicalResults,
    ]) => ({
      delivery,
      trend,
      previousDelivery,
      canonicalResults,
      previousCanonicalResults,
    }),
  );
}

async function OverviewV3LiveDeliverySection({
  liveDeliveryPromise,
  query,
}: {
  liveDeliveryPromise: ReturnType<typeof getLiveDeliveryForReport>;
  query: OverviewV3Query;
}) {
  const liveDelivery = await liveDeliveryPromise;
  return <LiveDeliveryStripV3 summary={liveDelivery} query={query} />;
}

async function OverviewV3MetaBreakdownSection({
  metaBreakdownPromise,
}: {
  metaBreakdownPromise: ReturnType<
    typeof getMetaBreakdownForReport
  >;
}) {
  const metaBreakdown = await metaBreakdownPromise;
  return <MetaBreakdownV3 model={metaBreakdown} />;
}

async function OverviewV3DataQualitySection({
  liveDeliveryPromise,
  warnings,
  query,
}: {
  liveDeliveryPromise: ReturnType<typeof getLiveDeliveryForReport>;
  warnings: readonly string[];
  query: OverviewV3Query;
}) {
  const liveDelivery = await liveDeliveryPromise;
  return (
    <DataQualityCompactV3
      warnings={warnings}
      liveDelivery={liveDelivery}
      query={query}
    />
  );
}

async function OverviewV3CreativeSection({
  creativePromise,
  canonicalQuery,
  reportingBar,
  resultDefinitions,
  reportingCurrency,
  resultMetrics,
  drawerCloseHref,
}: {
  creativePromise: ReturnType<typeof getCreativeRowsForReport>;
  canonicalQuery: OverviewV3Query;
  reportingBar: ReturnType<typeof buildReportingBarModel>;
  resultDefinitions: Awaited<
    ReturnType<typeof getCanonicalResultsForReport>
  >["definitions"];
  reportingCurrency: string;
  resultMetrics: ReturnType<typeof buildApplicationResultMetrics>;
  drawerCloseHref: string;
}) {
  const report = await creativePromise;
  const families = groupCreativeFamiliesForView(report.creatives);
  const selectedRaw = canonicalQuery.selected;
  const selectedId = Array.isArray(selectedRaw)
    ? selectedRaw[0]
    : selectedRaw;
  const selected = selectedId
    ? families.find((family) => family.id === selectedId)
    : undefined;

  return (
    <>
      <CreativeWatchlistV3
        model={buildOverviewCreativeWatchlistModel({
          creatives: report.creatives,
          objectiveKey: reportingBar.objective,
          resultKey: reportingBar.result,
          resultDefinitions,
          currency: reportingCurrency,
        })}
        query={canonicalQuery}
      />
      {selected ? (
        <EntityDrawer
          title={`Chi tiết ${selected.name}`}
          closeHref={drawerCloseHref}
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
      ) : null}
    </>
  );
}

async function OverviewV3CoreSection({
  corePromise,
  liveDeliveryPromise,
  snapshot,
  context,
  reportFilters,
  campaignMetaId,
  canonicalQuery,
  reportingBar,
  baseWarnings,
  currencyOptions,
  drawerCloseHref,
}: {
  corePromise: ReturnType<typeof loadOverviewV3Core>;
  liveDeliveryPromise: ReturnType<typeof getLiveDeliveryForReport>;
  snapshot: OverviewSnapshot;
  context: OverviewContext;
  reportFilters: CreativeReportFilters;
  campaignMetaId?: string;
  canonicalQuery: OverviewV3Query;
  reportingBar: ReturnType<typeof buildReportingBarModel>;
  baseWarnings: readonly string[];
  currencyOptions: string[];
  drawerCloseHref: string;
}) {
  const core = await corePromise;
  const resultMetrics = buildApplicationResultMetrics({
    context,
    delivery: core.delivery,
    definitions: core.canonicalResults.definitions,
    objectiveSpendByObjective:
      core.canonicalResults.objectiveSpendByObjective,
    periodReach: core.canonicalResults.periodReach,
    ...(core.canonicalResults.state === "demo_legacy_bridge"
      ? {}
      : { canonicalResults: core.canonicalResults.values }),
  });
  const previousResultMetrics = core.previousDelivery.length
    ? buildApplicationResultMetrics({
        context,
        delivery: core.previousDelivery,
        definitions:
          core.previousCanonicalResults?.definitions ??
          core.canonicalResults.definitions,
        objectiveSpendByObjective:
          core.previousCanonicalResults?.objectiveSpendByObjective ??
          {},
        periodReach:
          core.previousCanonicalResults?.periodReach ?? null,
        ...(core.previousCanonicalResults?.state ===
        "demo_legacy_bridge"
          ? {}
          : {
              canonicalResults:
                core.previousCanonicalResults?.values ?? [],
            }),
      })
    : undefined;
  const allWarnings = [
    ...new Set([
      ...baseWarnings,
      ...(core.canonicalResults.warning
        ? [core.canonicalResults.warning]
        : []),
    ]),
  ];
  const deferredWarnings = allWarnings.filter(
    (warning) => !baseWarnings.includes(warning),
  );

  // This call deliberately occurs only after the core promise resolves. The
  // current delivery rows are reused so Creative cannot repeat that query.
  const creativePromise = getCreativeRowsForReport({
    ...reportFilters,
    preloadedDelivery: core.delivery,
  });
  const metaBreakdownPromise = getMetaBreakdownForReport({
    snapshot,
    context,
    ...(campaignMetaId ? { campaignMetaId } : {}),
  });

  return (
    <OverviewMetricsV3
      trend={core.trend}
      reportingCurrency={context.currency}
      currencyOptions={currencyOptions}
      compare={context.compareMode}
      reportingBar={reportingBar}
      resultMetrics={resultMetrics}
      previousResultMetrics={previousResultMetrics}
      metricDisplayPresets={snapshot.settings.metricDisplayPresets}
      settingsUpdatedAt={snapshot.settings.updatedAt}
      resultDefinitions={core.canonicalResults.definitions}
      reportWarnings={deferredWarnings}
      creativeSlot={
        <Suspense fallback={<OverviewCreativeSkeleton />}>
          <OverviewV3CreativeSection
            creativePromise={creativePromise}
            canonicalQuery={canonicalQuery}
            reportingBar={reportingBar}
            resultDefinitions={core.canonicalResults.definitions}
            reportingCurrency={context.currency}
            resultMetrics={resultMetrics}
            drawerCloseHref={drawerCloseHref}
          />
        </Suspense>
      }
      metaBreakdownSlot={
        <Suspense fallback={<OverviewBreakdownSkeleton />}>
          <OverviewV3MetaBreakdownSection
            metaBreakdownPromise={metaBreakdownPromise}
          />
        </Suspense>
      }
      dataQualitySlot={
        <Suspense fallback={<OverviewDataQualitySkeleton />}>
          <OverviewV3DataQualitySection
            liveDeliveryPromise={liveDeliveryPromise}
            warnings={allWarnings}
            query={canonicalQuery}
          />
        </Suspense>
      }
    />
  );
}

/**
 * Starts only the V3 core/live reads, then returns stable Suspense boundaries.
 * Creative and breakdown reads remain gated behind the core section.
 */
export function buildOverviewV3ServerSlots({
  snapshot,
  context,
  reportFilters,
  campaignMetaId,
  previousDateFrom,
  previousDateTo,
  canonicalQuery,
  reportingBar,
  baseWarnings,
  currencyOptions,
  drawerCloseHref,
}: {
  snapshot: OverviewSnapshot;
  context: OverviewContext;
  reportFilters: CreativeReportFilters;
  campaignMetaId?: string;
  previousDateFrom: string;
  previousDateTo: string;
  canonicalQuery: OverviewV3Query;
  reportingBar: ReturnType<typeof buildReportingBarModel>;
  baseWarnings: readonly string[];
  currencyOptions: string[];
  drawerCloseHref: string;
}) {
  const liveDeliveryPromise = getLiveDeliveryForReport({
    snapshot,
    context,
  });
  const corePromise = loadOverviewV3Core({
    snapshot,
    context,
    reportFilters,
    campaignMetaId,
    previousDateFrom,
    previousDateTo,
  });

  return {
    liveDeliverySlot: (
      <Suspense fallback={<OverviewLiveDeliverySkeleton />}>
        <OverviewV3LiveDeliverySection
          liveDeliveryPromise={liveDeliveryPromise}
          query={canonicalQuery}
        />
      </Suspense>
    ),
    coreSlot: (
      <Suspense fallback={<OverviewCoreSkeleton />}>
        <OverviewV3CoreSection
          corePromise={corePromise}
          liveDeliveryPromise={liveDeliveryPromise}
          snapshot={snapshot}
          context={context}
          reportFilters={reportFilters}
          campaignMetaId={campaignMetaId}
          canonicalQuery={canonicalQuery}
          reportingBar={reportingBar}
          baseWarnings={baseWarnings}
          currencyOptions={currencyOptions}
          drawerCloseHref={drawerCloseHref}
        />
      </Suspense>
    ),
  };
}
