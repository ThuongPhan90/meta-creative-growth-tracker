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
import { EntityDrawer } from "@/components/ui/entity-drawer";
import { PerformanceRating } from "@/components/ui/performance-rating";
import { ReportingContext } from "@/components/ui/reporting-context";
import {
  formatCompactNumber,
  formatMoney,
  formatNumber,
  formatPercent,
} from "@/lib/presentation/formatters";
import {
  parseNavigationQuery,
  type CreativeDrilldownMetric,
  type SortDirection,
} from "@/lib/navigation/query";
import type {
  CreativePerformanceSummary,
  CreativePlatform,
  CreativeRating,
  CreativeRow,
  DataConfidence,
  RatingExplanation,
} from "@/types/view-models";

type Query = Record<string, string | string[] | undefined>;
export type CreativeDrawerOrigin =
  | "/creatives"
  | "/library"
  | "/overview";

export type CreativeFamilyViewItem = {
  id: string;
  name: string;
  assetKey: string;
  aliases: string[];
  format: CreativeRow["format"];
  platforms: CreativePlatform[];
  imageUrl: string;
  duration: string | null;
  ratio: string | null;
  pageName: string | null;
  adCount: number;
  activeAdCount: number;
  readiness: CreativeRow["readiness"];
  performance: CreativePerformanceSummary | null;
  currencies: string[];
  entityLinks: CreativeRow["entityLinks"];
};

type FamilyView = CreativeFamilyViewItem;

