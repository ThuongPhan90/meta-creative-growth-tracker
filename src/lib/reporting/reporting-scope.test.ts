import { describe, expect, it } from "vitest";

import {
  buildCanonicalReportingScope,
  readReportingScopeOverride,
  validateReportingScopeSelection,
  type ReportingScopeInventory,
} from "./reporting-scope";
import { resolveReportContext } from "./report-context";

const inventory: ReportingScopeInventory = {
  businesses: [
    {
      id: "biz_1",
      name: "Business One",
      isActive: true,
      adAccountIds: ["act_1", "act_2"],
    },
    {
      id: "biz_2",
      name: "Business Two",
      isActive: true,
      adAccountIds: ["act_3"],
    },
  ],
  adAccounts: [
    {
      id: "act_1",
      name: "Account One",
      isActive: true,
      accountStatus: 1,
      currency: "USD",
      timezone: "America/Los_Angeles",
      businessIds: ["biz_1"],
    },
    {
      id: "act_2",
      name: "Account Two",
      isActive: true,
      accountStatus: 1,
      currency: "USD",
      timezone: "America/Los_Angeles",
      businessIds: ["biz_1"],
    },
    {
      id: "act_3",
      name: "Account Three",
      isActive: true,
      accountStatus: 1,
      currency: "VND",
      timezone: "Asia/Ho_Chi_Minh",
      businessIds: ["biz_2"],
    },
    {
      id: "act_orphan",
      name: "Unassigned Account",
      isActive: true,
      accountStatus: 1,
      currency: "VND",
      timezone: "Asia/Ho_Chi_Minh",
      businessIds: [],
    },
  ],
};

