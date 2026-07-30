import type {
  CanonicalCreativeFormat,
  CanonicalOperatingSystem,
  DataConfidence,
  RatingExplanation,
  RatingPrimaryMetric,
} from "@/types/view-models";
import type { CreativeRating } from "@/types/view-models";

import { deriveDataConfidence } from "@/lib/data-contract/data-confidence";

export type CreativeRatingInput = {
  installs: number;
  cpi: number | null;
  osBaselineCpi: number | null;
  minimumInstalls?: number;
};

export type RatingExplanationInput = CreativeRatingInput & {
  os: CanonicalOperatingSystem;
  format: CanonicalCreativeFormat;
  currency: string;
  windowDays: number;
  benchmarkSampleSize: number;
  primaryMetric?: RatingPrimaryMetric;
  coverageRatio?: number | null;
  hasRequiredMapping?: boolean;
  isStale?: boolean;
  isPartial?: boolean;
  confidence?: DataConfidence;
  additionalReasons?: readonly string[];
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

function finiteMetric(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}

function deltaPercent(
  actualValue: number | null,
  benchmarkValue: number | null,
): number | null {
  if (
    actualValue === null ||
    benchmarkValue === null ||
    benchmarkValue <= 0
  ) {
    return null;
  }
  return ((actualValue - benchmarkValue) / benchmarkValue) * 100;
}

function deltaReason(delta: number): string {
  const magnitude = Math.abs(delta).toLocaleString("vi-VN", {
    maximumFractionDigits: 1,
  });
  if (delta < 0) return `CPI tốt hơn benchmark ${magnitude}%`;
  if (delta > 0) return `CPI cao hơn benchmark ${magnitude}%`;
  return "CPI bằng benchmark";
}

/**
 * Adds an explainable V2 contract while preserving `rateCreativeCpi` and its
 * legacy thresholds for existing consumers.
 */
export function explainCreativeRating({
  installs,
  cpi,
  osBaselineCpi,
  minimumInstalls = 20,
  os,
  format,
  currency,
  windowDays,
  benchmarkSampleSize,
  primaryMetric = "cpi",
  coverageRatio = 1,
  hasRequiredMapping = true,
  isStale = false,
  isPartial = false,
  confidence: providedConfidence,
  additionalReasons = [],
}: RatingExplanationInput): RatingExplanation {
  const rating = rateCreativeCpi({
    installs,
    cpi,
    osBaselineCpi,
    minimumInstalls,
  });
  const actualValue = finiteMetric(cpi);
  const benchmarkValue = finiteMetric(osBaselineCpi);
  const delta = deltaPercent(actualValue, benchmarkValue);
  const confidence =
    providedConfidence ??
    deriveDataConfidence({
      coverageRatio,
      sampleSize: installs,
      minimumSampleSize: minimumInstalls,
      hasRequiredMapping,
      isStale,
      isPartial,
    });

  const statusAndAction: Pick<
    RatingExplanation,
    "performanceStatus" | "recommendedAction"
  > =
    rating === "TỐT"
      ? { performanceStatus: "good", recommendedAction: "scale" }
      : rating === "ỔN"
        ? { performanceStatus: "within_range", recommendedAction: "hold" }
        : rating === "ÍT DỮ LIỆU"
          ? {
              performanceStatus: "watch",
              recommendedAction: "continue_test",
            }
          : { performanceStatus: "poor", recommendedAction: "review" };

  const reasons: string[] = [];
  if (installs <= 0) {
    reasons.push("Chưa ghi nhận lượt cài đặt trong kỳ");
  } else if (installs < minimumInstalls) {
    reasons.push(
      `Mới có ${installs.toLocaleString("vi-VN")} lượt cài đặt, cần tối thiểu ${minimumInstalls.toLocaleString("vi-VN")}`,
    );
  } else if (delta !== null) {
    reasons.push(deltaReason(delta));
  } else {
    reasons.push("Chưa có benchmark CPI hợp lệ để so sánh");
  }

  reasons.push(
    ...additionalReasons.map((reason) => reason.trim()).filter(Boolean),
  );

  return {
    rating,
    ...statusAndAction,
    primaryMetric,
    actualValue,
    benchmarkValue,
    deltaPercent: delta,
    benchmarkScope: {
      os,
      format,
      currency: currency.trim().toUpperCase(),
      windowDays: Math.max(1, Math.floor(windowDays)),
      sampleSize: Math.max(0, Math.floor(benchmarkSampleSize)),
    },
    thresholds: {
      minimumSampleSize: minimumInstalls,
      goodMaxRatio: 0.8,
      withinRangeMaxRatio: 1.2,
    },
    reasons,
    confidence,
  };
}

export type BaselineRow = {
  operatingSystem: "ANDROID" | "IOS" | "UNKNOWN";
  currency: string;
  spend: number;
  installs: number;
};

export type ScopedBaselineRow = BaselineRow & {
  format: CanonicalCreativeFormat;
};

export function baselineKey(
  operatingSystem: BaselineRow["operatingSystem"],
  currency: string,
) {
  return `${operatingSystem}:${currency.toUpperCase()}`;
}

export function scopedBaselineKey(
  operatingSystem: BaselineRow["operatingSystem"],
  format: CanonicalCreativeFormat,
  currency: string,
) {
  return `${operatingSystem}:${format}:${currency.toUpperCase()}`;
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

/**
 * V2 benchmark grouping. OS, physical format, and currency are all part of the
 * key so incomparable cohorts are never silently combined.
 */
export function computeScopedCpiBaselines(
  rows: readonly ScopedBaselineRow[],
): Map<string, number | null> {
  const totals = new Map<string, { spend: number; installs: number }>();

  for (const row of rows) {
    const key = scopedBaselineKey(
      row.operatingSystem,
      row.format,
      row.currency,
    );
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
