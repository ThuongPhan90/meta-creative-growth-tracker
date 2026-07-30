import type { DataConfidence } from "@/types/view-models";

export type DataConfidenceInput = {
  coverageRatio: number | null;
  sampleSize: number;
  minimumSampleSize: number;
  hasRequiredMapping?: boolean;
  isStale?: boolean;
  isPartial?: boolean;
  readyCoverageRatio?: number;
  mediumCoverageRatio?: number;
};

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function normalizedCoverage(value: number | null): number {
  if (value === null || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Applies one deterministic precedence order so the same response cannot be
 * simultaneously presented as ready and stale/missing.
 */
export function deriveDataConfidence({
  coverageRatio,
  sampleSize,
  minimumSampleSize,
  hasRequiredMapping = true,
  isStale = false,
  isPartial = false,
  readyCoverageRatio = 0.95,
  mediumCoverageRatio = 0.8,
}: DataConfidenceInput): DataConfidence {
  const coverage = normalizedCoverage(coverageRatio);
  const sample = finiteNonNegative(sampleSize);
  const threshold = finiteNonNegative(minimumSampleSize);
  const minimumThresholdMet = sample >= threshold;

  if (!hasRequiredMapping) {
    return {
      dataStatus: "missing_mapping",
      confidence: "low",
      coverageRatio: coverage,
      minimumThresholdMet,
      reasonCodes: ["required_mapping_missing"],
    };
  }

  if (isStale) {
    return {
      dataStatus: "stale",
      confidence: "low",
      coverageRatio: coverage,
      minimumThresholdMet,
      reasonCodes: ["data_stale"],
    };
  }

  if (!minimumThresholdMet) {
    return {
      dataStatus: "insufficient",
      confidence: "low",
      coverageRatio: coverage,
      minimumThresholdMet: false,
      reasonCodes: ["minimum_sample_not_met"],
    };
  }

  if (isPartial || coverage < readyCoverageRatio) {
    return {
      dataStatus: "partial",
      confidence: coverage >= mediumCoverageRatio ? "medium" : "low",
      coverageRatio: coverage,
      minimumThresholdMet: true,
      reasonCodes: [
        isPartial ? "source_reported_partial" : "coverage_below_ready",
      ],
    };
  }

  return {
    dataStatus: "ready",
    confidence: "high",
    coverageRatio: coverage,
    minimumThresholdMet: true,
    reasonCodes: [],
  };
}
