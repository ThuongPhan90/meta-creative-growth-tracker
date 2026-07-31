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

type Query = Record<string, string | string[] | undefined>;

export type OverviewTrendPoint = CanonicalResultTrendPoint;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
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

function supportedTrendMetric(
  primaryResultKey: string | null,
  label: string | undefined,
  valueType: ResultKpiCard["valueType"] | undefined,
): TrendMetric | null {
  return primaryResultKey && label && valueType
    ? { resultKey: primaryResultKey, label, valueType }
    : null;
}

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

function buildTrendChartModel(
  points: OverviewTrendPoint[],
  metric: TrendMetric,
  currency: string,
): TrendChartModel | null {
  const values = points
    .map((point) => point.efficiencyValues[metric.resultKey])
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
    const value = point.efficiencyValues[metric.resultKey];
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
  selectedDrawer,
}: {
  dashboard: DashboardViewModel;
  creatives: CreativeRow[];
  delivery: readonly DeliveryMetricRow[];
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
  selectedDrawer?: React.ReactNode;
}) {
  const families = groupCreativeFamiliesForView(creatives);
  const deliverySummary = summarizeDelivery(delivery);
  const currency = deliverySummary.singleCurrency?.currency ?? null;
  const primaryResultKey =
    resultMetrics.metadata.primaryResultKey;
  const primaryResultCard = resultMetrics.kpiCards.find(
    (card) =>
      card.key === `result:${primaryResultKey ?? ""}`,
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
  const maxScatterSpend = Math.max(
    ...scatterFamilies.map(
      ({ family }) => family.performance?.spend ?? 0,
    ),
    1,
  );
  const maxScatterEfficiency = Math.max(
    ...scatterFamilies.map((item) => item.efficiencyValue),
    1,
  );
  const maxScatterResult = Math.max(
    ...scatterFamilies.map((item) => item.resultValue),
    1,
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
  const trendMetric = supportedTrendMetric(
    primaryResultKey,
    primaryEfficiencyCard?.label,
    primaryEfficiencyCard?.valueType,
  );
  const trendChart =
    trendCurrency && trendMetric
      ? buildTrendChartModel(visibleTrend, trendMetric, trendCurrency)
      : null;
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
        preserved={reportingContextHiddenFields(query)}
      />
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
                      .map(
                        (result) =>
                          `${formatCompactNumber(result.value ?? 0)} ${result.label}`,
                      )
                      .join(" · ") || "Chưa có kết quả Meta ghi nhận"}
                  </strong>
                  <small>Chọn mục tiêu để phân tích Creative</small>
                </Link>
              ))}
            </section>
          ) : null}
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
                    : "Chọn một mục tiêu và kết quả để đánh giá"}
                </strong>
                <small>
                  Không dùng nhãn hoặc benchmark của kết quả khác. Creative chỉ
                  được xếp loại khi có mapping, benchmark đúng peer group và đủ
                  ngưỡng mẫu.
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
                      : "Chọn một kết quả có thể so sánh để mở scatter."}
                  </p>
                </div>
                <BarChart3 aria-hidden="true" size={18} />
              </div>
              {scatterFamilies.length ? (
                <>
                  <CreativeScatterLegend />
                  <div
                    className="v2-scatter"
                    role="group"
                    aria-label={`Biểu đồ phân tán. ${scatterXAxisLabel}. ${
                      scatterYAxisLabel ?? "Trục Y chưa khả dụng"
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
                    <i className="v2-scatter__line v2-scatter__line--x" />
                    <i className="v2-scatter__line v2-scatter__line--y" />
                    {scatterFamilies.slice(0, 28).map((item) => {
                      const {
                        family,
                        resultValue,
                        efficiencyValue,
                      } = item;
                      const performance = family.performance!;
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
                          className={`v2-scatter__point v2-scatter__point--${status.key}`}
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
                    {scatterUnavailableMessage(
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
                    {primaryEfficiencyCard
                      ? `Xu hướng ${primaryEfficiencyCard.label}`
                      : "Xu hướng hiệu quả theo kết quả"}
                  </h2>
                  <p>
                    Theo ngày và cùng tiền tệ; số chuyển đổi là Meta-attributed.
                  </p>
                </div>
                <BarChart3 aria-hidden="true" size={18} />
              </div>
              {trendChart && trendMetric && trendCurrency ? (
                <div className="v2-trend-chart">
                  <div
                    className="v2-trend-legend"
                    aria-label="Chú giải biểu đồ xu hướng"
                  >
                    <span>
                      <i
                        className="v2-trend-dot v2-trend-dot--efficiency"
                        aria-hidden="true"
                      />
                      <strong>{trendMetric.label}</strong>
                    </span>
                    <small>Meta-attributed · theo ngày</small>
                    <strong>
                      Đơn vị: {trendUnit(trendMetric, trendCurrency)}
                    </strong>
                  </div>
                  <div className="v2-trend-plot">
                    <div
                      className="v2-trend-y-axis"
                      aria-label={`Trục tung ${trendMetric.label}, đơn vị ${trendUnit(
                        trendMetric,
                        trendCurrency,
                      )}`}
                    >
                      <span className="v2-trend-y-axis__label">
                        {trendMetric.label} (
                        {trendUnit(trendMetric, trendCurrency)})
                      </span>
                      <div className="v2-trend-y-axis__ticks">
                        <span data-trend-axis-tick="max">
                          {formatTrendTick(
                            trendChart.max,
                            trendMetric,
                            trendCurrency,
                          )}
                        </span>
                        <span data-trend-axis-tick="min">
                          {formatTrendTick(
                            trendChart.min,
                            trendMetric,
                            trendCurrency,
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="v2-trend-canvas">
                      <svg
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        role="group"
                        aria-labelledby="overview-trend-title overview-trend-description"
                      >
                        <title id="overview-trend-title">
                          {`Xu hướng ${trendMetric.label} theo ngày`}
                        </title>
                        <desc id="overview-trend-description">
                          {`${trendChart.points.length} điểm dữ liệu, đơn vị ${trendCurrency}. Dùng Tab để đọc từng điểm.`}
                        </desc>
                        <path
                          className="v2-trend-line v2-trend-line--efficiency"
                          d={trendChart.path}
                          aria-hidden="true"
                        />
                      </svg>
                      <div
                        className="v2-trend-point-layer"
                        aria-label="Các điểm dữ liệu xu hướng"
                      >
                        {trendChart.points.map((point) => (
                          <span
                            className="v2-trend-point"
                            tabIndex={0}
                            role="img"
                            aria-label={point.tooltip}
                            title={point.tooltip}
                            data-tooltip={point.tooltip}
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
                        <span>{visibleTrend[0]?.date}</span>
                        <strong>Ngày</strong>
                        <span>{visibleTrend.at(-1)?.date}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="v2-compact-empty">
                  <BarChart3 aria-hidden="true" size={22} />
                  <p>
                    {primaryResultKey
                      ? "Chưa có đủ chuỗi normalized result theo ngày cho kết quả đã chọn."
                      : "Chọn một mục tiêu và kết quả để xem xu hướng có thể so sánh."}
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
                    Chưa có kết quả cấp Creative Family đủ tin cậy để xếp hạng.
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
                      : "Chưa xếp loại Creative cho kết quả này khi benchmark hoặc normalized result cấp Family chưa đủ."}
                  </p>
                </div>
              )}
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
      {selectedDrawer}
    </div>
  );
}
