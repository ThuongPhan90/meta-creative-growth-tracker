import { describe, expect, it } from "vitest";

import {
  reportingSyncStatus,
  resolveReportingRequest,
} from "./reporting-request";

describe("reporting request context", () => {
  it("keeps persisted scope defaults when plural URL keys are absent", () => {
    const result = resolveReportingRequest({
      searchParams: new URLSearchParams(),
      timeZone: "UTC",
      lookbackDays: 30,
      defaults: {
        businessIds: ["bm_saved"],
        adAccountIds: ["act_saved"],
      },
    });

    expect(result.context.businessIds).toEqual(["bm_saved"]);
    expect(result.context.adAccountIds).toEqual(["act_saved"]);
  });

  it("maps shareable URL state to the canonical context", () => {
    const result = resolveReportingRequest({
      searchParams: new URLSearchParams({
        from: "2026-07-01",
        to: "2026-07-30",
        business_ids: "biz_1,biz_2",
        account_ids: "act_1,act_2",
        objective: "sales",
        result: "purchase",
        currency: "USD",
        action_report_time: "conversion",
      }),
      timeZone: "UTC",
      lookbackDays: 30,
      defaults: { syncVersion: "sync_42" },
    });

    expect(result.context).toEqual({
      businessIds: ["biz_1", "biz_2"],
      adAccountIds: ["act_1", "act_2"],
      dateFrom: "2026-07-01",
      dateTo: "2026-07-30",
      compareMode: "previous_period",
      objectiveKey: "sales",
      primaryResultKey: "purchase",
      currency: "USD",
      currencyMode: "single",
      reportingTimezoneMode: "account_local",
      attributionSettingKey: "account_default",
      actionReportTime: "conversion",
      syncVersion: "sync_42",
    });
    expect(result.warnings).toEqual([]);
  });

  it("canonicalizes raw Objective aliases before selecting the default Result", () => {
    const result = resolveReportingRequest({
      searchParams: new URLSearchParams({
        objective: "outcome_sales",
      }),
      timeZone: "UTC",
      lookbackDays: 30,
      now: new Date("2026-07-30T10:00:00Z"),
    });

    expect(result.context).toMatchObject({
      objectiveKey: "sales",
      primaryResultKey: "purchase",
    });
    expect(result.warnings).toEqual([]);
  });

  it("returns a structured fallback warning for an incompatible Result", () => {
    const result = resolveReportingRequest({
      searchParams: new URLSearchParams({
        objective: "sales",
        result: "install",
      }),
      timeZone: "UTC",
      lookbackDays: 30,
      now: new Date("2026-07-30T10:00:00Z"),
    });

    expect(result.context).toMatchObject({
      objectiveKey: "sales",
      primaryResultKey: "purchase",
    });
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: "REPORTING_CONTEXT_FALLBACK",
        source: "backend_fallback",
        fallbacks: [
          {
            field: "primaryResultKey",
            requested: "install",
            applied: "purchase",
            reason:
              "result_not_available_for_objective",
          },
        ],
      }),
    ]);
  });

  it("maps freshness to explicit reporting sync states", () => {
    expect(
      reportingSyncStatus({
        lastSuccessfulSyncAt: null,
        syncStatus: "error",
      }),
    ).toBe("never");
    expect(
      reportingSyncStatus({
        lastSuccessfulSyncAt: "2026-07-30T10:00:00Z",
        syncStatus: "warning",
      }),
    ).toBe("completed_with_warnings");
    expect(
      reportingSyncStatus({
        lastSuccessfulSyncAt: "2026-07-30T10:00:00Z",
        syncStatus: "partial",
      }),
    ).toBe("partial");
  });
});
