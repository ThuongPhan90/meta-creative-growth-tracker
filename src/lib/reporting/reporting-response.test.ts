import { describe, expect, it } from "vitest";

import type { ReportingContext } from "./report-context";
import {
  BACKEND_FALLBACK_WARNING_CODE,
  createBackendFallbackWarning,
  createReportingResponse,
  isBackendFallbackWarning,
  REPORTING_SYNC_STATUSES,
  type ReportingCoverage,
  type ReportingSyncStatus,
} from "./reporting-response";

const context: ReportingContext = {
  businessIds: ["business_1"],
  adAccountIds: ["act_1"],
  dateFrom: "2026-07-01",
  dateTo: "2026-07-31",
  compareMode: "previous_period",
  objectiveKey: "sales",
  primaryResultKey: "purchase",
  currency: "USD",
  currencyMode: "single",
  reportingTimezoneMode: "account_local",
  attributionSettingKey: "7d_click_1d_view",
  actionReportTime: "conversion",
  syncVersion: "sync_2026_07_31",
};

const coverage: ReportingCoverage = {
  campaigns: {
    covered: 59,
    total: 100,
    ratio: 0.59,
    basis: "campaigns_in_reporting_scope",
  },
};

describe("reporting response contract", () => {
  it("exposes every supported terminal synchronization state", () => {
    const statuses: readonly ReportingSyncStatus[] =
      REPORTING_SYNC_STATUSES;

    expect(statuses).toEqual([
      "completed",
      "completed_with_warnings",
      "partial",
      "failed",
      "never",
    ]);
  });

  it("keeps data and the effective reporting metadata together", () => {
    const response = createReportingResponse(
      { spend: 125.5, currency: "USD" },
      {
        context,
        dataThrough: "2026-07-31",
        lastSuccessfulSyncAt: "2026-07-31T01:14:00.000Z",
        syncStatus: "completed_with_warnings",
        coverage,
      },
    );

    expect(response).toEqual({
      data: { spend: 125.5, currency: "USD" },
      meta: {
        context,
        dataThrough: "2026-07-31",
        lastSuccessfulSyncAt: "2026-07-31T01:14:00.000Z",
        syncStatus: "completed_with_warnings",
        coverage,
        warnings: [],
      },
    });
  });

  it("provides a structured warning when the backend applies a fallback", () => {
    const warning = createBackendFallbackWarning({
      message: "Currency was not available for the selected accounts.",
      fallbacks: [
        {
          field: "currency",
          requested: "EUR",
          applied: "USD",
          reason: "selected_scope_has_no_eur_delivery",
        },
      ],
      details: { requestId: "request_1" },
    });

    expect(warning).toEqual({
      code: BACKEND_FALLBACK_WARNING_CODE,
      message: "Currency was not available for the selected accounts.",
      severity: "warning",
      source: "backend_fallback",
      fallbacks: [
        {
          field: "currency",
          requested: "EUR",
          applied: "USD",
          reason: "selected_scope_has_no_eur_delivery",
        },
      ],
      details: { requestId: "request_1" },
    });
    expect(isBackendFallbackWarning(warning)).toBe(true);
    expect(
      isBackendFallbackWarning({
        code: "INSIGHTS_ROWS_PARTIAL",
        message: "Some insight rows are unavailable.",
        severity: "warning",
        source: "sync",
      }),
    ).toBe(false);
  });

  it.each(REPORTING_SYNC_STATUSES)(
    "preserves nullable freshness for %s",
    (syncStatus) => {
      const response = createReportingResponse(null, {
        context,
        dataThrough: null,
        lastSuccessfulSyncAt: null,
        syncStatus,
        coverage: {},
      });

      expect(response.meta).toMatchObject({
        dataThrough: null,
        lastSuccessfulSyncAt: null,
        syncStatus,
      });
    },
  );
});
