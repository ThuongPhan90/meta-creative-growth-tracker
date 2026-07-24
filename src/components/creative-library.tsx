"use client";

import {
  Check,
  ChevronDown,
  Circle,
  ExternalLink,
  Film,
  ImageIcon,
  Link2,
  Play,
  RefreshCcw,
  Search,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useDeferredValue,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  countActiveCreativeAssets,
  CREATIVE_BATCH_SIZE,
  getCreativeAdStatusPresentation,
  prioritizeCreatives,
  resolveSelectedCreative,
} from "@/components/creative-library-logic";
import { PageHeader } from "@/components/ui/page-header";
import { PerformanceRating } from "@/components/ui/performance-rating";
import type {
  CreativeFormat,
  CreativePlatform,
  CreativeReadiness,
  CreativeRow,
} from "@/types/view-models";

type SelectOption<T extends string> = {
  value: T | "all";
  label: string;
};

const formatOptions: SelectOption<CreativeFormat>[] = [
  { value: "all", label: "Tất cả định dạng" },
  { value: "Video", label: "Video" },
  { value: "Banner", label: "Banner" },
  { value: "Carousel", label: "Carousel" },
  { value: "Unknown", label: "Không xác định" },
];

const platformOptions: SelectOption<CreativePlatform>[] = [
  { value: "all", label: "Tất cả nền tảng" },
  { value: "Android", label: "Android" },
  { value: "iOS", label: "iOS" },
  { value: "Android + iOS", label: "Android + iOS" },
  { value: "Unknown", label: "Không xác định" },
];

const statusOptions: SelectOption<CreativeReadiness>[] = [
  { value: "all", label: "Tất cả trạng thái" },
  { value: "Sẵn sàng", label: "Sẵn sàng" },
  { value: "Thiếu event mapping", label: "Thiếu event mapping" },
  { value: "Chưa gắn Ads", label: "Chưa gắn Ads" },
  { value: "Chờ phân phối", label: "Chờ phân phối" },
  { value: "Chưa có dữ liệu", label: "Chưa có dữ liệu" },
  { value: "Không xác định", label: "Không xác định" },
];

function FilterSelect<T extends string>({
  value,
  label,
  options,
  onChange,
}: {
  value: T | "all";
  label: string;
  options: SelectOption<T>[];
  onChange: (value: T | "all") => void;
}) {
  return (
    <label className="filter-select">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value as T | "all")}
      >
        {options.map((option) => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden="true" size={15} />
    </label>
  );
}

function readinessClass(status: CreativeReadiness) {
  if (status === "Sẵn sàng") return "creative-status--ready";
  if (status === "Chờ phân phối") return "creative-status--info";
  if (status === "Không xác định" || status === "Chưa có dữ liệu") {
    return "creative-status--neutral";
  }
  return "creative-status--warning";
}

function formatMetric(
  value: number | null,
  options?: Intl.NumberFormatOptions,
) {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("vi-VN", options).format(value);
}

function CreativeThumb({
  creative,
  large = false,
  eager = false,
}: {
  creative: CreativeRow;
  large?: boolean;
  eager?: boolean;
}) {
  return (
    <span className={`creative-thumb${large ? " creative-thumb--large" : ""}`}>
      <Image
        src={creative.imageUrl}
        alt={`Thumbnail ${creative.name}`}
        fill
        loading={large || eager ? "eager" : "lazy"}
        sizes={large ? "220px" : "110px"}
      />
      {creative.format === "Video" ? (
        <span className="creative-thumb__play" aria-hidden="true">
          <Play size={large ? 19 : 14} fill="currentColor" />
        </span>
      ) : null}
    </span>
  );
}

