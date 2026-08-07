import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Columns3,
  ExternalLink,
  Grid2X2,
  ImageIcon,
  Info,
  ListFilter,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";

import { ContextualEntityLink } from "@/components/ui/contextual-entity-link";
import { CopyIdButton } from "@/components/ui/copy-id-button";
import {
  CreativeScatterLegend,
  CreativeScatterTooltip,
} from "@/components/ui/creative-scatter-accessibility";
import { EntityDrawer } from "@/components/ui/entity-drawer";
import {
  ReportingContext,
  type ReportingFreshness,
} from "@/components/ui/reporting-context";
import {
  formatCompactNumber,
  formatMoney,
  formatNumber,
  formatPercent,
} from "@/lib/presentation/formatters";
import {
  CREATIVE_PERFORMANCE_STATUSES,
  creativePerformanceStatus,
  creativePerformanceStatusKey,
  scatterAxisLabel,
  scatterBubbleAriaLabel,
} from "@/lib/presentation/creative-performance-status";
import {
  groupCreativeFamiliesForView,
  type CreativeFamilyViewItem,
} from "@/lib/presentation/creative-family-view";
import type { ReportingBarModel } from "@/lib/presentation/reporting-bar";
import {
  buildContextHref,
  NAVIGATION_QUERY_KEYS,
  parseNavigationQuery,
  reportingContextHiddenFields,
  type CreativeDrilldownMetric,
  type SortDirection,
} from "@/lib/navigation/query";
import {
  summarizeDelivery,
  type DeliveryMetricRow,
  type DynamicResultMetricsModel,
  type DynamicResultTableColumn,
  type EvaluationExplanation,
  type ResultKpiCard,
} from "@/lib/reporting";
import type {
  CreativePerformanceSummary,
  CreativeRow,
} from "@/types/view-models";

type Query = Record<string, string | string[] | undefined>;
export type CreativeDrawerOrigin =
  | "/creatives"
  | "/library"
  | "/overview";

type FamilyView = CreativeFamilyViewItem;

const METRIC_LABELS: Record<CreativeDrilldownMetric, string> = {
  spend: "Spend",
  impressions: "Impressions",
  reach: "Reach",
  frequency: "Frequency",
  cpm: "CPM",
  link_clicks: "Link Clicks",
  link_ctr: "Link CTR",
  cpc_link: "CPC Link",
  primary_result: "Kết quả chính",
  cost_per_result: "Chi phí/Kết quả",
  result_rate: "Result Rate",
  value: "Value",
  roas: "ROAS",
  installs: "Kết quả chính (URL cũ)",
  registrations: "Kết quả chính (URL cũ)",
  cpi: "Chi phí/Kết quả (URL cũ)",
  cpa: "Chi phí/Kết quả (URL cũ)",
  conversion: "Result Rate (URL cũ)",
};

const DETAIL_TABS = [
  { value: "preview", label: "Preview" },
  { value: "performance", label: "Hiệu quả" },
  { value: "rating", label: "Đánh giá" },
  { value: "usage", label: "Nơi đang sử dụng" },
  { value: "metadata", label: "Metadata" },
] as const;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function href(
  pathname: string,
  query: Query,
  overrides: Record<string, string | null | undefined> = {},
) {
  const allowed = new Set<string>([
    ...NAVIGATION_QUERY_KEYS,
    "q",
    "view",
    "page",
    "delivery",
    "origin",
    "explain",
  ]);
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(query)) {
    if (!allowed.has(key)) continue;
    const value = first(raw);
    if (value) params.set(key, value.slice(0, 500));
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (!allowed.has(key)) continue;
    if (value === null || value === undefined || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }
  const suffix = params.toString();
  return `${pathname}${suffix ? `?${suffix}` : ""}`;
}

export function creativeDrawerTabHref({
  familyId,
  query,
  tab,
  fullPage = false,
  originPathname = "/creatives",
}: {
  familyId: string;
  query: Query;
  tab: string;
  fullPage?: boolean;
  originPathname?: CreativeDrawerOrigin;
}) {
  return href(
    fullPage ? `/creatives/${familyId}` : originPathname,
    query,
    {
      selected: fullPage ? null : familyId,
      tab,
    },
  );
}

function creativeOriginValue(originPathname: CreativeDrawerOrigin) {
  return originPathname.slice(1);
}

export function creativeFullDetailHref({
  familyId,
  query,
  tab,
  originPathname,
}: {
  familyId: string;
  query: Query;
  tab: string;
  originPathname: CreativeDrawerOrigin;
}) {
  return href(`/creatives/${familyId}`, query, {
    selected: null,
    tab,
    origin: creativeOriginValue(originPathname),
  });
}

function creativeOriginPathname(
  value: string | string[] | undefined,
): CreativeDrawerOrigin {
  const origin = first(value);
  if (origin === "overview") return "/overview";
  if (origin === "library") return "/library";
  return "/creatives";
}

export function creativeDetailBackHref(query: Query) {
  return href(creativeOriginPathname(query.origin), query, {
    origin: null,
    selected: null,
    tab: null,
  });
}

export function creativeDetailBackLabel(query: Query) {
  const origin = creativeOriginPathname(query.origin);
  if (origin === "/overview") return "Quay lại Tổng quan";
  if (origin === "/library") return "Quay lại Thư viện Creative";
  return "Quay lại Hiệu quả Creative";
}

export function creativeScatterPointStyle(
  left: number,
  top: number,
  visualSize: number,
): CSSProperties {
  return {
    left: `${left}%`,
    top: `${top}%`,
    "--bubble-size": `${visualSize}px`,
  } as CSSProperties;
}

export function creativePerformanceGroup(
  performance: CreativePerformanceSummary | null | undefined,
) {
  return creativePerformanceStatusKey(performance);
}

function confidenceLabel(
  performance: CreativePerformanceSummary | null | undefined,
) {
  const confidence =
    performance?.evaluation?.dataConfidence ??
    performance?.confidence?.confidence;
  if (!confidence) return "Chưa đánh giá";
  if (confidence === "high") return "Cao";
  if (confidence === "medium") return "Trung bình";
  return "Thấp";
}

export function CreativeEvaluationStatus({
  performance,
  resultKey,
}: {
  performance: CreativePerformanceSummary | null | undefined;
  resultKey: string | null | undefined;
}) {
  const status = creativePerformanceStatus(performance, resultKey);
  return (
    <span className={`v2-chip v2-chip--${status.tone}`}>
      {status.label}
    </span>
  );
}

export function creativeEvaluationAction(
  evaluation: EvaluationExplanation | null | undefined,
) {
  if (!evaluation) return "Tiếp tục thu thập dữ liệu để có đề xuất.";
  if (evaluation.recommendationKey === "scale_controlled") {
    return "Có thể tiếp tục mở rộng có kiểm soát.";
  }
  if (evaluation.recommendationKey === "hold_monitor") {
    return "Giữ nhịp phân phối và theo dõi thêm.";
  }
  if (evaluation.recommendationKey === "continue_test") {
    return "Tiếp tục test đến khi đạt ngưỡng dữ liệu.";
  }
  if (evaluation.recommendationKey === "refresh_creative") {
    return "Làm mới Creative và kiểm tra lại xu hướng.";
  }
  if (evaluation.recommendationKey === "inspect_distribution") {
    return "Kiểm tra phân phối, placement và thông điệp.";
  }
  return "Kiểm tra mapping và chất lượng dữ liệu.";
}

function fatigueStatusLabel(
  status: EvaluationExplanation["fatigueStatus"] | undefined,
) {
  if (status === "stable") return "Ổn định";
  if (status === "monitor") return "Theo dõi thêm";
  if (status === "fatigue_risk") return "Có dấu hiệu mỏi";
  return "Chưa đủ dữ liệu";
}

function evaluationConfidenceLabel(
  confidence: EvaluationExplanation["dataConfidence"] | undefined,
) {
  if (confidence === "high") return "Cao";
  if (confidence === "medium") return "Trung bình";
  return "Thấp";
}

