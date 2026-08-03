import type { ReportingFreshness } from "@/components/ui/reporting-context";
import type { LiveDeliverySummary } from "@/lib/db";
import type { ReportingBarModel } from "@/lib/presentation/reporting-bar";
import type { MetricDisplayPresets } from "@/lib/reporting/metric-preset";
import type {
  DeliveryMetricRow,
  DynamicResultMetricsModel,
  MetaBreakdownModel,
  ResultDefinition,
} from "@/lib/reporting";
import type { DashboardViewModel, CreativeRow } from "@/types/view-models";

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
  dashboard: DashboardViewModel;
  creatives: CreativeRow[];
  delivery: readonly DeliveryMetricRow[];
  liveDelivery?: LiveDeliverySummary;
  trend: OverviewV3TrendPoint[];
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
  freshness: ReportingFreshness;
  reportingBar: ReportingBarModel;
  resultMetrics: DynamicResultMetricsModel;
  previousResultMetrics?: DynamicResultMetricsModel;
  metricDisplayPresets: MetricDisplayPresets;
  settingsUpdatedAt: string | null;
  metaBreakdown: MetaBreakdownModel;
  resultDefinitions: readonly ResultDefinition[];
  reportWarnings?: readonly string[];
  selectedDrawer?: React.ReactNode;
  resetHref: string;
};
