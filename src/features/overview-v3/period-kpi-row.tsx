"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  Info,
  SlidersHorizontal,
} from "lucide-react";

import {
  formatMoney,
  formatNumber,
  formatPercent,
} from "@/lib/presentation/formatters";
import type { DisplayMetric } from "@/lib/reporting/metric-preset";

import styles from "./overview-v3.module.css";

function unavailableReason(metric: DisplayMetric) {
  if (metric.disabledReason) return metric.disabledReason;
  switch (metric.reasonCode) {
    case "SPLIT_CURRENCY":
      return "Chọn một tiền tệ để xem chỉ số tiền tệ gộp.";
    case "ZERO_DENOMINATOR":
    case "MISSING_DENOMINATOR":
      return "Thiếu mẫu số phù hợp để tính chỉ số này.";
    case "RESULT_MAPPING_UNAVAILABLE":
      return "Cần Result Mapping hợp lệ cho chỉ số này.";
    case "PRIMARY_RESULT_REQUIRED":
      return "Chọn Primary Result trước khi xem chỉ số này.";
    case "PARTIAL_DATA":
      return "Dữ liệu chưa đủ coverage để dùng như một tổng đầy đủ.";
    default:
      return "Chỉ số chưa khả dụng trong Reporting Context hiện tại.";
  }
}

function formatCardValue(metric: DisplayMetric, currency: string) {
  if (metric.value === null) return "—";
  if (metric.valueType === "currency") return formatMoney(metric.value, currency);
  if (metric.valueType === "percent") return formatPercent(metric.value);
  if (metric.valueType === "ratio") return `${formatNumber(metric.value, 2)}×`;
  if (metric.valueType === "duration") return `${formatNumber(metric.value, 1)} giây`;
  return formatNumber(metric.value);
}

function coverageLabel(metric: DisplayMetric) {
  const coverage = metric.coverage;
  if (!coverage || coverage.selectedAccounts <= 0) return "Dữ liệu một phần";
  return `Dữ liệu một phần · ${coverage.includedAccounts}/${coverage.selectedAccounts} tài khoản`;
}

function comparisonLabel(metric: DisplayMetric) {
  if (!metric.eligible || metric.state === "unavailable") {
    return { text: unavailableReason(metric), tone: "neutral" as const };
  }
  if (metric.state === "partial") {
    return { text: coverageLabel(metric), tone: "neutral" as const };
  }
  const comparison = metric.comparison;
  if (comparison.state === "ready" && comparison.deltaPercent !== null) {
    return {
      text: `${formatPercent(Math.abs(comparison.deltaPercent))} so với kỳ trước`,
      tone: comparison.tone,
    };
  }
  if (comparison.state === "zero_baseline") {
    return { text: "Kỳ trước bằng 0 · không tính %", tone: "neutral" as const };
  }
  if (comparison.state === "partial") {
    return { text: "Kỳ so sánh có dữ liệu một phần", tone: "neutral" as const };
  }
  if (comparison.state === "not_requested") {
    return { text: "Không so sánh kỳ", tone: "neutral" as const };
  }
  return { text: "Không có so sánh phù hợp", tone: "neutral" as const };
}

export function PeriodKpiRow({
  cards,
  currency,
  selectedKey,
  onSelect,
  onCustomize,
}: {
  cards: readonly DisplayMetric[];
  currency: string;
  selectedKey: string;
  onSelect: (key: string) => void;
  onCustomize: () => void;
}) {
  return (
    <section aria-labelledby="period-kpi-title">
      <div className={styles.sectionHeading}>
        <div>
          <p>Hiệu quả trong kỳ</p>
          <h2 id="period-kpi-title">Chỉ số ưu tiên</h2>
        </div>
        <div className={styles.sectionActions}>
          <span>Dữ liệu Meta</span>
          <button className={styles.customizeMetrics} type="button" onClick={onCustomize}>
            <SlidersHorizontal aria-hidden="true" size={15} />
            Tùy chỉnh chỉ số
          </button>
        </div>
      </div>
      <div className={styles.kpiGrid}>
        {cards.map((metric) => {
          const comparison = comparisonLabel(metric);
          const selected = selectedKey === metric.key;
          const isPositive = comparison.tone === "positive";
          const isNegative = comparison.tone === "negative";
          return (
            <button
              key={metric.identity}
              type="button"
              className={`${styles.kpiCard}${selected ? ` ${styles.kpiCardSelected}` : ""}`}
              onClick={() => onSelect(metric.key)}
              aria-pressed={selected}
              title={metric.reasonCode ? `${metric.formula} · ${unavailableReason(metric)}` : metric.formula}
            >
              <span className={styles.kpiCardLabel}>
                {metric.label}
                <Info aria-hidden="true" size={14} />
              </span>
              <strong>{formatCardValue(metric, currency)}</strong>
              <small
                className={
                  isPositive
                    ? styles.deltaUp
                    : isNegative
                      ? styles.deltaDown
                      : styles.deltaNeutral
                }
              >
                {isPositive ? <ArrowUpRight aria-hidden="true" size={14} /> : null}
                {isNegative ? <ArrowDownRight aria-hidden="true" size={14} /> : null}
                {comparison.text}
              </small>
            </button>
          );
        })}
      </div>
    </section>
  );
}