describe("reporting scope", () => {
  it("returns partial collection and parent checkbox states", () => {
    const scope = buildCanonicalReportingScope({
      inventory,
      persisted: {
        businessIds: ["biz_1"],
        adAccountIds: ["act_1"],
        confirmedAt: "2026-07-31T01:00:00Z",
        updatedAt: "2026-07-31T01:00:00Z",
      },
    });

    expect(scope.selected).toMatchObject({
      businessIds: ["biz_1"],
      adAccountIds: ["act_1"],
      businessState: "partial",
      adAccountState: "partial",
      source: {
        businesses: "persisted",
        adAccounts: "persisted",
      },
    });
    expect(scope.available.businesses[0]).toMatchObject({
      id: "biz_1",
      selected: true,
      selectionState: "partial",
    });
    expect(scope.available.businesses[1]).toMatchObject({
      id: "biz_2",
      selected: false,
      selectionState: "none",
    });
  });

  it("represents explicit all and explicit none without ambiguity", () => {
    const all = buildCanonicalReportingScope({
      inventory,
      persisted: {
        businessIds: ["biz_1", "biz_2"],
        adAccountIds: ["act_1", "act_2", "act_3", "act_orphan"],
        confirmedAt: "2026-07-31T01:00:00Z",
        updatedAt: "2026-07-31T01:00:00Z",
      },
    });
    const none = buildCanonicalReportingScope({
      inventory,
      persisted: {
        businessIds: [],
        adAccountIds: [],
        confirmedAt: "2026-07-31T02:00:00Z",
        updatedAt: "2026-07-31T02:00:00Z",
      },
    });

    expect(all.selected.businessState).toBe("all");
    expect(all.selected.adAccountState).toBe("all");
    expect(none.selected.businessState).toBe("none");
    expect(none.selected.adAccountState).toBe("none");
    expect(none.confirmedAt).toBe("2026-07-31T02:00:00Z");
  });

  it("allows an orphan Ad Account to be selected explicitly", () => {
    const validation = validateReportingScopeSelection({
      inventory,
      businessIds: [],
      adAccountIds: ["act_orphan"],
    });
    const scope = buildCanonicalReportingScope({
      inventory,
      persisted: {
        businessIds: [],
        adAccountIds: ["act_orphan"],
        confirmedAt: null,
        updatedAt: null,
      },
    });

    expect(validation).toEqual({
      ok: true,
      businessIds: [],
      adAccountIds: ["act_orphan"],
    });
    expect(
      scope.available.adAccounts.find(
        (account) => account.id === "act_orphan",
      ),
    ).toMatchObject({
      selected: true,
      isOrphan: true,
      businessIds: [],
    });
  });

  it("uses plural URL IDs as the authority without changing persisted selection", () => {
    const override = readReportingScopeOverride(
      new URLSearchParams(
        "business_ids=biz_2&account_ids=act_orphan",
      ),
    );
    const scope = buildCanonicalReportingScope({
      inventory,
      persisted: {
        businessIds: ["biz_1"],
        adAccountIds: ["act_1"],
        confirmedAt: null,
        updatedAt: null,
      },
      override,
    });

    expect(scope.selected).toMatchObject({
      businessIds: ["biz_2"],
      adAccountIds: ["act_orphan"],
      source: {
        businesses: "url",
        adAccounts: "url",
      },
    });
  });

  it("reports unavailable persisted or URL members explicitly", () => {
    const scope = buildCanonicalReportingScope({
      inventory,
      override: {
        businessIds: ["biz_missing"],
        adAccountIds: ["act_missing"],
      },
    });

    expect(scope.selected.businessIds).toEqual([]);
    expect(scope.selected.adAccountIds).toEqual([]);
    expect(scope.unavailableSelected).toEqual({
      businessIds: ["biz_missing"],
      adAccountIds: ["act_missing"],
    });
  });

  it("rejects unknown and unsafe members before persistence", () => {
    expect(
      validateReportingScopeSelection({
        inventory,
        businessIds: ["biz_1", "<script>"],
        adAccountIds: ["act_missing"],
      }),
    ).toEqual({
      ok: false,
      invalidBusinessIds: ["<script>"],
      invalidAdAccountIds: ["act_missing"],
    });
  });

  it("preserves one Business with mixed currency and mixed account timezones as a split account-local scope", () => {
    const mixedInventory: ReportingScopeInventory = {
      ...inventory,
      adAccounts: inventory.adAccounts.map((account) =>
        account.id === "act_2"
          ? {
              ...account,
              currency: "VND",
              timezone: "Asia/Ho_Chi_Minh",
            }
          : account,
      ),
    };
    const scope = buildCanonicalReportingScope({
      inventory: mixedInventory,
      persisted: {
        businessIds: ["biz_1"],
        adAccountIds: ["act_1", "act_2"],
        confirmedAt: "2026-07-31T01:00:00Z",
        updatedAt: "2026-07-31T01:00:00Z",
      },
    });
    const selectedAccounts = scope.available.adAccounts.filter(
      (account) => scope.selected.adAccountIds.includes(account.id),
    );
    const context = resolveReportContext({
      query: { currencyMode: "split" },
      timeZone: "Asia/Ho_Chi_Minh",
      lookbackDays: 30,
      defaults: {
        businessIds: scope.selected.businessIds,
        adAccountIds: scope.selected.adAccountIds,
        currencyMode: "split",
      },
    });

    expect(scope.selected).toMatchObject({
      businessIds: ["biz_1"],
      adAccountIds: ["act_1", "act_2"],
      businessState: "partial",
    });
    expect(scope.available.businesses[0]?.selectionState).toBe("all");
    expect(new Set(selectedAccounts.map((account) => account.currency))).toEqual(
      new Set(["USD", "VND"]),
    );
    expect(
      new Set(selectedAccounts.map((account) => account.timezone)),
    ).toEqual(
      new Set(["America/Los_Angeles", "Asia/Ho_Chi_Minh"]),
    );
    expect(context).toMatchObject({
      currencyMode: "split",
      currency: "",
      reportingTimezoneMode: "account_local",
    });
  });
});