export function CreativeBenchmarkDisclosure({
  resultLabel,
  metricLabel,
  actualLabel,
  benchmarkLabel,
  deltaLabel,
  peerGroupLabel,
  sampleSize,
  reasons,
  initiallyOpen = false,
}: {
  resultLabel: string;
  metricLabel: string;
  actualLabel: string;
  benchmarkLabel: string;
  deltaLabel: string;
  peerGroupLabel: string;
  sampleSize: number;
  reasons: readonly string[];
  initiallyOpen?: boolean;
}) {
  return (
    <details
      className="v2-benchmark-disclosure"
      id="benchmark-explanation"
      open={initiallyOpen}
    >
      <summary aria-label={`Giải thích benchmark cho ${resultLabel}`}>
        <span>
          <Info aria-hidden="true" size={15} />
          Benchmark
        </span>
        <strong>{benchmarkLabel}</strong>
      </summary>
      <div className="v2-benchmark-disclosure__panel">
        <dl>
          <div>
            <dt>Metric</dt>
            <dd>{metricLabel}</dd>
          </div>
          <div>
            <dt>Giá trị hiện tại</dt>
            <dd>{actualLabel}</dd>
          </div>
          <div>
            <dt>Benchmark</dt>
            <dd>{benchmarkLabel}</dd>
          </div>
          <div>
            <dt>Chênh lệch</dt>
            <dd>{deltaLabel}</dd>
          </div>
          <div>
            <dt>Peer group</dt>
            <dd>{peerGroupLabel}</dd>
          </div>
          <div>
            <dt>Cỡ mẫu</dt>
            <dd>{formatNumber(sampleSize)} Creative Family</dd>
          </div>
        </dl>
        <div className="v2-benchmark-disclosure__reason">
          <strong>Vì sao Creative được đánh giá như vậy?</strong>
          <p>
            {reasons.length
              ? reasons.join(" ")
              : "Chưa có lý do đánh giá trong snapshot hiện tại."}
          </p>
        </div>
      </div>
    </details>
  );
}

function metricValue(
  family: FamilyView,
  metric: CreativeDrilldownMetric,
  resultKey?: string,
): number | null {
  const performance = family.performance;
  if (!performance) return null;

  switch (metric) {
    case "spend":
      return performance.spend;
    case "impressions":
      return performance.impressions;
    case "reach":
    case "frequency":
      return null;
    case "cpm":
      return performance.impressions > 0
        ? (performance.spend / performance.impressions) * 1_000
        : null;
    case "link_clicks":
      return performance.linkCtr === null
        ? null
        : (performance.linkCtr / 100) * performance.impressions;
    case "link_ctr":
      return performance.linkCtr;
    case "cpc_link": {
      const linkClicks =
        performance.linkCtr === null
          ? null
          : (performance.linkCtr / 100) * performance.impressions;
      return linkClicks && linkClicks > 0
        ? performance.spend / linkClicks
        : null;
    }
    case "primary_result":
      if (!resultKey) return null;
      const normalized = performance.resultValues?.[resultKey];
      return typeof normalized === "number" &&
        Number.isFinite(normalized)
        ? normalized
        : null;
    case "cost_per_result": {
      const result = metricValue(
        family,
        "primary_result",
        resultKey,
      );
      return result && result > 0 ? performance.spend / result : null;
    }
    case "result_rate": {
      const result = metricValue(
        family,
        "primary_result",
        resultKey,
      );
      const clicks = metricValue(family, "link_clicks");
      return result !== null && clicks && clicks > 0
        ? (result / clicks) * 100
        : null;
    }
    case "value":
    case "roas":
      return null;
    case "installs":
    case "registrations":
      return metricValue(family, "primary_result", resultKey);
    case "cpi":
    case "cpa":
      return metricValue(family, "cost_per_result", resultKey);
    case "conversion":
      return metricValue(family, "result_rate", resultKey);
  }
}

function familyCanonicalResultValue(
  family: FamilyView,
  canonicalResultKey: string,
) {
  return metricValue(
    family,
    "primary_result",
    canonicalResultKey,
  );
}

function familyDynamicColumnValue(
  family: FamilyView,
  column: DynamicResultTableColumn,
) {
  const performance = family.performance;
  if (!performance) return null;
  const result = familyCanonicalResultValue(
    family,
    column.canonicalResultKey,
  );
  if (column.key.startsWith("result:")) return result;
  if (result === null || result <= 0) return null;
  if (column.valueType === "currency") {
    return performance.spend / result;
  }
  if (column.valueType === "percent") {
    const clicks = metricValue(family, "link_clicks");
    return clicks && clicks > 0 ? (result / clicks) * 100 : null;
  }
  if (
    column.valueType === "ratio" &&
    column.canonicalResultKey === "purchase_value"
  ) {
    return performance.spend > 0
      ? result / performance.spend
      : null;
  }
  return null;
}

function formatDynamicValue(
  value: number | null,
  valueType: ResultKpiCard["valueType"],
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
  return formatCompactNumber(value);
}

function dynamicColumnMetric(
  column: DynamicResultTableColumn,
  primaryResultKey: string | null,
): CreativeDrilldownMetric | null {
  if (column.canonicalResultKey !== primaryResultKey) return null;
  return column.key.startsWith("result:")
    ? "primary_result"
    : column.valueType === "percent"
      ? "result_rate"
      : column.valueType === "ratio"
        ? "roas"
        : "cost_per_result";
}

