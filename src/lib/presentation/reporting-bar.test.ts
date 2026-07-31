import { describe, expect, it } from "vitest";

import {
  buildCanonicalReportingScope,
  resolveReportContext,
} from "@/lib/reporting";
import { buildReportingBarModel } from "./reporting-bar";

describe("buildReportingBarModel", () => {
  it("keeps canonical scope and exposes Install only for App Promotion", () => {
    const context = resolveReportContext({
      query: {
        businessIds: ["bm_1"],
        adAccountIds: ["act_1"],
        objectiveKey: "app_promotion",
        primaryResultKey: "install",
      },
      timeZone: "UTC",
      lookbackDays: 30,
    });
    const model = buildReportingBarModel(null, context);

    expect(model.selectedAccountIds).toEqual(["act_1"]);
    expect(model.objective).toBe("app_promotion");
    expect(
      model.results.find((result) => result.key === "install")
        ?.objectiveKeys,
    ).toEqual(["app_promotion"]);
  });

  it("surfaces saved scope members that are no longer accessible", () => {
    const context = resolveReportContext({
      query: {
        businessIds: ["bm_1"],
        adAccountIds: ["act_1"],
      },
      timeZone: "UTC",
      lookbackDays: 30,
    });
    const scope = buildCanonicalReportingScope({
      inventory: {
        businesses: [
          {
            id: "bm_1",
            name: "Business 1",
            isActive: true,
            adAccountIds: ["act_1"],
          },
        ],
        adAccounts: [
          {
            id: "act_1",
            name: "Account 1",
            businessIds: ["bm_1"],
            currency: "USD",
            timezone: "UTC",
            isActive: true,
            accountStatus: null,
          },
        ],
      },
      persisted: {
        businessIds: ["bm_1", "bm_revoked"],
        adAccountIds: ["act_1", "act_revoked"],
        confirmedAt: "2026-07-30T00:00:00.000Z",
        updatedAt: "2026-07-30T00:00:00.000Z",
      },
    });

    expect(buildReportingBarModel(scope, context).scopeWarning).toContain(
      "1 Business và 1 Ad Account",
    );
  });
});