export function CreativeLibrary({
  creatives,
  truncated,
  isConnected,
}: {
  creatives: CreativeRow[];
  truncated: boolean;
  isConnected: boolean;
}) {
  const router = useRouter();
  const prioritized = useMemo(
    () => prioritizeCreatives(creatives),
    [creatives],
  );
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState<CreativeFormat | "all">("all");
  const [platform, setPlatform] = useState<CreativePlatform | "all">("all");
  const [readiness, setReadiness] = useState<CreativeReadiness | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(
    prioritized.at(0)?.id ?? null,
  );
  const [visibleLimit, setVisibleLimit] = useState(CREATIVE_BATCH_SIZE);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const creativeTriggerRefs = useRef(
    new Map<string, HTMLButtonElement>(),
  );
  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    return prioritized.filter((creative) => {
      const matchesQuery =
        !normalizedQuery ||
        creative.name.toLowerCase().includes(normalizedQuery) ||
        creative.assetKey.toLowerCase().includes(normalizedQuery) ||
        creative.aliases.some((alias) =>
          alias.toLowerCase().includes(normalizedQuery),
        );
      const matchesFormat = format === "all" || creative.format === format;
      const matchesPlatform =
        platform === "all" || creative.platform === platform;
      const matchesReadiness =
        readiness === "all" || creative.readiness === readiness;

      return (
        matchesQuery &&
        matchesFormat &&
        matchesPlatform &&
        matchesReadiness
      );
    });
  }, [deferredQuery, format, platform, prioritized, readiness]);

  const visibleCreatives = useMemo(
    () => filtered.slice(0, visibleLimit),
    [filtered, visibleLimit],
  );
  const selected = resolveSelectedCreative(visibleCreatives, selectedId);
  const effectiveSelectedId = selected?.id ?? null;
  const activeCreativeCount = useMemo(
    () => countActiveCreativeAssets(prioritized),
    [prioritized],
  );
  const remainingCreativeCount =
    filtered.length - visibleCreatives.length;

  function openCreativeDetail(creativeId: string) {
    setSelectedId(creativeId);
    window.requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 980px)").matches) {
        document
          .getElementById("creative-detail-panel")
          ?.scrollIntoView({ block: "start" });
      }
    });
  }

  function closeCreativeDetail() {
    const triggerId = effectiveSelectedId;
    setSelectedId(null);
    window.requestAnimationFrame(() => {
      if (triggerId) {
        creativeTriggerRefs.current.get(triggerId)?.focus();
      }
    });
  }

  async function handleSync() {
    if (!isConnected) {
      router.push("/connect");
      return;
    }

    setSyncing(true);
    setSyncMessage(null);
    try {
      const response = await fetch("/api/sync", { method: "POST" });
      const result = (await response.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error ?? "Không thể bắt đầu đồng bộ.");
      }
      setSyncMessage(result.message ?? "Đã bắt đầu đồng bộ.");
      router.refresh();
    } catch (error) {
      setSyncMessage(
        error instanceof Error ? error.message : "Đồng bộ thất bại.",
      );
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="creative-page">
      <PageHeader
        title="Thư viện Creative"
        description="Kiểm tra tài sản trước khi dữ liệu hiệu quả được mở khóa."
        actions={
          <button
            type="button"
            className="button button--secondary"
            onClick={handleSync}
            disabled={syncing}
          >
            <RefreshCcw
              aria-hidden="true"
              className={syncing ? "spin" : undefined}
              size={16}
            />
            {syncing ? "Đang đồng bộ" : "Đồng bộ creative"}
          </button>
        }
      />

      {syncMessage ? (
        <p className="inline-notice" role="status">
          {syncMessage}
        </p>
      ) : null}

      <section className="creative-workspace">
        <div className="creative-workspace__list">
          <div className="creative-toolbar">
            <label className="search-control">
              <Search aria-hidden="true" size={17} />
              <span className="sr-only">Tìm creative</span>
              <input
                value={query}
                type="search"
                placeholder="Tìm tên creative hoặc ID..."
                onChange={(event) => {
                  setQuery(event.target.value);
                  setVisibleLimit(CREATIVE_BATCH_SIZE);
                }}
              />
            </label>
            <FilterSelect
              value={format}
              label="Lọc theo định dạng"
              options={formatOptions}
              onChange={(value) => {
                setFormat(value);
                setVisibleLimit(CREATIVE_BATCH_SIZE);
              }}
            />
            <FilterSelect
              value={platform}
              label="Lọc theo nền tảng"
              options={platformOptions}
              onChange={(value) => {
                setPlatform(value);
                setVisibleLimit(CREATIVE_BATCH_SIZE);
              }}
            />
            <FilterSelect
              value={readiness}
              label="Lọc theo trạng thái"
              options={statusOptions}
              onChange={(value) => {
                setReadiness(value);
                setVisibleLimit(CREATIVE_BATCH_SIZE);
              }}
            />
          </div>

          <div
            className="creative-table"
            role="table"
            aria-label="Danh sách creative"
            aria-busy={query !== deferredQuery}
          >
            <div className="creative-table__head" role="row">
              <span role="columnheader">Creative</span>
              <span role="columnheader">Định dạng</span>
              <span role="columnheader">Nền tảng</span>
              <span role="columnheader">Quảng cáo</span>
              <span role="columnheader">Trạng thái dữ liệu</span>
              <span role="columnheader">Hiệu quả</span>
            </div>

            {visibleCreatives.length ? (
              visibleCreatives.map((creative) => {
                const adStatus = getCreativeAdStatusPresentation(creative);
                return (
                  <div
                    role="row"
                    className={`creative-row${
                      effectiveSelectedId === creative.id
                        ? " creative-row--selected"
                        : ""
                    }`}
                    key={creative.id}
                  >
                    <span className="creative-identity" role="cell">
                      <button
                        type="button"
                        className="creative-identity__button"
                        ref={(node) => {
                          if (node) {
                            creativeTriggerRefs.current.set(
                              creative.id,
                              node,
                            );
                          } else {
                            creativeTriggerRefs.current.delete(creative.id);
                          }
                        }}
                        onClick={() => openCreativeDetail(creative.id)}
                        aria-label={`Mở chi tiết ${creative.name}`}
                        aria-expanded={effectiveSelectedId === creative.id}
                        aria-controls={
                          effectiveSelectedId === creative.id
                            ? "creative-detail-panel"
                            : undefined
                        }
                      >
                        <CreativeThumb
                          creative={creative}
                          eager={effectiveSelectedId === creative.id}
                        />
                        <span>
                          <strong>{creative.name}</strong>
                          <small>{creative.assetKey}</small>
                          {creative.aliases[0] ? (
                            <em>{creative.aliases[0]}</em>
                          ) : null}
                          {creative.duration ? (
                            <em>{creative.duration}</em>
                          ) : null}
                        </span>
                      </button>
                    </span>
                    <span role="cell" className="format-cell">
                      {creative.format === "Video" ? (
                        <Film aria-hidden="true" size={15} />
                      ) : (
                        <ImageIcon aria-hidden="true" size={15} />
                      )}
                      {creative.format}
                    </span>
                    <span role="cell">{creative.platform}</span>
                    <span role="cell">
                      <span
                        className={`creative-ad-status creative-ad-status--${adStatus.tone}`}
                        title={`Quảng cáo: ${adStatus.label}; ${creative.linkCount} liên kết Ads`}
                      >
                        <Link2 aria-hidden="true" size={13} />
                        {adStatus.label}
                      </span>
                    </span>
                    <span role="cell">
                      <span
                        className={`creative-status ${readinessClass(
                          creative.readiness,
                        )}`}
                      >
                        {creative.readiness}
                      </span>
                    </span>
                    <span className="performance-cell" role="cell">
                      {creative.performance?.rating ? (
                        <PerformanceRating
                          rating={creative.performance.rating}
                        />
                      ) : (
                        creative.performanceLabel
                      )}
                    </span>
                  </div>
                );
              })
            ) : (
              <div role="row">
                <div className="creative-no-results" role="cell">
                  Không có creative phù hợp với bộ lọc hiện tại.
                </div>
              </div>
            )}
          </div>

          <footer className="creative-list-footer">
            <div className="creative-list-footer__summary">
              <span>
                Hiển thị {visibleCreatives.length}/
                {filtered.length} kết quả ·{" "}
                {activeCreativeCount.toLocaleString("vi-VN")} creative có Ads
                đang chạy được ưu tiên trước
              </span>
              {remainingCreativeCount > 0 ? (
                <button
                  type="button"
                  className="button button--secondary creative-list-footer__more"
                  onClick={() =>
                    setVisibleLimit((current) =>
                      Math.min(
                        current + CREATIVE_BATCH_SIZE,
                        filtered.length,
                      ),
                    )
                  }
                >
                  Xem thêm{" "}
                  {Math.min(
                    CREATIVE_BATCH_SIZE,
                    remainingCreativeCount,
                  ).toLocaleString("vi-VN")}
                </button>
              ) : null}
            </div>
            {truncated ? (
              <span className="creative-list-footer__warning">
                Library đang giới hạn 5.000 dòng để bảo vệ thời gian phản hồi.
                Dùng Creative Tracker để tìm kiếm toàn bộ dữ liệu theo trang.
              </span>
            ) : null}
            <span className="creative-list-footer__scope">
              Hiệu quả chỉ dùng tài khoản quảng cáo đang vận hành.{" "}
              <Link href="/tracker">Xem lịch sử trong Tracker</Link>.
            </span>
          </footer>
        </div>

        {selected ? (
          <aside
            className="creative-detail"
            id="creative-detail-panel"
            aria-label="Chi tiết creative"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                closeCreativeDetail();
              }
            }}
          >
            <div className="creative-detail__header">
              <div>
                <small>Chi tiết tài sản</small>
                <h2>{selected.name}</h2>
              </div>
              <button
                type="button"
                aria-label="Đóng chi tiết"
                onClick={closeCreativeDetail}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>

            <CreativeThumb creative={selected} large />

            <section className="detail-section">
              <h3>Thông tin tài sản</h3>
              <dl>
                <div>
                  <dt>ID tài sản</dt>
                  <dd>{selected.assetKey}</dd>
                </div>
                <div>
                  <dt>Mã creative</dt>
                  <dd>
                    {selected.aliases.length
                      ? selected.aliases.join(", ")
                      : "Chưa xác định"}
                  </dd>
                </div>
                <div>
                  <dt>Định dạng</dt>
                  <dd>{selected.format}</dd>
                </div>
                <div>
                  <dt>Thời lượng</dt>
                  <dd>{selected.duration ?? "N/A"}</dd>
                </div>
                <div>
                  <dt>Tỷ lệ khung hình</dt>
                  <dd>{selected.ratio ?? "Chưa xác định"}</dd>
                </div>
                <div>
                  <dt>Nền tảng</dt>
                  <dd>{selected.platform}</dd>
                </div>
                <div>
                  <dt>Trang</dt>
                  <dd>{selected.pageName ?? "Chưa liên kết"}</dd>
                </div>
                <div>
                  <dt>Quảng cáo</dt>
                  <dd>
                    {selected.activeAdCount > 0
                      ? `${selected.activeAdCount} đang chạy / ${selected.linkCount} liên kết`
                      : selected.linkCount > 0
                        ? `Không chạy / ${selected.linkCount} liên kết`
                        : "Chưa gắn Ads"}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="detail-section">
              <h3>Event mapping</h3>
              <ul className="mapping-list">
                <li>
                  {selected.eventMapping.install === true ? (
                    <Check aria-hidden="true" size={15} />
                  ) : (
                    <Circle aria-hidden="true" size={15} />
                  )}
                  Install
                  {selected.eventMapping.install === null
                    ? " · chưa xác minh"
                    : ""}
                </li>
                <li>
                  {selected.eventMapping.registration === true ? (
                    <Check aria-hidden="true" size={15} />
                  ) : (
                    <Circle aria-hidden="true" size={15} />
                  )}
                  CompleteRegistration
                  {selected.eventMapping.registration === null
                    ? " · chưa xác minh"
                    : ""}
                </li>
              </ul>
            </section>

            <section className="detail-section">
              <h3>Hiệu quả creative</h3>
              {selected.performance ? (
                <>
                  <div className="creative-metric-grid">
                    <div>
                      <span>Spend</span>
                      <strong>
                        {formatMetric(selected.performance.spend, {
                          maximumFractionDigits: 2,
                        })}{" "}
                        {selected.performance.currency}
                      </strong>
                    </div>
                    <div>
                      <span>Impressions</span>
                      <strong>
                        {formatMetric(selected.performance.impressions)}
                      </strong>
                    </div>
                    <div>
                      <span>Reach (tổng theo ngày)</span>
                      <strong>
                        {formatMetric(selected.performance.dailyReachSum)}
                      </strong>
                    </div>
                    <div>
                      <span>Link CTR</span>
                      <strong>
                        {formatMetric(selected.performance.linkCtr, {
                          maximumFractionDigits: 2,
                        })}
                        %
                      </strong>
                    </div>
                    <div>
                      <span>Meta Install</span>
                      <strong>{formatMetric(selected.performance.installs)}</strong>
                    </div>
                    <div>
                      <span>Meta Registration</span>
                      <strong>
                        {formatMetric(selected.performance.registrations)}
                      </strong>
                    </div>
                    <div>
                      <span>CPI</span>
                      <strong>
                        {formatMetric(selected.performance.cpi, {
                          maximumFractionDigits: 2,
                        })}{" "}
                        {selected.performance.currency}
                      </strong>
                    </div>
                    <div>
                      <span>CPA Registration</span>
                      <strong>
                        {formatMetric(
                          selected.performance.costPerRegistration,
                          { maximumFractionDigits: 2 },
                        )}{" "}
                        {selected.performance.currency}
                      </strong>
                    </div>
                    <div>
                      <span>Hook</span>
                      <strong>
                        {selected.format === "Video"
                          ? `${formatMetric(selected.performance.hookRate, {
                              maximumFractionDigits: 2,
                            })}%`
                          : "N/A"}
                      </strong>
                    </div>
                    <div>
                      <span>Hold</span>
                      <strong>
                        {selected.format === "Video"
                          ? `${formatMetric(selected.performance.holdRate, {
                              maximumFractionDigits: 2,
                            })}%`
                          : "N/A"}
                      </strong>
                    </div>
                  </div>
                  <div className="performance-context">
                    <PerformanceRating
                      rating={selected.performance.rating}
                    />
                    <p>
                      {selected.performance.dateFrom} →{" "}
                      {selected.performance.dateTo}
                      {" · Reach là tổng reach từng ngày, không phải unique reach của toàn khoảng ngày."}
                      {selected.performance.osBaselineCpi !== null
                        ? ` · Baseline CPI OS ${formatMetric(
                            selected.performance.osBaselineCpi,
                            { maximumFractionDigits: 2 },
                          )} ${selected.performance.currency}`
                        : ""}
                    </p>
                  </div>
                </>
              ) : (
                <p className="metric-empty">
                  Chưa có delivery. Spend, Impressions, Reach, CTR, CPI, CPA,
                  Hook và Hold sẽ tự mở khóa sau lần đồng bộ Insights có dữ
                  liệu.
                </p>
              )}
            </section>

            <div className="detail-notice">
              <strong>
                {selected.readiness === "Sẵn sàng"
                  ? "Creative đã sẵn sàng."
                  : selected.readiness}
              </strong>
              <p>
                Hiệu quả chỉ được đánh giá sau khi có đủ dữ liệu phân phối.
              </p>
            </div>

            {selected.linkCount ? (
              <Link
                className="detail-link"
                href={`/tracker?q=${encodeURIComponent(
                  selected.aliases[0] ?? selected.assetKey,
                )}`}
              >
                Xem {selected.linkCount} liên kết trong Tracker
                <ExternalLink aria-hidden="true" size={14} />
              </Link>
            ) : null}
          </aside>
        ) : null}
      </section>
    </div>
  );
}
