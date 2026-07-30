import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CircleDollarSign,
  MousePointer2,
  ShieldCheck,
  Sparkles,
  Target,
  UserRoundCheck,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import {
  creativeFullDetailHref,
  creativeScatterPointStyle,
  groupCreativeFamiliesForView,
  type CreativeFamilyViewItem,
} from "@/components/creative-performance-v2";
import { ContextualEntityLink } from "@/components/ui/contextual-entity-link";
import { PerformanceRating } from "@/components/ui/performance-rating";
import { ReportingContext } from "@/components/ui/reporting-context";
import {
  buildContextHref,
  type CreativeDrilldownMetric,
  type SortDirection,
} from "@/lib/navigation/query";
import {
  formatCompactNumber,
  formatMoney,
  formatNumber,
  formatPercent,
} from "@/lib/presentation/formatters";
import type {
  CreativeRow,
  DashboardViewModel,
} from "@/types/view-models";

type Query = Record<string, string | string[] | undefined>;

export type OverviewTrendPoint = {
  date: string;
  currency: string;
  spend: number;
  installs: number;
  registrations: number;
  cpi: number | null;
  costPerRegistration: number | null;
};

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

function creativeDrilldownHref(
  query: Query,
  metric: CreativeDrilldownMetric,
  sort: SortDirection,
) {
  return `${buildContextHref("/creatives?view=table", query, {
    metric,
    sort,
    selected: null,
    tab: null,
    compare_ids: null,
  })}#creative-results`;
}

function group(family: CreativeFamilyViewItem) {
  const rating = family.performance?.rating;
  if (rating === "TỐT") return "good";
  if (rating === "ỔN") return "stable";
  if (rating === "ÍT DỮ LIỆU") return "limited";
  return "poor";
}

