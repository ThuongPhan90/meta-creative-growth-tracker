import { groupCreativeFamiliesForView } from "@/lib/presentation/creative-family-view";
import {
  buildCreativeWatchlist,
  filterCreativeWatchlist,
  type CreativeWatchlistDataStatus,
  type CreativeWatchlistItem,
  type CreativeWatchlistView,
  type ResultDefinition,
} from "@/lib/reporting";
import type { CreativeRow } from "@/types/view-models";

export const OVERVIEW_WATCHLIST_VIEWS = [
  "priority",
  "running",
  "insufficient",
  "all",
] as const satisfies readonly CreativeWatchlistView[];

export type OverviewWatchlistView =
  (typeof OVERVIEW_WATCHLIST_VIEWS)[number];

export type OverviewWatchlistItem = CreativeWatchlistItem & {
  name: string;
  format: string;
  thumbnailUrl: string;
  adCount: number;
};

export type OverviewCreativeWatchlistModel = {
  canEvaluate: boolean;
  resultLabel: string;
  /** At most 20 unique, serializable items: five candidates per UI view. */
  items: readonly OverviewWatchlistItem[];
  itemIdsByView: Record<OverviewWatchlistView, readonly string[]>;
};

const ITEMS_PER_VIEW = 5;

function emptyIdsByView(): OverviewCreativeWatchlistModel["itemIdsByView"] {
  return {
    priority: [],
    running: [],
    insufficient: [],
    all: [],
  };
}

function emptyModel(
  resultLabel = "Kết quả",
): OverviewCreativeWatchlistModel {
  return {
    canEvaluate: false,
    resultLabel,
    items: [],
    itemIdsByView: emptyIdsByView(),
  };
}

/**
 * Ranks the complete server-side Creative scope, then compacts it to the five
 * highest-ranked candidates needed by each existing Watchlist view. The
 * browser never receives the complete CreativeRow collection.
 */
export function buildOverviewCreativeWatchlistModel({
  creatives,
  objectiveKey,
  resultKey,
  resultDefinitions,
  currency,
}: {
  creatives: readonly CreativeRow[];
  objectiveKey: string;
  resultKey?: string;
  resultDefinitions: readonly ResultDefinition[];
  currency: string;
}): OverviewCreativeWatchlistModel {
  const resultDefinition = resultDefinitions.find(
    (definition) =>
      definition.enabled && definition.canonicalKey === resultKey,
  );
  const selectedCurrency = currency.trim().toUpperCase();
  if (
    !resultKey ||
    !resultDefinition ||
    objectiveKey === "all" ||
    !selectedCurrency
  ) {
    return emptyModel(resultDefinition?.shortLabel);
  }

  const families = groupCreativeFamiliesForView(creatives);
  const familyById = new Map(
    families.map((family) => [family.id, family]),
  );
  const candidates = families.flatMap((family) => {
    const performance = family.performance;
    const evaluation =
      performance?.evaluation?.resultKey === resultKey
        ? performance.evaluation
        : null;
    const dataStatus = performance?.confidence?.dataStatus;
    const performanceCurrency = performance?.currency
      .trim()
      .toUpperCase();
    if (!performance || !performanceCurrency || !dataStatus) return [];
    if (performanceCurrency !== selectedCurrency) return [];

    const primaryResults = performance.resultValues?.[resultKey] ?? null;
    const costPerResult =
      evaluation?.metricKey === "cost_per_result"
        ? evaluation.actualValue
        : primaryResults !== null && primaryResults > 0
          ? performance.spend / primaryResults
          : null;
    const benchmarkCostPerResult =
      evaluation?.metricKey === "cost_per_result"
        ? evaluation.benchmarkValue
        : null;

    return [
      {
        creativeId: family.id,
        objectiveKey,
        resultKey,
        currency: performanceCurrency,
        activeAds: family.activeAdCount,
        spend: performance.spend,
        impressions: performance.impressions,
        primaryResults,
        costPerResult,
        benchmarkCostPerResult,
        dataStatus: dataStatus as CreativeWatchlistDataStatus,
        fatigueStatus: evaluation?.fatigueStatus ?? "insufficient",
      },
    ];
  });
  const ranked =
    buildCreativeWatchlist(candidates, {
      minimumImpressions: resultDefinition.minimumImpressions,
      minimumResults: resultDefinition.minimumResults,
    }).find(
      (group) =>
        group.objectiveKey === objectiveKey &&
        group.resultKey === resultKey &&
        group.currency === selectedCurrency,
    )?.items ?? [];

  const idsForView = (view: OverviewWatchlistView) =>
    filterCreativeWatchlist(ranked, view)
      .slice(0, ITEMS_PER_VIEW)
      .map((item) => item.creativeId);
  const itemIdsByView: OverviewCreativeWatchlistModel["itemIdsByView"] = {
    priority: idsForView("priority"),
    running: idsForView("running"),
    insufficient: idsForView("insufficient"),
    all: idsForView("all"),
  };
  const selectedIds = new Set(Object.values(itemIdsByView).flat());
  const items = ranked.flatMap((item): OverviewWatchlistItem[] => {
    if (!selectedIds.has(item.creativeId)) return [];
    const family = familyById.get(item.creativeId);
    if (!family) return [];
    return [
      {
        ...item,
        name: family.name,
        format: family.format,
        thumbnailUrl: family.imageUrl,
        adCount: family.adCount,
      },
    ];
  });

  return {
    canEvaluate: true,
    resultLabel: resultDefinition.shortLabel,
    items,
    itemIdsByView,
  };
}
