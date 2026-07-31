import type {
  CreativePerformanceSummary,
  CreativePlatform,
  CreativeRow,
  EntityLink,
} from "@/types/view-models";

export type CreativeFamilyViewItem = {
  id: string;
  name: string;
  assetKey: string;
  aliases: string[];
  format: CreativeRow["format"];
  platforms: CreativePlatform[];
  imageUrl: string;
  duration: string | null;
  ratio: string | null;
  pageName: string | null;
  adCount: number;
  activeAdCount: number;
  readiness: CreativeRow["readiness"];
  performance: CreativePerformanceSummary | null;
  currencies: string[];
  entityLinks: CreativeRow["entityLinks"];
};

function familyId(row: CreativeRow) {
  return row.creativeFamilyId ?? `cf_${row.id.split(":")[0]}`;
}

function unique(values: readonly string[]) {
  return [...new Set(values.filter(Boolean))];
}

function mergeEntityLinks(
  items: readonly CreativeRow[],
): EntityLink | undefined {
  const links = items.flatMap((item) =>
    item.entityLinks ? [item.entityLinks] : [],
  );
  if (!links.length) return undefined;
  return {
    creativeFamilyId: links[0].creativeFamilyId,
    assetId: links[0].assetId,
    metaCreativeIds: unique(
      links.flatMap((link) => link.metaCreativeIds),
    ),
    adIds: unique(links.flatMap((link) => link.adIds)),
    campaignIds: unique(
      links.flatMap((link) => link.campaignIds),
    ),
    adAccountIds: unique(
      links.flatMap((link) => link.adAccountIds),
    ),
    pageIds: unique(links.flatMap((link) => link.pageIds)),
  };
}

function familyAdCounts(
  items: readonly CreativeRow[],
  entityLinks: EntityLink | undefined,
) {
  if (!entityLinks?.adIds.length) {
    return {
      adCount: Math.max(0, ...items.map((item) => item.linkCount)),
      activeAdCount: Math.max(
        0,
        ...items.map((item) => item.activeAdCount),
      ),
    };
  }
  const activeByUsageSet = new Map<string, number>();
  for (const item of items) {
    const key = item.entityLinks?.adIds
      .slice()
      .sort()
      .join("\u001f");
    if (!key) continue;
    activeByUsageSet.set(
      key,
      Math.max(
        activeByUsageSet.get(key) ?? 0,
        item.activeAdCount,
      ),
    );
  }
  return {
    adCount: entityLinks.adIds.length,
    activeAdCount: Math.min(
      entityLinks.adIds.length,
      [...activeByUsageSet.values()].reduce(
        (sum, count) => sum + count,
        0,
      ),
    ),
  };
}

function sumPerformance(
  items: readonly CreativePerformanceSummary[],
): CreativePerformanceSummary | null {
  if (!items.length) return null;
  const spend = items.reduce((sum, item) => sum + item.spend, 0);
  const impressions = items.reduce(
    (sum, item) => sum + item.impressions,
    0,
  );
  const installs = items.reduce(
    (sum, item) => sum + item.installs,
    0,
  );
  const registrations = items.reduce(
    (sum, item) => sum + item.registrations,
    0,
  );
  const clicks = items.reduce(
    (sum, item) =>
      sum +
      (item.linkCtr === null
        ? 0
        : (item.linkCtr / 100) * item.impressions),
    0,
  );
  const video3s = items.reduce(
    (sum, item) =>
      sum +
      (item.hookRate === null
        ? 0
        : (item.hookRate / 100) * item.impressions),
    0,
  );
  const video100 = items.reduce(
    (sum, item) =>
      sum +
      (item.holdRate === null
        ? 0
        : (item.holdRate / 100) *
          (item.hookRate === null
            ? 0
            : (item.hookRate / 100) * item.impressions)),
    0,
  );
  const leading = items.reduce((current, item) =>
    item.spend > current.spend ? item : current,
  );
  const hasCanonicalResultValues = items.some(
    (item) => item.resultValues !== undefined,
  );
  const resultKeys = new Set(
    items.flatMap((item) => Object.keys(item.resultValues ?? {})),
  );
  const resultValues = hasCanonicalResultValues
    ? Object.fromEntries(
        [...resultKeys].map((key) => {
          const values = items.flatMap((item) => {
            const value = item.resultValues?.[key];
            return typeof value === "number" &&
              Number.isFinite(value)
              ? [value]
              : [];
          });
          return [
            key,
            values.length
              ? values.reduce((sum, value) => sum + value, 0)
              : null,
          ];
        }),
      )
    : undefined;
  const evaluation =
    items.find((item) => item.evaluation)?.evaluation ?? null;

  return {
    ...leading,
    spend,
    impressions,
    dailyReachSum: items.reduce(
      (sum, item) => sum + item.dailyReachSum,
      0,
    ),
    linkCtr: impressions > 0 ? (clicks / impressions) * 100 : null,
    installs,
    registrations,
    cpi: installs > 0 ? spend / installs : null,
    costPerRegistration:
      registrations > 0 ? spend / registrations : null,
    hookRate: impressions > 0 ? (video3s / impressions) * 100 : null,
    holdRate: video3s > 0 ? (video100 / video3s) * 100 : null,
    ...(resultValues === undefined ? {} : { resultValues }),
    evaluation,
  };
}

export function groupCreativeFamiliesForView(
  rows: readonly CreativeRow[],
): CreativeFamilyViewItem[] {
  const grouped = new Map<string, CreativeRow[]>();
  for (const row of rows) {
    const id = familyId(row);
    grouped.set(id, [...(grouped.get(id) ?? []), row]);
  }

  return [...grouped].map(([id, items]) => {
    const base = items[0];
    const performanceRows = items.flatMap((item) =>
      item.performance ? [item.performance] : [],
    );
    const byCurrency = new Map<
      string,
      CreativePerformanceSummary[]
    >();
    for (const performance of performanceRows) {
      byCurrency.set(performance.currency, [
        ...(byCurrency.get(performance.currency) ?? []),
        performance,
      ]);
    }
    const selectedCurrency =
      byCurrency.size === 1
        ? [...byCurrency.entries()][0]
        : undefined;
    const entityLinks = mergeEntityLinks(items);
    const { adCount, activeAdCount } = familyAdCounts(
      items,
      entityLinks,
    );

    return {
      id,
      name: base.aliases[0] ?? base.name,
      assetKey: base.assetKey,
      aliases: [...new Set(items.flatMap((item) => item.aliases))],
      format: base.format,
      platforms: [...new Set(items.map((item) => item.platform))],
      imageUrl: base.imageUrl,
      duration: base.duration,
      ratio: base.ratio,
      pageName: base.pageName,
      adCount,
      activeAdCount,
      readiness: base.readiness,
      performance: selectedCurrency
        ? sumPerformance(selectedCurrency[1])
        : null,
      currencies: [...byCurrency.keys()],
      entityLinks,
    };
  });
}
