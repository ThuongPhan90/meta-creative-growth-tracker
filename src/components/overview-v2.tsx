import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CircleDollarSign,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import {
  CreativeEvaluationStatus,
  creativeEvaluationAction,
  creativeFullDetailHref,
  creativeScatterPointStyle,
  groupCreativeFamiliesForView,
  type CreativeFamilyViewItem,
} from "@/components/creative-performance-v2";
import { LiveDeliveryStrip } from "@/components/overview/live-delivery-strip";
import { ContextualEntityLink } from "@/components/ui/contextual-entity-link";
import {
  CreativeScatterLegend,
  CreativeScatterTooltip,
} from "@/components/ui/creative-scatter-accessibility";
import {
  ReportingContext,
  type ReportingFreshness,
} from "@/components/ui/reporting-context";
import {
  buildContextHref,
  buildNavigationHref,
  reportingContextHiddenFields,
  type CreativeDrilldownMetric,
} from "@/lib/navigation/query";
import {
  summarizeDelivery,
  type DeliveryMetricRow,
  type DynamicResultMetricsModel,
  type ResultKpiCard,
} from "@/lib/reporting";
import type { CanonicalResultTrendPoint } from "@/lib/reporting/legacy-result-bridge";
import {
  CREATIVE_PERFORMANCE_STATUSES,
  creativePerformanceStatus,
  creativePerformanceStatusKey,
  scatterAxisLabel,
  scatterBubbleAriaLabel,
} from "@/lib/presentation/creative-performance-status";
import {
  formatCompactNumber,
  formatMoney,
  formatNumber,
  formatPercent,
} from "@/lib/presentation/formatters";
import type { ReportingBarModel } from "@/lib/presentation/reporting-bar";
import type {
  CreativeRow,
  DashboardViewModel,
} from "@/types/view-models";
import type { LiveDeliverySummary } from "@/lib/db";

type Query = Record<string, string | string[] | undefined>;

export type OverviewTrendPoint = CanonicalResultTrendPoint;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function overviewReportingContextHiddenFields(query: Query) {
  const fields = reportingContextHiddenFields(query);
  const campaign = first(query.campaign)?.trim();
  return campaign ? { ...fields, campaign } : fields;
}

function href(
  pathname: string,
  query: Query,
  overrides: Record<string, string | null | undefined> = {},
) {
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(query)) {
    const value = first(raw);
    if (value) params.set(key, value.slice(0, 500));
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (!value) params.delete(key);
    else params.set(key, value);
  }
  return `${pathname}${params.size ? `?${params.toString()}` : ""}`;
}

function overviewHealthHref(
  label: string,
  query: Query,
) {
  const normalized = label.toLocaleLowerCase("vi-VN");
  if (
    normalized.includes("event") ||
    normalized.includes("mapping")
  ) {
    return buildNavigationHref(
      "/data-health?coverage=event",
      query,
    );
  }
  if (normalized.includes("quyền truy cập")) {
    return buildNavigationHref(
      "/data-health#health-access",
      query,
    );
  }
  if (normalized.includes("đồng bộ")) {
    return buildNavigationHref(
      "/data-health#sync-history",
      query,
    );
  }
  return buildNavigationHref(
    "/data-health#health-issues",
    query,
  );
}

function creativeDrilldownHref({
  query,
  metric,
  sort,
  resultKey,
}: {
  query: Query;
  metric: CreativeDrilldownMetric;
  sort: "asc" | "desc";
  resultKey?: string;
}) {
  return buildContextHref("/creatives?view=table#creative-results", query, {
    metric,
    sort,
    ...(resultKey ? { result: resultKey } : {}),
    selected: null,
    tab: null,
    compare_ids: null,
  });
}

type TrendMetric = {
  resultKey: string;
  label: string;
  valueType: ResultKpiCard["valueType"];
  source: "result" | "efficiency";
  attribution: ResultKpiCard["attribution"];
};

type TrendChartModel = {
  min: number;
  max: number;
  path: string;
  points: Array<{
    date: string;
    value: number;
    x: number;
    y: number;
    tooltip: string;
  }>;
};

function isTrendValue(
  value: number | null | undefined,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0
  );
}

function formatTrendValue(
  value: number,
  metric: TrendMetric,
  currency: string,
) {
  if (metric.valueType === "currency") {
    return formatMoney(value, currency, 2);
  }
  if (metric.valueType === "percent") return formatPercent(value);
  if (metric.valueType === "ratio") {
    return `${value.toLocaleString("vi-VN", {
      maximumFractionDigits: 2,
    })}×`;
  }
  return formatCompactNumber(value);
}

function trendUnit(metric: TrendMetric, currency: string) {
  if (metric.valueType === "currency") return currency;
  if (metric.valueType === "percent") return "%";
  if (metric.valueType === "ratio") return "×";
  return "kết quả";
}

function trendPointValue(
  point: OverviewTrendPoint,
  metric: TrendMetric,
) {
  return metric.source === "result"
    ? point.resultValues[metric.resultKey]
    : point.efficiencyValues[metric.resultKey];
}

function buildTrendChartModel(
  points: OverviewTrendPoint[],
  metric: TrendMetric,
  currency: string,
): TrendChartModel | null {
  const values = points
    .map((point) => trendPointValue(point, metric))
    .filter(isTrendValue);
  if (values.length < 2) return null;

  const observedMin = Math.min(...values);
  const observedMax = Math.max(...values);
  const observedRange = observedMax - observedMin;
  const padding =
    observedRange > 0
      ? observedRange * 0.1
      : Math.max(Math.abs(observedMax) * 0.1, 1);
  const min = Math.max(0, observedMin - padding);
  const max = observedMax + padding;
  const range = Math.max(max - min, 1);
  const chartPoints: TrendChartModel["points"] = [];
  const path: string[] = [];
  let continuesLine = false;

  points.forEach((point, index) => {
    const value = trendPointValue(point, metric);
    if (!isTrendValue(value)) {
      continuesLine = false;
      return;
    }
    const x =
      points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
    const y = 8 + (1 - (value - min) / range) * 78;
    path.push(
      `${continuesLine ? "L" : "M"} ${x.toFixed(2)} ${y.toFixed(2)}`,
    );
    continuesLine = true;
    chartPoints.push({
      date: point.date,
      value,
      x,
      y,
      tooltip: `${point.date} · ${metric.label}: ${formatTrendValue(
        value,
        metric,
        currency,
      )}`,
    });
  });

  return {
    min,
    max,
    path: path.join(" "),
    points: chartPoints,
  };
}

function formatTrendTick(
  value: number,
  metric: TrendMetric,
  currency: string,
) {
  return formatTrendValue(value, metric, currency);
}

