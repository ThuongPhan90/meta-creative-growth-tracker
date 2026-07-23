import {
  getMetaActionMapping,
  type ActionMetricRule,
  type MetaActionMapping,
} from "./config";
import type { MetaAction, MetaInsightRow } from "./types";

export interface ParsedActionMetrics {
  /** Conversions attributed by Meta under the configured install action rule. */
  metaAttributedInstalls: number;
  /** Conversions attributed by Meta under the configured registration rule. */
  metaAttributedRegistrations: number;
}

export interface ParsedInsightMetrics extends ParsedActionMetrics {
  spend: number;
  impressions: number;
  reach: number;
  frequency: number | null;
  inlineLinkClicks: number;
  linkCtrPercent: number | null;
  costPerMetaAttributedInstall: number | null;
  costPerMetaAttributedRegistration: number | null;
  threeSecondVideoViews: number;
  completedVideoViews: number;
  hookRatePercent: number | null;
  holdRatePercent: number | null;
}

function toNonNegativeNumber(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function sumValues(actions: readonly MetaAction[] | undefined): number {
  if (!actions) {
    return 0;
  }

  return actions.reduce(
    (total, action) => total + (toNonNegativeNumber(action.value) ?? 0),
    0,
  );
}

export function extractActionMetric(
  actions: readonly MetaAction[] | undefined,
  rule: ActionMetricRule,
): number {
  if (!actions || rule.actionTypes.length === 0) {
    return 0;
  }

  if (rule.strategy === "sum-matches") {
    const allowedTypes = new Set(rule.actionTypes);
    return sumValues(
      actions.filter((action) => allowedTypes.has(action.action_type)),
    );
  }

  for (const actionType of rule.actionTypes) {
    const matchingActions = actions.filter(
      (action) => action.action_type === actionType,
    );

    if (matchingActions.length > 0) {
      return sumValues(matchingActions);
    }
  }

  return 0;
}

export function parseActionMetrics(
  insight: Pick<MetaInsightRow, "actions">,
  mapping: MetaActionMapping = getMetaActionMapping(),
): ParsedActionMetrics {
  return {
    metaAttributedInstalls: extractActionMetric(
      insight.actions,
      mapping.installs,
    ),
    metaAttributedRegistrations: extractActionMetric(
      insight.actions,
      mapping.registrations,
    ),
  };
}

function ratioPercent(
  numerator: number,
  denominator: number,
): number | null {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

function costPer(spend: number, conversions: number): number | null {
  return conversions > 0 ? spend / conversions : null;
}

/**
 * Parses a single already-aggregated Insights row.
 *
 * For date/account rollups, callers must sum raw numerators and denominators
 * first and then calculate ratios. Averaging per-row CTR/CPI/CPA is incorrect.
 */
export function parseInsightMetrics(
  insight: MetaInsightRow,
  mapping: MetaActionMapping = getMetaActionMapping(),
): ParsedInsightMetrics {
  const spend = toNonNegativeNumber(insight.spend) ?? 0;
  const impressions = toNonNegativeNumber(insight.impressions) ?? 0;
  const reach = toNonNegativeNumber(insight.reach) ?? 0;
  const inlineLinkClicks =
    toNonNegativeNumber(insight.inline_link_clicks) ?? 0;
  const reportedLinkCtr = toNonNegativeNumber(
    insight.inline_link_click_ctr,
  );
  const frequency = toNonNegativeNumber(insight.frequency);
  const actionMetrics = parseActionMetrics(insight, mapping);
  const threeSecondVideoViews = sumValues(
    insight.video_3_sec_watched_actions,
  );
  const completedVideoViews = sumValues(insight.video_p100_watched_actions);

  return {
    spend,
    impressions,
    reach,
    frequency,
    inlineLinkClicks,
    linkCtrPercent:
      reportedLinkCtr ?? ratioPercent(inlineLinkClicks, impressions),
    ...actionMetrics,
    costPerMetaAttributedInstall: costPer(
      spend,
      actionMetrics.metaAttributedInstalls,
    ),
    costPerMetaAttributedRegistration: costPer(
      spend,
      actionMetrics.metaAttributedRegistrations,
    ),
    threeSecondVideoViews,
    completedVideoViews,
    hookRatePercent: ratioPercent(threeSecondVideoViews, impressions),
    holdRatePercent: ratioPercent(
      completedVideoViews,
      threeSecondVideoViews,
    ),
  };
}
