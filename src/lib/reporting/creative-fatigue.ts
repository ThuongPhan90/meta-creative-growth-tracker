/**
 * Pure V3 fatigue evaluation.
 *
 * The caller is responsible for providing two adjacent, equally sized report
 * windows and deciding what its minimum sample is. This module deliberately
 * does not infer missing metrics from lower-grain data: an incomplete input
 * fails closed as `insufficient`.
 */

export const CREATIVE_FATIGUE_DEFAULT_WINDOW_DAYS = 7;

export const CREATIVE_FATIGUE_THRESHOLDS = {
  frequencyIncreasePercent: 20,
  linkCtrDecreasePercent: 15,
  costPerResultIncreasePercent: 20,
  resultVolumeDecreasePercent: 20,
} as const;

export type CreativeFatigueStatus =
  | "stable"
  | "monitor"
  | "fatigue_risk"
  | "insufficient";

export type CreativeFatigueMetric =
  | "frequency"
  | "link_ctr"
  | "cost_per_result"
  | "result_volume";

export type CreativeFatigueReason =
  | "window_days_mismatch"
  | "minimum_sample_not_met"
  | "metric_input_missing"
  | "previous_value_zero";

export type CreativeFatigueWindow = {
  /** Inclusive calendar days represented by this window. V5 defaults to 7. */
  days: number;
  /** Resolved by the reporting layer from its configured minimum sample. */
  minimumSampleMet: boolean;
  frequency: number | null | undefined;
  linkCtr: number | null | undefined;
  costPerResult: number | null | undefined;
  resultVolume: number | null | undefined;
};

export type CreativeFatigueInput = {
  previous: CreativeFatigueWindow;
  recent: CreativeFatigueWindow;
};

export type CreativeFatigueSignal = {
  metric: CreativeFatigueMetric;
  /** `(recent - previous) / previous * 100`; null when it is not safe. */
  deltaPercent: number | null;
  /** Absolute V5 threshold; direction is encoded by the metric. */
  thresholdPercent: number;
  /** Null means the signal cannot be evaluated safely. */
  adverse: boolean | null;
};

export type CreativeFatigueResult = {
  status: CreativeFatigueStatus;
  windowDays: number | null;
  adverseSignalCount: number;
  signals: readonly CreativeFatigueSignal[];
  reasonCodes: readonly CreativeFatigueReason[];
};

type SignalDefinition = {
  metric: CreativeFatigueMetric;
  thresholdPercent: number;
  isAdverseDelta: (deltaPercent: number) => boolean;
  value: (window: CreativeFatigueWindow) => number | null | undefined;
};

const THRESHOLD_EPSILON = 1e-9;

const SIGNAL_DEFINITIONS: readonly SignalDefinition[] = [
  {
    metric: "frequency",
    thresholdPercent: CREATIVE_FATIGUE_THRESHOLDS.frequencyIncreasePercent,
    isAdverseDelta: (deltaPercent) =>
      deltaPercent >=
      CREATIVE_FATIGUE_THRESHOLDS.frequencyIncreasePercent -
        THRESHOLD_EPSILON,
    value: (window) => window.frequency,
  },
  {
    metric: "link_ctr",
    thresholdPercent: CREATIVE_FATIGUE_THRESHOLDS.linkCtrDecreasePercent,
    isAdverseDelta: (deltaPercent) =>
      deltaPercent <=
      -CREATIVE_FATIGUE_THRESHOLDS.linkCtrDecreasePercent +
        THRESHOLD_EPSILON,
    value: (window) => window.linkCtr,
  },
  {
    metric: "cost_per_result",
    thresholdPercent:
      CREATIVE_FATIGUE_THRESHOLDS.costPerResultIncreasePercent,
    isAdverseDelta: (deltaPercent) =>
      deltaPercent >=
      CREATIVE_FATIGUE_THRESHOLDS.costPerResultIncreasePercent -
        THRESHOLD_EPSILON,
    value: (window) => window.costPerResult,
  },
  {
    metric: "result_volume",
    thresholdPercent:
      CREATIVE_FATIGUE_THRESHOLDS.resultVolumeDecreasePercent,
    isAdverseDelta: (deltaPercent) =>
      deltaPercent <=
      -CREATIVE_FATIGUE_THRESHOLDS.resultVolumeDecreasePercent +
        THRESHOLD_EPSILON,
    value: (window) => window.resultVolume,
  },
];

