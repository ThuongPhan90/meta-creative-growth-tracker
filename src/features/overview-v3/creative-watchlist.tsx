"use client";

import { ArrowUpRight, Image as ImageIcon } from "lucide-react";
import { useMemo, useState } from "react";

import {
  formatMoney,
  formatNumber,
  formatPercent,
} from "@/lib/presentation/formatters";
import type { CreativeFatigueStatus } from "@/lib/reporting";
import { buildContextHref } from "@/lib/navigation";
import { ContextualEntityLink } from "@/components/ui/contextual-entity-link";

import type {
  OverviewCreativeWatchlistModel,
  OverviewWatchlistItem,
  OverviewWatchlistView,
} from "./creative-watchlist-model";
import type { OverviewV3Query } from "./types";
import styles from "./overview-v3.module.css";

type WatchlistTab = OverviewWatchlistView;

const WATCHLIST_TABS: ReadonlyArray<readonly [WatchlistTab, string]> = [
  ["priority", "Ưu tiên"],
  ["running", "Đang chạy"],
  ["insufficient", "Chưa đủ dữ liệu"],
  ["all", "Tất cả"],
];

function formatCount(value: number | null) {
  return value === null ? "—" : formatNumber(value);
}

function dataLabel(status: OverviewWatchlistItem["dataStatus"]) {
  switch (status) {
    case "ready":
      return "Đủ dữ liệu";
    case "partial":
      return "Dữ liệu một phần";
    case "missing_mapping":
      return "Thiếu mapping";
    case "stale":
      return "Dữ liệu cũ";
    default:
      return "Chưa đủ dữ liệu";
  }
}

function performanceLabel(item: OverviewWatchlistItem) {
  if (item.action === "zero_result_delivery") return "0 kết quả cần kiểm tra";
  switch (item.performance.status) {
    case "better_than_benchmark":
      return "Tốt hơn benchmark";
    case "within_benchmark":
      return "Trong ngưỡng";
    case "needs_review":
      return "Cần theo dõi";
    default:
      return "Chưa thể đánh giá";
  }
}

function fatigueLabel(status: CreativeFatigueStatus) {
  switch (status) {
    case "fatigue_risk":
      return "Có rủi ro fatigue";
    case "monitor":
      return "Theo dõi fatigue";
    case "stable":
      return "Ổn định";
    default:
      return "Chưa đủ xu hướng";
  }
}

function actionLabel(item: OverviewWatchlistItem) {
  if (item.action === "zero_result_delivery") return "Kiểm tra delivery";
  if (item.performance.status === "needs_review") return "Xem benchmark";
  if (item.fatigueStatus === "fatigue_risk") return "Xem fatigue";
  return "Mở chi tiết";
}

function statusTone(item: OverviewWatchlistItem) {
  if (item.action === "zero_result_delivery") return styles.performancePillWatch;
  if (item.performance.status === "better_than_benchmark") {
    return styles.performancePillGood;
  }
  if (item.performance.status === "needs_review") {
    return styles.performancePillWatch;
  }
  return styles.performancePillUnavailable;
}

function trendTone(status: CreativeFatigueStatus) {
  if (status === "fatigue_risk") return styles.fatiguePill;
  if (status === "monitor") return styles.trendPillMonitor;
  if (status === "stable") return styles.trendPillStable;
  return styles.trendPillUnavailable;
}

/**
 * Ranked, read-only Watchlist. Data confidence, benchmark performance and
 * fatigue stay visually separate; a partial data state cannot become green.
 */