function TrendSeriesChart({
  chart,
  metric,
  currency,
}: {
  chart: TrendChartModel;
  metric: TrendMetric;
  currency: string;
}) {
  const seriesId = `overview-trend-${metric.source}-${metric.resultKey.replace(
    /[^a-z0-9_-]/gi,
    "-",
  )}`;
  const unit = trendUnit(metric, currency);
  const sourceLabel =
    metric.attribution === "delivery"
      ? "Meta-reported"
      : "Meta-attributed";

  return (
    <div className="v2-trend-chart" data-trend-series={metric.source}>
      <div
        className="v2-trend-legend"
        aria-label="Chú giải biểu đồ xu hướng"
      >
        <span>
          <i
            className={`v2-trend-dot v2-trend-dot--${metric.source}`}
            aria-hidden="true"
          />
          <strong>{metric.label}</strong>
        </span>
        <small>{sourceLabel} · theo ngày</small>
        <strong>Đơn vị: {unit}</strong>
      </div>
      <div className="v2-trend-plot">
        <div
          className="v2-trend-y-axis"
          aria-label={`Trục tung ${metric.label}, đơn vị ${unit}`}
        >
          <span className="v2-trend-y-axis__label">
            {metric.label} ({unit})
          </span>
          <div className="v2-trend-y-axis__ticks">
            <span data-trend-axis-tick="max">
              {formatTrendTick(chart.max, metric, currency)}
            </span>
            <span data-trend-axis-tick="min">
              {formatTrendTick(chart.min, metric, currency)}
            </span>
          </div>
        </div>
        <div className="v2-trend-canvas">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            role="group"
            aria-labelledby={`${seriesId}-title ${seriesId}-description`}
          >
            <title id={`${seriesId}-title`}>
              {`Xu hướng ${metric.label} theo ngày`}
            </title>
            <desc id={`${seriesId}-description`}>
              {`${chart.points.length} điểm dữ liệu, đơn vị ${unit}. Dùng Tab để đọc từng điểm.`}
            </desc>
            <path
              className={`v2-trend-line v2-trend-line--${metric.source}`}
              d={chart.path}
              aria-hidden="true"
            />
          </svg>
          <div
            className="v2-trend-point-layer"
            aria-label={`Các điểm dữ liệu ${metric.label}`}
          >
            {chart.points.map((point) => (
              <span
                className="v2-trend-point"
                tabIndex={0}
                role="img"
                aria-label={point.tooltip}
                title={point.tooltip}
                data-tooltip={point.tooltip}
                data-trend-series={metric.source}
                data-trend-date={point.date}
                data-trend-value={point.value}
                key={`${point.date}:${point.value}`}
                style={{
                  left: `${point.x}%`,
                  top: `${point.y}%`,
                }}
              />
            ))}
          </div>
          <div
            className="v2-trend-axis"
            aria-label="Trục hoành theo ngày"
          >
            <span>{chart.points[0]?.date}</span>
            <strong>Ngày</strong>
            <span>{chart.points.at(-1)?.date}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TopCreative({
  family,
  query,
  index,
  resultLabel,
  resultDisplay,
  efficiencyLabel,
  efficiencyDisplay,
  resultKey,
}: {
  family: CreativeFamilyViewItem;
  query: Query;
  index: number;
  resultLabel: string;
  resultDisplay: string;
  efficiencyLabel: string | null;
  efficiencyDisplay: string | null;
  resultKey: string | null;
}) {
  return (
    <li>
      <span>{index + 1}</span>
      <Image
        src={family.imageUrl}
        alt=""
        width={72}
        height={72}
        unoptimized
      />
      <ContextualEntityLink
        href={creativeFullDetailHref({
          familyId: family.id,
          query,
          tab: "performance",
          originPathname: "/overview",
        })}
        drawerHref={href("/overview", query, {
          selected: family.id,
          tab: "performance",
        })}
        entityId={family.id}
      >
        <strong>{family.name}</strong>
        <small>
          {resultDisplay} {resultLabel}
          {efficiencyLabel
            ? ` · ${efficiencyLabel} ${efficiencyDisplay ?? "—"}`
            : ""}
        </small>
      </ContextualEntityLink>
      {resultKey ? (
        <CreativeEvaluationStatus
          performance={family.performance}
          resultKey={resultKey}
        />
      ) : null}
    </li>
  );
}

function KpiComparison({
  current,
  previous,
  fallback,
  direction = "higher",
}: {
  current: number | null;
  previous: number | null;
  fallback: string;
  direction?: "higher" | "lower" | "neutral";
}) {
  if (
    current === null ||
    previous === null ||
    !Number.isFinite(previous) ||
    previous === 0
  ) {
    return <small>{fallback}</small>;
  }
  const delta = ((current - previous) / Math.abs(previous)) * 100;
  const good =
    direction === "higher"
      ? delta > 0
      : direction === "lower"
        ? delta < 0
        : false;
  const bad =
    direction === "higher"
      ? delta < 0
      : direction === "lower"
        ? delta > 0
        : false;

  return (
    <small
      className={
        good ? "v2-delta" : bad ? "v2-delta v2-delta--bad" : undefined
      }
      title="So sánh cùng số ngày với kỳ liền trước"
    >
      {delta > 0 ? "+" : ""}
      {formatPercent(delta)} so với kỳ trước
    </small>
  );
}

function kpiValue(
  card: ResultKpiCard,
  currency: string | null,
): string {
  if (card.value === null) {
    return card.unavailableReason === "split_currency"
      ? "Nhiều tiền tệ"
      : "—";
  }
  if (card.valueType === "currency") {
    return currency ? formatMoney(card.value, currency) : "—";
  }
  if (card.valueType === "percent") {
    return formatPercent(card.value);
  }
  if (card.valueType === "ratio") {
    return `${card.value.toLocaleString("vi-VN", {
      maximumFractionDigits: 2,
    })}×`;
  }
  return formatCompactNumber(card.value);
}

function kpiDirection(
  card: ResultKpiCard,
): "higher" | "lower" | "neutral" {
  if (card.key === "spend" || card.key === "frequency") {
    return "neutral";
  }
  if (card.key === "cpm" || card.label.toLowerCase().startsWith("cost/")) {
    return "lower";
  }
  return "higher";
}

function kpiMetric(card: ResultKpiCard): CreativeDrilldownMetric {
  if (card.key.startsWith("result:")) return "primary_result";
  if (card.key.startsWith("efficiency:")) return "cost_per_result";
  if (
    card.key === "spend" ||
    card.key === "impressions" ||
    card.key === "reach" ||
    card.key === "frequency" ||
    card.key === "cpm"
  ) {
    return card.key;
  }
  return "primary_result";
}

function familyResultValue(
  family: CreativeFamilyViewItem,
  canonicalResultKey: string | null,
) {
  const performance = family.performance;
  if (!performance || !canonicalResultKey) return null;
  const normalized = performance.resultValues?.[canonicalResultKey];
  return typeof normalized === "number" &&
    Number.isFinite(normalized)
    ? normalized
    : null;
}

function familyEfficiencyValue(
  family: CreativeFamilyViewItem,
  canonicalResultKey: string | null,
  resultValue: number | null,
  valueType: ResultKpiCard["valueType"] | null,
) {
  const performance = family.performance;
  if (!performance || resultValue === null || resultValue <= 0) {
    return null;
  }
  if (valueType === "currency") {
    return performance.spend / resultValue;
  }
  if (valueType === "percent") {
    const clicks =
      performance.linkCtr === null
        ? null
        : (performance.linkCtr / 100) * performance.impressions;
    return clicks && clicks > 0 ? (resultValue / clicks) * 100 : null;
  }
  if (
    valueType === "ratio" &&
    canonicalResultKey === "purchase_value"
  ) {
    return performance.spend > 0
      ? resultValue / performance.spend
      : null;
  }
  return null;
}

function formatFamilyMetric(
  value: number | null,
  valueType: ResultKpiCard["valueType"] | null,
  currency: string | null,
) {
  if (value === null) return "—";
  if (valueType === "currency") {
    return currency ? formatMoney(value, currency) : "—";
  }
  if (valueType === "percent") return formatPercent(value);
  if (valueType === "ratio") {
    return `${value.toLocaleString("vi-VN", {
      maximumFractionDigits: 2,
    })}×`;
  }
  return formatNumber(value);
}

function medianFinite(values: readonly number[]) {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

type ScatterConfidence = "high" | "medium" | "low" | "unknown";

function scatterConfidenceLabel(confidence: ScatterConfidence) {
  if (confidence === "high") return "Cao";
  if (confidence === "medium") return "Trung bình";
  if (confidence === "low") return "Thấp";
  return "Chưa có đánh giá";
}

function scatterDeltaLabel(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return `${value > 0 ? "+" : ""}${formatPercent(value)}`;
}

function scatterUnavailableMessage(
  reason: DynamicResultMetricsModel["scatter"]["unavailableReason"],
) {
  if (reason === "all_objectives") {
    return "Chọn một mục tiêu để so sánh Creative theo cùng một loại kết quả.";
  }
  if (reason === "result_not_selected") {
    return "Chọn kết quả chính để mở biểu đồ hiệu quả Creative.";
  }
  if (reason === "split_currency") {
    return "Chọn một tiền tệ để so sánh chi phí/kết quả.";
  }
  if (reason === "zero_result") {
    return "Chưa có kết quả Meta ghi nhận để tính chi phí/kết quả.";
  }
  return "Chưa có dữ liệu Creative đủ tin cậy cho kết quả đã chọn.";
}

export function OverviewV2({
  dashboard,
  creatives,
  delivery,
  liveDelivery,
  trend,
  connected,
  query,
  dateFrom,
  dateTo,
  account,
  accounts,
  reportingCurrency,
  currencyOptions,
  compare,
  freshness,
  reportingBar,
  resultMetrics,
  previousResultMetrics,
  reportWarnings = [],
  selectedDrawer,
}: {
  dashboard: DashboardViewModel;
  creatives: CreativeRow[];
  delivery: readonly DeliveryMetricRow[];
  liveDelivery?: LiveDeliverySummary;
  trend: OverviewTrendPoint[];
  connected: boolean;
  query: Query;
  dateFrom: string;
  dateTo: string;
  account: string;
  accounts: { id: string; name: string }[];
  reportingCurrency: string;
  currencyOptions: string[];
  compare: "previous_period" | "none";
  freshness: ReportingFreshness;
  reportingBar: ReportingBarModel;
  resultMetrics: DynamicResultMetricsModel;
  previousResultMetrics?: DynamicResultMetricsModel;
  reportWarnings?: readonly string[];
  selectedDrawer?: React.ReactNode;
}) {
  const families = groupCreativeFamiliesForView(creatives);
  const deliverySummary = summarizeDelivery(delivery);
  const currency = deliverySummary.singleCurrency?.currency ?? null;
  const primaryResultKey =
    resultMetrics.metadata.primaryResultKey;
  const primaryResultCard = resultMetrics.kpiCards.find(
    (card) =>
      card.canonicalResultKey === primaryResultKey &&
      !card.key.startsWith("efficiency:"),
  );
  const primaryEfficiencyCard = resultMetrics.kpiCards.find(
    (card) =>
      card.key === `efficiency:${primaryResultKey ?? ""}`,
  );
  const primaryResultDefinition =
    resultMetrics.availableResults.find(
      (result) => result.canonicalKey === primaryResultKey,
    ) ?? null;
  const familyMetrics = families.map((family) => {
    const resultValue = familyResultValue(
      family,
      primaryResultKey,
    );
    const efficiencyValue = familyEfficiencyValue(
      family,
      primaryResultKey,
      resultValue,
      primaryEfficiencyCard?.valueType ?? null,
    );
    return { family, resultValue, efficiencyValue };
  });
  const top = familyMetrics
    .filter(
      (
        item,
      ): item is typeof item & { resultValue: number } =>
        item.resultValue !== null,
    )
    .sort((left, right) => right.resultValue - left.resultValue)
    .slice(0, 5);
  const hasCreativeEvaluation =
    !!primaryResultKey &&
    families.some(
      (family) =>
        family.performance?.evaluation?.resultKey ===
        primaryResultKey,
    );
  const actions = (hasCreativeEvaluation ? families : [])
    .filter((family) =>
      ["poor", "limited"].includes(
        creativePerformanceStatusKey(
          family.performance,
          primaryResultKey,
        ),
      ),
    )
    .slice(0, 5);
  const fatigueEvaluations = primaryResultKey
    ? families.flatMap((family) => {
        const evaluation = family.performance?.evaluation;
        return evaluation?.resultKey === primaryResultKey
          ? [evaluation]
          : [];
      })
    : [];
  const fatigueStatuses = [
    {
      key: "fatigue_risk" as const,
      label: "Có dấu hiệu mỏi",
      detail: "Nhiều tín hiệu xu hướng đang xấu đi.",
      tone: "error",
    },
    {
      key: "monitor" as const,
      label: "Theo dõi thêm",
      detail: "Có tín hiệu cần thêm thời gian quan sát.",
      tone: "warning",
    },
    {
      key: "stable" as const,
      label: "Chưa thấy dấu hiệu mỏi",
      detail: "Các tín hiệu xu hướng vẫn ổn định.",
      tone: "ready",
    },
  ].map((status) => ({
    ...status,
    count: fatigueEvaluations.filter(
      (evaluation) => evaluation.fatigueStatus === status.key,
    ).length,
  }));
  const fatigueEvaluableCount = fatigueStatuses.reduce(
    (total, status) => total + status.count,
    0,
  );
  const fatigueInsufficientCount = fatigueEvaluations.filter(
    (evaluation) => evaluation.fatigueStatus === "insufficient",
  ).length;
  const scatterFamilies = resultMetrics.scatter.enabled
    ? familyMetrics.filter(
        (
          item,
        ): item is typeof item & {
          resultValue: number;
          efficiencyValue: number;
        } =>
          item.family.performance !== null &&
          item.resultValue !== null &&
          item.efficiencyValue !== null,
      )
    : [];
  const scatterMedianSpend = medianFinite(
    scatterFamilies.map(
      ({ family }) => family.performance?.spend ?? Number.NaN,
    ),
  );
  const scatterUsesCostPerResult =
    resultMetrics.scatter.y?.valueType === "currency";
  const scatterBenchmarkValues = scatterUsesCostPerResult
    ? scatterFamilies.flatMap(({ family }) => {
        const evaluation = family.performance?.evaluation;
        return evaluation?.resultKey === primaryResultKey &&
          typeof evaluation.benchmarkValue === "number" &&
          Number.isFinite(evaluation.benchmarkValue)
          ? [evaluation.benchmarkValue]
          : [];
      })
    : [];
  const scatterBenchmark = medianFinite(scatterBenchmarkValues);
  const maxScatterSpend = Math.max(
    ...scatterFamilies.map(
      ({ family }) => family.performance?.spend ?? 0,
    ),
    1,
  );
  const maxScatterEfficiency = Math.max(
    ...scatterFamilies.map((item) => item.efficiencyValue),
    scatterBenchmark ?? 0,
    1,
  );
  const maxScatterResult = Math.max(
    ...scatterFamilies.map((item) => item.resultValue),
    1,
  );
  const scatterMedianLeft =
    scatterMedianSpend === null
      ? null
      : Math.min(
          90,
          Math.max(
            8,
            8 + (scatterMedianSpend / maxScatterSpend) * 82,
          ),
        );
  const scatterBenchmarkTop =
    scatterBenchmark === null
      ? null
      : Math.min(
          82,
          Math.max(
            8,
            8 +
              (1 - scatterBenchmark / maxScatterEfficiency) * 74,
          ),
        );
  const statusDescriptions = {
    good: "Kết quả đã qua ngưỡng đánh giá",
    stable: "Nằm trong ±15% benchmark",
    poor: "Kém benchmark trên ngưỡng",
    limited: "Xem trạng thái dữ liệu riêng",
  } as const;
  const segments = CREATIVE_PERFORMANCE_STATUSES.map(
    (status) => ({
      value: status.key,
      label: status.label,
      description: statusDescriptions[status.key],
      tone: status.tone,
      count: families.filter(
        (family) =>
          creativePerformanceStatusKey(
            family.performance,
            primaryResultKey,
          ) === status.key,
      ).length,
    }),
  );
  const trendCurrencies = [...new Set(trend.map((point) => point.currency))];
  const trendCurrency =
    currency && trendCurrencies.includes(currency)
      ? currency
      : trendCurrencies.length === 1
        ? trendCurrencies[0]
        : null;
  const visibleTrend = trendCurrency
    ? trend.filter((point) => point.currency === trendCurrency)
    : [];
  const trendMetrics: TrendMetric[] = [];
  if (primaryResultKey && primaryResultCard) {
    trendMetrics.push({
      resultKey: primaryResultKey,
      label: primaryResultCard.label,
      valueType: primaryResultCard.valueType,
      source: "result",
      attribution: primaryResultCard.attribution,
    });
  }
  if (
    primaryResultKey &&
    primaryEfficiencyCard &&
    !primaryEfficiencyCard.unavailableReason
  ) {
    trendMetrics.push({
      resultKey: primaryResultKey,
      label: primaryEfficiencyCard.label,
      valueType: primaryEfficiencyCard.valueType,
      source: "efficiency",
      attribution: primaryEfficiencyCard.attribution,
    });
  }
  const trendSeries = trendCurrency
    ? trendMetrics.flatMap((metric) => {
        const chart = buildTrendChartModel(
          visibleTrend,
          metric,
          trendCurrency,
        );
        return chart ? [{ chart, metric }] : [];
      })
    : [];
  const scatterCurrency =
    currency ??
    scatterFamilies[0]?.family.performance?.currency ??
    null;
  const scatterXAxisLabel = scatterAxisLabel({
    axis: "X",
    label: resultMetrics.scatter.x.label,
    valueType: resultMetrics.scatter.x.valueType,
    currency: scatterCurrency,
  });
  const scatterYAxisLabel = resultMetrics.scatter.y
    ? scatterAxisLabel({
        axis: "Y",
        label: resultMetrics.scatter.y.label,
        valueType: resultMetrics.scatter.y.valueType,
        currency: scatterCurrency,
        direction:
          resultMetrics.scatter.y.valueType === "currency"
            ? "thấp hơn tốt hơn"
            : "cao hơn tốt hơn",
      })
    : null;
  const scatterMedianSpendText =
    scatterMedianSpend === null || !scatterCurrency
      ? null
      : formatMoney(scatterMedianSpend, scatterCurrency);
  const scatterBenchmarkText =
    scatterBenchmark === null || !resultMetrics.scatter.y
      ? null
      : formatFamilyMetric(
          scatterBenchmark,
          resultMetrics.scatter.y.valueType,
          scatterCurrency,
        );
  const scatterBenchmarkMetricLabel = resultMetrics.scatter.y
    ? `${resultMetrics.scatter.y.label}${
        new Set(scatterBenchmarkValues).size > 1
          ? " (trung vị)"
          : ""
      }`
    : null;
  const scatterQuadrants =
    scatterMedianLeft !== null && scatterBenchmarkTop !== null
      ? {
          left: (8 + scatterMedianLeft) / 2,
          right: (scatterMedianLeft + 90) / 2,
          top: (8 + scatterBenchmarkTop) / 2,
          bottom: (scatterBenchmarkTop + 82) / 2,
        }
      : null;
  const isAllObjectives = reportingBar.objective === "all";
  const selectedResultKey = reportingBar.result ?? null;
  const selectedResultLabel =
    reportingBar.results.find(
      (result) => result.key === selectedResultKey,
    )?.label ??
    selectedResultKey ??
    "kết quả đã chọn";
  const selectedResultUnavailable =
    !isAllObjectives && !!selectedResultKey && !primaryResultKey;
  const objectiveCtaSection =
    resultMetrics.crossObjectiveSections.find((section) =>
      section.results.some((result) => result.value !== null),
    ) ??
    resultMetrics.crossObjectiveSections[0] ??
    null;
  const objectiveCta = objectiveCtaSection
    ? {
        key: objectiveCtaSection.objectiveKey,
        label: objectiveCtaSection.objectiveLabel,
      }
    : (reportingBar.objectives[0] ?? null);
  const objectiveSpendCurrency = reportingCurrency || currency;
  const objectiveSpendTotal =
    resultMetrics.crossObjectiveSections.reduce(
      (total, section) => total + (section.spend ?? 0),
      0,
    );
  const visibleReportWarnings = [
    ...new Set(
      reportWarnings
        .map((warning) => warning.trim())
        .filter(Boolean),
    ),
  ];

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div>
          <h1>Tổng quan</h1>
          <p>
            Ưu tiên Creative dựa trên hiệu quả, độ tin cậy dữ liệu và mối liên
            kết Campaign → Ads → Creative Family.
          </p>
        </div>
      </header>
      <ReportingContext
        {...reportingBar}
        action="/overview"
        dateFrom={dateFrom}
        dateTo={dateTo}
        account={account}
        accounts={accounts}
        currency={reportingCurrency}
        currencies={currencyOptions}
        compare={compare}
        freshness={freshness}
        preserved={overviewReportingContextHiddenFields(query)}
      />
      {connected && visibleReportWarnings.length ? (
        <aside className="v2-report-context-warning" role="alert">
          <strong>Ngữ cảnh báo cáo cần kiểm tra.</strong>{" "}
          {visibleReportWarnings.join(" · ")}{" "}
          <Link
            className="v2-link"
            href={buildNavigationHref(
              "/data-health?coverage=event",
              query,
            )}
          >
            Mở Chất lượng dữ liệu
            <ArrowRight aria-hidden="true" size={13} />
          </Link>
        </aside>
      ) : null}
      {!connected ? (
        <section className="v2-panel v2-overview-onboarding">
          <Image
            src="/creative-analytics-empty.png"
            width={360}
            height={360}
            alt=""
            priority
          />
          <div>
            <span className="v2-chip v2-chip--warning">
              Chưa kết nối nguồn dữ liệu
            </span>
            <h2>Kết nối Meta để mở khóa bảng điều khiển hiệu suất</h2>
            <p>{dashboard.connectionDetail}</p>
            <div>
              <Link
                className="button button--primary"
                href={href("/sources", query, { tab: "connection" })}
              >
                Kết nối Meta
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
              <Link className="button button--secondary" href="/setup">
                Xem hướng dẫn
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <>
          {liveDelivery ? (
            <LiveDeliveryStrip summary={liveDelivery} query={query} />
          ) : null}
          <section className="v2-kpi-grid" aria-label="KPI hiệu quả">
            {resultMetrics.kpiCards.map((card) => {
              const previous =
                previousResultMetrics?.kpiCards.find(
                  (item) => item.key === card.key,
                )?.value ?? null;
              const resultKey = card.canonicalResultKey;
              return (
                <Link
                  className="v2-kpi"
                  href={creativeDrilldownHref({
                    query,
                    metric: kpiMetric(card),
                    sort:
                      kpiDirection(card) === "lower" ? "asc" : "desc",
                    resultKey,
                  })}
                  key={card.key}
                  title={card.formula}
                >
                  <span className="v2-kpi__label">
                    {card.label}
                    {card.valueType === "currency" ? (
                      <CircleDollarSign aria-hidden="true" size={16} />
                    ) : card.attribution === "meta_attributed" ? (
                      <Target aria-hidden="true" size={16} />
                    ) : (
                      <BarChart3 aria-hidden="true" size={16} />
                    )}
                  </span>
                  <strong>{kpiValue(card, currency)}</strong>
                  <KpiComparison
                    current={card.value}
                    previous={previous}
                    fallback={
                      card.unavailableReason === "split_currency"
                        ? "Chọn một tiền tệ để tính"
                        : card.formula
                    }
                    direction={kpiDirection(card)}
                  />
                </Link>
              );
            })}
          </section>
          {resultMetrics.crossObjectiveSections.length ? (
            <section className="v2-objective-summary" aria-label="Kết quả theo mục tiêu">
              {resultMetrics.crossObjectiveSections.map((section) => (
                <Link
                  href={href("/overview", query, {
                    objective: section.objectiveKey,
                    result: null,
                  })}
                  key={section.objectiveKey}
                >
                  <span>{section.objectiveLabel}</span>
                  <strong>
                    {section.results
                      .filter((result) => result.value !== null)
                      .map((result) => {
                        const resultDisplay = `${formatCompactNumber(
                          result.value ?? 0,
                        )} ${result.label}`;
                        return result.costPerResult !== null &&
                          result.efficiencyLabel &&
                          objectiveSpendCurrency
                          ? `${resultDisplay} · ${
                              result.efficiencyLabel
                            } ${formatMoney(
                              result.costPerResult,
                              objectiveSpendCurrency,
                            )}`
                          : resultDisplay;
                      })
                      .join(" · ") || "Chưa có kết quả Meta ghi nhận"}
                  </strong>
                  <small>
                    {section.spend !== null && objectiveSpendCurrency
                      ? `Spend ${formatMoney(
                          section.spend,
                          objectiveSpendCurrency,
                        )}${
                          objectiveSpendTotal > 0
                            ? ` (${formatPercent(
                                (section.spend /
                                  objectiveSpendTotal) *
                                  100,
                              )})`
                            : ""
                        }`
                      : "Spend tách theo từng tiền tệ · chọn currency để xem"}{" "}
                    · Chọn mục tiêu để phân tích Creative
                  </small>
                </Link>
              ))}
            </section>
          ) : null}
          {isAllObjectives ? (
            <section
              className="v2-panel"
              aria-label="Chọn mục tiêu để phân tích Creative"
            >
              <div className="v2-compact-empty">
                <Target aria-hidden="true" size={22} />
                <p>
                  Chọn một mục tiêu để xếp hạng và đánh giá Creative
                  theo cùng một loại kết quả.
                </p>
                {objectiveCta ? (
                  <Link
                    className="button button--secondary"
                    href={href("/overview", query, {
                      objective: objectiveCta.key,
                      result: null,
                      selected: null,
                      tab: null,
                    })}
                  >
                    Phân tích {objectiveCta.label}
                    <ArrowRight aria-hidden="true" size={15} />
                  </Link>
                ) : null}
              </div>
            </section>
          ) : (
            <>
              {hasCreativeEvaluation ? (
                <section
                  className="v2-segment-grid"
                  aria-label="Phân khúc hiệu suất"
                >
                  {segments.map((segment) => (
                    <Link
                      className="v2-segment-card"
                      href={buildContextHref(
                        "/creatives?view=table#creative-results",
                        query,
                        {
                          performance: segment.value,
                          selected: null,
                          tab: null,
                        },
                      )}
                      key={segment.value}
                    >
                      <span className={`v2-chip v2-chip--${segment.tone}`}>
                        {segment.label}
                      </span>
                      <strong>{segment.count}</strong>
                      <small>{segment.description}</small>
                      <ArrowRight aria-hidden="true" size={15} />
                    </Link>
                  ))}
                </section>
              ) : (
                <section className="v2-panel v2-evaluation-gate">
                  <ShieldCheck aria-hidden="true" size={20} />
                  <div>
                    <strong>
                      {primaryResultKey
                        ? `Đánh giá theo ${
                            primaryResultDefinition?.label ??
                            "kết quả đã chọn"
                          }`
                        : selectedResultUnavailable
                          ? `${selectedResultLabel} đã được chọn nhưng dữ liệu chuẩn hóa chưa sẵn sàng`
                          : "Chọn một kết quả để đánh giá Creative"}
                    </strong>
                    <small>
                      {selectedResultUnavailable
                        ? "Hãy kiểm tra snapshot, Result Mapping và phạm vi dữ liệu trước khi đánh giá Creative."
                        : "Không dùng nhãn hoặc benchmark của kết quả khác. Creative chỉ được xếp loại khi có mapping, benchmark đúng peer group và đủ ngưỡng mẫu."}
                    </small>
                  </div>
                </section>
              )}
              <div className="v2-overview-grid">
                <section className="v2-panel v2-scatter-panel v2-overview-scatter">
                  <div className="v2-panel__header">
                    <div>
                      <h2>
                        {resultMetrics.scatter.y
                          ? `Spend × ${resultMetrics.scatter.y.label}`
                          : "Hiệu quả Creative theo kết quả"}
                      </h2>
                      <p>
                        {resultMetrics.scatter.bubbleSize
                          ? `Kích thước bubble theo ${resultMetrics.scatter.bubbleSize.label}; click để mở Creative Family.`
                          : selectedResultUnavailable
                            ? `${selectedResultLabel} đã được chọn; đang chờ normalized result cấp Creative Family.`
                            : "Chọn một kết quả có thể so sánh để mở scatter."}
                      </p>
                    </div>
                    <BarChart3 aria-hidden="true" size={18} />
                  </div>
                  {scatterFamilies.length ? (
                    <>
                      <CreativeScatterLegend />
                      <div
                        className="v2-scatter-confidence-legend"
                        role="list"
                        aria-label="Chú giải viền theo độ tin cậy dữ liệu"
                      >
                        {(
                          [
                            ["high", "Tin cậy cao"],
                            ["medium", "Tin cậy trung bình"],
                            ["low", "Tin cậy thấp"],
                            ["unknown", "Chưa có đánh giá"],
                          ] as const
                        ).map(([key, label]) => (
                          <span role="listitem" key={key}>
                            <i
                              className={`v2-scatter-confidence-legend__swatch v2-scatter-confidence-legend__swatch--${key}`}
                              aria-hidden="true"
                            />
                            {label}
                          </span>
                        ))}
                      </div>
                      <div
                        className="v2-scatter"
                        role="group"
                        aria-label={`Biểu đồ phân tán. ${scatterXAxisLabel}. ${
                          scatterYAxisLabel ?? "Trục Y chưa khả dụng"
                        }. ${
                          scatterMedianSpendText
                            ? `Median Spend: ${scatterMedianSpendText}`
                            : "Median Spend chưa khả dụng"
                        }. ${
                          scatterBenchmarkText
                            ? `Benchmark ${scatterBenchmarkMetricLabel}: ${scatterBenchmarkText}`
                            : scatterUsesCostPerResult
                              ? "Benchmark chưa khả dụng"
                              : "Đường benchmark Cost/Result không áp dụng cho chỉ số Y hiện tại"
                        }`}
                      >
                        <span
                          className="v2-scatter__y"
                          aria-label={scatterYAxisLabel ?? undefined}
                        >
                          {scatterYAxisLabel}
                        </span>
                        <span
                          className="v2-scatter__x"
                          aria-label={scatterXAxisLabel}
                        >
                          {scatterXAxisLabel} →
                        </span>
                        {scatterMedianLeft !== null &&
                        scatterMedianSpendText ? (
                          <>
                            <i
                              className="v2-scatter__benchmark-line v2-scatter__benchmark-line--median"
                              data-scatter-reference="median-spend"
                              aria-hidden="true"
                              style={{ left: `${scatterMedianLeft}%` }}
                            />
                            <span
                              className="v2-scatter__benchmark-label v2-scatter__benchmark-label--median"
                              data-scatter-label="median-spend"
                              style={{ left: `${scatterMedianLeft}%` }}
                            >
                              Median Spend: {scatterMedianSpendText}
                            </span>
                          </>
                        ) : null}
                        {scatterBenchmarkTop !== null &&
                        scatterBenchmarkText ? (
                          <>
                            <i
                              className="v2-scatter__benchmark-line v2-scatter__benchmark-line--result"
                              data-scatter-reference="result-benchmark"
                              aria-hidden="true"
                              style={{ top: `${scatterBenchmarkTop}%` }}
                            />
                            <span
                              className="v2-scatter__benchmark-label v2-scatter__benchmark-label--result"
                              data-scatter-label="result-benchmark"
                              style={{ top: `${scatterBenchmarkTop}%` }}
                            >
                              Benchmark {scatterBenchmarkMetricLabel}:{" "}
                              {scatterBenchmarkText}
                            </span>
                          </>
                        ) : null}
                        {scatterQuadrants ? (
                          <div
                            className="v2-scatter__quadrants"
                            aria-label="Bốn vùng quyết định theo Median Spend và benchmark"
                          >
                            {[
                              {
                                key: "low-spend-high-cost",
                                title: "Chi tiêu thấp · Cost cao",
                                action: "Tiếp tục test",
                                left: scatterQuadrants.left,
                                top: scatterQuadrants.top,
                              },
                              {
                                key: "high-spend-high-cost",
                                title: "Chi tiêu lớn · Cost cao",
                                action: "Cần kiểm tra",
                                left: scatterQuadrants.right,
                                top: scatterQuadrants.top,
                              },
                              {
                                key: "low-spend-good-cost",
                                title: "Chi tiêu thấp · Cost tốt",
                                action: "Có tiềm năng",
                                left: scatterQuadrants.left,
                                top: scatterQuadrants.bottom,
                              },
                              {
                                key: "high-spend-good-cost",
                                title: "Chi tiêu lớn · Cost tốt",
                                action: "Ứng viên mở rộng",
                                left: scatterQuadrants.right,
                                top: scatterQuadrants.bottom,
                              },
                            ].map((quadrant) => (
                              <span
                                className="v2-scatter__quadrant"
                                data-scatter-quadrant={quadrant.key}
                                key={quadrant.key}
                                style={{
                                  left: `${quadrant.left}%`,
                                  top: `${quadrant.top}%`,
                                }}
                              >
                                <small>{quadrant.title}</small>
                                <strong>{quadrant.action}</strong>
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {scatterFamilies.slice(0, 28).map((item) => {
                          const {
                            family,
                            resultValue,
                            efficiencyValue,
                          } = item;
                          const performance = family.performance!;
                          const evaluation =
                            performance.evaluation?.resultKey ===
                            primaryResultKey
                              ? performance.evaluation
                              : null;
                          const confidence: ScatterConfidence =
                            evaluation?.dataConfidence ?? "unknown";
                          const confidenceText =
                            scatterConfidenceLabel(confidence);
                          const benchmarkDeltaText = scatterDeltaLabel(
                            evaluation?.deltaPercent,
                          );
                          const left =
                            8 +
                            (performance.spend / maxScatterSpend) * 82;
                          const top =
                            8 +
                            (1 -
                              efficiencyValue /
                                maxScatterEfficiency) *
                              74;
                          const pointSize =
                            14 +
                            Math.sqrt(
                              resultValue / maxScatterResult,
                            ) *
                              18;
                          const status = creativePerformanceStatus(
                            performance,
                            primaryResultKey,
                          );
                          const spendText = formatMoney(
                            performance.spend,
                            performance.currency,
                          );
                          const efficiencyLabel =
                            resultMetrics.scatter.y?.label ??
                            "Hiệu quả";
                          const efficiencyText = formatFamilyMetric(
                            efficiencyValue,
                            resultMetrics.scatter.y?.valueType ??
                              null,
                            performance.currency,
                          );
                          const resultLabel =
                            primaryResultCard?.label ??
                            primaryResultDefinition?.label ??
                            "Kết quả";
                          const resultText = formatFamilyMetric(
                            resultValue,
                            primaryResultCard?.valueType ?? null,
                            performance.currency,
                          );
                          return (
                            <ContextualEntityLink
                              key={family.id}
                              className={`v2-scatter__point v2-scatter__point--${status.key} v2-scatter__point--confidence-${confidence}`}
                              href={creativeFullDetailHref({
                                familyId: family.id,
                                query,
                                tab: "performance",
                                originPathname: "/overview",
                              })}
                              drawerHref={href("/overview", query, {
                                selected: family.id,
                                tab: "performance",
                              })}
                              entityId={family.id}
                              ariaLabel={scatterBubbleAriaLabel({
                                name: family.name,
                                statusLabel: status.label,
                                spend: spendText,
                                efficiencyLabel,
                                efficiencyValue: efficiencyText,
                                resultLabel,
                                resultValue: resultText,
                                confidenceLabel: confidenceText,
                                benchmarkDeltaLabel:
                                  benchmarkDeltaText,
                              })}
                              style={creativeScatterPointStyle(
                                left,
                                top,
                                pointSize,
                              )}
                            >
                              <CreativeScatterTooltip
                                name={family.name}
                                status={status.key}
                                statusLabel={status.label}
                                spend={spendText}
                                efficiencyLabel={efficiencyLabel}
                                efficiencyValue={efficiencyText}
                                resultLabel={resultLabel}
                                resultValue={resultText}
                                confidenceLabel={confidenceText}
                                benchmarkDeltaLabel={
                                  benchmarkDeltaText
                                }
                                horizontal={
                                  left > 68
                                    ? "right"
                                    : left < 32
                                      ? "left"
                                      : "center"
                                }
                                vertical={
                                  top < 30 ? "below" : "above"
                                }
                              />
                            </ContextualEntityLink>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="v2-compact-empty">
                      <BarChart3 aria-hidden="true" size={22} />
                      <p>
                        {selectedResultUnavailable
                          ? `${selectedResultLabel} đã được chọn nhưng normalized result cấp Creative Family chưa sẵn sàng.`
                          : scatterUnavailableMessage(
                              resultMetrics.scatter.unavailableReason,
                            )}
                      </p>
                    </div>
                  )}
                </section>
            <section className="v2-panel v2-trend-panel">
              <div className="v2-panel__header">
                <div>
                  <h2>
                    {primaryResultDefinition
                      ? `Xu hướng ${primaryResultDefinition.label}`
                      : "Xu hướng kết quả và hiệu quả"}
                  </h2>
                  <p>
                    Result và chỉ số hiệu quả khả dụng theo ngày, cùng tiền tệ.
                  </p>
                </div>
                <BarChart3 aria-hidden="true" size={18} />
              </div>
              {trendSeries.length && trendCurrency ? (
                <div className="v2-trend-series">
                  {trendSeries.map(({ chart, metric }) => (
                    <TrendSeriesChart
                      chart={chart}
                      metric={metric}
                      currency={trendCurrency}
                      key={`${metric.source}:${metric.resultKey}`}
                    />
                  ))}
                </div>
              ) : (
                <div className="v2-compact-empty">
                  <BarChart3 aria-hidden="true" size={22} />
                  <p>
                    {primaryResultKey
                      ? "Chưa có đủ chuỗi normalized result theo ngày cho kết quả đã chọn."
                      : selectedResultUnavailable
                        ? `${selectedResultLabel} đã được chọn nhưng normalized result theo ngày chưa sẵn sàng.`
                        : "Chọn một kết quả để xem xu hướng có thể so sánh."}
                  </p>
                </div>
              )}
            </section>
            <section className="v2-panel v2-ranked-list">
              <div className="v2-panel__header">
                <div>
                  <h2>Top Creative</h2>
                  <p>
                    {primaryResultDefinition
                      ? `Theo ${primaryResultDefinition.label} Meta ghi nhận trong kỳ.`
                      : selectedResultUnavailable
                        ? `${selectedResultLabel} đã được chọn nhưng normalized result cấp Creative Family chưa sẵn sàng.`
                        : "Chọn một kết quả để xếp hạng cùng bản chất."}
                  </p>
                </div>
                <Sparkles aria-hidden="true" size={18} />
              </div>
              {top.length ? (
                <ol>
                  {top.map((item, index) => (
                    <TopCreative
                      family={item.family}
                      query={query}
                      index={index}
                      resultLabel={
                        primaryResultDefinition?.shortLabel ??
                        "kết quả"
                      }
                      resultDisplay={formatFamilyMetric(
                        item.resultValue,
                        primaryResultCard?.valueType ?? null,
                        item.family.performance?.currency ?? null,
                      )}
                      efficiencyLabel={
                        primaryEfficiencyCard?.label ?? null
                      }
                      efficiencyDisplay={formatFamilyMetric(
                        item.efficiencyValue,
                        primaryEfficiencyCard?.valueType ?? null,
                        item.family.performance?.currency ?? null,
                      )}
                      resultKey={primaryResultKey}
                      key={item.family.id}
                    />
                  ))}
                </ol>
              ) : (
                <div className="v2-compact-empty">
                  <Sparkles aria-hidden="true" size={22} />
                  <p>
                    {selectedResultUnavailable
                      ? `Chưa thể xếp hạng theo ${selectedResultLabel} vì dữ liệu chuẩn hóa cấp Creative Family chưa sẵn sàng.`
                      : "Chưa có kết quả cấp Creative Family đủ tin cậy để xếp hạng."}
                  </p>
                </div>
              )}
            </section>
            <section className="v2-panel v2-action-list">
              <div className="v2-panel__header">
                <div>
                  <h2>Creative cần hành động</h2>
                  <p>Lý do và bước tiếp theo có thể kiểm tra được.</p>
                </div>
                <AlertTriangle aria-hidden="true" size={18} />
              </div>
              {actions.length ? (
                <ul>
                  {actions.map((family) => (
                    <li key={family.id}>
                      <Image
                        src={family.imageUrl}
                        alt=""
                        width={72}
                        height={72}
                        unoptimized
                      />
                      <ContextualEntityLink
                        href={creativeFullDetailHref({
                          familyId: family.id,
                          query,
                          tab: "rating",
                          originPathname: "/overview",
                        })}
                        drawerHref={href("/overview", query, {
                          selected: family.id,
                          tab: "rating",
                        })}
                        entityId={family.id}
                      >
                        <strong>{family.name}</strong>
                        <small>
                          {family.performance?.evaluation?.resultKey ===
                          primaryResultKey
                            ? family.performance.evaluation.reasons[0] ??
                              creativeEvaluationAction(
                                family.performance.evaluation,
                              )
                            : family.performance
                              ? creativeEvaluationAction(null)
                              : "Chưa có dữ liệu delivery"}
                        </small>
                      </ContextualEntityLink>
                      <Link
                        className="v2-link"
                        href={href("/overview", query, {
                          selected: family.id,
                          tab: "rating",
                        })}
                        scroll={false}
                      >
                        Xem đề xuất
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="v2-compact-empty">
                  <ShieldCheck aria-hidden="true" size={22} />
                  <p>
                    {hasCreativeEvaluation
                      ? "Không có cảnh báo Creative trong bộ lọc hiện tại."
                      : selectedResultUnavailable
                        ? `Đã chọn ${selectedResultLabel}, nhưng chưa thể đề xuất hành động khi normalized result cấp Creative Family chưa sẵn sàng.`
                        : selectedResultKey
                          ? "Chưa xếp loại Creative cho kết quả này khi benchmark hoặc normalized result cấp Family chưa đủ."
                          : "Chọn một kết quả để nhận đề xuất hành động cho Creative."}
                  </p>
                </div>
              )}
            </section>
            <section className="v2-panel v2-data-quality-card v2-fatigue-panel">
              <div className="v2-panel__header">
                <div>
                  <h2>Dấu hiệu mỏi Creative</h2>
                  <p>
                    Tách riêng tín hiệu xu hướng khỏi điểm hiệu quả tổng thể.
                  </p>
                </div>
                <BarChart3 aria-hidden="true" size={18} />
              </div>
              {fatigueEvaluableCount > 0 ? (
                <ul aria-label="Phân bố trạng thái mỏi Creative">
                  {fatigueStatuses.map((status) => (
                    <li key={status.key}>
                      <span
                        className={`v2-quality-dot v2-quality-dot--${status.tone}`}
                        aria-hidden="true"
                      />
                      <div>
                        <strong>{status.label}</strong>
                        <small>
                          {status.count} Creative · {status.detail}
                        </small>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="v2-compact-empty">
                  <ShieldCheck aria-hidden="true" size={22} />
                  <p>
                    {selectedResultUnavailable
                      ? `Chưa thể đánh giá độ mỏi theo ${selectedResultLabel} khi normalized result cấp Creative Family chưa sẵn sàng.`
                      : "Chưa đủ dữ liệu xu hướng hoặc khoảng ngày còn quá ngắn để đánh giá độ mỏi."}
                  </p>
                </div>
              )}
              {fatigueInsufficientCount > 0 ? (
                <p className="v2-fatigue-note">
                  {fatigueInsufficientCount} Creative chưa đủ dữ liệu xu hướng
                  nên không được gán trạng thái mỏi.
                </p>
              ) : null}
            </section>
            <section className="v2-panel v2-data-quality-card">
              <div className="v2-panel__header">
                <div>
                  <h2>Chất lượng dữ liệu</h2>
                  <p>Trạng thái mới nhất dùng chung với màn chi tiết.</p>
                </div>
                <ShieldCheck aria-hidden="true" size={18} />
              </div>
              <ul>
                {dashboard.checklist.map((item) => {
                  const details = (
                    <>
                      <strong>{item.label}</strong>
                      <small>{item.detail}</small>
                    </>
                  );
                  return (
                    <li key={item.label}>
                      <span
                        className={`v2-quality-dot v2-quality-dot--${item.status}`}
                        aria-hidden="true"
                      />
                      {item.status === "ready" ? (
                        <div>{details}</div>
                      ) : (
                        <Link
                          className="v2-quality-link"
                          href={overviewHealthHref(
                            item.label,
                            query,
                          )}
                          aria-label={`Xem chi tiết ${item.label}`}
                        >
                          <span>{details}</span>
                          <span className="v2-link">
                            Xem chi tiết
                            <ArrowRight
                              aria-hidden="true"
                              size={13}
                            />
                          </span>
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
              <Link
                className="v2-link"
                href={buildNavigationHref(
                  "/data-health#health-issues",
                  query,
                )}
              >
                Mở Chất lượng dữ liệu
                <ArrowRight aria-hidden="true" size={15} />
              </Link>
            </section>
          </div>
            </>
          )}
        </>
      )}
      {selectedDrawer}
    </div>
  );
}
