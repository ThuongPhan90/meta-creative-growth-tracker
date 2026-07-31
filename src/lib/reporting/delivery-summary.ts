export type DeliveryMetricRow = {
  currency: string;
  spend: number;
  impressions: number;
  linkClicks: number;
  installs: number;
  registrations: number;
  video3sViews: number;
  video100Views: number;
};

export type DeliveryCurrencySummary = DeliveryMetricRow & {
  cpi: number | null;
  costPerRegistration: number | null;
  linkCtr: number | null;
  hookRate: number | null;
  holdRate: number | null;
};

export type DeliverySummary = {
  currencyMode: "single" | "split";
  byCurrency: DeliveryCurrencySummary[];
  singleCurrency: DeliveryCurrencySummary | null;
  installs: number;
  registrations: number;
};

function finiteNonNegative(value: number) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

function cost(spend: number, result: number) {
  return result > 0 ? spend / result : null;
}

/**
 * Canonical presentation aggregation for delivery totals.
 *
 * Monetary values stay grouped by account currency. Result counts may be
 * summed because they retain one semantic definition, but Spend and
 * Cost/Result are exposed as a single total only when exactly one currency is
 * present. This prevents consumers from choosing the numerically largest
 * currency or silently adding incompatible monetary units.
 */
export function summarizeDelivery(
  rows: readonly DeliveryMetricRow[],
): DeliverySummary {
  const grouped = new Map<string, DeliveryMetricRow>();

  for (const row of rows) {
    const currency = row.currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) continue;
    const current = grouped.get(currency) ?? {
      currency,
      spend: 0,
      impressions: 0,
      linkClicks: 0,
      installs: 0,
      registrations: 0,
      video3sViews: 0,
      video100Views: 0,
    };
    current.spend += finiteNonNegative(row.spend);
    current.impressions += finiteNonNegative(row.impressions);
    current.linkClicks += finiteNonNegative(row.linkClicks);
    current.installs += finiteNonNegative(row.installs);
    current.registrations += finiteNonNegative(row.registrations);
    current.video3sViews += finiteNonNegative(row.video3sViews);
    current.video100Views += finiteNonNegative(row.video100Views);
    grouped.set(currency, current);
  }

  const byCurrency = [...grouped.values()]
    .sort((left, right) => left.currency.localeCompare(right.currency))
    .map(
      (row): DeliveryCurrencySummary => ({
        ...row,
        cpi: cost(row.spend, row.installs),
        costPerRegistration: cost(row.spend, row.registrations),
        linkCtr: rate(row.linkClicks, row.impressions),
        hookRate: rate(row.video3sViews, row.impressions),
        holdRate: rate(row.video100Views, row.video3sViews),
      }),
    );

  return {
    currencyMode: byCurrency.length <= 1 ? "single" : "split",
    byCurrency,
    singleCurrency: byCurrency.length === 1 ? byCurrency[0] : null,
    installs: byCurrency.reduce((sum, row) => sum + row.installs, 0),
    registrations: byCurrency.reduce(
      (sum, row) => sum + row.registrations,
      0,
    ),
  };
}
