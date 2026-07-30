import { describe, expect, it } from "vitest";

import { resolveReportContext } from "./report-context";

describe("resolveReportContext", () => {
  it("normalizes an inverted range and account", () => {
    expect(
      resolveReportContext({
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
      }),
    ).toMatchObject({
      dateFrom: "2026-07-01",
      dateTo: "2026-07-30",
      account: "act_123",
      currency: "USD",
      compare: "none",
    });
  });

  it("caps report windows at 365 days", () => {
    const result = resolveReportContext({
      query: { from: "2020-01-01", to: "2026-07-30" },
      timeZone: "UTC",
      lookbackDays: 30,
    });
    expect(result.dateFrom).toBe("2025-07-31");
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
      compare: "none",
    });
  });
});
