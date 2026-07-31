import type { ReportingContext } from "./report-context";

export const REPORTING_SYNC_STATUSES = [
  "completed",
  "completed_with_warnings",
  "partial",
  "failed",
  "never",
] as const;

export type ReportingSyncStatus =
  (typeof REPORTING_SYNC_STATUSES)[number];

export type ReportingCoverageMetric = {
  covered: number;
  total: number;
  ratio: number | null;
  basis?: string;
};

export type ReportingCoverage = Readonly<
  Record<string, ReportingCoverageMetric>
>;

export type ReportingWarningSeverity =
  | "critical"
  | "warning"
  | "info";

type ReportingWarningBase = {
  code: string;
  message: string;
  severity: ReportingWarningSeverity;
  details?: Readonly<Record<string, unknown>>;
};

export type ReportingStandardWarning = ReportingWarningBase & {
  source: "reporting" | "sync" | "coverage";
};

export type ReportingFallbackDetail = {
  field: keyof ReportingContext;
  requested: unknown;
  applied: unknown;
  reason: string;
};

export const BACKEND_FALLBACK_WARNING_CODE =
  "REPORTING_CONTEXT_FALLBACK" as const;

export type ReportingBackendFallbackWarning =
  ReportingWarningBase & {
    code: typeof BACKEND_FALLBACK_WARNING_CODE;
    source: "backend_fallback";
    fallbacks: readonly ReportingFallbackDetail[];
  };

export type ReportingWarning =
  | ReportingStandardWarning
  | ReportingBackendFallbackWarning;

export type ReportingResponseMeta<
  TCoverage = ReportingCoverage,
> = {
  context: ReportingContext;
  dataThrough: string | null;
  lastSuccessfulSyncAt: string | null;
  syncStatus: ReportingSyncStatus;
  coverage: TCoverage;
  warnings: readonly ReportingWarning[];
};

export type ReportingResponse<
  TData,
  TCoverage = ReportingCoverage,
> = {
  data: TData;
  meta: ReportingResponseMeta<TCoverage>;
};

export function createReportingResponse<
  TData,
  TCoverage = ReportingCoverage,
>(
  data: TData,
  meta: Omit<ReportingResponseMeta<TCoverage>, "warnings"> & {
    warnings?: readonly ReportingWarning[];
  },
): ReportingResponse<TData, TCoverage> {
  return {
    data,
    meta: {
      ...meta,
      warnings: meta.warnings ?? [],
    },
  };
}

export function createBackendFallbackWarning({
  message,
  fallbacks,
  details,
}: {
  message: string;
  fallbacks: readonly ReportingFallbackDetail[];
  details?: Readonly<Record<string, unknown>>;
}): ReportingBackendFallbackWarning {
  return {
    code: BACKEND_FALLBACK_WARNING_CODE,
    message,
    severity: "warning",
    source: "backend_fallback",
    fallbacks,
    details,
  };
}

export function isBackendFallbackWarning(
  warning: ReportingWarning,
): warning is ReportingBackendFallbackWarning {
  return (
    warning.source === "backend_fallback" &&
    warning.code === BACKEND_FALLBACK_WARNING_CODE
  );
}
