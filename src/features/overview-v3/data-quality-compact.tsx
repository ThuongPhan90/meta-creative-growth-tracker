import {
  ArrowUpRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
} from "lucide-react";
import Link from "next/link";

import type { LiveDeliverySummary } from "@/lib/db";
import { buildNavigationHref } from "@/lib/navigation";
import { formatPercent } from "@/lib/presentation/formatters";

import type { OverviewV3Query } from "./types";
import styles from "./overview-v3.module.css";

export function DataQualityCompactV3({
  warnings = [],
  liveDelivery,
  query,
}: {
  warnings?: readonly string[];
  liveDelivery?: LiveDeliverySummary;
  query: OverviewV3Query;
}) {
  const qualityState = !liveDelivery
    ? "unknown"
    : warnings.length > 0 || liveDelivery.state !== "ready"
      ? "warning"
      : "ready";
  const mappingLabel = liveDelivery
    ? liveDelivery.mappingCoverage.percent === null
      ? "Creative mapping chưa khả dụng"
      : `Creative mapping ${formatPercent(liveDelivery.mappingCoverage.percent)}`
    : "Chưa có snapshot delivery";
  const deliveryCoverage = !liveDelivery
    ? "Chưa có snapshot delivery để xác nhận coverage"
    : liveDelivery.deliveryEligibleAccountCount > 0
      ? `Delivery-ready ${liveDelivery.deliveryReadyAccountCount}/${liveDelivery.deliveryEligibleAccountCount} Ad Account`
      : liveDelivery.selectedAccountCount > 0
        ? "Chưa có Ad Account đủ điều kiện delivery trong scope"
        : "Scope chưa có Ad Account";
  const detail = [warnings[0], deliveryCoverage, mappingLabel]
    .filter(Boolean)
    .join(" · ");
  const summary =
    qualityState === "ready"
      ? "Dữ liệu ổn định"
      : qualityState === "warning"
        ? "Có điểm cần kiểm tra"
        : "Chưa thể xác nhận chất lượng dữ liệu";

  if (qualityState === "ready") {
    return (
      <section className={`${styles.qualityPanel} ${styles.qualityPanelReady}`} aria-label="Chất lượng dữ liệu">
        <div className={styles.qualityReadyLine}>
          <p>
            <CircleCheck aria-hidden="true" size={17} />
            <strong>{summary}</strong>
            <span aria-hidden="true">·</span>
            <span>{deliveryCoverage}</span>
            <span aria-hidden="true">·</span>
            <span>{mappingLabel}</span>
          </p>
          <Link href={buildNavigationHref("/data-health", query)}>
            Xem chi tiết <ArrowUpRight aria-hidden="true" size={14} />
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.qualityPanel} aria-labelledby="quality-v3-title">
      <header className={styles.qualityHeader}>
        <div>
          <p>Độ tin cậy</p>
          <h2 id="quality-v3-title">Chất lượng dữ liệu</h2>
        </div>
        <Link href={buildNavigationHref("/data-health", query)}>Xem chi tiết</Link>
      </header>
      <div className={styles.qualityBody}>
        <p className={styles.qualitySummary}>
          {qualityState === "warning" ? (
            <CircleAlert aria-hidden="true" size={17} />
          ) : (
            <CircleDashed aria-hidden="true" size={17} />
          )}
          {summary}
        </p>
        <p className={styles.qualityDetail}>{detail}</p>
        <Link className={styles.qualityLink} href={buildNavigationHref("/data-health", query)}>
          Kiểm tra coverage và mapping <ArrowUpRight aria-hidden="true" size={14} />
        </Link>
      </div>
    </section>
  );
}
