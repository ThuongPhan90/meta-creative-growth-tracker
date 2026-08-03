"use client";

import { AlertTriangle } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { resolveDisplayMetrics } from "@/lib/reporting";

import { AnalyticsPanelV3 } from "./analytics-panel";
import { MetricCustomizerDrawer } from "./metric-customizer-drawer";
import { PeriodKpiRow } from "./period-kpi-row";
import type { OverviewV3MetricsProps } from "./types";
import styles from "./overview-v3.module.css";

/**
 * Owns the small amount of interactive metric state while the heavier server
 * sections continue streaming through React slots.
 */
export function OverviewMetricsV3(props: OverviewV3MetricsProps) {
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
    <>
      {qualityWarnings.map((warning) => (
        <div className={styles.notice} key={warning} role="status">
          <AlertTriangle aria-hidden="true" size={17} />
          <span>{warning}</span>
        </div>
      ))}

      <PeriodKpiRow
        cards={cards}
        currency={props.reportingCurrency || props.currencyOptions[0] || "VND"}
        selectedKey={selectedMetric?.key ?? ""}
        onSelect={setSelectedMetricKey}
        onCustomize={() => setCustomizerOpen(true)}
      />

      {props.creativeSlot}

      <AnalyticsPanelV3
        trend={props.trend}
        selectedCard={selectedMetric}
        currency={props.reportingCurrency}
      />

      <div className={styles.bottomGrid}>
        {props.metaBreakdownSlot}
        {props.dataQualitySlot}
      </div>

      <MetricCustomizerDrawer
        open={customizerOpen}
        onClose={() => setCustomizerOpen(false)}
        onSaved={() => router.refresh()}
        metrics={cards}
        availableMetrics={displayMetrics.availableMetrics}
        preset={displayMetrics.preset}
        expectedUpdatedAt={props.settingsUpdatedAt}
      />
    </>
  );
}
