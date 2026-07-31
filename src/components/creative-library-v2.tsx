import {
  Grid2X2,
  LayoutList,
  Play,
  Search,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import {
  CreativeEvaluationStatus,
  CreativeDrawerContent,
  creativePerformanceGroup,
  creativeFullDetailHref,
  groupCreativeFamiliesForView,
  type CreativeFamilyViewItem,
} from "@/components/creative-performance-v2";
import { ContextualEntityLink } from "@/components/ui/contextual-entity-link";
import { CopyIdButton } from "@/components/ui/copy-id-button";
import { EntityDrawer } from "@/components/ui/entity-drawer";
import {
  ReportingContext,
  type ReportingFreshness,
} from "@/components/ui/reporting-context";
import {
  NAVIGATION_QUERY_KEYS,
  reportingContextHiddenFields,
} from "@/lib/navigation/query";
import {
  formatCompactNumber,
  formatMoney,
  formatNumber,
  formatPercent,
} from "@/lib/presentation/formatters";
import type { ReportingBarModel } from "@/lib/presentation/reporting-bar";
import type {
  DynamicResultMetricsModel,
  ResultKpiCard,
} from "@/lib/reporting";
import type { CreativeRow } from "@/types/view-models";

type Query = Record<string, string | string[] | undefined>;

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
  ]);
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(query)) {
    if (!allowed.has(key)) continue;
    const value = first(raw);
    if (value) params.set(key, value.slice(0, 500));
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (!allowed.has(key)) continue;
    if (!value) params.delete(key);
    else params.set(key, value);
  }
  return `${pathname}${params.size ? `?${params.toString()}` : ""}`;
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
  resultKey: string | null,
  valueType: ResultKpiCard["valueType"] | null,
) {
  const performance = family.performance;
  const result = familyResultValue(family, resultKey);
  if (!performance || result === null || result <= 0) return null;
  if (valueType === "currency") return performance.spend / result;
  if (valueType === "percent") {
    const clicks =
      performance.linkCtr === null
        ? null
        : (performance.linkCtr / 100) * performance.impressions;
    return clicks && clicks > 0 ? (result / clicks) * 100 : null;
  }
  if (valueType === "ratio" && resultKey === "purchase_value") {
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

function matches(
  family: CreativeFamilyViewItem,
  filters: {
    query: string;
    format: string;
    os: string;
    dataStatus: string;
    performance: string;
  },
) {
  if (
    filters.query &&
    ![
      family.name,
      family.id,
      family.assetKey,
      family.aliases.join(" "),
      family.entityLinks?.assetId ?? "",
      ...(family.entityLinks?.metaCreativeIds ?? []),
      ...(family.entityLinks?.adIds ?? []),
    ]
      .join(" ")
      .toLocaleLowerCase("vi-VN")
      .includes(filters.query.toLocaleLowerCase("vi-VN"))
  ) {
    return false;
  }
  if (
    filters.format &&
    family.format.toLocaleLowerCase("vi-VN") !== filters.format
  ) {
    return false;
  }
  if (
    filters.os &&
    !family.platforms.some(
      (platform) => platform.toLocaleLowerCase("vi-VN") === filters.os,
    )
  ) {
    return false;
  }
  if (
    filters.dataStatus &&
    family.performance?.confidence?.dataStatus !== filters.dataStatus
  ) {
    return false;
  }
  if (filters.performance) {
    if (
      creativePerformanceGroup(family.performance) !==
      filters.performance
    ) {
      return false;
    }
  }
  return true;
}

function CreativeCard({
  family,
  query,
  resultMetrics,
  priority = false,
}: {
  family: CreativeFamilyViewItem;
  query: Query;
  resultMetrics: DynamicResultMetricsModel;
  priority?: boolean;
}) {
  const detailHref = creativeFullDetailHref({
    familyId: family.id,
    query,
    tab: "preview",
    originPathname: "/library",
  });
  const drawerHref = href("/library", query, {
    selected: family.id,
    tab: "preview",
  });
  const performance = family.performance;
  const resultKey = resultMetrics.metadata.primaryResultKey;
  const resultCard = resultMetrics.kpiCards.find(
    (card) => card.key === `result:${resultKey ?? ""}`,
  );
  const efficiencyCard = resultMetrics.kpiCards.find(
    (card) => card.key === `efficiency:${resultKey ?? ""}`,
  );
  const resultDefinition =
    resultMetrics.availableResults.find(
      (result) => result.canonicalKey === resultKey,
    ) ?? null;
  const resultValue = familyResultValue(family, resultKey);
  const efficiencyValue = familyEfficiencyValue(
    family,
    resultKey,
    efficiencyCard?.valueType ?? null,
  );
  return (
    <article className="v2-library-card">
      <ContextualEntityLink
        className="v2-library-card__preview"
        href={detailHref}
        drawerHref={drawerHref}
        entityId={family.id}
        ariaLabel={`Mở chi tiết ${family.name}`}
      >
        <Image
          src={family.imageUrl}
          alt={`Preview ${family.name}`}
          width={480}
          height={300}
          unoptimized
          priority={priority}
        />
        {family.format === "Video" ? (
          <span className="v2-library-card__play" aria-hidden="true">
            <Play size={18} fill="currentColor" />
          </span>
        ) : null}
        {family.duration ? (
          <span className="v2-library-card__duration">
            {family.duration}
          </span>
        ) : null}
      </ContextualEntityLink>
      <div className="v2-library-card__body">
        <div className="v2-library-card__title">
          <div>
            <ContextualEntityLink
              href={detailHref}
              drawerHref={drawerHref}
              entityId={family.id}
            >
              <strong>{family.name}</strong>
            </ContextualEntityLink>
            <div className="v2-id-line">
              <code>{family.id}</code>
              <CopyIdButton value={family.id} />
            </div>
          </div>
          <span>{family.ratio ?? "—"}</span>
        </div>
        <div className="v2-chip-row">
          <span className="v2-chip v2-chip--accent">{family.format}</span>
          {family.platforms.map((platform) => (
            <span className="v2-chip" key={platform}>
              {platform}
            </span>
          ))}
        </div>
        <Link
          className="v2-link v2-library-card__usage"
          href={href("/library", query, {
            selected: family.id,
            tab: "usage",
          })}
          scroll={false}
        >
          {family.adCount} Ads · {family.activeAdCount} đang hoạt động
        </Link>
        <dl className="v2-library-metrics">
          <div>
            <dt>Spend</dt>
            <dd>
              {performance
                ? formatMoney(performance.spend, performance.currency)
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Impressions</dt>
            <dd>
              {performance
                ? formatCompactNumber(performance.impressions)
                : "—"}
            </dd>
          </div>
          {resultDefinition && resultCard ? (
            <div>
              <dt>{resultDefinition.shortLabel}</dt>
              <dd>
                {formatDynamicValue(
                  resultValue,
                  resultCard.valueType,
                  performance?.currency ?? null,
                )}
              </dd>
            </div>
          ) : null}
          {efficiencyCard ? (
            <div>
              <dt>{efficiencyCard.label}</dt>
              <dd>
                {formatDynamicValue(
                  efficiencyValue,
                  efficiencyCard.valueType,
                  performance?.currency ?? null,
                )}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
      <footer className="v2-library-card__footer">
        <CreativeEvaluationStatus
          performance={performance}
          resultKey={resultKey}
        />
        <small>
          Tin cậy{" "}
          {performance?.confidence?.confidence === "high"
            ? "Cao"
            : performance?.confidence?.confidence === "medium"
              ? "Trung bình"
              : performance?.confidence
                ? "Thấp"
                : "Chưa đánh giá"}
        </small>
        <span aria-hidden="true">›</span>
      </footer>
    </article>
  );
}

function LibraryTable({
  families,
  query,
  resultMetrics,
}: {
  families: CreativeFamilyViewItem[];
  query: Query;
  resultMetrics: DynamicResultMetricsModel;
}) {
  const gridTemplateColumns = [
    "minmax(280px, 1.55fr)",
    "minmax(170px, 0.95fr)",
    "minmax(135px, 0.7fr)",
    "minmax(155px, 0.85fr)",
    "minmax(130px, 0.75fr)",
    "minmax(115px, 0.7fr)",
    ...resultMetrics.dynamicTableColumns.map(
      () => "minmax(118px, 0.72fr)",
    ),
    "minmax(145px, 0.8fr)",
  ].join(" ");
  const gridStyle = {
    gridTemplateColumns,
    minWidth: `${1030 + resultMetrics.dynamicTableColumns.length * 118}px`,
  };
  return (
    <section
      className="v2-library-table"
      role="table"
      aria-label="Bảng thư viện Creative Family"
      tabIndex={0}
    >
      <div
        className="v2-library-table__head"
        role="row"
        style={gridStyle}
      >
        <span role="columnheader">Creative Family</span>
        <span role="columnheader">Định dạng / OS</span>
        <span role="columnheader">Nơi sử dụng</span>
        <span role="columnheader">Trạng thái dữ liệu</span>
        <span role="columnheader">Spend</span>
        <span role="columnheader">Impressions</span>
        {resultMetrics.dynamicTableColumns.map((column) => (
          <span
            role="columnheader"
            title={column.formula}
            key={column.key}
          >
            {column.label}
          </span>
        ))}
        <span role="columnheader">Đánh giá</span>
      </div>
      {families.map((family) => {
        const detail = creativeFullDetailHref({
          familyId: family.id,
          query,
          tab: "preview",
          originPathname: "/library",
        });
        const drawer = href("/library", query, {
          selected: family.id,
          tab: "preview",
        });
        const ratingDrawer = href("/library", query, {
          selected: family.id,
          tab: "rating",
        });
        return (
          <div
            className="v2-library-table__row"
            role="row"
            key={family.id}
            style={gridStyle}
          >
            <span role="cell">
              <ContextualEntityLink
                className="v2-creative-identity"
                href={detail}
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
                <span className="v2-chip v2-chip--accent">
                  {family.format}
                </span>
                {family.platforms.map((platform) => (
                  <span className="v2-chip" key={platform}>
                    {platform}
                  </span>
                ))}
              </span>
            </span>
            <span role="cell">
              <Link
                className="v2-link"
                href={href("/library", query, {
                  selected: family.id,
                  tab: "usage",
                })}
                scroll={false}
              >
                {family.adCount} Ads
              </Link>
            </span>
            <span role="cell">
              <span
                className={`v2-chip ${
                  family.performance
                    ? "v2-chip--success"
                    : "v2-chip--warning"
                }`}
              >
                {family.performance ? "Sẵn sàng" : family.readiness}
              </span>
            </span>
            <span role="cell">
              {family.performance
                ? formatMoney(
                    family.performance.spend,
                    family.performance.currency,
                  )
                : "—"}
            </span>
            <span role="cell">
              {family.performance
                ? formatCompactNumber(
                    family.performance.impressions,
                  )
                : "—"}
            </span>
            {resultMetrics.dynamicTableColumns.map((column) => {
              const value = column.key.startsWith("result:")
                ? familyResultValue(
                    family,
                    column.canonicalResultKey,
                  )
                : familyEfficiencyValue(
                    family,
                    column.canonicalResultKey,
                    column.valueType,
                  );
              return (
                <span role="cell" title={column.formula} key={column.key}>
                  {formatDynamicValue(
                    value,
                    column.valueType,
                    family.performance?.currency ?? null,
                  )}
                </span>
              );
            })}
            <span role="cell">
              {resultMetrics.metadata.primaryResultKey ? (
                <Link
                  className="v2-rating-detail-link"
                  href={ratingDrawer}
                  aria-label={`Mở chi tiết đánh giá ${family.name}`}
                  scroll={false}
                >
                  <CreativeEvaluationStatus
                    performance={family.performance}
                    resultKey={
                      resultMetrics.metadata.primaryResultKey
                    }
                  />
                </Link>
              ) : (
                <span className="v2-chip v2-chip--warning">
                  Chưa thể đánh giá
                </span>
              )}
            </span>
          </div>
        );
      })}
    </section>
  );
}

export function CreativeLibraryV2({
  creatives,
  connected,
  truncated,
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
  connected: boolean;
  truncated: boolean;
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
    format: first(query.format)?.trim().toLocaleLowerCase("vi-VN") ?? "",
    os: first(query.os)?.trim().toLocaleLowerCase("vi-VN") ?? "",
    dataStatus: first(query.data_status)?.trim().slice(0, 64) ?? "",
    performance:
      resultMetrics.metadata.primaryResultKey
        ? first(query.performance)?.trim().slice(0, 64) ?? ""
        : "",
  };
  const view = first(query.view) === "table" ? "table" : "grid";
  const all = groupCreativeFamiliesForView(creatives);
  const filtered = all.filter((family) => matches(family, filters));
  const page = Math.max(
    1,
    Math.min(100_000, Number.parseInt(first(query.page) ?? "1", 10) || 1),
  );
  const pageSize = view === "grid" ? 12 : 24;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );
  const selectedId = first(query.selected);
  const selected = selectedId
    ? all.find((family) => family.id === selectedId)
    : undefined;

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div>
          <h1>Thư viện Creative</h1>
          <p>
            Một Creative Family cho mỗi tài sản vật lý chuẩn; aliases và nơi sử
            dụng được liên kết bằng ID, không dùng tên làm định danh.
          </p>
        </div>
      </header>
      <ReportingContext
        {...reportingBar}
        action="/library"
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
          ...(filters.format ? { format: filters.format } : {}),
          ...(filters.os ? { os: filters.os } : {}),
          ...(filters.dataStatus
            ? { data_status: filters.dataStatus }
            : {}),
          ...(filters.performance
            ? { performance: filters.performance }
            : {}),
          view,
        }}
      />
      <form className="v2-filter-bar v2-library-filters" action="/library">
        <input type="hidden" name="from" value={dateFrom} />
        <input type="hidden" name="to" value={dateTo} />
        {account ? <input type="hidden" name="account" value={account} /> : null}
        <input type="hidden" name="compare" value={compare} />
        {reportingCurrency ? (
          <input type="hidden" name="currency" value={reportingCurrency} />
        ) : null}
        <input type="hidden" name="view" value={view} />
        <label className="v2-filter-search">
          <Search aria-hidden="true" size={16} />
          <span className="sr-only">Tìm Creative</span>
          <input
            name="q"
            defaultValue={filters.query}
            placeholder="Tìm Creative, mã, ID…"
          />
        </label>
        <select name="format" defaultValue={filters.format} aria-label="Định dạng">
          <option value="">Tất cả định dạng</option>
          <option value="video">Video</option>
          <option value="banner">Banner</option>
          <option value="unknown">Chưa xác định</option>
        </select>
        <select name="os" defaultValue={filters.os} aria-label="Hệ điều hành">
          <option value="">Tất cả hệ điều hành</option>
          <option value="android">Android</option>
          <option value="ios">iOS</option>
          <option value="unknown">Chưa xác định</option>
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
        <button className="button button--primary" type="submit">
          Lọc
        </button>
      </form>
      <div className="v2-library-toolbar">
        <div>
          <strong>{formatNumber(filtered.length)} Creative Family</strong>
          {truncated ? (
            <span className="v2-chip v2-chip--warning">
              Danh sách đã giới hạn để bảo vệ hiệu năng
            </span>
          ) : null}
        </div>
        <nav className="v2-segmented" aria-label="Kiểu hiển thị thư viện">
          <Link
            href={href("/library", query, {
              view: "grid",
              page: null,
              selected: null,
              tab: null,
            })}
            aria-current={view === "grid" ? "page" : undefined}
          >
            <Grid2X2 aria-hidden="true" size={16} />
            Lưới
          </Link>
          <Link
            href={href("/library", query, {
              view: "table",
              page: null,
              selected: null,
              tab: null,
            })}
            aria-current={view === "table" ? "page" : undefined}
          >
            <LayoutList aria-hidden="true" size={16} />
            Bảng
          </Link>
        </nav>
      </div>
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
            <h2>Kết nối Meta để đồng bộ Creative</h2>
            <p>
              Ứng dụng chỉ đọc tài sản và Insights; không tạo hoặc sửa quảng cáo.
            </p>
            <Link
              className="button button--primary"
              href={href("/sources", query, { tab: "connection" })}
            >
              Mở nguồn dữ liệu
            </Link>
          </div>
        </section>
      ) : visible.length === 0 ? (
        <section className="v2-panel v2-empty-state">
          <div>
            <Image
              src="/creative-analytics-empty.png"
              width={320}
              height={320}
              alt=""
            />
            <h2>Không tìm thấy Creative Family</h2>
            <p>Thử xóa bộ lọc hoặc kiểm tra đồng bộ Creative gần nhất.</p>
            <Link
              className="button button--secondary"
              href={href("/data-health", query)}
            >
              Xem chất lượng dữ liệu
            </Link>
          </div>
        </section>
      ) : view === "table" ? (
        <LibraryTable
          families={visible}
          query={query}
          resultMetrics={resultMetrics}
        />
      ) : (
        <section className="v2-library-grid" aria-label="Lưới Creative Family">
          {visible.map((family, index) => (
            <CreativeCard
              family={family}
              query={query}
              resultMetrics={resultMetrics}
              priority={index === 0}
              key={family.id}
            />
          ))}
        </section>
      )}
      {filtered.length > pageSize ? (
        <nav className="v2-pagination" aria-label="Phân trang thư viện">
          <Link
            className={`button button--secondary${
              safePage === 1 ? " button--disabled" : ""
            }`}
            aria-disabled={safePage === 1}
            href={href("/library", query, {
              page: String(Math.max(1, safePage - 1)),
              selected: null,
              tab: null,
            })}
          >
            Trang trước
          </Link>
          <span>
            Trang {safePage} / {pageCount}
          </span>
          <Link
            className={`button button--secondary${
              safePage === pageCount ? " button--disabled" : ""
            }`}
            aria-disabled={safePage === pageCount}
            href={href("/library", query, {
              page: String(Math.min(pageCount, safePage + 1)),
              selected: null,
              tab: null,
            })}
          >
            Trang sau
          </Link>
        </nav>
      ) : null}
      {selected ? (
        <EntityDrawer
          title={`Chi tiết ${selected.name}`}
          closeHref={href("/library", query, {
            selected: null,
            tab: null,
          })}
          restoreFocusId={selected.id}
          width="wide"
        >
          <CreativeDrawerContent
            family={selected}
            query={query}
            resultMetrics={resultMetrics}
            originPathname="/library"
          />
        </EntityDrawer>
      ) : null}
    </div>
  );
}