export function CreativeWatchlistV3({
  model,
  query,
}: {
  model: OverviewCreativeWatchlistModel;
  query: OverviewV3Query;
}) {
  const [tab, setTab] = useState<WatchlistTab>("priority");
  const itemById = useMemo(
    () => new Map(model.items.map((item) => [item.creativeId, item])),
    [model.items],
  );
  const visible = model.itemIdsByView[tab].flatMap((creativeId) => {
    const item = itemById.get(creativeId);
    return item ? [item] : [];
  });
  const canEvaluate = model.canEvaluate;

  return (
    <section className={styles.watchlistPanel} aria-labelledby="watchlist-v3-title">
      <header className={styles.watchlistHeader}>
        <div>
          <p>Ưu tiên vận hành</p>
          <h2 id="watchlist-v3-title">Creative Watchlist</h2>
        </div>
        <span className={styles.tableMuted}>
          {canEvaluate
            ? "Tối đa 5 Creative sau khi xếp hạng toàn bộ scope"
            : "Không xếp hạng chéo Objective/Result"}
        </span>
      </header>

      <div className={styles.watchlistTabs} role="group" aria-label="Bộ lọc Watchlist">
        {WATCHLIST_TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            className={`${styles.watchlistTab}${tab === key ? ` ${styles.watchlistTabActive}` : ""}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {!canEvaluate ? (
        <p className={styles.emptyWatchlist}>
          Chọn một Mục tiêu, Kết quả chính và tiền tệ để hệ thống chỉ so sánh các Creative cùng ngữ cảnh dữ liệu.
        </p>
      ) : visible.length === 0 ? (
        <p className={styles.emptyWatchlist}>
          Không có Creative phù hợp với bộ lọc này hoặc chưa đủ dữ liệu Meta để xếp hạng an toàn.
        </p>
      ) : (
        <div className={styles.watchlistViewport}>
          <table className={styles.watchlistTable}>
            <thead>
              <tr>
                <th className={styles.watchlistCreative}>Creative</th>
                <th>Ads active/tổng</th>
                <th>Spend</th>
                <th>{model.resultLabel}</th>
                <th>Chi phí/KQ</th>
                <th>Benchmark</th>
                <th>Xu hướng</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => {
                const detailsHref = buildContextHref("/creatives", query, {
                  selected: item.creativeId,
                  tab: "performance",
                });
                const drawerHref = buildContextHref("/overview", query, {
                  selected: item.creativeId,
                  tab: "performance",
                });
                return (
                  <tr key={item.creativeId}>
                    <td className={styles.watchlistCreative}>
                      <ContextualEntityLink
                        className={styles.creativeLink}
                        href={detailsHref}
                        drawerHref={drawerHref}
                        entityId={item.creativeId}
                        ariaLabel={`Mở chi tiết ${item.name}`}
                      >
                        <span className={styles.creativeThumb} aria-hidden="true">
                          {item.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.thumbnailUrl} alt="" />
                          ) : (
                            <ImageIcon size={17} />
                          )}
                        </span>
                        <span>
                          <strong className={styles.creativeName}>{item.name}</strong>
                          <small className={styles.creativeMeta}>{item.format}</small>
                        </span>
                      </ContextualEntityLink>
                    </td>
                    <td className={styles.numeric}>
                      {formatCount(item.activeAds)}
                      <small className={styles.tableMuted}>/{formatCount(item.adCount)}</small>
                    </td>
                    <td className={styles.numeric}>{formatMoney(item.spend, item.currency)}</td>
                    <td className={styles.numeric}>{formatCount(item.primaryResults)}</td>
                    <td className={styles.numeric}>{formatMoney(item.costPerResult, item.currency)}</td>
                    <td className={styles.numeric}>
                      {item.performance.benchmarkDeltaPercent === null
                        ? "—"
                        : `${item.performance.benchmarkDeltaPercent > 0 ? "+" : ""}${formatPercent(item.performance.benchmarkDeltaPercent)}`}
                    </td>
                    <td>
                      <span className={`${styles.statusPill} ${trendTone(item.fatigueStatus)}`}>
                        {fatigueLabel(item.fatigueStatus)}
                      </span>
                    </td>
                    <td>
                      <span className={`${styles.statusPill} ${styles.dataPill}`}>
                        {dataLabel(item.dataStatus)}
                      </span>
                      <span className={`${styles.statusPill} ${statusTone(item)}`}>
                        {performanceLabel(item)}
                      </span>
                    </td>
                    <td>
                      <ContextualEntityLink
                        className={styles.rowAction}
                        href={detailsHref}
                        drawerHref={drawerHref}
                        entityId={item.creativeId}
                        ariaLabel={`${actionLabel(item)}: ${item.name}`}
                      >
                        {actionLabel(item)} <ArrowUpRight aria-hidden="true" size={14} />
                      </ContextualEntityLink>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
