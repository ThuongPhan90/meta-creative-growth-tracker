import { describe, expect, it } from "vitest";

import {
  sourceAccountCampaignsHref,
  sourceBusinessAccountsHref,
  sourceBusinessFilterId,
} from "./source-navigation";

describe("Source entity navigation", () => {
  const query = {
    from: "2026-07-01",
    to: "2026-07-30",
    business_ids: "biz_1,biz_2",
    account_ids: "act_1,act_2",
    objective: "leads",
    result: "lead",
    currency: "VND",
    compare: "previous_period",
    selected: "drawer-old",
    tab: "businesses",
    ignored: "must-not-propagate",
  };

  it("opens the account list for one Business without dropping report context", () => {
    const url = new URL(
      sourceBusinessAccountsHref("biz_1", query),
      "https://tracker.test",
    );

    expect(url.pathname).toBe("/sources");
    expect(url.searchParams.get("tab")).toBe("ad-accounts");
    expect(url.searchParams.get("source_business")).toBe("biz_1");
    expect(url.searchParams.get("from")).toBe("2026-07-01");
    expect(url.searchParams.get("to")).toBe("2026-07-30");
    expect(url.searchParams.get("account_ids")).toBe("act_1,act_2");
    expect(url.searchParams.get("objective")).toBe("leads");
    expect(url.searchParams.get("result")).toBe("lead");
    expect(url.searchParams.has("selected")).toBe(false);
    expect(url.searchParams.has("ignored")).toBe(false);
  });

  it("narrows Campaigns to one Ad Account and clears stale detail filters", () => {
    const url = new URL(
      sourceAccountCampaignsHref("act_2", {
        ...query,
        campaign: "campaign-old",
      }),
      "https://tracker.test",
    );

    expect(url.pathname).toBe("/campaigns");
    expect(url.searchParams.get("account_ids")).toBe("act_2");
    expect(url.searchParams.get("account")).toBe("act_2");
    expect(url.searchParams.get("business_ids")).toBe("biz_1,biz_2");
    expect(url.searchParams.get("objective")).toBe("leads");
    expect(url.searchParams.get("result")).toBe("lead");
    expect(url.searchParams.has("campaign")).toBe(false);
    expect(url.searchParams.has("selected")).toBe(false);
    expect(url.searchParams.has("tab")).toBe(false);
  });

  it("accepts only a canonical local Business filter", () => {
    expect(
      sourceBusinessFilterId({ source_business: "biz_1" }),
    ).toBe("biz_1");
    expect(
      sourceBusinessFilterId({
        source_business: "<script>",
      }),
    ).toBeNull();
  });
});
