import { describe, expect, it } from "vitest";

import { formatFreshnessFields } from "./freshness-presentation";

describe("formatFreshnessFields", () => {
  it("keeps data through, successful sync time and status separate", () => {
    expect(
      formatFreshnessFields(
        {
          dataThroughAt: "2026-07-30T23:59:59.999Z",
          lastSyncedAt: "2026-07-31T01:00:00.000Z",
          syncStatus: "partial",
        },
        "UTC",
        new Date("2026-07-31T02:00:00.000Z"),
      ),
    ).toEqual({
      dataThrough: "30/07/2026",
      lastSuccessfulSync: "1 giờ trước",
      status: "Đồng bộ một phần",
      tone: "warning",
    });
  });
});
