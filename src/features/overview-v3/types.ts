import type { ReportingBarModel } from "@/lib/presentation/reporting-bar";
import type { MetricDisplayPresets } from "@/lib/reporting/metric-preset";
import type {
  DynamicResultMetricsModel,
  ResultDefinition,
} from "@/lib/reporting";

import type { ReactNode } from "react";

export type OverviewV3TrendPoint = {
  date: string;
  currency: string;
  spend: number;
  impressions?: number;
  linkClicks?: number;
  resultValues: Record<string, number | null>;
  efficiencyValues: Record<string, number | null>;
};

export type OverviewV3Query = Record<
  string,
  string | string[] | undefined
>;

export type OverviewV3Props = {
  connected: boolean;
  query: OverviewV3Query;
  dateFrom: string;
  dateTo: string;
  account: string;
  accounts: { id: string; name: string }[];
  reportingCurrency: string;
  currencyOptions: string[];
  compare: "previous_period" | "none";
  attribution: string;
  actionReportTime: "impression" | "conversion" | "mixed";
  syncVersion: string;
  reportingBar: ReportingBarModel;
  reportWarnings?: readonly string[];
  resetHref: string;
  liveDeliverySlot?: ReactNode;
  coreSlot?: ReactNode;
};

export type OverviewV3MetricsProps = {
  trend: OverviewV3TrendPoint[];
  reportingCurrency: string;
  currencyOptions: string[];
  compare: "previous_period" | "none";
  reportingBar: ReportingBarModel;
  resultMetrics: DynamicResultMetricsModel;
  previousResultMetrics?: DynamicResultMetricsModel;
  metricDisplayPresets: MetricDisplayPresets;
  settingsUpdatedAt: string | null;
  resultDefinitions: readonly ResultDefinition[];
  reportWarnings?: readonly string[];
  creativeSlot: ReactNode;
  metaBreakdownSlot: ReactNode;
  dataQualitySlot: ReactNode;
};
