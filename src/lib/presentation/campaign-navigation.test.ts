import { describe, expect, it } from "vitest";

import { campaignInventoryBackHref } from "./campaign-navigation";

describe("Campaign inventory back link", () => {
  it("keeps every shared value and the list-only filters", () => {
    const href = campaignInventoryBackHref({
      from: "2026-07-01",
      to: "2026-07-30",
      account: "act_123",
      campaign: "1200123",
      os: "android",
      format: "video",
      performance: "watch",
      data_status: "partial",
      currency: "vnd",
      compare: "previous_period",
      q: " Summer launch ",
      status: "ACTIVE",
      page: "03",
      selected: "1200123",
      tab: "structure",
      injected: "drop-me",
    });

    expect(href).toBe(
      "/campaigns?from=2026-07-01&to=2026-07-30&account=act_123&campaign=1200123&os=android&format=video&performance=watch&data_status=partial&currency=VND&compare=previous_period&q=Summer+launch&status=ACTIVE&page=3",
    );
    expect(href).not.toContain("selected");
    expect(href).not.toContain("tab=");
    expect(href).not.toContain("injected");
  });

  it("drops malformed shared dates and invalid pages", () => {
    expect(
      campaignInventoryBackHref({
        from: "2026-02-30",
        q: " ",
        page: "-2",
      }),
    ).toBe("/campaigns");
  });
});