function linePath(
  points: OverviewTrendPoint[],
  key: "cpi" | "costPerRegistration",
) {
  const values = points.map((point) => point[key]).filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  if (values.length < 2) return "";
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const range = Math.max(max - min, max * 0.1, 1);
  return points
    .map((point, index) => {
      const value = point[key];
      const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
      const y =
        value === null ? 94 : 8 + (1 - (value - min) / range) * 78;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function TopCreative({
  family,
  query,
  index,
}: {
  family: CreativeFamilyViewItem;
  query: Query;
  index: number;
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
          {formatNumber(family.performance?.installs ?? 0)} installs · CPI{" "}
          {family.performance
            ? formatMoney(
                family.performance.cpi,
                family.performance.currency,
              )
            : "—"}
        </small>
      </ContextualEntityLink>
      <PerformanceRating rating={family.performance?.rating ?? null} />
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

export function OverviewV2({
  dashboard,
  creatives,
  previousCreatives = [],
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
  selectedDrawer,
}: {
  dashboard: DashboardViewModel;
  creatives: CreativeRow[];
  previousCreatives?: CreativeRow[];
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
  freshness: string;
  selectedDrawer?: React.ReactNode;
}) {
  const families = groupCreativeFamiliesForView(creatives);
  const performances = families.flatMap((family) =>
    family.performance ? [family.performance] : [],
  );
  const currencies = [...new Set(performances.map((item) => item.currency))];
  const currency = currencies.length === 1 ? currencies[0] : null;
  const spend = currency
    ? performances.reduce((sum, item) => sum + item.spend, 0)
    : null;
  const installs = performances.reduce((sum, item) => sum + item.installs, 0);
  const registrations = performances.reduce(
    (sum, item) => sum + item.registrations,
    0,
  );
  const previousFamilies = groupCreativeFamiliesForView(previousCreatives);
  const previousPerformances = previousFamilies
    .flatMap((family) =>
      family.performance ? [family.performance] : [],
    )
    .filter((performance) => !currency || performance.currency === currency);
  const previousSpend =
    currency && previousPerformances.length
      ? previousPerformances.reduce((sum, item) => sum + item.spend, 0)
      : null;
  const previousInstalls = previousPerformances.length
    ? previousPerformances.reduce((sum, item) => sum + item.installs, 0)
    : null;
  const previousRegistrations = previousPerformances.length
    ? previousPerformances.reduce(
        (sum, item) => sum + item.registrations,
        0,
      )
    : null;
  const currentCpi =
    spend !== null && installs > 0 ? spend / installs : null;
  const previousCpi =
    previousSpend !== null &&
    previousInstalls !== null &&
    previousInstalls > 0
      ? previousSpend / previousInstalls
      : null;
  const currentCpa =
    spend !== null && registrations > 0 ? spend / registrations : null;
  const previousCpa =
    previousSpend !== null &&
    previousRegistrations !== null &&
    previousRegistrations > 0
      ? previousSpend / previousRegistrations
      : null;
  const currentConversionRate =
    installs > 0 ? (registrations / installs) * 100 : null;
  const previousConversionRate =
    previousInstalls !== null &&
    previousRegistrations !== null &&
    previousInstalls > 0
      ? (previousRegistrations / previousInstalls) * 100
      : null;
  const top = [...families]
    .filter((family) => family.performance)
    .sort(
      (left, right) =>
        (right.performance?.installs ?? 0) -
        (left.performance?.installs ?? 0),
    )
    .slice(0, 5);
  const actions = families
    .filter((family) => ["poor", "limited"].includes(group(family)))
    .slice(0, 5);
  const scatterFamilies = families.filter(
    (family) =>
      family.performance &&
      family.performance.spend >= 0 &&
      family.performance.cpi !== null,
  );
  const maxScatterSpend = Math.max(
    ...scatterFamilies.map((family) => family.performance?.spend ?? 0),
    1,
  );
  const maxScatterCpi = Math.max(
    ...scatterFamilies.map((family) => family.performance?.cpi ?? 0),
    1,
  );
  const maxScatterInstalls = Math.max(
    ...scatterFamilies.map((family) => family.performance?.installs ?? 0),
    1,
  );
  const segments = [
    {
      value: "good",
      label: "Tốt",
      description: "CPI tốt hơn benchmark",
      tone: "success",
      count: families.filter((family) => group(family) === "good").length,
    },
    {
      value: "stable",
      label: "Ổn định",
      description: "Trong vùng benchmark",
      tone: "accent",
      count: families.filter((family) => group(family) === "stable").length,
    },
    {
      value: "limited",
      label: "Ít dữ liệu",
      description: "Chưa đạt ngưỡng mẫu",
      tone: "warning",
      count: families.filter((family) => group(family) === "limited").length,
    },
    {
      value: "poor",
      label: "Cần xử lý",
      description: "CPI cao hoặc không install",
      tone: "danger",
      count: families.filter((family) => group(family) === "poor").length,
    },
  ];
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
        action="/overview"
        dateFrom={dateFrom}
        dateTo={dateTo}
        account={account}
        accounts={accounts}
        currency={reportingCurrency}
        currencies={currencyOptions}
        compare={compare}
        freshness={freshness}
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
            <Link
              className="v2-kpi"
              href={creativeDrilldownHref(query, "spend", "desc")}
            >
              <span className="v2-kpi__label">
                Spend <CircleDollarSign aria-hidden="true" size={16} />
              </span>
              <strong>
                {currency
                  ? formatMoney(spend, currency)
                  : currencies.length
                    ? "Nhiều tiền tệ"
                    : "—"}
              </strong>
              <KpiComparison
                current={spend}
                previous={previousSpend}
                fallback={
                  currencies.length > 1
                    ? "Không cộng gộp tiền tệ"
                    : "Toàn bộ delivery trong kỳ"
                }
                direction="neutral"
              />
            </Link>
            <Link
              className="v2-kpi"
              href={creativeDrilldownHref(query, "installs", "desc")}
            >
              <span className="v2-kpi__label">
                Install <MousePointer2 aria-hidden="true" size={16} />
              </span>
              <strong>{formatCompactNumber(installs)}</strong>
              <KpiComparison
                current={installs}
                previous={previousInstalls}
                fallback="Meta-attributed"
              />
            </Link>
            <Link
              className="v2-kpi"
              href={creativeDrilldownHref(
                query,
                "registrations",
                "desc",
              )}
            >
              <span className="v2-kpi__label">
                Registration <UserRoundCheck aria-hidden="true" size={16} />
              </span>
              <strong>{formatCompactNumber(registrations)}</strong>
              <KpiComparison
                current={registrations}
                previous={previousRegistrations}
                fallback="CompleteRegistration"
              />
            </Link>
            <Link
              className="v2-kpi"
              href={creativeDrilldownHref(query, "cpi", "asc")}
            >
              <span className="v2-kpi__label">
                CPI <Target aria-hidden="true" size={16} />
              </span>
              <strong>
                {currency && currentCpi !== null
                  ? formatMoney(currentCpi, currency)
                  : "—"}
              </strong>
              <KpiComparison
                current={currentCpi}
                previous={previousCpi}
                fallback="Spend / Install"
                direction="lower"
              />
            </Link>
            <Link
              className="v2-kpi"
              href={creativeDrilldownHref(query, "cpa", "asc")}
            >
              <span className="v2-kpi__label">CPA Registration</span>
              <strong>
                {currency && currentCpa !== null
                  ? formatMoney(currentCpa, currency)
                  : "—"}
              </strong>
              <KpiComparison
                current={currentCpa}
                previous={previousCpa}
                fallback="Spend / Registration"
                direction="lower"
              />
            </Link>
            <Link
              className="v2-kpi"
              href={creativeDrilldownHref(
                query,
                "conversion",
                "desc",
              )}
            >
              <span className="v2-kpi__label">
                Install → Registration
                <Sparkles aria-hidden="true" size={16} />
              </span>
              <strong>
                {currentConversionRate !== null
                  ? formatPercent(currentConversionRate)
                  : "—"}
              </strong>
              <KpiComparison
                current={currentConversionRate}
                previous={previousConversionRate}
                fallback={`${formatNumber(families.length)} Creative Family trong kỳ`}
              />
            </Link>
          </section>
          <section className="v2-segment-grid" aria-label="Phân khúc hiệu suất">
            {segments.map((segment) => (
              <Link
                className="v2-segment-card"
                href={href("/creatives", query, {
                  view: "table",
                  performance: segment.value,
                })}
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
          <div className="v2-overview-grid">
            <section className="v2-panel v2-scatter-panel v2-overview-scatter">
              <div className="v2-panel__header">
                <div>
                  <h2>Spend × CPI</h2>
                  <p>
                    Kích thước bubble theo Install; click để mở Creative
                    Family.
                  </p>
                </div>
                <BarChart3 aria-hidden="true" size={18} />
              </div>
              {scatterFamilies.length ? (
                <div
                  className="v2-scatter"
                  role="group"
                  aria-label="Biểu đồ phân tán Spend và CPI theo Creative Family"
                >
                  <span className="v2-scatter__y">
                    CPI thấp hơn tốt hơn
                  </span>
                  <span className="v2-scatter__x">Spend →</span>
                  <i className="v2-scatter__line v2-scatter__line--x" />
                  <i className="v2-scatter__line v2-scatter__line--y" />
                  {scatterFamilies.slice(0, 28).map((family) => {
                    const performance = family.performance!;
                    const left =
                      8 + (performance.spend / maxScatterSpend) * 82;
                    const top =
                      8 +
                      (1 - (performance.cpi ?? 0) / maxScatterCpi) * 74;
                    const pointSize =
                      14 +
                      Math.sqrt(
                        performance.installs / maxScatterInstalls,
                      ) *
                        18;
                    return (
                      <ContextualEntityLink
                        key={family.id}
                        className={`v2-scatter__point v2-scatter__point--${group(
                          family,
                        )}`}
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
                        ariaLabel={`${family.name}: Spend ${formatMoney(
                          performance.spend,
                          performance.currency,
                        )}, CPI ${formatMoney(
                          performance.cpi,
                          performance.currency,
                        )}, ${formatNumber(performance.installs)} installs`}
                        style={creativeScatterPointStyle(
                          left,
                          top,
                          pointSize,
                        )}
                      >
                        <span>{family.name}</span>
                      </ContextualEntityLink>
                    );
                  })}
                </div>
              ) : (
                <div className="v2-compact-empty">
                  <BarChart3 aria-hidden="true" size={22} />
                  <p>
                    Chưa có đủ Spend và CPI để vẽ scatter trong bộ lọc hiện
                    tại.
                  </p>
                </div>
              )}
            </section>
            <section className="v2-panel v2-trend-panel">
              <div className="v2-panel__header">
                <div>
                  <h2>Xu hướng CPI / CPA Registration</h2>
                  <p>
                    Theo ngày, cùng tiền tệ; không chuẩn hóa hoặc cộng chéo tiền
                    tệ.
                  </p>
                </div>
                <BarChart3 aria-hidden="true" size={18} />
              </div>
              {visibleTrend.length > 1 ? (
                <div className="v2-trend-chart">
                  <div className="v2-trend-legend">
                    <span>
                      <i className="v2-trend-dot v2-trend-dot--cpi" />
                      CPI
                    </span>
                    <span>
                      <i className="v2-trend-dot v2-trend-dot--cpa" />
                      CPA Registration
                    </span>
                    <strong>{trendCurrency}</strong>
                  </div>
                  <svg
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    role="img"
                    aria-label="Đường xu hướng CPI và CPA Registration theo ngày"
                  >
                    <path
                      className="v2-trend-line v2-trend-line--cpi"
                      d={linePath(visibleTrend, "cpi")}
                    />
                    <path
                      className="v2-trend-line v2-trend-line--cpa"
                      d={linePath(
                        visibleTrend,
                        "costPerRegistration",
                      )}
                    />
                  </svg>
                  <div className="v2-trend-axis">
                    <span>{visibleTrend[0]?.date}</span>
                    <span>{visibleTrend.at(-1)?.date}</span>
                  </div>
                </div>
              ) : (
                <div className="v2-compact-empty">
                  <BarChart3 aria-hidden="true" size={22} />
                  <p>
                    Chưa có đủ chuỗi dữ liệu theo ngày để vẽ xu hướng trong bộ
                    lọc hiện tại.
                  </p>
                </div>
              )}
            </section>
            <section className="v2-panel v2-ranked-list">
              <div className="v2-panel__header">
                <div>
                  <h2>Top Creative</h2>
                  <p>Theo số lượt cài đặt trong kỳ.</p>
                </div>
                <Sparkles aria-hidden="true" size={18} />
              </div>
              <ol>
                {top.map((family, index) => (
                  <TopCreative
                    family={family}
                    query={query}
                    index={index}
                    key={family.id}
                  />
                ))}
              </ol>
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
                          {family.performance?.ratingExplanation?.reasons[0] ??
                            (family.performance
                              ? "Cần xem chi tiết benchmark"
                              : "Chưa có dữ liệu delivery")}
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
                  <p>Không có cảnh báo Creative trong bộ lọc hiện tại.</p>
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
                {dashboard.checklist.map((item) => (
                  <li key={item.label}>
                    <span
                      className={`v2-quality-dot v2-quality-dot--${item.status}`}
                      aria-hidden="true"
                    />
                    <div>
                      <strong>{item.label}</strong>
                      <small>{item.detail}</small>
                    </div>
                  </li>
                ))}
              </ul>
              <Link className="v2-link" href={href("/data-health", query)}>
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
