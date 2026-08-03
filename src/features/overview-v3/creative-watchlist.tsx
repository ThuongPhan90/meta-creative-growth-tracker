"use client";

import { ArrowUpRight, Image as ImageIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { groupCreativeFamiliesForView } from "@/lib/presentation/creative-family-view";
import {
  formatMoney,
  formatNumber,
  formatPercent,
} from "@/lib/presentation/formatters";
import {
  buildCreativeWatchlist,
  filterCreativeWatchlist,
  type CreativeFatigueStatus,
  type CreativeWatchlistDataStatus,
  type CreativeWatchlistItem,
  type CreativeWatchlistView,
  type ResultDefinition,
} from "@/lib/reporting";
import { buildContextHref } from "@/lib/navigation";
import { ContextualEntityLink } from "@/components/ui/contextual-entity-link";
import type { CreativeRow, DataStatus } from "@/types/view-models";

import type { OverviewV3Query } from "./types";
import styles from "./overview-v3.module.css";

type WatchlistTab = CreativeWatchlistView;

const WATCHLIST_TABS: ReadonlyArray<readonly [WatchlistTab, string]> = [
  ["priority", "Ưu tiên"],
  ["running", "Đang chạy"],
  ["insufficient", "Chưa đủ dữ liệu"],
  ["all", "Tất cả"],
];

type DisplayWatchlistItem = CreativeWatchlistItem & {
  name: string;
  format: string;
  thumbnailUrl: string;
  adCount: number;
};

function asDataStatus(value: DataStatus): CreativeWatchlistDataStatus {
  return value;
}

function formatCount(value: number | null) {
  return value === null ? "—" : formatNumber(value);
}

function dataLabel(status: DisplayWatchlistItem["dataStatus"]) {
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

function performanceLabel(item: DisplayWatchlistItem) {
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

function actionLabel(item: DisplayWatchlistItem) {
  if (item.action === "zero_result_delivery") return "Kiểm tra delivery";
  if (item.performance.status === "needs_review") return "Xem benchmark";
  if (item.fatigueStatus === "fatigue_risk") return "Xem fatigue";
  return "Mở chi tiết";
}

function statusTone(item: DisplayWatchlistItem) {
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
  creatives,
  query,
  objectiveKey,
  resultKey,
  resultDefinitions,
  currency,
}: {
  creatives: readonly CreativeRow[];
  query: OverviewV3Query;
  objectiveKey: string;
  resultKey?: string;
  resultDefinitions: readonly ResultDefinition[];
  currency: string;
}) {
  const [tab, setTab] = useState<WatchlistTab>("priority");
  const resultDefinition = resultDefinitions.find(
    (definition) => definition.enabled && definition.canonicalKey === resultKey,
  );
  const families = useMemo(
    () => groupCreativeFamiliesForView(creatives),
    [creatives],
  );

  const items = useMemo<DisplayWatchlistItem[]>(() => {
    if (!resultKey || !resultDefinition || objectiveKey === "all" || !currency) return [];
    const familyById = new Map(families.map((family) => [family.id, family]));
    const candidates = families.flatMap((family) => {
      const performance = family.performance;
      const evaluation =
        performance?.evaluation?.resultKey === resultKey
          ? performance.evaluation
          : null;
      const dataStatus = performance?.confidence?.dataStatus;
      const selectedCurrency = performance?.currency?.trim().toUpperCase();
      if (!performance || !selectedCurrency || !dataStatus) return [];
      if (currency && selectedCurrency !== currency.toUpperCase()) return [];
      const primaryResults = performance.resultValues?.[resultKey] ?? null;
      const costPerResult =
        evaluation?.metricKey === "cost_per_result"
          ? evaluation.actualValue
          : primaryResults !== null && primaryResults > 0
            ? performance.spend / primaryResults
            : null;
      const benchmarkCostPerResult =
        evaluation?.metricKey === "cost_per_result"
          ? evaluation.benchmarkValue
          : null;
      return [
        {
          creativeId: family.id,
          objectiveKey,
          resultKey,
          currency: selectedCurrency,
          activeAds: family.activeAdCount,
          spend: performance.spend,
          impressions: performance.impressions,
          primaryResults,
          costPerResult,
          benchmarkCostPerResult,
          dataStatus: asDataStatus(dataStatus),
          fatigueStatus: evaluation?.fatigueStatus ?? "insufficient",
        },
      ];
    });
    const group = buildCreativeWatchlist(candidates, {
      minimumImpressions: resultDefinition.minimumImpressions,
      minimumResults: resultDefinition.minimumResults,
    }).find(
      (candidateGroup) =>
        candidateGroup.objectiveKey === objectiveKey &&
        candidateGroup.resultKey === resultKey &&
        (!currency || candidateGroup.currency === currency.toUpperCase()),
    );

    return (group?.items ?? []).flatMap((item) => {
      const family = familyById.get(item.creativeId);
      if (!family) return [];
      return [
        {
          ...item,
          name: family.name,
          format: family.format,
          thumbnailUrl: family.imageUrl,
          adCount: family.adCount,
        },
      ];
    });
  }, [currency, families, objectiveKey, resultDefinition, resultKey]);

  const visible = filterCreativeWatchlist(items, tab).slice(0, 5);
  const canEvaluate = Boolean(
    resultDefinition && resultKey && objectiveKey !== "all" && currency,
  );

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
                <th>{resultDefinition?.shortLabel ?? "Kết quả"}</th>
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
