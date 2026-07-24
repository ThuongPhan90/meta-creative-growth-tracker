import { describe, expect, it } from "vitest";

import {
  isActionableMetaAdAccountStatus,
  isOperationalAdAccount,
  isOperationalMetaAssetAccount,
  metaAdAccountStatusLabel,
  shouldIncludeInactiveMetaAdAccounts,
} from "./ad-account-status";

describe("Meta ad account status", () => {
  it("requires both current discovery access and Meta ACTIVE status", () => {
    expect(
      isOperationalAdAccount({ isActive: true, accountStatus: 1 }),
    ).toBe(true);
    expect(
      isOperationalAdAccount({ isActive: false, accountStatus: 1 }),
    ).toBe(false);
    expect(
      isOperationalAdAccount({ isActive: true, accountStatus: 101 }),
    ).toBe(false);
  });

  it("labels known closed states without hiding unknown Meta values", () => {
    expect(metaAdAccountStatusLabel(1)).toBe("ACTIVE");
    expect(metaAdAccountStatusLabel(101)).toBe("CLOSED");
    expect(metaAdAccountStatusLabel(999)).toBe("STATUS 999");
    expect(metaAdAccountStatusLabel(null)).toBe("UNKNOWN");
  });

  it("uses both latest discovery and Meta status for view-model accounts", () => {
    const account = {
      id: "act_1",
      name: "Account",
      kind: "Ad Account" as const,
      parentName: null,
      status: "ACTIVE",
      isCurrent: true,
    };

    expect(isOperationalMetaAssetAccount(account)).toBe(true);
    expect(
      isOperationalMetaAssetAccount({ ...account, isCurrent: false }),
    ).toBe(false);
    expect(
      isOperationalMetaAssetAccount({ ...account, status: "UNSETTLED" }),
    ).toBe(false);
  });

  it("keeps a selected inactive account queryable without widening by default", () => {
    const active = {
      id: "act_active",
      name: "Active",
      kind: "Ad Account" as const,
      parentName: null,
      status: "ACTIVE",
      isCurrent: true,
    };
    const stale = {
      ...active,
      id: "act_stale",
      status: "UNSETTLED",
      isCurrent: false,
    };

    expect(
      shouldIncludeInactiveMetaAdAccounts(
        [active, stale],
        "act_active",
        false,
      ),
    ).toBe(false);
    expect(
      shouldIncludeInactiveMetaAdAccounts(
        [active, stale],
        "act_stale",
        false,
      ),
    ).toBe(true);
    expect(
      shouldIncludeInactiveMetaAdAccounts([], "", true),
    ).toBe(true);
  });

  it("separates statuses that need action from archival states", () => {
    expect(isActionableMetaAdAccountStatus("UNSETTLED")).toBe(true);
    expect(isActionableMetaAdAccountStatus("PENDING_RISK_REVIEW")).toBe(true);
    expect(isActionableMetaAdAccountStatus("PENDING_OTHER")).toBe(true);
    expect(isActionableMetaAdAccountStatus("PENDING_CLOSURE")).toBe(false);
    expect(isActionableMetaAdAccountStatus("CLOSED")).toBe(false);
  });
});
