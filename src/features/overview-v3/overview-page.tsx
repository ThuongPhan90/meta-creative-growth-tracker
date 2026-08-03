"use client";

import { AlertTriangle, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ReportingToolbar } from "@/components/ui-v3/reporting-toolbar";
import { resolveDisplayMetrics } from "@/lib/reporting";
import { buildNavigationHref } from "@/lib/navigation";

import { AnalyticsPanelV3 } from "./analytics-panel";
import { CreativeWatchlistV3 } from "./creative-watchlist";
import { DataQualityCompactV3 } from "./data-quality-compact";
import { LiveDeliveryStripV3 } from "./live-delivery-strip";
import { MetaBreakdownV3 } from "./meta-breakdown";
import { MetricCustomizerDrawer } from "./metric-customizer-drawer";
import { PeriodKpiRow } from "./period-kpi-row";
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

/** Client composition only; all report data remains resolved server-side. */
export function OverviewV3(props: OverviewV3Props) {
  const router = useRouter();
  const displayMetrics = useMemo(
    () =>
      resolveDisplayMetrics({
        resultMetrics: props.resultMetrics,
        previousResultMetrics: props.previousResultMetrics,
        objectiveKey: props.reportingBar.objective,
        primaryResultKey: props.reportingBar.result,
        preset: props.metricDisplayPresets,
        comparisonMode: props.compare,
        resultDefinitions: props.resultDefinitions,
      }),
    [
      props.compare,
      props.metricDisplayPresets,
      props.previousResultMetrics,
      props.reportingBar.objective,
      props.reportingBar.result,
      props.resultDefinitions,
      props.resultMetrics,
    ],
  );
  const cards = displayMetrics.metrics;
  const [selectedMetricKey, setSelectedMetricKey] = useState<string | null>(null);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const selectedMetric =
    cards.find((card) => card.key === selectedMetricKey) ??
    cards.find((card) => card.eligible) ??
    cards[0];
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

          {props.liveDelivery ? <LiveDeliveryStripV3 summary={props.liveDelivery} query={props.query} /> : null}

          <PeriodKpiRow
            cards={cards}
            currency={props.reportingCurrency || props.currencyOptions[0] || "VND"}
            selectedKey={selectedMetric?.key ?? ""}
            onSelect={setSelectedMetricKey}
            onCustomize={() => setCustomizerOpen(true)}
          />

          <CreativeWatchlistV3
            creatives={props.creatives}
            query={props.query}
            objectiveKey={props.reportingBar.objective}
            resultKey={props.reportingBar.result}
            resultDefinitions={props.resultDefinitions}
            currency={props.reportingCurrency}
          />

          <AnalyticsPanelV3
            trend={props.trend}
            selectedCard={selectedMetric}
            currency={props.reportingCurrency}
          />

          <div className={styles.bottomGrid}>
            <MetaBreakdownV3 model={props.metaBreakdown} />
            <DataQualityCompactV3 warnings={qualityWarnings} liveDelivery={props.liveDelivery} query={props.query} />
          </div>
        </>
      )}

      <MetricCustomizerDrawer
        open={customizerOpen}
        onClose={() => setCustomizerOpen(false)}
        onSaved={() => router.refresh()}
        metrics={cards}
        availableMetrics={displayMetrics.availableMetrics}
        preset={displayMetrics.preset}
        expectedUpdatedAt={props.settingsUpdatedAt}
      />

      {props.selectedDrawer}
    </div>
  );
}
