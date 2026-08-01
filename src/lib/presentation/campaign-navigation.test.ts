import { describe, expect, it } from "vitest";

import {
  buildCampaignsRouteHref,
  campaignInventoryBackHref,
  parseCampaignsRouteFilters,
  serializeCampaignsRouteFilters,
} from "./campaign-navigation";

describe("Campaign route-local filters", () => {
  it("normalizes only the supported tab, status, delivery, q and page values", () => {
    expect(
      parseCampaignsRouteFilters({
        tab: " ADS ",
        status: "PAUSED",
        delivery: " latest ",
        q: ["  Summer launch  ", "ignored"],
        page: "003",
      }),
    ).toEqual({
      tab: "ads",
      status: "active",
      delivery: "latest",
      q: "Summer launch",
      page: 3,
    });
  });

  it("drops unsupported local values and does not classify them as an Ads filter", () => {
    expect(
      parseCampaignsRouteFilters({
        tab: "injected",
        status: "ARCHIVED",
        delivery: "yesterday",
        q: " ",
        page: "0",
      }),
    ).toEqual({
      tab: "campaigns",
      status: "all",
      delivery: "all",
      q: null,
      page: 1,
    });
  });

  it("serializes defaults away and keeps delivery as the active-only route contract", () => {
    expect(
      serializeCampaignsRouteFilters({
        tab: "ads",
        status: "active",
        delivery: "latest",
        q: "  Creative 01  ",
        page: 2,
      }).toString(),
    ).toBe("tab=ads&delivery=latest&q=Creative+01&page=2");

    expect(
      serializeCampaignsRouteFilters({
        tab: "campaigns",
        status: "all",
        delivery: "all",
        q: null,
        page: 1,
      }).toString(),
    ).toBe("");
  });

  it("keeps global reporting context while replacing only valid local filters", () => {
    const href = buildCampaignsRouteHref(
      {
        from: "2026-07-01",
        to: "2026-07-30",
        business_ids: "bm_1,bm_2",
        account_ids: "act_1,act_2",
        account: "act_1",
        objective: "app_promotion",
        result: "install",
        attribution: "account_default",
        action_report_time: "mixed",
        sync_version: "sync_42",
        tab: "campaigns",
        status: "paused",
        q: "old",
        page: "9",
        selected: "should-not-leak",
      },
      {
        tab: "ads",
        delivery: "missing",
        q: "  New Ad  ",
        page: 2,
      },
    );
    const params = new URL(href, "https://tracker.example").searchParams;

    expect(Object.fromEntries(params)).toEqual({
      from: "2026-07-01",
      to: "2026-07-30",
      business_ids: "bm_1,bm_2",
      account_ids: "act_1,act_2",
      account: "act_1",
      objective: "app_promotion",
      result: "install",
      attribution: "account_default",
      action_report_time: "mixed",
      sync_version: "sync_42",
      tab: "ads",
      delivery: "missing",
      q: "New Ad",
      page: "2",
    });
    expect(params.get("status")).toBeNull();
    expect(params.get("selected")).toBeNull();
  });

  it("clears Ads-only filters when moving back to Campaign and keeps an explicit inactive toggle", () => {
    const href = buildCampaignsRouteHref(
      {
        from: "2026-07-01",
        to: "2026-07-30",
        account_ids: "act_1",
        tab: "ads",
        delivery: "missing",
        showInactive: "1",
      },
      {
        tab: "campaigns",
        status: "all",
        delivery: "all",
        page: 1,
      },
    );
    const params = new URL(href, "https://tracker.example").searchParams;

    expect(params.get("tab")).toBeNull();
    expect(params.get("status")).toBeNull();
    expect(params.get("delivery")).toBeNull();
    expect(params.get("showInactive")).toBe("1");
    expect(params.get("account_ids")).toBe("act_1");
  });
});

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
