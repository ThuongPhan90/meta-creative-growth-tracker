"use client";

import { useMemo } from "react";

import {
  formatMoney,
  formatNumber,
  formatPercent,
} from "@/lib/presentation/formatters";
import type { DisplayMetric } from "@/lib/reporting/metric-preset";

import type { OverviewV3TrendPoint } from "./types";
import styles from "./overview-v3.module.css";

function metricTrendValue(point: OverviewV3TrendPoint, card: DisplayMetric) {
  if (card.key === "spend") return point.spend;
  if (card.key === "impressions") return point.impressions ?? null;
  if (card.key.startsWith("result:")) {
    return point.resultValues[card.canonicalResultKey ?? card.key.slice("result:".length)] ?? null;
  }
  if (card.key.startsWith("efficiency:")) {
    return point.efficiencyValues[card.canonicalResultKey ?? card.key.slice("efficiency:".length)] ?? null;
  }
  if (card.key === "link_clicks") {
    return point.linkClicks ?? point.resultValues.link_click ?? null;
  }
  if (card.key === "link_ctr") {
    const linkClicks = point.linkClicks ?? point.resultValues.link_click;
    return point.impressions && point.impressions > 0 && linkClicks !== null && linkClicks !== undefined
      ? (linkClicks / point.impressions) * 100
      : null;
  }
  if (card.key === "link_cpc") {
    const linkClicks = point.linkClicks ?? point.resultValues.link_click;
    return linkClicks && linkClicks > 0
      ? point.spend / linkClicks
      : null;
  }
  if (card.key === "cpm") {
    return point.impressions && point.impressions > 0
      ? (point.spend / point.impressions) * 1_000
      : null;
  }
  return null;
}

function valueLabel(value: number, card: DisplayMetric, currency: string) {
  if (card.valueType === "currency") return formatMoney(value, currency);
  if (card.valueType === "percent") return formatPercent(value);
  if (card.valueType === "ratio") return `${formatNumber(value, 2)}×`;
  return formatNumber(value);
}

function linePoints(values: readonly number[]) {
  if (!values.length) return "";
  const width = 680;
  const height = 180;
  const padding = 16;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;
  return values
    .map((value, index) => {
      const x = padding + (index / Math.max(1, values.length - 1)) * (width - padding * 2);
      const y = height - padding - ((value - low) / span) * (height - padding * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function areaPoints(points: string) {
  return points ? `16,180 ${points} 664,180` : "";
}

export function AnalyticsPanelV3({
  trend,
  selectedCard,
  currency,
}: {
  trend: readonly OverviewV3TrendPoint[];
  selectedCard: DisplayMetric | undefined;
  currency: string;
}) {
  const analysis = useMemo(() => {
    if (!selectedCard) return { points: [], currencies: [] as string[] };
    const currencies = [...new Set(trend.map((point) => point.currency))];
    if (currencies.length > 1 && !currency) return { points: [], currencies };
    const selectedCurrency = currency || currencies[0];
    return {
      currencies,
      points: trend
        .filter((point) => !selectedCurrency || point.currency === selectedCurrency)
        .map((point) => ({ date: point.date, value: metricTrendValue(point, selectedCard) }))
        .filter((point): point is { date: string; value: number } => typeof point.value === "number" && Number.isFinite(point.value)),
    };
  }, [currency, selectedCard, trend]);
  const values = analysis.points.map((point) => point.value);
  const chartPoints = linePoints(values);

  return (
    <section className={styles.analyticsPanel} aria-labelledby="analytics-v3-title">
      <header className={styles.analyticsHeader}>
        <div>
          <p>Xu hướng</p>
          <h2 id="analytics-v3-title">Diễn biến KPI đã chọn</h2>
        </div>
        <span className={styles.tableMuted}>Chỉ hiển thị dữ liệu phù hợp scope hiện tại</span>
      </header>
      <div className={styles.analyticsBody}>
        {!selectedCard ? (
          <p className={styles.analyticsEmpty}>Chọn một KPI khả dụng để xem xu hướng.</p>
        ) : analysis.currencies.length > 1 && !currency ? (
          <p className={styles.analyticsEmpty}>
            Chọn một tiền tệ để xem xu hướng có chỉ số tiền tệ; hệ thống không cộng gộp tiền tệ khác nhau.
          </p>
        ) : !analysis.points.length ? (
          <p className={styles.analyticsEmpty}>
            Chưa có chuỗi dữ liệu Meta đủ điều kiện cho {selectedCard.label} trong kỳ đã chọn.
          </p>
        ) : (
          <>
            <div className={styles.trendMeta}>
              <span>{selectedCard.label} · {analysis.points.length} mốc dữ liệu</span>
              <strong>{valueLabel(analysis.points.at(-1)!.value, selectedCard, currency || analysis.currencies[0] || "VND")}</strong>
            </div>
            <svg className={styles.trendChart} viewBox="0 0 680 190" role="img" aria-label={`Xu hướng ${selectedCard.label}`}>
              <line className={styles.trendGrid} x1="16" y1="46" x2="664" y2="46" />
              <line className={styles.trendGrid} x1="16" y1="96" x2="664" y2="96" />
              <line className={styles.trendGrid} x1="16" y1="146" x2="664" y2="146" />
              <polygon className={styles.trendArea} points={areaPoints(chartPoints)} />
              <polyline className={styles.trendLine} points={chartPoints} />
            </svg>
            <div className={styles.analyticsList}>
              {analysis.points.slice(-3).map((point) => (
                <div className={styles.analyticsRow} key={point.date}>
                  <span>{point.date}</span>
                  <strong>{valueLabel(point.value, selectedCard, currency || analysis.currencies[0] || "VND")}</strong>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
