import type { CreativeRating } from "@/types/view-models";

export type CreativeRatingInput = {
  installs: number;
  cpi: number | null;
  osBaselineCpi: number | null;
  minimumInstalls?: number;
};

/**
 * Mirrors TRACKER_CREATIVE_ DAY CUSTOME.
 *
 * A row without delivery should not call this function; the UI keeps the
 * performance state locked instead. Once an Insights row exists, zero installs
 * is explicitly classified as KHÔNG INSTALL.
 */
export function rateCreativeCpi({
  installs,
  cpi,
  osBaselineCpi,
  minimumInstalls = 20,
}: CreativeRatingInput): CreativeRating {
  if (installs <= 0) return "KHÔNG INSTALL";
  if (installs < minimumInstalls) return "ÍT DỮ LIỆU";

  if (
    cpi === null ||
    osBaselineCpi === null ||
    !Number.isFinite(cpi) ||
    !Number.isFinite(osBaselineCpi) ||
    osBaselineCpi <= 0
  ) {
    return "ÍT DỮ LIỆU";
  }

  if (cpi <= osBaselineCpi * 0.8) return "TỐT";
  if (cpi <= osBaselineCpi * 1.2) return "ỔN";
  return "KÉM";
}

export type BaselineRow = {
  operatingSystem: "ANDROID" | "IOS" | "UNKNOWN";
  currency: string;
  spend: number;
  installs: number;
};

export function baselineKey(
  operatingSystem: BaselineRow["operatingSystem"],
  currency: string,
) {
  return `${operatingSystem}:${currency.toUpperCase()}`;
}

/**
 * Currency is part of the key: money from different currencies is never
 * silently summed. UNKNOWN OS remains a separate benchmark.
 */
export function computeOsCpiBaselines(
  rows: readonly BaselineRow[],
): Map<string, number | null> {
  const totals = new Map<string, { spend: number; installs: number }>();

  for (const row of rows) {
    const key = baselineKey(row.operatingSystem, row.currency);
    const current = totals.get(key) ?? { spend: 0, installs: 0 };
    current.spend += Number.isFinite(row.spend) ? Math.max(row.spend, 0) : 0;
    current.installs += Number.isFinite(row.installs)
      ? Math.max(row.installs, 0)
      : 0;
    totals.set(key, current);
  }

  return new Map(
    [...totals].map(([key, value]) => [
      key,
      value.installs > 0 ? value.spend / value.installs : null,
    ]),
  );
}