function finiteNonNegative(
  value: number | null | undefined,
): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0
    ? value
    : null;
}

function positiveWholeDays(value: number): number | null {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function addReason(
  reasons: CreativeFatigueReason[],
  reason: CreativeFatigueReason,
) {
  if (!reasons.includes(reason)) reasons.push(reason);
}

/**
 * Evaluates the four V5 fatigue signals using two equally sized windows.
 *
 * A percentage change requires a positive previous value. Zero in the recent
 * window is valid (for example, a 100% Result-volume decrease); zero in the
 * previous window is not a safe percentage denominator and therefore returns
 * `insufficient` instead of fabricating a signal. A fatigue risk requires an
 * adverse Frequency signal plus at least one adverse CTR, Cost/Result or
 * Result-volume signal; other combinations remain in monitor state.
 */
export function evaluateCreativeFatigue(
  input: CreativeFatigueInput,
): CreativeFatigueResult {
  const reasons: CreativeFatigueReason[] = [];
  const previousDays = positiveWholeDays(input.previous.days);
  const recentDays = positiveWholeDays(input.recent.days);
  const matchingWindows =
    previousDays !== null &&
    recentDays !== null &&
    previousDays === recentDays;

  if (!matchingWindows) addReason(reasons, "window_days_mismatch");
  if (!input.previous.minimumSampleMet || !input.recent.minimumSampleMet) {
    addReason(reasons, "minimum_sample_not_met");
  }

  const signals = SIGNAL_DEFINITIONS.map((definition) => {
    const previous = finiteNonNegative(definition.value(input.previous));
    const recent = finiteNonNegative(definition.value(input.recent));

    if (previous === null || recent === null) {
      addReason(reasons, "metric_input_missing");
      return {
        metric: definition.metric,
        deltaPercent: null,
        thresholdPercent: definition.thresholdPercent,
        adverse: null,
      } satisfies CreativeFatigueSignal;
    }

    if (previous === 0) {
      addReason(reasons, "previous_value_zero");
      return {
        metric: definition.metric,
        deltaPercent: null,
        thresholdPercent: definition.thresholdPercent,
        adverse: null,
      } satisfies CreativeFatigueSignal;
    }

    const deltaPercent = ((recent - previous) / previous) * 100;
    return {
      metric: definition.metric,
      deltaPercent,
      thresholdPercent: definition.thresholdPercent,
      adverse: definition.isAdverseDelta(deltaPercent),
    } satisfies CreativeFatigueSignal;
  });

  const adverseSignalCount = signals.filter(
    (signal) => signal.adverse === true,
  ).length;
  const frequencyAdverse = signals.some(
    (signal) => signal.metric === "frequency" && signal.adverse === true,
  );
  const otherAdverseSignalCount = signals.filter(
    (signal) =>
      signal.metric !== "frequency" && signal.adverse === true,
  ).length;
  const allSignalsAvailable = signals.every(
    (signal) => signal.adverse !== null,
  );
  const evaluable =
    matchingWindows &&
    input.previous.minimumSampleMet &&
    input.recent.minimumSampleMet &&
    allSignalsAvailable;

  return {
    status: !evaluable
      ? "insufficient"
      : frequencyAdverse && otherAdverseSignalCount >= 1
        ? "fatigue_risk"
        : adverseSignalCount >= 1
          ? "monitor"
          : "stable",
    windowDays: matchingWindows ? recentDays : null,
    adverseSignalCount,
    signals,
    reasonCodes: reasons,
  };
}
