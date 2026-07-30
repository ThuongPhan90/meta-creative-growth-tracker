import { describe, expect, it } from "vitest";

import type { SettingsAuditRecord } from "@/lib/db";

import {
  demoSettingsAuditRecords,
  toSettingsAuditView,
} from "./settings-audit";

describe("settings audit presentation", () => {
  it("shows every supported field change while keeping unknown data hidden", () => {
    const records: SettingsAuditRecord[] = [
      {
        settingsAuditId: "audit-1",
        changedAt: "2026-07-29T09:42:00.000Z",
        changedBy: "unexpected-actor-name",
        beforeState: {
          reportingTimezone: "UTC",
          scoringWeights: { cpi: 50, cpa: 30, hook: 10, hold: 10 },
          internalSecret: "before",
          updatedAt: "2026-07-29T09:40:00.000Z",
        },
        afterState: {
          reportingTimezone: "Asia/Ho_Chi_Minh",
          scoringWeights: { cpi: 40, cpa: 40, hook: 10, hold: 10 },
          internalSecret: "after",
          updatedAt: "2026-07-29T09:42:00.000Z",
        },
      },
    ];

    const [entry] = toSettingsAuditView(
      records,
      "Asia/Ho_Chi_Minh",
    );

    expect(entry.actorLabel).toBe("Tác nhân nội bộ");
    expect(entry.changes).toEqual([
      {
        key: "reportingTimezone",
        label: "Múi giờ báo cáo",
        before: "UTC",
        after: "Hồ Chí Minh · GMT+7",
      },
      {
        key: "scoringWeights.cpi",
        label: "Trọng số CPI",
        before: "50%",
        after: "40%",
      },
      {
        key: "scoringWeights.cpa",
        label: "Trọng số CPA Registration",
        before: "30%",
        after: "40%",
      },
    ]);
    expect(entry.hasHiddenChanges).toBe(true);
    expect(JSON.stringify(entry)).not.toContain("internalSecret");
  });

  it("provides multiple realistic demo entries for Settings QA", () => {
    const entries = toSettingsAuditView(
      demoSettingsAuditRecords,
      "Asia/Ho_Chi_Minh",
    );

    expect(entries).toHaveLength(3);
    expect(entries.every((entry) => entry.changes.length > 0)).toBe(true);
    expect(entries[0].changes.map((change) => change.key)).toEqual([
      "reportingCurrency",
      "compareDefault",
    ]);
  });
});
