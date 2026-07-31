import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "./client";
import { TrackerRepository } from "./repository";

describe("reporting scope repository", () => {
  it("maps Business relations and preserves orphan Ad Accounts", async () => {
    const unsafe = vi.fn(async (query: string) => {
      if (query.includes("from tracker.meta_businesses business")) {
        return [
          {
            meta_business_id: "biz_1",
            name: "Business One",
            is_active: true,
            ad_account_ids: ["act_1"],
          },
        ];
      }
      return [
        {
          meta_ad_account_id: "act_orphan",
          name: "Unassigned Account",
          is_active: true,
          account_status: 1,
          currency: "VND",
          timezone_name: "Asia/Ho_Chi_Minh",
          business_ids: [],
        },
      ];
    });
    const repository = new TrackerRepository({
      unsafe,
    } as unknown as DatabaseClient);

    await expect(
      repository.listReportingScopeInventory("connection-1"),
    ).resolves.toEqual({
      businesses: [
        {
          id: "biz_1",
          name: "Business One",
          isActive: true,
          adAccountIds: ["act_1"],
        },
      ],
      adAccounts: [
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
    });
  });

  it("replaces both member sets atomically with structured JSON arrays", async () => {
    const confirmedAt = new Date("2026-07-31T02:00:00.000Z");
    const transactionUnsafe = vi.fn(
      async (query: string, _parameters?: unknown[]) => {
        void _parameters;
        if (query.includes("from tracker.reporting_scopes scope")) {
          return [
            {
              confirmed_at: confirmedAt,
              updated_at: confirmedAt,
              business_ids: ["biz_1"],
              ad_account_ids: ["act_orphan"],
            },
          ];
        }
        return [];
      },
    );
    const begin = vi.fn(
      async (
        callback: (transaction: { unsafe: typeof transactionUnsafe }) =>
          Promise<unknown>,
      ) => callback({ unsafe: transactionUnsafe }),
    );
    const repository = new TrackerRepository({
      begin,
    } as unknown as DatabaseClient);

    await expect(
      repository.saveReportingScope({
        connectionId: "connection-1",
        businessIds: ["biz_1"],
        adAccountIds: ["act_orphan"],
      }),
    ).resolves.toEqual({
      businessIds: ["biz_1"],
      adAccountIds: ["act_orphan"],
      confirmedAt: confirmedAt.toISOString(),
      updatedAt: confirmedAt.toISOString(),
    });

    expect(begin).toHaveBeenCalledOnce();
    expect(transactionUnsafe).toHaveBeenCalledTimes(6);
    expect(transactionUnsafe.mock.calls[0]?.[0]).toContain(
      "insert into tracker.reporting_scopes",
    );
    expect(transactionUnsafe.mock.calls[1]?.[0]).toContain(
      "delete from tracker.reporting_scope_business_members",
    );
    expect(transactionUnsafe.mock.calls[2]?.[0]).toContain(
      "delete from tracker.reporting_scope_ad_account_members",
    );
    expect(transactionUnsafe.mock.calls[3]?.[1]).toEqual([
      "connection-1",
      ["biz_1"],
    ]);
    expect(transactionUnsafe.mock.calls[4]?.[1]).toEqual([
      "connection-1",
      ["act_orphan"],
    ]);
  });
});
