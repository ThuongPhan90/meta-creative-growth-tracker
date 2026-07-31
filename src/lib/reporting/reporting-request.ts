import {
  resolveReportContext,
  type ReportComparison,
  type ReportingContext,
  type ReportingContextDefaults,
  type ResolvedReportContext,
} from "./report-context";
import {
  createBackendFallbackWarning,
  type ReportingSyncStatus,
  type ReportingWarning,
} from "./reporting-response";
import { resolvePrimaryResult } from "./result-definition";

type SearchParamsLike = Pick<URLSearchParams, "get" | "getAll" | "has">;

export function canonicalReportingContext(
  resolved: ResolvedReportContext,
): ReportingContext {
  return {
    businessIds: [...resolved.businessIds],
    adAccountIds: [...resolved.adAccountIds],
    dateFrom: resolved.dateFrom,
    dateTo: resolved.dateTo,
    compareMode: resolved.compareMode,
    objectiveKey: resolved.objectiveKey,
    ...(resolved.primaryResultKey
      ? { primaryResultKey: resolved.primaryResultKey }
      : {}),
    ...(resolved.currency ? { currency: resolved.currency } : {}),
    currencyMode: resolved.currencyMode,
    reportingTimezoneMode: resolved.reportingTimezoneMode,
    attributionSettingKey: resolved.attributionSettingKey,
    actionReportTime: resolved.actionReportTime,
    syncVersion: resolved.syncVersion,
  };
}

export function resolveReportingRequest({
  searchParams,
  timeZone,
  lookbackDays,
  reportingCurrency,
  compareDefault,
  defaults,
  now,
}: {
  searchParams: SearchParamsLike;
  timeZone: string;
  lookbackDays: number;
  reportingCurrency?: string | null;
  compareDefault?: ReportComparison;
  defaults?: ReportingContextDefaults;
  now?: Date;
}): {
  context: ReportingContext;
  resolved: ResolvedReportContext;
  warnings: ReportingWarning[];
} {
  const resolved = resolveReportContext({
    query: {
      from: searchParams.get("from"),
      to: searchParams.get("to"),
      businessIds: searchParams.has("business_ids")
        ? searchParams.getAll("business_ids")
        : undefined,
      adAccountIds: searchParams.has("account_ids")
        ? searchParams.getAll("account_ids")
        : searchParams.get("account"),
      account: searchParams.get("account"),
      objectiveKey: searchParams.get("objective"),
      primaryResultKey: searchParams.get("result"),
      currency: searchParams.get("currency"),
      compareMode: searchParams.get("compare"),
      attributionSettingKey: searchParams.get("attribution"),
      actionReportTime: searchParams.get("action_report_time"),
      syncVersion: searchParams.get("sync_version"),
    },
    timeZone,
    lookbackDays,
    reportingCurrency,
    compareDefault,
    defaults,
    now,
  });
  if (resolved.objectiveKey !== "all" && !resolved.primaryResultKey) {
    const primary = resolvePrimaryResult({
      campaignId: "workspace_default",
      objectiveKey: resolved.objectiveKey,
    });
    if (primary.definition) {
      resolved.primaryResultKey = primary.definition.canonicalKey;
    }
  }
  const context = canonicalReportingContext(resolved);
  const fallbacks = resolved.warnings.map((warning) => ({
    field: warning.field,
    requested: warning.input,
    applied: warning.fallback ?? context[warning.field],
    reason: warning.code,
  }));

  return {
    context,
    resolved,
    warnings: fallbacks.length
      ? [
          createBackendFallbackWarning({
            message:
              "Backend đã chuẩn hóa một phần ngữ cảnh báo cáo; hãy kiểm tra metadata trước khi đối soát.",
            fallbacks,
          }),
        ]
      : [],
  };
}

export function reportingSyncStatus(input: {
  lastSuccessfulSyncAt: string | null;
  syncStatus: "healthy" | "warning" | "partial" | "error";
}): ReportingSyncStatus {
  if (!input.lastSuccessfulSyncAt) return "never";
  if (input.syncStatus === "error") return "failed";
  if (input.syncStatus === "partial") return "partial";
  if (input.syncStatus === "warning") {
    return "completed_with_warnings";
  }
  return "completed";
}
