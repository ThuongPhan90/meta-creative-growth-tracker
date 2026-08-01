import {
  Activity,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  FolderKanban,
  Layers3,
  Megaphone,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

import type {
  LiveDeliveryMetricState,
  LiveDeliverySnapshotMetric,
  LiveDeliverySummary,
} from "@/lib/db";
import { buildNavigationHref } from "@/lib/navigation/query";
import { formatNumber, formatPercent } from "@/lib/presentation/formatters";

type Query = Record<string, string | string[] | undefined>;

function snapshotDate(value: string | null) {
  if (!value) return "chưa xác định";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "chưa xác định";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(date);
}

function metricDateRange(min: string | null, max: string | null) {
  const format = (value: string | null) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime())) return null;
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
  };
  const from = format(min);
  const to = format(max);
  if (!from && !to) return null;
  if (!from || !to || from === to) return `Ngày delivery: ${from ?? to}`;
  return `Khoảng delivery: ${from}–${to}`;
}

function statePresentation(state: LiveDeliveryMetricState) {
  if (state === "ready") {
    return {
      label: "Đủ dữ liệu",
      className: "v2-chip--success",
      Icon: CircleCheck,
    };
  }
  if (state === "partial") {
    return {
      label: "Hiển thị một phần",
      className: "v2-chip--warning",
      Icon: CircleAlert,
    };
  }
  return {
    label: "Chưa đủ dữ liệu",
    className: "",
    Icon: CircleDashed,
  };
}

function metricValue(metric: LiveDeliverySnapshotMetric) {
  return metric.value === null ? "—" : formatNumber(metric.value);
}

function CoverageLine({ summary }: { summary: LiveDeliverySummary }) {
  const eligible = summary.deliveryEligibleAccountCount;
  const deliveryCoverage =
    summary.state === "unavailable" || summary.activeAds.value === null
      ? "Coverage delivery chưa khả dụng"
      : eligible
        ? `${summary.deliveryReadyAccountCount}/${eligible} tài khoản có delivery gần nhất`
        : "Không có Ads đang bật trong phạm vi đã chọn";
  const mapping =
    summary.mappingCoverage.percent === null
      ? "Creative mapping chưa khả dụng"
      : `Creative mapping ${formatPercent(summary.mappingCoverage.percent)}`;

  return (
    <p className="v2-live-delivery__coverage">
      {deliveryCoverage} <span aria-hidden="true">·</span> {mapping}
    </p>
  );
}

function DeliveryMetric({
  label,
  metric,
  href,
  Icon,
  prominent = false,
}: {
  label: string;
  metric: LiveDeliverySnapshotMetric;
  href: string;
  Icon: typeof Megaphone;
  prominent?: boolean;
}) {
  const content = (
    <>
      <span className="v2-live-delivery__metric-label">
        <Icon aria-hidden="true" size={15} />
        {label}
      </span>
      <strong>{metricValue(metric)}</strong>
      <small>
        {metric.state === "ready"
          ? "Snapshot hiện tại"
          : metric.state === "partial"
            ? "Có coverage kèm theo"
            : "Chưa xác minh được"}
      </small>
    </>
  );

  return metric.value === null ? (
    <article
      className={`v2-live-delivery__metric${
        prominent ? " v2-live-delivery__metric--prominent" : ""
      }`}
    >
      {content}
    </article>
  ) : (
    <Link
      className={`v2-live-delivery__metric${
        prominent ? " v2-live-delivery__metric--prominent" : ""
      }`}
      href={href}
    >
      {content}
    </Link>
  );
}

/**
 * Small operational rail for the current snapshot. It intentionally does not
 * reuse historical KPI numbers: current status and period performance answer
 * different questions.
 */
export function LiveDeliveryStrip({
  summary,
  query,
}: {
  summary: LiveDeliverySummary;
  query: Query;
}) {
  const presentation = statePresentation(summary.state);
  const StateIcon = presentation.Icon;
  const snapshotAt =
    summary.reportingSnapshot.publishedAt ?? summary.inventoryObservedAt;
  const activeWithoutDelivery = summary.activeWithoutDelivery;
  const metricRange = metricDateRange(
    summary.metricDateMin,
    summary.metricDateMax,
  );

  return (
    <section
      className={`v2-live-delivery v2-live-delivery--${summary.state}`}
      aria-labelledby="live-delivery-title"
    >
      <header className="v2-live-delivery__header">
        <div>
          <span>Đang chạy hiện tại</span>
          <h2 id="live-delivery-title">Phân phối Meta</h2>
          <p>
            Snapshot dữ liệu: {snapshotDate(snapshotAt)}
            {metricRange ? ` · ${metricRange}` : ""}
          </p>
        </div>
        <span className={`v2-chip ${presentation.className}`}>
          <StateIcon aria-hidden="true" size={14} />
          {presentation.label}
        </span>
      </header>

      <div className="v2-live-delivery__metrics">
        <DeliveryMetric
          label="Ads đang bật"
          metric={summary.activeAds}
          href={buildNavigationHref(
            "/campaigns?tab=ads&status=active",
            query,
          )}
          Icon={Megaphone}
          prominent
        />
        <DeliveryMetric
          label="Ads có phân phối"
          metric={summary.activeDeliveringAds}
          href={buildNavigationHref(
            "/campaigns?tab=ads&delivery=latest",
            query,
          )}
          Icon={Activity}
        />
        <DeliveryMetric
          label="Creative đã xác định"
          metric={summary.mappedActiveCreativeFamilies}
          href={buildNavigationHref("/creatives?delivery=active", query)}
          Icon={Sparkles}
        />
        <DeliveryMetric
          label="Campaign đang chạy"
          metric={summary.activeCampaigns}
          href={buildNavigationHref("/campaigns?status=active", query)}
          Icon={FolderKanban}
        />
      </div>

      <footer className="v2-live-delivery__footer">
        {activeWithoutDelivery.value === null ? (
          <span>Chưa thể xác định Ads bật chưa có delivery gần nhất.</span>
        ) : (
          <Link
            className="v2-live-delivery__missing"
            href={buildNavigationHref(
              "/campaigns?tab=ads&delivery=missing",
              query,
            )}
          >
            {formatNumber(activeWithoutDelivery.value)} Ads bật chưa có
            delivery gần nhất
          </Link>
        )}
        <Link
          className="v2-link"
          href={buildNavigationHref("/data-health?coverage=ad", query)}
        >
          <Layers3 aria-hidden="true" size={14} />
          <CoverageLine summary={summary} />
        </Link>
      </footer>
    </section>
  );
}
