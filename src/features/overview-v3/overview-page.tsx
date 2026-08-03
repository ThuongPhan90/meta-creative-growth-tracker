"use client";

import { AlertTriangle, ArrowRight } from "lucide-react";
import Link from "next/link";

import { ReportingToolbar } from "@/components/ui-v3/reporting-toolbar";
import { buildNavigationHref } from "@/lib/navigation";

import type { OverviewV3Props } from "./types";
import styles from "./overview-v3.module.css";

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function preservedQuery(query: OverviewV3Props["query"]) {
  const excluded = new Set([
    "from",
    "to",
    "business_ids",
    "account_ids",
    "objective",
    "result",
    "compare",
    "currency",
    "selected",
    "tab",
    "notice",
  ]);
  return Object.fromEntries(
    Object.entries(query).flatMap(([key, value]) => {
      const selected = firstQueryValue(value);
      return excluded.has(key) || !selected ? [] : [[key, selected]];
    }),
  );
}

/**
 * The lightweight client shell can flush after the reporting context resolves.
 * Expensive report sections arrive through server-rendered Suspense slots.
 */
export function OverviewV3(props: OverviewV3Props) {
  const qualityWarnings = [...new Set(props.reportWarnings ?? [])];

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1>Tổng quan</h1>
          <p>Theo dõi phân phối, hiệu quả và Creative từ dữ liệu Meta.</p>
        </div>
      </header>

      <ReportingToolbar
        action="/overview"
        dateFrom={props.dateFrom}
        dateTo={props.dateTo}
        account={props.account}
        accounts={props.accounts}
        reportingBar={props.reportingBar}
        currency={props.reportingCurrency}
        currencies={props.currencyOptions}
        compare={props.compare}
        attribution={props.attribution}
        actionReportTime={props.actionReportTime}
        syncVersion={props.syncVersion}
        preserved={preservedQuery(props.query)}
        resetHref={props.resetHref}
      />

      {!props.connected ? (
        <section className={styles.onboarding} aria-labelledby="connect-meta-v3">
          <div>
            <h2 id="connect-meta-v3">Kết nối Meta để mở bảng điều khiển</h2>
            <p>Ứng dụng chỉ đọc dữ liệu bạn cho phép. Không tạo, sửa hoặc thay đổi quảng cáo.</p>
            <Link className={styles.primaryLink} href={buildNavigationHref("/sources?tab=connection", props.query)}>
              Kiểm tra kết nối Meta <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </div>
        </section>
      ) : (
        <>
          {qualityWarnings.map((warning) => (
            <div className={styles.notice} key={warning} role="status">
              <AlertTriangle aria-hidden="true" size={17} />
              <span>{warning}</span>
            </div>
          ))}

          {props.liveDeliverySlot}
          {props.coreSlot}
        </>
      )}
    </div>
  );
}