const METRIC_LABELS: Record<CreativeDrilldownMetric, string> = {
  spend: "Spend",
  installs: "Install",
  registrations: "Registration",
  cpi: "CPI",
  cpa: "CPA Registration",
  conversion: "Install → Registration",
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
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(query)) {
    const value = first(raw);
    if (value) params.set(key, value.slice(0, 500));
  }
  for (const [key, value] of Object.entries(overrides)) {
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

function legacyFamilyId(row: CreativeRow) {
  return row.creativeFamilyId ?? `cf_${row.id.split(":")[0]}`;
}

function sumPerformance(
  items: CreativePerformanceSummary[],
): CreativePerformanceSummary | null {
  if (!items.length) return null;
  const spend = items.reduce((sum, item) => sum + item.spend, 0);
  const impressions = items.reduce(
    (sum, item) => sum + item.impressions,
    0,
  );
  const installs = items.reduce((sum, item) => sum + item.installs, 0);
  const registrations = items.reduce(
    (sum, item) => sum + item.registrations,
    0,
  );
  const clicks = items.reduce(
    (sum, item) =>
      sum +
      (item.linkCtr === null
        ? 0
        : (item.linkCtr / 100) * item.impressions),
    0,
  );
  const video3s = items.reduce(
    (sum, item) =>
      sum +
      (item.hookRate === null
        ? 0
        : (item.hookRate / 100) * item.impressions),
    0,
  );
  const video100 = items.reduce(
    (sum, item) =>
      sum +
      (item.holdRate === null
        ? 0
        : (item.holdRate / 100) *
          (item.hookRate === null
            ? 0
            : (item.hookRate / 100) * item.impressions)),
    0,
  );
  const leading = [...items].sort((left, right) => right.spend - left.spend)[0];
  return {
    ...leading,
    spend,
    impressions,
    dailyReachSum: items.reduce(
      (sum, item) => sum + item.dailyReachSum,
      0,
    ),
    linkCtr: impressions > 0 ? (clicks / impressions) * 100 : null,
    installs,
    registrations,
    cpi: installs > 0 ? spend / installs : null,
    costPerRegistration:
      registrations > 0 ? spend / registrations : null,
    hookRate: impressions > 0 ? (video3s / impressions) * 100 : null,
    holdRate: video3s > 0 ? (video100 / video3s) * 100 : null,
  };
}

function groupFamilies(rows: CreativeRow[]): FamilyView[] {
  const grouped = new Map<string, CreativeRow[]>();
  for (const row of rows) {
    const id = legacyFamilyId(row);
    const current = grouped.get(id) ?? [];
    current.push(row);
    grouped.set(id, current);
  }

  return [...grouped].map(([id, items]) => {
    const base = items[0];
    const performanceRows = items.flatMap((item) =>
      item.performance ? [item.performance] : [],
    );
    const byCurrency = new Map<string, CreativePerformanceSummary[]>();
    for (const performance of performanceRows) {
      const current = byCurrency.get(performance.currency) ?? [];
      current.push(performance);
      byCurrency.set(performance.currency, current);
    }
    const selectedCurrency = [...byCurrency.entries()].sort(
      ([, left], [, right]) =>
        right.reduce((sum, item) => sum + item.spend, 0) -
        left.reduce((sum, item) => sum + item.spend, 0),
    )[0];

    return {
      id,
      name: base.aliases[0] ?? base.name,
      assetKey: base.assetKey,
      aliases: [...new Set(items.flatMap((item) => item.aliases))],
      format: base.format,
      platforms: [...new Set(items.map((item) => item.platform))],
      imageUrl: base.imageUrl,
      duration: base.duration,
      ratio: base.ratio,
      pageName: base.pageName,
      adCount: Math.max(...items.map((item) => item.linkCount), 0),
      activeAdCount: Math.max(
        ...items.map((item) => item.activeAdCount),
        0,
      ),
      readiness: base.readiness,
      performance: selectedCurrency
        ? sumPerformance(selectedCurrency[1])
        : null,
      currencies: [...byCurrency.keys()],
      entityLinks: items.find((item) => item.entityLinks)?.entityLinks,
    };
  });
}

function confidenceLabel(confidence?: DataConfidence) {
  if (!confidence) return "Chưa đánh giá";
  if (confidence.confidence === "high") return "Cao";
  if (confidence.confidence === "medium") return "Trung bình";
  return "Thấp";
}

function performanceGroup(rating: CreativeRating | null | undefined) {
  if (rating === "TỐT") return "good";
  if (rating === "KÉM" || rating === "KHÔNG INSTALL") return "poor";
  if (rating === "ÍT DỮ LIỆU") return "limited";
  return "stable";
}

function metricValue(
  family: FamilyView,
  metric: CreativeDrilldownMetric,
) {
  const performance = family.performance;
  if (!performance) return null;

  switch (metric) {
    case "spend":
      return performance.spend;
    case "installs":
      return performance.installs;
    case "registrations":
      return performance.registrations;
    case "cpi":
      return performance.cpi;
    case "cpa":
      return performance.costPerRegistration;
    case "conversion":
      return performance.installs > 0
        ? performance.registrations / performance.installs
        : null;
  }
}

export function sortCreativeFamiliesForMetric(
  families: readonly CreativeFamilyViewItem[],
  metric: CreativeDrilldownMetric,
  direction: SortDirection,
) {
  return families
    .map((family, index) => ({ family, index }))
    .sort((left, right) => {
      const leftValue = metricValue(left.family, metric);
      const rightValue = metricValue(right.family, metric);
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
  return metric === "cpi" || metric === "cpa" ? "asc" : "desc";
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
    performanceGroup(family.performance?.rating) !== filters.performance
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

function ratingAction(explanation: RatingExplanation | null | undefined) {
  if (!explanation) return "Tiếp tục thu thập dữ liệu để có đề xuất.";
  if (explanation.recommendedAction === "scale") {
    return "Có thể mở rộng phân phối sau khi kiểm tra chéo chất lượng đăng ký.";
  }
  if (explanation.recommendedAction === "hold") {
    return "Giữ nhịp phân phối và theo dõi thêm trong cửa sổ benchmark.";
  }
  if (explanation.recommendedAction === "continue_test") {
    return "Tiếp tục thử nghiệm đến khi đạt ngưỡng dữ liệu tối thiểu.";
  }
  return "Rà soát hook, thông điệp và placement trước khi thử biến thể mới.";
}

export function CreativeDrawerContent({
  family,
  query,
  fullPage = false,
  originPathname = "/creatives",
}: {
  family: FamilyView;
  query: Query;
  fullPage?: boolean;
  originPathname?: CreativeDrawerOrigin;
}) {
  const tab = DETAIL_TABS.some((item) => item.value === first(query.tab))
    ? first(query.tab)!
    : "preview";
  const performance = family.performance;
  const explanation = performance?.ratingExplanation;
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
                  <span>Install</span>
                  <strong>{formatNumber(performance.installs)}</strong>
                </div>
                <div>
                  <span>Registration</span>
                  <strong>{formatNumber(performance.registrations)}</strong>
                </div>
                <div>
                  <span>CPI</span>
                  <strong>
                    {formatMoney(performance.cpi, performance.currency)}
                  </strong>
                </div>
                <div>
                  <span>CPA Registration</span>
                  <strong>
                    {formatMoney(
                      performance.costPerRegistration,
                      performance.currency,
                    )}
                  </strong>
                </div>
                <div>
                  <span>Link CTR</span>
                  <strong>{formatPercent(performance.linkCtr)}</strong>
                </div>
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
            <div className="v2-rating-heading">
              <div>
                <span>Đánh giá tổng hợp</span>
                <PerformanceRating rating={performance?.rating ?? null} />
              </div>
              <span className="v2-chip v2-chip--success">
                Độ tin cậy:{" "}
                {confidenceLabel(performance?.confidence)}
              </span>
            </div>
            <div className="v2-rating-comparison">
              <span>CPI so với benchmark</span>
              <strong>
                {formatMoney(performance?.cpi ?? null, performance?.currency ?? "VND")}
              </strong>
              <div className="v2-rating-bar" aria-hidden="true">
                <span
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(
                        8,
                        50 - (explanation?.deltaPercent ?? 0) / 2,
                      ),
                    )}%`,
                  }}
                />
              </div>
              <small>
                Benchmark{" "}
                {formatMoney(
                  explanation?.benchmarkValue ??
                    performance?.osBaselineCpi ??
                    null,
                  performance?.currency ?? "VND",
                )}
                {explanation
                  ? ` · ${explanation.benchmarkScope.windowDays} ngày · ${formatNumber(
                      explanation.benchmarkScope.sampleSize,
                    )} mẫu`
                  : ""}
              </small>
            </div>
            <div className="v2-explanation">
              <Info aria-hidden="true" size={17} />
              <div>
                <strong>Vì sao Creative được đánh giá như vậy?</strong>
                <p>
                  {explanation?.reasons.join(". ") ??
                    "Cần thêm dữ liệu benchmark theo hệ điều hành, định dạng và tiền tệ."}
                </p>
              </div>
            </div>
            <div className="v2-explanation v2-explanation--action">
              <Target aria-hidden="true" size={17} />
              <div>
                <strong>Hành động đề xuất</strong>
                <p>{ratingAction(explanation)}</p>
              </div>
            </div>
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
}: {
  families: FamilyView[];
  query: Query;
  metric?: CreativeDrilldownMetric;
  direction: SortDirection;
}) {
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
      <div className="v2-creative-table__head" role="row">
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
          metric="installs"
        />
        <MetricColumnHeader
          activeMetric={metric}
          direction={direction}
          metric="registrations"
        />
        <MetricColumnHeader
          activeMetric={metric}
          direction={direction}
          metric="conversion"
        />
        <MetricColumnHeader
          activeMetric={metric}
          direction={direction}
          metric="cpi"
        />
        <MetricColumnHeader
          activeMetric={metric}
          direction={direction}
          metric="cpa"
        />
        <span role="columnheader">Link CTR</span>
        <span role="columnheader">Hook</span>
        <span role="columnheader">Hold</span>
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
        const ratingDrawer = href("/creatives", query, {
          selected: family.id,
          tab: "rating",
        });
        return (
          <div className="v2-creative-table__row" role="row" key={family.id}>
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
              className={metricCellClass(metric, "installs")}
            >
              {performance ? formatNumber(performance.installs) : "—"}
            </span>
            <span
              role="cell"
              className={metricCellClass(metric, "registrations")}
            >
              {performance ? formatNumber(performance.registrations) : "—"}
            </span>
            <span
              role="cell"
              className={metricCellClass(metric, "conversion")}
            >
              {formatPercent(
                performance && performance.installs > 0
                  ? (performance.registrations / performance.installs) * 100
                  : null,
              )}
            </span>
            <span
              role="cell"
              className={metricCellClass(metric, "cpi")}
            >
              {performance
                ? formatMoney(performance.cpi, performance.currency)
                : "—"}
            </span>
            <span
              role="cell"
              className={metricCellClass(metric, "cpa")}
            >
              {performance
                ? formatMoney(
                    performance.costPerRegistration,
                    performance.currency,
                  )
                : "—"}
            </span>
            <span role="cell">
              {formatPercent(performance?.linkCtr ?? null)}
            </span>
            <span role="cell">
              {formatPercent(performance?.hookRate ?? null)}
            </span>
            <span role="cell">
              {formatPercent(performance?.holdRate ?? null)}
            </span>
            <span role="cell">
              <Link
                className="v2-rating-detail-link"
                href={ratingDrawer}
                aria-label={`Mở chi tiết đánh giá ${family.name}`}
                scroll={false}
              >
                <PerformanceRating rating={performance?.rating ?? null} />
              </Link>
              <small>
                Tin cậy {confidenceLabel(performance?.confidence)}
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
}: {
  families: FamilyView[];
  query: Query;
}) {
  const withPerformance = families.filter((family) => family.performance);
  const maxSpend = Math.max(
    ...withPerformance.map((family) => family.performance?.spend ?? 0),
    1,
  );
  const maxCpi = Math.max(
    ...withPerformance.map((family) => family.performance?.cpi ?? 0),
    1,
  );
  const maxInstalls = Math.max(
    ...withPerformance.map(
      (family) => family.performance?.installs ?? 0,
    ),
    1,
  );
  const distribution = [
    {
      key: "good",
      label: "Tốt",
      tone: "success",
      count: families.filter(
        (family) => performanceGroup(family.performance?.rating) === "good",
      ).length,
    },
    {
      key: "stable",
      label: "Ổn định",
      tone: "accent",
      count: families.filter(
        (family) => performanceGroup(family.performance?.rating) === "stable",
      ).length,
    },
    {
      key: "limited",
      label: "Ít dữ liệu",
      tone: "warning",
      count: families.filter(
        (family) => performanceGroup(family.performance?.rating) === "limited",
      ).length,
    },
    {
      key: "poor",
      label: "Cần xử lý",
      tone: "danger",
      count: families.filter(
        (family) => performanceGroup(family.performance?.rating) === "poor",
      ).length,
    },
  ];
  const top = [...withPerformance]
    .sort(
      (left, right) =>
        (right.performance?.installs ?? 0) -
        (left.performance?.installs ?? 0),
    )
    .slice(0, 5);
  const actions = families
    .filter((family) =>
      ["poor", "limited"].includes(
        performanceGroup(family.performance?.rating),
      ),
    )
    .slice(0, 5);

  return (
    <div className="v2-performance-overview">
      <section className="v2-panel v2-distribution">
        <div className="v2-panel__header">
          <div>
            <h2>Phân bổ hiệu suất</h2>
            <p>Creative Family theo benchmark cùng OS × định dạng × tiền tệ.</p>
          </div>
          <Sparkles aria-hidden="true" size={18} />
        </div>
        <div className="v2-distribution__body">
          {distribution.map((item) => (
            <Link
              className="v2-distribution__item"
              href={href("/creatives", query, {
                view: "table",
                performance: item.key,
              })}
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
      <section className="v2-panel v2-scatter-panel">
        <div className="v2-panel__header">
          <div>
            <h2>Spend × CPI</h2>
            <p>Mỗi điểm là một Creative Family; click để mở chi tiết.</p>
          </div>
          <BarChart3 aria-hidden="true" size={18} />
        </div>
        <div
          className="v2-scatter"
          role="group"
          aria-label="Biểu đồ phân tán Spend và CPI"
        >
          <span className="v2-scatter__y">CPI thấp hơn tốt hơn</span>
          <span className="v2-scatter__x">Spend →</span>
          <i className="v2-scatter__line v2-scatter__line--x" />
          <i className="v2-scatter__line v2-scatter__line--y" />
          {withPerformance.slice(0, 28).map((family) => {
            const performance = family.performance!;
            const left = 8 + (performance.spend / maxSpend) * 82;
            const top = 8 + (1 - (performance.cpi ?? 0) / maxCpi) * 74;
            const pointSize =
              14 +
              Math.sqrt(performance.installs / maxInstalls) * 18;
            return (
              <ContextualEntityLink
                key={family.id}
                className={`v2-scatter__point v2-scatter__point--${performanceGroup(
                  performance.rating,
                )}`}
                href={href(`/creatives/${family.id}`, query, {
                  selected: null,
                  tab: "performance",
                })}
                drawerHref={href("/creatives", query, {
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
                )}`}
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
      </section>
      <section className="v2-panel v2-ranked-list">
        <div className="v2-panel__header">
          <div>
            <h2>Top Creative</h2>
            <p>Xếp theo số lượt cài đặt trong kỳ.</p>
          </div>
          <ArrowUpRight aria-hidden="true" size={18} />
        </div>
        <ol>
          {top.map((family, index) => (
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
                  tab: "performance",
                })}
                entityId={family.id}
              >
                <strong>{family.name}</strong>
                <small>
                  {formatNumber(family.performance?.installs ?? 0)} installs
                </small>
              </ContextualEntityLink>
              <PerformanceRating
                rating={family.performance?.rating ?? null}
              />
            </li>
          ))}
        </ol>
      </section>
      <section className="v2-panel v2-ranked-list">
        <div className="v2-panel__header">
          <div>
            <h2>Creative cần hành động</h2>
            <p>Ưu tiên theo đánh giá và độ phủ dữ liệu.</p>
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
                    {ratingAction(
                      family.performance?.ratingExplanation,
                    )}
                  </small>
                </ContextualEntityLink>
                <PerformanceRating
                  rating={family.performance?.rating ?? null}
                />
              </li>
            ))}
          </ol>
        ) : (
          <div className="v2-compact-empty">
            <ShieldCheck aria-hidden="true" size={22} />
            <p>Không có Creative cần xử lý trong bộ lọc hiện tại.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function CompareView({
  families,
  query,
}: {
  families: FamilyView[];
  query: Query;
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
              <PerformanceRating
                rating={family.performance?.rating ?? null}
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
                  <dt>Install</dt>
                  <dd>{formatNumber(family.performance?.installs ?? 0)}</dd>
                </div>
                <div>
                  <dt>Registration</dt>
                  <dd>
                    {formatNumber(family.performance?.registrations ?? 0)}
                  </dd>
                </div>
                <div>
                  <dt>CPI</dt>
                  <dd>
                    {family.performance
                      ? formatMoney(
                          family.performance.cpi,
                          family.performance.currency,
                        )
                      : "—"}
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
}: {
  creatives: CreativeRow[];
  connected: boolean;
  query: Query;
  dateFrom: string;
  dateTo: string;
  accounts: { id: string; name: string }[];
  account: string;
  reportingCurrency: string;
  currencyOptions: string[];
  compare: "previous_period" | "none";
  freshness: string;
}) {
  const filters = {
    query: first(query.q)?.trim().slice(0, 200) ?? "",
    campaign: first(query.campaign)?.trim().slice(0, 160) ?? "",
    os: first(query.os)?.trim().slice(0, 64) ?? "",
    format: first(query.format)?.trim().slice(0, 64) ?? "",
    performance: first(query.performance)?.trim().slice(0, 64) ?? "",
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
  const allFamilies = groupFamilies(creatives);
  const families = allFamilies.filter((family) =>
    matchesFilters(family, filters),
  );
  const orderedFamilies = activeMetric
    ? sortCreativeFamiliesForMetric(
        families,
        activeMetric,
        metricSort,
      )
    : families;
  const performances = families.flatMap((family) =>
    family.performance ? [family.performance] : [],
  );
  const currencies = [...new Set(performances.map((item) => item.currency))];
  const singleCurrency = currencies.length === 1 ? currencies[0] : null;
  const spend = singleCurrency
    ? performances.reduce((sum, item) => sum + item.spend, 0)
    : null;
  const installs = performances.reduce((sum, item) => sum + item.installs, 0);
  const registrations = performances.reduce(
    (sum, item) => sum + item.registrations,
    0,
  );
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
        <select
          name="performance"
          defaultValue={filters.performance}
          aria-label="Hiệu suất"
        >
          <option value="">Tất cả hiệu suất</option>
          <option value="good">Tốt</option>
          <option value="stable">Ổn định</option>
          <option value="limited">Ít dữ liệu</option>
          <option value="poor">Cần xử lý</option>
        </select>
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
        <button className="v2-icon-button" type="submit" aria-label="Áp dụng bộ lọc">
          <ListFilter aria-hidden="true" size={18} />
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
          href={href("/library", query, { selected: null, tab: null })}
        >
          <span className="v2-kpi__label">
            Creative Family <ImageIcon aria-hidden="true" size={16} />
          </span>
          <strong>{formatNumber(families.length)}</strong>
          <small>{formatNumber(allFamilies.length)} trong toàn thư viện</small>
        </Link>
        <article className="v2-kpi">
          <span className="v2-kpi__label">Spend</span>
          <strong>
            {singleCurrency
              ? formatMoney(spend, singleCurrency)
              : currencies.length
                ? "Nhiều tiền tệ"
                : "—"}
          </strong>
          <small>
            {currencies.length > 1
              ? "Không cộng gộp tiền tệ"
              : "Trong bộ lọc hiện tại"}
          </small>
        </article>
        <article className="v2-kpi">
          <span className="v2-kpi__label">Install</span>
          <strong>{formatCompactNumber(installs)}</strong>
          <small>Meta-attributed</small>
        </article>
        <article className="v2-kpi">
          <span className="v2-kpi__label">Registration</span>
          <strong>{formatCompactNumber(registrations)}</strong>
          <small>Meta-attributed</small>
        </article>
        <article className="v2-kpi">
          <span className="v2-kpi__label">CPI tổng</span>
          <strong>
            {singleCurrency && installs > 0
              ? formatMoney((spend ?? 0) / installs, singleCurrency)
              : "—"}
          </strong>
          <small>Spend / Install</small>
        </article>
        <article className="v2-kpi">
          <span className="v2-kpi__label">CPA Registration</span>
          <strong>
            {singleCurrency && registrations > 0
              ? formatMoney((spend ?? 0) / registrations, singleCurrency)
              : "—"}
          </strong>
          <small>Spend / Registration</small>
        </article>
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
        <CreativeTable
          families={orderedFamilies}
          query={query}
          metric={activeMetric}
          direction={metricSort}
        />
      ) : view === "compare" ? (
        <CompareView families={families} query={query} />
      ) : (
        <CreativeOverview families={families} query={query} />
      )}
      {selected ? (
        <EntityDrawer
          title={`Chi tiết ${selected.name}`}
          closeHref={clearDrawerHref}
          restoreFocusId={selected.id}
          width="wide"
        >
          <CreativeDrawerContent family={selected} query={query} />
        </EntityDrawer>
      ) : null}
    </div>
  );
}

export { groupFamilies as groupCreativeFamiliesForView };
