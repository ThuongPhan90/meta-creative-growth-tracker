import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getCreativeFamilyRowsForReport,
  type ApplicationSnapshot,
} from "@/lib/app-data";
import { demoCreatives } from "@/lib/demo-data";
import type { ReportingContext } from "@/lib/reporting";

describe("demo Creative Family reporting detail", () => {
  it("uses the same canonical Result bridge as overview and collection pages", async () => {
    const row = demoCreatives[0];
    const context: ReportingContext = {
      businessIds: [],
      adAccountIds: [],
      dateFrom: "2026-07-02",
      dateTo: "2026-07-31",
      compareMode: "previous_period",
      objectiveKey: "app_promotion",
      primaryResultKey: "install",
      currency: "VND",
      currencyMode: "single",
      reportingTimezoneMode: "account_local",
      attributionSettingKey: "account_default",
      actionReportTime: "mixed",
      syncVersion: "demo",
    };

    const result = await getCreativeFamilyRowsForReport({
      snapshot: {
        demoMode: true,
        creatives: [row],
      } as unknown as ApplicationSnapshot,
      creativeFamilyId: row.creativeFamilyId!,
      dateFrom: context.dateFrom,
      dateTo: context.dateTo,
      currency: context.currency,
      reportContext: context,
    });

    expect(result?.[0].performance?.resultValues).toMatchObject({
      install: row.performance?.installs,
    });
  });
});
