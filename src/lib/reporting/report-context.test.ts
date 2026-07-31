import { describe, expect, it } from "vitest";

import { resolveReportContext } from "./report-context";

describe("resolveReportContext", () => {
  it("keeps legacy queries compatible while returning the canonical V2 contract", () => {
    const result = resolveReportContext({
      query: {
        from: "2026-07-30",
        to: "2026-07-01",
        account: " act_123 ",
        currency: "usd",
        compare: "none",
      },
      timeZone: "Asia/Ho_Chi_Minh",
      lookbackDays: 30,
      reportingCurrency: "VND",
      compareDefault: "previous_period",
      now: new Date("2026-07-30T10:00:00.000Z"),
    });

    expect(result).toMatchObject({
      businessIds: [],
      adAccountIds: ["act_123"],
      dateFrom: "2026-07-01",
      dateTo: "2026-07-30",
      compareMode: "none",
      objectiveKey: "all",
      currency: "USD",
      currencyMode: "single",
      reportingTimezoneMode: "account_local",
      attributionSettingKey: "account_default",
      actionReportTime: "mixed",
      syncVersion: "latest",
      account: "act_123",
      compare: "none",
    });
    expect(result.debug.legacyQueryKeys).toEqual([
      "from",
      "to",
      "account",
      "compare",
    ]);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "date_range_reordered" }),
    );
  });

  it("caps report windows at 365 inclusive days and explains the fallback", () => {
    const result = resolveReportContext({
      query: { from: "2020-01-01", to: "2026-07-30" },
      timeZone: "UTC",
      lookbackDays: 30,
    });

    expect(result.dateFrom).toBe("2025-07-31");
    expect(result.warnings).toContainEqual({
      code: "date_range_capped",
      field: "dateFrom",
      message: "The reporting range was capped at 365 inclusive days.",
      input: "2020-01-01",
      fallback: "2025-07-31",
    });
    expect(result.debug).toMatchObject({
      fallbackApplied: true,
      fallbackFields: ["dateFrom"],
      normalizedFields: ["dateFrom"],
    });
  });

  it("uses validated reporting defaults for invalid URL context", () => {
    const result = resolveReportContext({
      query: {
        currency: "US dollars",
        compare: "cf_111111111111111111111111",
      },
      timeZone: "UTC",
      lookbackDays: 30,
      reportingCurrency: "vnd",
      compareDefault: "none",
      now: new Date("2026-07-30T10:00:00.000Z"),
    });

    expect(result).toMatchObject({
      currency: "VND",
      currencyMode: "single",
      compare: "none",
      compareMode: "none",
    });
    expect(result.warnings.map(({ field }) => field)).toEqual([
      "compareMode",
      "currency",
    ]);
  });

  it("sanitizes and deduplicates canonical multi-scope selections", () => {
    const result = resolveReportContext({
      query: {
        businessIds: [" 123,456 ", "123", "<script>"],
        adAccountIds: ["act_1", "act_2,act_1", "bad account"],
        dateFrom: "2026-07-01",
        dateTo: "2026-07-30",
        compareMode: "previous_period",
        objectiveKey: "OUTCOME_SALES",
        primaryResultKey: "purchase",
        currency: "USD",
        currencyMode: "single",
        reportingTimezoneMode: "account_local",
        attributionSettingKey: "7d_click_1d_view",
        actionReportTime: "conversion",
        syncVersion: "sync:2026-07-30T10:00:00Z",
      },
      timeZone: "UTC",
      lookbackDays: 30,
    });

    expect(result).toMatchObject({
      businessIds: ["123", "456"],
      adAccountIds: ["act_1", "act_2"],
      objectiveKey: "sales",
      primaryResultKey: "purchase",
      currency: "USD",
      currencyMode: "single",
      attributionSettingKey: "7d_click_1d_view",
      actionReportTime: "conversion",
      syncVersion: "sync:2026-07-30T10:00:00Z",
    });
    expect(result.warnings).toEqual([
      expect.objectContaining({
        field: "businessIds",
        input: ["<script>"],
      }),
      expect.objectContaining({
        field: "adAccountIds",
        input: ["bad account"],
      }),
    ]);
    expect(result.debug.normalizedFields).toContain(
      "objectiveKey",
    );
  });

  it.each(["OUTCOME_SALES", "outcome_sales"])(
    "canonicalizes the Objective URL alias %s",
    (objectiveKey) => {
      const result = resolveReportContext({
        query: { objectiveKey },
        timeZone: "UTC",
        lookbackDays: 30,
        now: new Date("2026-07-30T10:00:00Z"),
      });

      expect(result.objectiveKey).toBe("sales");
      expect(result.primaryResultKey).toBe("purchase");
      expect(result.warnings).toEqual([]);
      expect(result.debug.normalizedFields).toContain(
        "objectiveKey",
      );
    },
  );

  it("falls back from an incompatible Result to the Objective default", () => {
    const result = resolveReportContext({
      query: {
        objectiveKey: "sales",
        primaryResultKey: "install",
      },
      timeZone: "UTC",
      lookbackDays: 30,
      now: new Date("2026-07-30T10:00:00Z"),
    });

    expect(result.objectiveKey).toBe("sales");
    expect(result.primaryResultKey).toBe("purchase");
    expect(result.warnings).toContainEqual({
      code: "result_not_available_for_objective",
      field: "primaryResultKey",
      message:
        "primaryResultKey was not available for the selected Objective and the Objective default was used.",
      input: "install",
      fallback: "purchase",
    });
    expect(result.debug.fallbackApplied).toBe(true);
    expect(result.debug.fallbackFields).toContain(
      "primaryResultKey",
    );
    expect(result.debug.normalizedFields).toContain(
      "primaryResultKey",
    );
  });

  it("removes a Result selection when all Objectives are selected", () => {
    const result = resolveReportContext({
      query: {
        objectiveKey: "all",
        primaryResultKey: "install",
      },
      timeZone: "UTC",
      lookbackDays: 30,
      now: new Date("2026-07-30T10:00:00Z"),
    });

    expect(result.objectiveKey).toBe("all");
    expect(result.primaryResultKey).toBeUndefined();
    expect(result.warnings).toContainEqual({
      code: "result_not_available_for_objective",
      field: "primaryResultKey",
      message:
        "primaryResultKey was removed because all Objectives were selected.",
      input: "install",
      fallback: undefined,
    });
    expect(result.debug.fallbackApplied).toBe(true);
    expect(result.debug.fallbackFields).toContain("primaryResultKey");
    expect(result.debug.normalizedFields).toContain(
      "primaryResultKey",
    );
  });

  it("keeps a compatible non-default Result selection", () => {
    const result = resolveReportContext({
      query: {
        objectiveKey: "sales",
        primaryResultKey: "purchase_value",
      },
      timeZone: "UTC",
      lookbackDays: 30,
      now: new Date("2026-07-30T10:00:00Z"),
    });

    expect(result.objectiveKey).toBe("sales");
    expect(result.primaryResultKey).toBe("purchase_value");
    expect(result.warnings).toEqual([]);
    expect(result.debug.normalizedFields).not.toContain(
      "primaryResultKey",
    );
  });

  it("keeps currencies separate in split mode instead of silently selecting one", () => {
    const result = resolveReportContext({
      query: {
        currency: "USD",
        currencyMode: "split",
      },
      timeZone: "UTC",
      lookbackDays: 30,
      reportingCurrency: "VND",
    });

    expect(result.currency).toBe("");
    expect(result.currencyMode).toBe("split");
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: "currency_ignored_for_split_mode",
        field: "currency",
        input: "USD",
      }),
    );
  });

  it("falls back to split mode when single mode has no valid currency", () => {
    const result = resolveReportContext({
      query: {
        currencyMode: "single",
      },
      timeZone: "UTC",
      lookbackDays: 30,
    });

    expect(result.currency).toBe("");
    expect(result.currencyMode).toBe("split");
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: "single_currency_missing",
        field: "currencyMode",
      }),
    );
  });

  it("makes all invalid fallbacks explicit and debuggable", () => {
    const result = resolveReportContext({
      query: {
        dateFrom: "2026-02-30",
        dateTo: "not-a-date",
        objectiveKey: "<all>",
        primaryResultKey: "purchase<script>",
        currencyMode: "converted",
        reportingTimezoneMode: "viewer_local",
        attributionSettingKey: "<bad>",
        actionReportTime: "click",
        syncVersion: "bad version",
      },
      timeZone: "UTC",
      lookbackDays: 7,
      defaults: {
        objectiveKey: "all",
        primaryResultKey: "purchase",
        currencyMode: "split",
        attributionSettingKey: "account_default",
        actionReportTime: "impression",
        syncVersion: "sync_42",
      },
      now: new Date("2026-07-30T10:00:00.000Z"),
    });

    expect(result).toMatchObject({
      dateFrom: "2026-07-24",
      dateTo: "2026-07-30",
      objectiveKey: "all",
      currencyMode: "split",
      reportingTimezoneMode: "account_local",
      attributionSettingKey: "account_default",
      actionReportTime: "impression",
      syncVersion: "sync_42",
    });
    expect(result.debug.fallbackApplied).toBe(true);
    expect(new Set(result.debug.fallbackFields)).toEqual(
      new Set([
        "dateFrom",
        "dateTo",
        "objectiveKey",
        "primaryResultKey",
        "currencyMode",
        "reportingTimezoneMode",
        "attributionSettingKey",
        "actionReportTime",
        "syncVersion",
      ]),
    );
  });

  it("does not mutate default scope arrays", () => {
    const businessIds = ["b_1"];
    const adAccountIds = ["act_1"];

    const result = resolveReportContext({
      query: {},
      timeZone: "UTC",
      lookbackDays: 30,
      defaults: { businessIds, adAccountIds },
    });

    result.businessIds.push("b_2");
    result.adAccountIds.push("act_2");
    expect(businessIds).toEqual(["b_1"]);
    expect(adAccountIds).toEqual(["act_1"]);
  });
});