function resultCardMetric(
  card: ResultKpiCard,
): CreativeDrilldownMetric {
  if (card.key.startsWith("result:")) return "primary_result";
  if (card.key.startsWith("efficiency:")) {
    if (card.valueType === "percent") return "result_rate";
    if (card.valueType === "ratio") return "roas";
    return "cost_per_result";
  }
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

function resultCardSort(card: ResultKpiCard): SortDirection {
  return card.key === "cpm" ||
    card.key.startsWith("efficiency:") &&
      card.valueType === "currency"
    ? "asc"
    : "desc";
}

export function sortCreativeFamiliesForMetric(
  families: readonly CreativeFamilyViewItem[],
  metric: CreativeDrilldownMetric,
  direction: SortDirection,
  resultKey?: string,
) {
  return families
    .map((family, index) => ({ family, index }))
    .sort((left, right) => {
      const leftValue = metricValue(left.family, metric, resultKey);
      const rightValue = metricValue(right.family, metric, resultKey);
      if (leftValue === null && rightValue === null) {
        return left.index - right.index;
      }
      if (leftValue === null) return 1;
      if (rightValue === null) return -1;
      const difference = leftValue - rightValue;
      if (difference === 0) return left.index - right.index;
      return direction === "asc" ? difference : -difference;
    })
    .map(({ family }) => family);
}

function defaultSortDirection(
  metric: CreativeDrilldownMetric,
): SortDirection {
  return [
    "cpi",
    "cpa",
    "cpm",
    "cpc_link",
    "cost_per_result",
  ].includes(metric)
    ? "asc"
    : "desc";
}

function metricCellClass(
  activeMetric: CreativeDrilldownMetric | undefined,
  cellMetric: CreativeDrilldownMetric,
) {
  return activeMetric === cellMetric
    ? "v2-creative-metric--active"
    : undefined;
}

function MetricColumnHeader({
  activeMetric,
  direction,
  metric,
}: {
  activeMetric?: CreativeDrilldownMetric;
  direction: SortDirection;
  metric: CreativeDrilldownMetric;
}) {
  const active = activeMetric === metric;
  return (
    <span
      role="columnheader"
      className={metricCellClass(activeMetric, metric)}
      aria-sort={
        active
          ? direction === "asc"
            ? "ascending"
            : "descending"
          : undefined
      }
    >
      {METRIC_LABELS[metric]}
      {active ? (
        <small aria-hidden="true">
          {direction === "asc" ? " ↑" : " ↓"}
        </small>
      ) : null}
    </span>
  );
}

function matchesFilters(
  family: FamilyView,
  filters: {
    query: string;
    os: string;
    format: string;
    performance: string;
    dataStatus: string;
    campaign: string;
    delivery: string;
  },
) {
  const haystack = [
    family.name,
    family.id,
    family.assetKey,
    ...family.aliases,
    family.pageName ?? "",
    family.entityLinks?.assetId ?? "",
    ...(family.entityLinks?.metaCreativeIds ?? []),
    ...(family.entityLinks?.adIds ?? []),
  ]
    .join(" ")
    .toLocaleLowerCase("vi-VN");
  if (
    filters.query &&
    !haystack.includes(filters.query.toLocaleLowerCase("vi-VN"))
  ) {
    return false;
  }
  if (
    filters.os &&
    !family.platforms.some(
      (platform) =>
        platform.toLocaleLowerCase("vi-VN") ===
        filters.os.toLocaleLowerCase("vi-VN"),
    )
  ) {
    return false;
  }
  if (
    filters.format &&
    family.format.toLocaleLowerCase("vi-VN") !==
      filters.format.toLocaleLowerCase("vi-VN")
  ) {
    return false;
  }
  if (
    filters.performance &&
    creativePerformanceGroup(family.performance) !== filters.performance
  ) {
    return false;
  }
  if (
    filters.dataStatus &&
    family.performance?.confidence?.dataStatus !== filters.dataStatus
  ) {
    return false;
  }
  if (
    filters.campaign &&
    !family.entityLinks?.campaignIds.includes(filters.campaign)
  ) {
    return false;
  }
  if (filters.delivery === "active" && family.activeAdCount === 0) {
    return false;
  }
  if (
    filters.delivery === "inactive" &&
    (family.adCount === 0 || family.activeAdCount > 0)
  ) {
    return false;
  }
  if (filters.delivery === "unlinked" && family.adCount > 0) {
    return false;
  }
  return true;
}

export function CreativeDrawerContent({
  family,
  query,
  resultMetrics,
  fullPage = false,
  originPathname = "/creatives",
}: {
  family: FamilyView;
  query: Query;
  resultMetrics?: DynamicResultMetricsModel;
  fullPage?: boolean;
  originPathname?: CreativeDrawerOrigin;
}) {
  const tab = DETAIL_TABS.some((item) => item.value === first(query.tab))
    ? first(query.tab)!
    : "preview";
  const performance = family.performance;
  const resultKey =
    resultMetrics?.metadata.primaryResultKey ??
    first(query.result)?.trim() ??
    "";
  const configuredResult =
    resultMetrics?.availableResults.find(
      (result) => result.canonicalKey === resultKey,
    ) ?? null;
  const resultColumn = resultMetrics?.dynamicTableColumns.find(
    (column) => column.key === `result:${resultKey}`,
  );
  const efficiencyColumn =
    resultMetrics?.dynamicTableColumns.find(
      (column) => column.key === `efficiency:${resultKey}`,
    ) ?? null;
  const resultLabel = configuredResult?.label ?? null;
  const resultValueType = resultColumn?.valueType ?? "count";
  const resultValue = resultKey
    ? familyCanonicalResultValue(family, resultKey)
    : null;
  const efficiencyValue =
    efficiencyColumn
      ? familyDynamicColumnValue(family, efficiencyColumn)
      : null;
  const efficiencyLabel = efficiencyColumn?.label ?? null;
  const efficiencyType: ResultKpiCard["valueType"] =
    efficiencyColumn?.valueType ?? "currency";
  const evaluation =
    performance?.evaluation?.resultKey === resultKey
      ? performance.evaluation
      : null;
  const evaluationActualLabel = evaluation
    ? formatDynamicValue(
        evaluation.actualValue,
        efficiencyType,
        performance?.currency ?? null,
      )
    : "";
  const evaluationBenchmarkLabel = evaluation
    ? formatDynamicValue(
        evaluation.benchmarkValue,
        efficiencyType,
        performance?.currency ?? null,
      )
    : "";
  const evaluationDeltaLabel =
    evaluation?.deltaPercent === null || evaluation?.deltaPercent === undefined
      ? "Chưa so sánh được"
      : `${evaluation.deltaPercent > 0 ? "+" : ""}${formatPercent(
          evaluation.deltaPercent,
        )}`;
  const benchmarkExplanationOpen = first(query.explain) === "benchmark";
  const fullPageHref = creativeFullDetailHref({
    familyId: family.id,
    query,
    tab,
    originPathname,
  });

  return (
    <>
      <div className="v2-drawer__body">
        <div className="v2-drawer__hero">
          <Image
            src={family.imageUrl}
            alt=""
            width={176}
            height={176}
            unoptimized
            loading={fullPage ? "eager" : "lazy"}
          />
          <div>
            <h3>{family.name}</h3>
            <div className="v2-id-line">
              <code>{family.id}</code>
              <CopyIdButton value={family.id} />
            </div>
            <div className="v2-chip-row">
              <span className="v2-chip v2-chip--accent">{family.format}</span>
              {family.platforms.map((platform) => (
                <span className="v2-chip" key={platform}>
                  {platform}
                </span>
              ))}
            </div>
          </div>
        </div>
        {!fullPage ? (
          <Link className="button button--secondary" href={fullPageHref}>
            Mở trang đầy đủ
            <ExternalLink aria-hidden="true" size={15} />
          </Link>
        ) : null}
      </div>
      <nav className="v2-tabs v2-drawer-tabs" aria-label="Chi tiết Creative">
        {DETAIL_TABS.map((item) => (
          <Link
            key={item.value}
            className="v2-tab"
            href={creativeDrawerTabHref({
              familyId: family.id,
              query,
              tab: item.value,
              fullPage,
              originPathname,
            })}
            aria-current={tab === item.value ? "page" : undefined}
            scroll={false}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="v2-drawer__body">
        {tab === "preview" ? (
          <>
            <div className="v2-creative-preview">
              <Image
                src={family.imageUrl}
                alt={`Preview ${family.name}`}
                width={720}
                height={720}
                unoptimized
              />
            </div>
            <div className="v2-detail-grid">
              <div>
                <span>Tỷ lệ</span>
                <strong>{family.ratio ?? "Chưa có"}</strong>
              </div>
              <div>
                <span>Thời lượng</span>
                <strong>{family.duration ?? "Không áp dụng"}</strong>
              </div>
              <div>
                <span>Định dạng</span>
                <strong>{family.format}</strong>
              </div>
              <div>
                <span>Page</span>
                <strong>{family.pageName ?? "Chưa xác định"}</strong>
              </div>
            </div>
          </>
        ) : null}
        {tab === "performance" ? (
          <section className="v2-drawer__section">
            <h3>Hiệu quả trong kỳ</h3>
            {performance ? (
              <div className="v2-detail-grid">
                <div>
                  <span>Spend</span>
                  <strong>
                    {formatMoney(performance.spend, performance.currency)}
                  </strong>
                </div>
                <div>
                  <span>Impressions</span>
                  <strong>
                    {formatCompactNumber(performance.impressions)}
                  </strong>
                </div>
                <div>
                  <span>Link CTR</span>
                  <strong>{formatPercent(performance.linkCtr)}</strong>
                </div>
                {resultLabel ? (
                  <div>
                    <span>{resultLabel}</span>
                    <strong>
                      {formatDynamicValue(
                        resultValue,
                        resultValueType,
                        performance.currency,
                      )}
                    </strong>
                  </div>
                ) : null}
                {efficiencyLabel ? (
                  <div>
                    <span>{efficiencyLabel}</span>
                    <strong>
                      {formatDynamicValue(
                        efficiencyValue,
                        efficiencyType,
                        performance.currency,
                      )}
                    </strong>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="v2-muted">
                Creative chưa có delivery trong khoảng ngày đang chọn.
              </p>
            )}
          </section>
        ) : null}
        {tab === "rating" ? (
          <section className="v2-drawer__section">
            {evaluation ? (
              <>
                <div className="v2-rating-heading">
                  <div>
                    <span>Đánh giá theo {resultLabel ?? resultKey}</span>
                    <CreativeEvaluationStatus
                      performance={performance}
                      resultKey={resultKey}
                    />
                  </div>
                  <span
                    className={`v2-chip v2-chip--${
                      evaluation.dataConfidence === "high"
                        ? "success"
                        : evaluation.dataConfidence === "medium"
                          ? "warning"
                          : "danger"
                    }`}
                  >
                    Độ tin cậy:{" "}
                    {evaluationConfidenceLabel(
                      evaluation.dataConfidence,
                    )}
                  </span>
                </div>
                <div className="v2-detail-grid">
                  <div>
                    <span>Kết quả đang đánh giá</span>
                    <strong>{resultLabel ?? evaluation.resultKey}</strong>
                  </div>
                  <div>
                    <span>Metric</span>
                    <strong>{efficiencyLabel ?? evaluation.metricKey}</strong>
                  </div>
                  <div>
                    <span>Giá trị hiện tại</span>
                    <strong>{evaluationActualLabel}</strong>
                  </div>
                  <CreativeBenchmarkDisclosure
                    resultLabel={resultLabel ?? evaluation.resultKey}
                    metricLabel={efficiencyLabel ?? evaluation.metricKey}
                    actualLabel={evaluationActualLabel}
                    benchmarkLabel={evaluationBenchmarkLabel}
                    deltaLabel={evaluationDeltaLabel}
                    peerGroupLabel={evaluation.peerGroupLabel}
                    sampleSize={evaluation.sampleSize}
                    reasons={evaluation.reasons}
                    initiallyOpen={benchmarkExplanationOpen}
                  />
                  <div>
                    <span>Chênh lệch</span>
                    <strong>{evaluationDeltaLabel}</strong>
                  </div>
                  <div>
                    <span>Fatigue</span>
                    <strong>
                      {fatigueStatusLabel(evaluation.fatigueStatus)}
                    </strong>
                  </div>
                </div>
                <div className="v2-explanation v2-explanation--action">
                  <Target aria-hidden="true" size={17} />
                  <div>
                    <strong>Hành động đề xuất</strong>
                    <p>{creativeEvaluationAction(evaluation)}</p>
                  </div>
                </div>
              </>
            ) : (
              <div className="v2-evaluation-gate">
                <ShieldCheck aria-hidden="true" size={20} />
                <div>
                  <strong>
                    {resultLabel
                      ? `Chưa thể đánh giá theo ${resultLabel}`
                      : "Chọn một kết quả trước khi đánh giá"}
                  </strong>
                  <small>
                    Hệ thống không tái sử dụng benchmark của một kết quả khác.
                    Cần normalized result, peer group, sample size và mapping
                    phù hợp.
                  </small>
                </div>
              </div>
            )}
          </section>
        ) : null}
        {tab === "usage" ? (
          <section className="v2-drawer__section">
            <h3>Nơi đang sử dụng</h3>
            <dl className="v2-detail-list">
              <div>
                <dt>Ads đang hoạt động</dt>
                <dd>{formatNumber(family.activeAdCount)}</dd>
              </div>
              <div>
                <dt>Tổng Ads liên kết</dt>
                <dd>
                  {formatNumber(family.adCount)}
                  {family.entityLinks?.adIds.length
                    ? ` · ${formatNumber(
                        family.entityLinks.adIds.length,
                      )} ID canonical có sẵn`
                    : ""}
                </dd>
              </div>
              <div>
                <dt>Ads</dt>
                <dd>
                  {family.entityLinks?.adIds.length ? (
                    <span className="v2-canonical-id-list">
                      {family.entityLinks.adIds.map((id) => (
                        <span className="v2-canonical-id" key={id}>
                          <code>{id}</code>
                          <CopyIdButton
                            value={id}
                            label="Sao chép Ad ID"
                          />
                        </span>
                      ))}
                    </span>
                  ) : (
                    "Chưa có Ad ID canonical trong snapshot này"
                  )}
                </dd>
              </div>
              <div>
                <dt>Campaigns</dt>
                <dd>
                  {family.entityLinks?.campaignIds.length ? (
                    <span className="v2-entity-links">
                      {family.entityLinks.campaignIds.map((id) => (
                        <ContextualEntityLink
                          className="v2-link"
                          href={href(
                            `/campaigns/${encodeURIComponent(id)}`,
                            query,
                            { selected: null, tab: null },
                          )}
                          drawerHref={href("/campaigns", query, {
                            selected: id,
                            tab: null,
                          })}
                          entityId={id}
                          key={id}
                        >
                          {id}
                        </ContextualEntityLink>
                      ))}
                    </span>
                  ) : (
                    "Chưa có ID campaign trong snapshot này"
                  )}
                </dd>
              </div>
              <div>
                <dt>Ad Accounts</dt>
                <dd>
                  {family.entityLinks?.adAccountIds.length ? (
                    <span className="v2-entity-links">
                      {family.entityLinks.adAccountIds.map((id) => (
                        <Link
                          className="v2-link"
                          href={href("/sources", query, {
                            tab: "ad-accounts",
                            selected: id,
                          })}
                          key={id}
                        >
                          {id}
                        </Link>
                      ))}
                    </span>
                  ) : (
                    "Chưa có ID tài khoản trong snapshot này"
                  )}
                </dd>
              </div>
              <div>
                <dt>Pages</dt>
                <dd>
                  {family.entityLinks?.pageIds.length ? (
                    <span className="v2-entity-links">
                      {family.entityLinks.pageIds.map((id) => (
                        <Link
                          className="v2-link"
                          href={href("/sources", query, {
                            tab: "pages",
                            selected: id,
                          })}
                          key={id}
                        >
                          {id}
                        </Link>
                      ))}
                    </span>
                  ) : (
                    family.pageName || "Chưa xác định"
                  )}
                </dd>
              </div>
              <div>
                <dt>Ad Set → Ads</dt>
                <dd>
                  {family.entityLinks?.campaignIds.length ? (
                    <span className="v2-entity-links">
                      {family.entityLinks.campaignIds.map((id) => (
                        <Link
                          className="v2-link v2-usage-structure-link"
                          href={href(
                            `/campaigns/${encodeURIComponent(id)}`,
                            query,
                            {
                              selected: null,
                              tab: "structure",
                            },
                          )}
                          key={id}
                        >
                          Mở cấu trúc Campaign {id}
                          <ArrowUpRight aria-hidden="true" size={14} />
                        </Link>
                      ))}
                    </span>
                  ) : (
                    "Cần đồng bộ Campaign để tra Ad Set của các Ads này"
                  )}
                </dd>
              </div>
            </dl>
          </section>
        ) : null}
        {tab === "metadata" ? (
          <section className="v2-drawer__section">
            <h3>Định danh chuẩn</h3>
            <dl className="v2-detail-list">
              <div>
                <dt>Creative Family ID</dt>
                <dd>{family.id}</dd>
              </div>
              <div>
                <dt>Physical asset key</dt>
                <dd>{family.assetKey}</dd>
              </div>
              <div>
                <dt>Nguồn định danh</dt>
                <dd>
                  {family.assetKey.startsWith("video:") ||
                  family.assetKey.startsWith("image:")
                    ? "Physical asset Meta"
                    : "Internal stable identifier"}
                </dd>
              </div>
              <div>
                <dt>Aliases báo cáo</dt>
                <dd>{family.aliases.join(", ") || "Không có"}</dd>
              </div>
              <div>
                <dt>Meta Creative IDs</dt>
                <dd>
                  {family.entityLinks?.metaCreativeIds.join(", ") ||
                    "Chưa có trong snapshot"}
                </dd>
              </div>
              <div>
                <dt>Meta Ad IDs</dt>
                <dd>
                  {family.entityLinks?.adIds.join(", ") ||
                    "Chưa có trong snapshot"}
                </dd>
              </div>
            </dl>
          </section>
        ) : null}
      </div>
    </>
  );
}

function CreativeTable({
  families,
  query,
  metric,
  direction,
  resultMetrics,
}: {
  families: FamilyView[];
  query: Query;
  metric?: CreativeDrilldownMetric;
  direction: SortDirection;
  resultMetrics: DynamicResultMetricsModel;
}) {
  const gridTemplateColumns = [
    "minmax(245px, 1.55fr)",
    "minmax(170px, 1fr)",
    "minmax(145px, 0.9fr)",
    "minmax(125px, 0.9fr)",
    "minmax(115px, 0.85fr)",
    ...resultMetrics.dynamicTableColumns.map(
      () => "minmax(118px, 0.85fr)",
    ),
    "minmax(88px, 0.65fr)",
    "minmax(76px, 0.55fr)",
    "minmax(76px, 0.55fr)",
    "minmax(128px, 0.85fr)",
    "minmax(145px, 0.95fr)",
  ].join(" ");
  const gridStyle = {
    gridTemplateColumns,
    minWidth: `${1248 + resultMetrics.dynamicTableColumns.length * 118}px`,
  };

  return (
    <section
      className="v2-creative-table"
      role="table"
      aria-label={`Bảng hiệu quả Creative Family, có thể cuộn ngang${
        metric
          ? `, đang sắp xếp theo ${METRIC_LABELS[metric]} ${
              direction === "asc" ? "tăng dần" : "giảm dần"
            }`
          : ""
      }`}
      id="creative-results"
      tabIndex={0}
    >
      <div
        className="v2-creative-table__head"
        role="row"
        style={gridStyle}
      >
        <span role="columnheader">Creative Family</span>
        <span role="columnheader">Định dạng / OS</span>
        <span role="columnheader">Campaign / Ads</span>
        <MetricColumnHeader
          activeMetric={metric}
          direction={direction}
          metric="spend"
        />
        <MetricColumnHeader
          activeMetric={metric}
          direction={direction}
          metric="impressions"
        />
        {resultMetrics.dynamicTableColumns.map((column) => {
          const columnMetric = dynamicColumnMetric(
            column,
            resultMetrics.metadata.primaryResultKey,
          );
          return columnMetric ? (
            <MetricColumnHeader
              activeMetric={metric}
              direction={direction}
              metric={columnMetric}
              key={column.key}
            />
          ) : (
            <span
              role="columnheader"
              title={column.formula}
              key={column.key}
            >
              {column.label}
            </span>
          );
        })}
        <MetricColumnHeader
          activeMetric={metric}
          direction={direction}
          metric="link_ctr"
        />
        <span role="columnheader">Hook</span>
        <span role="columnheader">Hold</span>
        <span role="columnheader">Mỏi Creative</span>
        <span role="columnheader">Đánh giá</span>
      </div>
      {families.map((family) => {
        const performance = family.performance;
        const full = href(`/creatives/${family.id}`, query, {
          selected: null,
          tab: null,
        });
        const drawer = href("/creatives", query, {
          selected: family.id,
          tab: "performance",
        });
        const usageDrawer = href("/creatives", query, {
          selected: family.id,
          tab: "usage",
        });
        const ratingDrawer = `${href("/creatives", query, {
          selected: family.id,
          tab: "rating",
          explain: "benchmark",
        })}#benchmark-explanation`;
        return (
          <div
            className="v2-creative-table__row"
            role="row"
            key={family.id}
            style={gridStyle}
          >
            <span role="cell">
              <ContextualEntityLink
                className="v2-creative-identity"
                href={full}
                drawerHref={drawer}
                entityId={family.id}
              >
                <Image
                  src={family.imageUrl}
                  alt=""
                  width={88}
                  height={88}
                  unoptimized
                />
                <span>
                  <strong>{family.name}</strong>
                  <small>{family.id}</small>
                </span>
              </ContextualEntityLink>
            </span>
            <span role="cell">
              <span className="v2-chip-row">
                <Link
                  className="v2-chip v2-chip--accent"
                  href={href("/creatives", query, {
                    format: family.format.toLocaleLowerCase("vi-VN"),
                    page: null,
                    selected: null,
                    tab: null,
                  })}
                >
                  {family.format}
                </Link>
                {family.platforms.map((platform) => (
                  <Link
                    className="v2-chip"
                    href={href("/creatives", query, {
                      os: platform.toLocaleLowerCase("vi-VN"),
                      page: null,
                      selected: null,
                      tab: null,
                    })}
                    key={platform}
                  >
                    {platform}
                  </Link>
                ))}
              </span>
              {family.currencies.length > 1 ? (
                <small>{family.currencies.length} tiền tệ · không cộng gộp</small>
              ) : null}
            </span>
            <span role="cell">
              <span className="v2-table-usage-links">
                <Link
                  className="v2-link"
                  href={usageDrawer}
                  scroll={false}
                >
                  {family.entityLinks?.campaignIds.length ?? 0} chiến dịch
                </Link>
                <Link
                  className="v2-link"
                  href={usageDrawer}
                  aria-label={`Xem ${family.adCount} Ads đang dùng ${family.name}`}
                  scroll={false}
                >
                  {family.adCount} Ads
                </Link>
              </span>
            </span>
            <span
              role="cell"
              className={metricCellClass(metric, "spend")}
            >
              {performance
                ? formatMoney(performance.spend, performance.currency)
                : "—"}
            </span>
            <span
              role="cell"
              className={metricCellClass(metric, "impressions")}
            >
              {performance
                ? formatCompactNumber(performance.impressions)
                : "—"}
            </span>
            {resultMetrics.dynamicTableColumns.map((column) => {
              const columnMetric = dynamicColumnMetric(
                column,
                resultMetrics.metadata.primaryResultKey,
              );
              return (
                <span
                  role="cell"
                  className={
                    columnMetric
                      ? metricCellClass(metric, columnMetric)
                      : undefined
                  }
                  title={column.formula}
                  key={column.key}
                >
                  {formatDynamicValue(
                    familyDynamicColumnValue(family, column),
                    column.valueType,
                    performance?.currency ?? null,
                  )}
                </span>
              );
            })}
            <span
              role="cell"
              className={metricCellClass(metric, "link_ctr")}
            >
              {formatPercent(performance?.linkCtr ?? null)}
            </span>
            <span role="cell">
              {formatPercent(performance?.hookRate ?? null)}
            </span>
            <span role="cell">
              {formatPercent(performance?.holdRate ?? null)}
            </span>
            <span role="cell">
              {fatigueStatusLabel(
                performance?.evaluation?.resultKey ===
                  resultMetrics.metadata.primaryResultKey
                  ? performance.evaluation.fatigueStatus
                  : undefined,
              )}
            </span>
            <span role="cell">
              {resultMetrics.metadata.primaryResultKey ? (
                <Link
                  className="v2-rating-detail-link"
                  href={ratingDrawer}
                  aria-label={`Mở giải thích benchmark ${family.name}`}
                  scroll={false}
                >
                  <CreativeEvaluationStatus
                    performance={performance}
                    resultKey={resultMetrics.metadata.primaryResultKey}
                  />
                </Link>
              ) : (
                <span className="v2-chip v2-chip--warning">
                  Chưa thể đánh giá
                </span>
              )}
              <small>
                Tin cậy {confidenceLabel(performance)}
              </small>
            </span>
          </div>
        );
      })}
    </section>
  );
}

function CreativeOverview({
  families,
  query,
  resultMetrics,
}: {
  families: FamilyView[];
  query: Query;
  resultMetrics: DynamicResultMetricsModel;
}) {
  const resultKey = resultMetrics.metadata.primaryResultKey;
  const resultDefinition =
    resultMetrics.availableResults.find(
      (result) => result.canonicalKey === resultKey,
    ) ?? null;
  const resultColumn = resultMetrics.dynamicTableColumns.find(
    (column) =>
      column.key === `result:${resultKey ?? ""}`,
  );
  const efficiencyColumn = resultMetrics.dynamicTableColumns.find(
    (column) =>
      column.key === `efficiency:${resultKey ?? ""}`,
  );
  const familyMetrics = families.map((family) => ({
    family,
    resultValue: resultColumn
      ? familyDynamicColumnValue(family, resultColumn)
      : null,
    efficiencyValue: efficiencyColumn
      ? familyDynamicColumnValue(family, efficiencyColumn)
      : null,
  }));
  const withPerformance = familyMetrics.filter(
    (item) =>
      item.family.performance &&
      item.resultValue !== null &&
      item.efficiencyValue !== null,
  );
  const maxSpend = Math.max(
    ...withPerformance.map(
      ({ family }) => family.performance?.spend ?? 0,
    ),
    1,
  );
  const maxEfficiency = Math.max(
    ...withPerformance.map((item) => item.efficiencyValue ?? 0),
    1,
  );
  const maxResults = Math.max(
    ...withPerformance.map((item) => item.resultValue ?? 0),
    1,
  );
  const hasEvaluation =
    !!resultKey &&
    families.some(
      (family) =>
        family.performance?.evaluation?.resultKey === resultKey,
    );
  const distribution = CREATIVE_PERFORMANCE_STATUSES.map(
    (status) => ({
      ...status,
      count: families.filter(
        (family) =>
          creativePerformanceStatusKey(
            family.performance,
            resultKey,
          ) === status.key,
      ).length,
    }),
  );
  const top = [...familyMetrics]
    .filter((item) => item.resultValue !== null)
    .sort(
      (left, right) =>
        (right.resultValue ?? 0) - (left.resultValue ?? 0),
    )
    .slice(0, 5);
  const actions = (hasEvaluation ? families : [])
    .filter((family) =>
      ["poor", "limited"].includes(
        creativePerformanceStatusKey(
          family.performance,
          resultKey,
        ),
      ),
    )
    .slice(0, 5);
  const scatterCurrency =
    withPerformance[0]?.family.performance?.currency ?? null;
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
    <div className="v2-performance-overview">
      {hasEvaluation ? (
        <section className="v2-panel v2-distribution">
          <div className="v2-panel__header">
            <div>
              <h2>Phân bổ hiệu suất</h2>
              <p>
                Creative Family theo benchmark cùng Objective × Result × định
                dạng × tiền tệ.
              </p>
            </div>
            <Sparkles aria-hidden="true" size={18} />
          </div>
          <div className="v2-distribution__body">
            {distribution.map((item) => (
              <Link
                className="v2-distribution__item"
                href={buildContextHref(
                  "/creatives?view=table#creative-results",
                  query,
                  {
                    performance: item.key,
                    selected: null,
                    tab: null,
                  },
                )}
                key={item.key}
              >
                <span className={`v2-chip v2-chip--${item.tone}`}>
                  {item.label}
                </span>
                <strong>{item.count}</strong>
                <small>Creative</small>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <section className="v2-panel v2-evaluation-gate">
          <ShieldCheck aria-hidden="true" size={20} />
          <div>
            <strong>
              {resultDefinition
                ? `Đánh giá theo ${resultDefinition.label}`
                : "Chọn một mục tiêu và kết quả"}
            </strong>
            <small>
              Chỉ xếp loại khi normalized result cấp Creative, benchmark đúng
              peer group và eligibility gate đều khả dụng.
            </small>
          </div>
        </section>
      )}
      <section className="v2-panel v2-scatter-panel">
        <div className="v2-panel__header">
          <div>
            <h2>
              {resultMetrics.scatter.y
                ? `Spend × ${resultMetrics.scatter.y.label}`
                : "Hiệu quả Creative theo kết quả"}
            </h2>
            <p>Mỗi điểm là một Creative Family; click để mở chi tiết.</p>
          </div>
          <BarChart3 aria-hidden="true" size={18} />
        </div>
        {resultMetrics.scatter.enabled && withPerformance.length ? (
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
              {withPerformance.slice(0, 28).map((item) => {
                const { family } = item;
                const performance = family.performance!;
                const resultValue = item.resultValue ?? 0;
                const efficiencyValue = item.efficiencyValue ?? 0;
                const left =
                  8 + (performance.spend / maxSpend) * 82;
                const top =
                  8 +
                  (1 - efficiencyValue / maxEfficiency) * 74;
                const pointSize =
                  14 +
                  Math.sqrt(resultValue / maxResults) * 18;
                const status = creativePerformanceStatus(
                  performance,
                  resultKey,
                );
                const spendText = formatMoney(
                  performance.spend,
                  performance.currency,
                );
                const efficiencyLabel =
                  efficiencyColumn?.label ?? "Hiệu quả";
                const efficiencyText = formatDynamicValue(
                  efficiencyValue,
                  efficiencyColumn?.valueType ?? "count",
                  performance.currency,
                );
                const resultLabel =
                  resultColumn?.label ??
                  resultDefinition?.label ??
                  "Kết quả";
                const resultText = formatDynamicValue(
                  resultValue,
                  resultColumn?.valueType ?? "count",
                  performance.currency,
                );
                return (
                  <ContextualEntityLink
                    key={family.id}
                    className={`v2-scatter__point v2-scatter__point--${status.key}`}
                    href={href(`/creatives/${family.id}`, query, {
                      selected: null,
                      tab: "performance",
                    })}
                    drawerHref={href("/creatives", query, {
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
                      vertical={top < 30 ? "below" : "above"}
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
              Chưa có một Objective, Result và currency đồng nhất để so sánh
              Creative.
            </p>
          </div>
        )}
      </section>
      <section className="v2-panel v2-ranked-list">
        <div className="v2-panel__header">
          <div>
            <h2>Top Creative</h2>
            <p>
              {resultDefinition
                ? `Xếp theo ${resultDefinition.label} Meta ghi nhận trong kỳ.`
                : "Chọn kết quả trước khi xếp hạng."}
            </p>
          </div>
          <ArrowUpRight aria-hidden="true" size={18} />
        </div>
        {top.length ? (
          <ol>
            {top.map((item, index) => (
            <li key={item.family.id}>
              <span>{index + 1}</span>
              <Image
                src={item.family.imageUrl}
                alt=""
                width={64}
                height={64}
                unoptimized
              />
              <ContextualEntityLink
                href={href(`/creatives/${item.family.id}`, query)}
                drawerHref={href("/creatives", query, {
                  selected: item.family.id,
                  tab: "performance",
                })}
                entityId={item.family.id}
              >
                <strong>{item.family.name}</strong>
                <small>
                  {formatDynamicValue(
                    item.resultValue,
                    resultColumn?.valueType ?? "count",
                    item.family.performance?.currency ?? null,
                  )}{" "}
                  {resultDefinition?.shortLabel ?? "kết quả"}
                </small>
              </ContextualEntityLink>
              {hasEvaluation ? (
                <CreativeEvaluationStatus
                  performance={item.family.performance}
                  resultKey={resultKey}
                />
              ) : null}
            </li>
            ))}
          </ol>
        ) : (
          <div className="v2-compact-empty">
            <Sparkles aria-hidden="true" size={22} />
            <p>Chưa có normalized result cấp Creative để xếp hạng.</p>
          </div>
        )}
      </section>
      <section className="v2-panel v2-ranked-list">
        <div className="v2-panel__header">
          <div>
            <h2>Creative cần hành động</h2>
            <p>Ưu tiên theo benchmark, eligibility và độ phủ dữ liệu.</p>
          </div>
          <ArrowDownRight aria-hidden="true" size={18} />
        </div>
        {actions.length ? (
          <ol>
            {actions.map((family, index) => (
              <li key={family.id}>
                <span>{index + 1}</span>
                <Image
                  src={family.imageUrl}
                  alt=""
                  width={64}
                  height={64}
                  unoptimized
                />
                <ContextualEntityLink
                  href={href(`/creatives/${family.id}`, query)}
                  drawerHref={href("/creatives", query, {
                    selected: family.id,
                    tab: "rating",
                  })}
                  entityId={family.id}
                >
                  <strong>{family.name}</strong>
                  <small>
                    {family.performance?.evaluation?.resultKey ===
                    resultKey
                      ? family.performance.evaluation.reasons[0] ??
                        creativeEvaluationAction(
                          family.performance.evaluation,
                        )
                      : creativeEvaluationAction(null)}
                  </small>
                </ContextualEntityLink>
                <CreativeEvaluationStatus
                  performance={family.performance}
                  resultKey={resultKey}
                />
              </li>
            ))}
          </ol>
        ) : (
          <div className="v2-compact-empty">
            <ShieldCheck aria-hidden="true" size={22} />
            <p>
              {hasEvaluation
                ? "Không có Creative cần theo dõi trong bộ lọc hiện tại."
                : "Chưa tạo recommendation cho kết quả này khi benchmark chưa đủ."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function CompareView({
  families,
  query,
  resultMetrics,
}: {
  families: FamilyView[];
  query: Query;
  resultMetrics: DynamicResultMetricsModel;
}) {
  const requested = (first(query.compare_ids) ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 4);
  const selected = requested.length
    ? requested.flatMap((id) => families.find((family) => family.id === id) ?? [])
    : families.filter((family) => family.performance).slice(0, 3);

  return (
    <section className="v2-panel">
      <div className="v2-panel__header">
        <div>
          <h2>So sánh Creative</h2>
          <p>
            Tối đa bốn Creative Family; trạng thái được lưu trong URL để chia sẻ.
          </p>
        </div>
        <Columns3 aria-hidden="true" size={18} />
      </div>
      <form className="v2-compare-picker" action="/creatives" method="get">
        {Object.entries(query).map(([key, raw]) => {
          const value = first(raw);
          return key !== "compare_ids" && value ? (
            <input key={key} type="hidden" name={key} value={value} />
          ) : null;
        })}
        <input type="hidden" name="view" value="compare" />
        <label>
          <span>Creative Family IDs</span>
          <input
            name="compare_ids"
            defaultValue={selected.map((family) => family.id).join(",")}
            placeholder="cf_... , cf_..."
          />
        </label>
        <button className="button button--primary" type="submit">
          So sánh
        </button>
      </form>
      {selected.length ? (
        <div className="v2-compare-grid">
          {selected.map((family) => (
            <article key={family.id}>
              <Image
                src={family.imageUrl}
                alt=""
                width={180}
                height={180}
                unoptimized
              />
              <h3>{family.name}</h3>
              <div className="v2-id-line">
                <code>{family.id}</code>
                <CopyIdButton value={family.id} />
              </div>
              <CreativeEvaluationStatus
                performance={family.performance}
                resultKey={resultMetrics.metadata.primaryResultKey}
              />
              <dl className="v2-detail-list">
                <div>
                  <dt>Spend</dt>
                  <dd>
                    {family.performance
                      ? formatMoney(
                          family.performance.spend,
                          family.performance.currency,
                        )
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Impressions</dt>
                  <dd>
                    {family.performance
                      ? formatCompactNumber(
                          family.performance.impressions,
                        )
                      : "—"}
                  </dd>
                </div>
                {resultMetrics.dynamicTableColumns.map((column) => (
                  <div key={column.key}>
                    <dt>{column.label}</dt>
                    <dd>
                      {formatDynamicValue(
                        familyDynamicColumnValue(family, column),
                        column.valueType,
                        family.performance?.currency ?? null,
                      )}
                    </dd>
                  </div>
                ))}
                <div>
                  <dt>Link CTR</dt>
                  <dd>
                    {formatPercent(
                      family.performance?.linkCtr ?? null,
                    )}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      ) : (
        <div className="v2-compact-empty">
          <Grid2X2 aria-hidden="true" size={22} />
          <p>Chọn ít nhất một Creative Family để so sánh.</p>
        </div>
      )}
    </section>
  );
}

export function CreativePerformanceV2({
  creatives,
  delivery,
  connected,
  query,
  dateFrom,
  dateTo,
  accounts,
  account,
  reportingCurrency,
  currencyOptions,
  compare,
  freshness,
  reportingBar,
  resultMetrics,
}: {
  creatives: CreativeRow[];
  delivery: readonly DeliveryMetricRow[];
  connected: boolean;
  query: Query;
  dateFrom: string;
  dateTo: string;
  accounts: { id: string; name: string }[];
  account: string;
  reportingCurrency: string;
  currencyOptions: string[];
  compare: "previous_period" | "none";
  freshness: ReportingFreshness;
  reportingBar: ReportingBarModel;
  resultMetrics: DynamicResultMetricsModel;
}) {
  const filters = {
    query: first(query.q)?.trim().slice(0, 200) ?? "",
    campaign: first(query.campaign)?.trim().slice(0, 160) ?? "",
    os: first(query.os)?.trim().slice(0, 64) ?? "",
    format: first(query.format)?.trim().slice(0, 64) ?? "",
    performance:
      resultMetrics.metadata.primaryResultKey
        ? first(query.performance)?.trim().slice(0, 64) ?? ""
        : "",
    dataStatus: first(query.data_status)?.trim().slice(0, 64) ?? "",
    delivery: first(query.delivery)?.trim().slice(0, 32) ?? "",
  };
  const view = ["overview", "table", "compare"].includes(first(query.view) ?? "")
    ? first(query.view)!
    : "overview";
  const navigationQuery = parseNavigationQuery(query);
  const activeMetric = navigationQuery.metric;
  const metricSort = activeMetric
    ? navigationQuery.sort ?? defaultSortDirection(activeMetric)
    : "desc";
  const allFamilies = groupCreativeFamiliesForView(creatives);
  const families = allFamilies.filter((family) =>
    matchesFilters(family, filters),
  );
  const orderedFamilies = activeMetric
      ? sortCreativeFamiliesForMetric(
        families,
        activeMetric,
        metricSort,
        navigationQuery.result,
      )
    : families;
  const requestedTablePage = Math.max(
    1,
    Math.min(
      100_000,
      Number.parseInt(first(query.page) ?? "1", 10) || 1,
    ),
  );
  const tablePageSize = 100;
  const tablePageCount = Math.max(
    1,
    Math.ceil(orderedFamilies.length / tablePageSize),
  );
  const tablePage = Math.min(requestedTablePage, tablePageCount);
  const visibleTableFamilies = orderedFamilies.slice(
    (tablePage - 1) * tablePageSize,
    tablePage * tablePageSize,
  );
  const deliverySummary = summarizeDelivery(delivery);
  const singleCurrency =
    deliverySummary.singleCurrency?.currency ?? null;
  const selectedId = first(query.selected);
  const selected = selectedId
    ? allFamilies.find((family) => family.id === selectedId)
    : undefined;
  const clearDrawerHref = href("/creatives", query, {
    selected: null,
    tab: null,
  });

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div>
          <h1>Hiệu quả Creative</h1>
          <p>
            So sánh Creative Family theo dữ liệu Meta-attributed và benchmark
            cùng hệ điều hành, định dạng, tiền tệ.
          </p>
        </div>
      </header>
      <ReportingContext
        {...reportingBar}
        action="/creatives"
        dateFrom={dateFrom}
        dateTo={dateTo}
        account={account}
        accounts={accounts}
        currency={reportingCurrency}
        currencies={currencyOptions}
        compare={compare}
        freshness={freshness}
        preserved={{
          ...reportingContextHiddenFields(query),
          ...(filters.query ? { q: filters.query } : {}),
          ...(filters.campaign ? { campaign: filters.campaign } : {}),
          ...(filters.os ? { os: filters.os } : {}),
          ...(filters.format ? { format: filters.format } : {}),
          ...(filters.performance
            ? { performance: filters.performance }
            : {}),
          ...(filters.dataStatus
            ? { data_status: filters.dataStatus }
            : {}),
          ...(filters.delivery ? { delivery: filters.delivery } : {}),
          ...(activeMetric
            ? { metric: activeMetric, sort: metricSort }
            : {}),
          view,
        }}
      />
      <form className="v2-filter-bar" action="/creatives" method="get">
        <input type="hidden" name="from" value={dateFrom} />
        <input type="hidden" name="to" value={dateTo} />
        {account ? <input type="hidden" name="account" value={account} /> : null}
        <input type="hidden" name="compare" value={compare} />
        {reportingCurrency ? (
          <input type="hidden" name="currency" value={reportingCurrency} />
        ) : null}
        <input type="hidden" name="view" value={view} />
        {activeMetric ? (
          <>
            <input type="hidden" name="metric" value={activeMetric} />
            <input type="hidden" name="sort" value={metricSort} />
          </>
        ) : null}
        <label className="v2-filter-search">
          <Search aria-hidden="true" size={16} />
          <span className="sr-only">Tìm Creative</span>
          <input
            name="q"
            defaultValue={filters.query}
            placeholder="Tìm Creative, mã hoặc ID"
          />
        </label>
        <label>
          <span className="sr-only">Campaign ID</span>
          <input
            name="campaign"
            defaultValue={filters.campaign}
            placeholder="Campaign ID"
          />
        </label>
        <select name="os" defaultValue={filters.os} aria-label="Hệ điều hành">
          <option value="">Tất cả hệ điều hành</option>
          <option value="android">Android</option>
          <option value="ios">iOS</option>
          <option value="unknown">Chưa xác định</option>
        </select>
        <select name="format" defaultValue={filters.format} aria-label="Định dạng">
          <option value="">Tất cả định dạng</option>
          <option value="video">Video</option>
          <option value="banner">Banner</option>
          <option value="unknown">Chưa xác định</option>
        </select>
        {resultMetrics.metadata.primaryResultKey ? (
          <select
            name="performance"
            defaultValue={filters.performance}
            aria-label="Hiệu suất"
          >
            <option value="">Tất cả hiệu suất</option>
            <option value="good">Tốt hơn benchmark</option>
            <option value="stable">Trong ngưỡng</option>
            <option value="limited">Chưa thể đánh giá</option>
            <option value="poor">Cần theo dõi</option>
          </select>
        ) : null}
        <select
          name="data_status"
          defaultValue={filters.dataStatus}
          aria-label="Trạng thái dữ liệu"
        >
          <option value="">Tất cả trạng thái dữ liệu</option>
          <option value="ready">Sẵn sàng</option>
          <option value="insufficient">Chưa đủ dữ liệu</option>
          <option value="missing_mapping">Thiếu mapping</option>
          <option value="stale">Dữ liệu cũ</option>
          <option value="partial">Đồng bộ một phần</option>
        </select>
        <select
          name="delivery"
          defaultValue={filters.delivery}
          aria-label="Phân phối"
        >
          <option value="">Tất cả phân phối</option>
          <option value="active">Đang phân phối</option>
          <option value="inactive">Không có Ads hoạt động</option>
          <option value="unlinked">Chưa gắn Ads</option>
        </select>
        <button
          className="button button--primary v2-filter-submit"
          type="submit"
          aria-label="Áp dụng bộ lọc"
        >
          <ListFilter aria-hidden="true" size={18} />
          <span>Áp dụng bộ lọc</span>
        </button>
        {Object.values(filters).some(Boolean) ? (
          <Link
            className="button button--secondary"
            href={href("/creatives", query, {
              q: null,
              campaign: null,
              os: null,
              format: null,
              performance: null,
              data_status: null,
              delivery: null,
              page: null,
              selected: null,
              tab: null,
            })}
          >
            Xóa lọc
          </Link>
        ) : null}
      </form>
      <nav className="v2-tabs" aria-label="Chế độ xem Creative">
        {[
          { value: "overview", label: "Tổng quan" },
          { value: "table", label: "Bảng chi tiết" },
          { value: "compare", label: "So sánh" },
        ].map((item) => (
          <Link
            className="v2-tab"
            href={href("/creatives", query, {
              view: item.value,
              page: null,
              selected: null,
              tab: null,
            })}
            aria-current={view === item.value ? "page" : undefined}
            key={item.value}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <section className="v2-kpi-grid" aria-label="Chỉ số Creative">
        <Link
          className="v2-kpi"
          href={href("/library", query, {
            page: null,
            selected: null,
            tab: null,
          })}
        >
          <span className="v2-kpi__label">
            Creative Family <ImageIcon aria-hidden="true" size={16} />
          </span>
          <strong>{formatNumber(families.length)}</strong>
          <small>{formatNumber(allFamilies.length)} trong toàn thư viện</small>
        </Link>
        {resultMetrics.kpiCards.map((card) => (
          <Link
            className="v2-kpi"
            href={buildContextHref(
              "/creatives?view=table#creative-results",
              query,
              {
                metric: resultCardMetric(card),
                sort: resultCardSort(card),
                ...(card.canonicalResultKey
                  ? { result: card.canonicalResultKey }
                  : {}),
                selected: null,
                tab: null,
              },
            )}
            title={card.formula}
            key={card.key}
          >
            <span className="v2-kpi__label">{card.label}</span>
            <strong>
              {formatDynamicValue(
                card.value,
                card.valueType,
                singleCurrency,
              )}
            </strong>
            <small>
              {card.unavailableReason === "split_currency"
                ? "Chọn một tiền tệ để so sánh"
                : card.attribution === "meta_attributed"
                  ? "Meta-attributed · Chỉ đọc"
                  : card.formula}
            </small>
          </Link>
        ))}
      </section>
      {!connected ? (
        <section className="v2-panel v2-empty-state">
          <div>
            <Image
              src="/creative-analytics-empty.png"
              width={320}
              height={320}
              alt=""
              priority
            />
            <h2>Kết nối Meta để xem hiệu quả Creative</h2>
            <p>
              Kết nối chỉ đọc sẽ đồng bộ Creative, Ads và Insights mà không thay
              đổi quảng cáo.
            </p>
            <Link
              className="button button--primary"
              href={href("/sources", query, { tab: "connection" })}
            >
              Mở nguồn dữ liệu
            </Link>
          </div>
        </section>
      ) : families.length === 0 ? (
        <section className="v2-panel v2-empty-state">
          <div>
            <Image
              src="/creative-analytics-empty.png"
              width={320}
              height={320}
              alt=""
            />
            <h2>Không có Creative phù hợp</h2>
            <p>
              Xóa bớt bộ lọc hoặc kiểm tra độ mới dữ liệu trước khi thay đổi
              khoảng ngày.
            </p>
            <Link
              className="button button--secondary"
              href={href("/data-health", query)}
            >
              Kiểm tra chất lượng dữ liệu
            </Link>
          </div>
        </section>
      ) : view === "table" ? (
        <>
          <CreativeTable
            families={visibleTableFamilies}
            query={query}
            metric={activeMetric}
            direction={metricSort}
            resultMetrics={resultMetrics}
          />
          {orderedFamilies.length > tablePageSize ? (
            <nav
              className="v2-pagination"
              aria-label="Phân trang hiệu quả Creative"
            >
              {tablePage > 1 ? (
                <Link
                  className="button button--secondary"
                  href={href("/creatives", query, {
                    page: String(tablePage - 1),
                    selected: null,
                    tab: null,
                  })}
                >
                  Trang trước
                </Link>
              ) : (
                <span
                  className="button button--secondary"
                  aria-disabled="true"
                >
                  Trang trước
                </span>
              )}
              <span>
                Trang {tablePage} / {tablePageCount}
              </span>
              {tablePage < tablePageCount ? (
                <Link
                  className="button button--secondary"
                  href={href("/creatives", query, {
                    page: String(tablePage + 1),
                    selected: null,
                    tab: null,
                  })}
                >
                  Trang sau
                </Link>
              ) : (
                <span
                  className="button button--secondary"
                  aria-disabled="true"
                >
                  Trang sau
                </span>
              )}
            </nav>
          ) : null}
        </>
      ) : view === "compare" ? (
        <CompareView
          families={families}
          query={query}
          resultMetrics={resultMetrics}
        />
      ) : (
        <CreativeOverview
          families={families}
          query={query}
          resultMetrics={resultMetrics}
        />
      )}
      {selected ? (
        <EntityDrawer
          title={`Chi tiết ${selected.name}`}
          closeHref={clearDrawerHref}
          restoreFocusId={selected.id}
          width="wide"
        >
          <CreativeDrawerContent
            family={selected}
            query={query}
            resultMetrics={resultMetrics}
          />
        </EntityDrawer>
      ) : null}
    </div>
  );
}

export {
  groupCreativeFamiliesForView,
  type CreativeFamilyViewItem,
};
