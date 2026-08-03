"use client";

import { useState } from "react";

import { formatMoney, formatNumber } from "@/lib/presentation/formatters";
import {
  type MetaBreakdownDimension,
  type MetaBreakdownModel,
  type MetaBreakdownUnavailableReason,
} from "@/lib/reporting";

import styles from "./overview-v3.module.css";

const DIMENSION_OPTIONS: Array<{
  value: MetaBreakdownDimension;
  label: string;
}> = [
  { value: "ad_account", label: "Ad Account" },
  { value: "objective", label: "Mục tiêu" },
  { value: "campaign", label: "Campaign" },
  { value: "placement", label: "Placement" },
  { value: "meta_platform", label: "Meta Platform" },
];

const UNAVAILABLE_COPY: Record<MetaBreakdownUnavailableReason, string> = {
  no_data: "Chưa có delivery trong Reporting Context hiện tại để phân bổ.",
  split_currency:
    "Chọn một tiền tệ trong toolbar để xem phân bổ Spend. Hệ thống không cộng các tiền tệ.",
  unknown_currency:
    "Tiền tệ của dữ liệu delivery chưa hợp lệ nên không thể phân bổ Spend an toàn.",
  detail_unavailable:
    "Dữ liệu chi tiết theo entity chưa khả dụng cho snapshot hiện tại. Hệ thống không suy diễn phân bổ từ tổng Creative.",
  entity_identity_unavailable:
    "Một phần delivery thiếu định danh entity cần thiết nên không thể phân bổ an toàn.",
  placement_breakdown_unavailable:
    "Placement chưa có breakdown đầy đủ trong snapshot hiện tại; không hiển thị phân bổ một phần.",
  meta_platform_breakdown_unavailable:
    "Meta Platform chưa có breakdown đầy đủ trong snapshot hiện tại; không hiển thị phân bổ một phần.",
};

function selectedLabel(dimension: MetaBreakdownDimension) {
  return DIMENSION_OPTIONS.find((option) => option.value === dimension)?.label ?? "Ad Account";
}

export function MetaBreakdownV3({
  model,
}: {
  model: MetaBreakdownModel;
}) {
  const [dimension, setDimension] = useState<MetaBreakdownDimension>("ad_account");
  const data = model.dimensions[dimension];
  const rows = data.rows.slice(0, 5);
  const maxSpend = Math.max(0, ...rows.map((row) => row.spend));

  return (
    <section className={styles.breakdownPanel} aria-labelledby="breakdown-v3-title">
      <header className={styles.breakdownHeader}>
        <div>
          <p>Phân bổ Meta</p>
          <h2 id="breakdown-v3-title">Theo {selectedLabel(dimension)}</h2>
        </div>
        <label className={styles.breakdownSelectLabel}>
          <span className="sr-only">Phân bổ theo</span>
          <select
            aria-label="Phân bổ theo"
            className={styles.breakdownSelect}
            value={dimension}
            onChange={(event) => setDimension(event.target.value as MetaBreakdownDimension)}
          >
            {DIMENSION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </header>
      <div className={styles.breakdownBody}>
        {data.state === "unavailable" ? (
          <p className={styles.analyticsEmpty}>
            {UNAVAILABLE_COPY[data.reason ?? "detail_unavailable"]}
          </p>
        ) : (
          <>
            {data.state === "partial" ? (
              <p className={styles.breakdownState}>
                Có Objective Meta chưa map; các dòng đó được gom riêng và không đổi nhãn sang Objective khác.
              </p>
            ) : null}
            <div className={styles.breakdownList}>
              {rows.map((row) => {
                const share = maxSpend > 0 ? (row.spend / maxSpend) * 100 : 0;
                return (
                  <div className={styles.breakdownRow} key={row.id}>
                    <span title={row.label}>{row.label}</span>
                    <span>{formatMoney(row.spend, model.currency ?? "VND")}</span>
                    <div>
                      <div
                        className={styles.breakdownBar}
                        aria-label={`${row.label}: ${formatNumber(share, 1)}% so với dòng có Spend lớn nhất`}
                      >
                        <span style={{ width: `${share}%` }} />
                      </div>
                      <small className={styles.tableMuted}>
                        {formatNumber(row.impressions)} Impressions · {formatNumber(row.linkClicks)} Link Clicks
                      </small>
                    </div>
                  </div>
                );
              })}
            </div>
            {data.rows.length > rows.length ? (
              <p className={styles.breakdownMeta}>
                Hiển thị 5 dòng Spend cao nhất trong {formatNumber(data.rows.length)} dòng.
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
