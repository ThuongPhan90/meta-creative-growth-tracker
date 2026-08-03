import {
  Activity,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  FolderKanban,
  Megaphone,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

import type { LiveDeliverySnapshotMetric, LiveDeliverySummary } from "@/lib/db";
import { buildNavigationHref } from "@/lib/navigation";
import { formatNumber, formatPercent } from "@/lib/presentation/formatters";

import type { OverviewV3Query } from "./types";
import styles from "./overview-v3.module.css";

function snapshotLabel(value: string | null) {
  if (!value) return "chưa xác định";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "chưa xác định";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(date);
}

function statePresentation(state: LiveDeliverySummary["state"]) {
  if (state === "ready") {
    return { label: "Đủ dữ liệu", tone: "ready", Icon: CircleCheck };
  }
  if (state === "partial") {
    return { label: "Một phần", tone: "partial", Icon: CircleAlert };
  }
  return { label: "Chưa đủ dữ liệu", tone: "unavailable", Icon: CircleDashed };
}

function LiveMetric({
  label,
  metric,
  href,
  Icon,
}: {
  label: string;
  metric: LiveDeliverySnapshotMetric;
  href: string;
  Icon: typeof Megaphone;
}) {
  const content = (
    <>
      <span className={styles.liveMetricLabel}>
        <Icon aria-hidden="true" size={16} />
        {label}
      </span>
      <strong>{metric.value === null ? "—" : formatNumber(metric.value)}</strong>
      <small>
        {metric.state === "ready"
          ? "Snapshot hiện tại"
          : metric.state === "partial"
            ? `${metric.coverage.includedAccounts}/${metric.coverage.selectedAccounts} tài khoản`
            : "Chưa xác minh"}
      </small>
    </>
  );

  return metric.value === null ? (
    <article className={styles.liveMetric}>{content}</article>
  ) : (
    <Link className={styles.liveMetric} href={href}>
      {content}
    </Link>
  );
}

export function LiveDeliveryStripV3({
  summary,
  query,
}: {
  summary: LiveDeliverySummary;
  query: OverviewV3Query;
}) {
  const presentation = statePresentation(summary.state);
  const StateIcon = presentation.Icon;
  const snapshotAt =
    summary.reportingSnapshot.publishedAt ?? summary.inventoryObservedAt;
  const coverage =
    summary.mappingCoverage.percent === null
      ? "Creative mapping chưa khả dụng"
      : `Creative mapping ${formatPercent(summary.mappingCoverage.percent)}`;
  const deliveryCoverage =
    summary.state === "unavailable" || summary.activeAds.value === null
      ? "Coverage delivery chưa khả dụng"
      : summary.deliveryEligibleAccountCount > 0
        ? `${summary.deliveryReadyAccountCount}/${summary.deliveryEligibleAccountCount} tài khoản có delivery gần nhất`
        : "Không có Ads đang bật trong phạm vi đã chọn";

  return (
    <section className={styles.liveDelivery} aria-labelledby="live-delivery-v3">
      <header className={styles.liveHeader}>
        <div>
          <p>Đang chạy hiện tại</p>
          <h2 id="live-delivery-v3">Phân phối Meta</h2>
          <span>Snapshot: {snapshotLabel(snapshotAt)}</span>
        </div>
        <span className={`${styles.statusBadge} ${styles[`status${presentation.tone}`]}`}>
          <StateIcon aria-hidden="true" size={14} />
          {presentation.label}
        </span>
      </header>

      <div className={styles.liveMetrics}>
        <LiveMetric
          label="Ads đang bật"
          metric={summary.activeAds}
          href={buildNavigationHref("/campaigns?tab=ads&status=active", query)}
          Icon={Megaphone}
        />
        <LiveMetric
          label="Ads có delivery"
          metric={summary.activeDeliveringAds}
          href={buildNavigationHref("/campaigns?tab=ads&delivery=latest", query)}
          Icon={Activity}
        />
        <LiveMetric
          label="Creative đã xác định"
          metric={summary.mappedActiveCreativeFamilies}
          href={buildNavigationHref("/creatives?delivery=active", query)}
          Icon={Sparkles}
        />
        <LiveMetric
          label="Campaign đang chạy"
          metric={summary.activeCampaigns}
          href={buildNavigationHref("/campaigns?status=active", query)}
          Icon={FolderKanban}
        />
      </div>

      <footer className={styles.liveFooter}>
        {summary.activeWithoutDelivery.value === null ? (
          <span>Chưa thể xác định Ads bật chưa có delivery gần nhất.</span>
        ) : (
          <Link
            href={buildNavigationHref("/campaigns?tab=ads&delivery=missing", query)}
          >
            {formatNumber(summary.activeWithoutDelivery.value)} Ads bật chưa có delivery gần nhất
          </Link>
        )}
        <Link href={buildNavigationHref("/data-health?coverage=delivery_ready_account", query)}>
          {deliveryCoverage} · {coverage}
        </Link>
      </footer>
    </section>
  );
}
