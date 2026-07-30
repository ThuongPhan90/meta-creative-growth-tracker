import { describe, expect, it } from "vitest";

import { normalizeDataHealthResource } from "@/lib/data-contract";
import { dataHealthEntityHref } from "./data-health-links";

describe("Data Health affected entity links", () => {
  it("opens the canonical ad account in Sources", () => {
    const entity = normalizeDataHealthResource("act_123/ads")[0];

    expect(entity).toBeDefined();
    expect(dataHealthEntityHref(entity)).toBe(
      "/sources?tab=ad-accounts&selected=act_123",
    );
  });

  it("routes supported source entities to their matching tabs", () => {
    expect(
      dataHealthEntityHref({
        entityType: "business",
        entityId: "business 1",
        label: null,
      }),
    ).toBe("/sources?tab=businesses&selected=business%201");
    expect(
      dataHealthEntityHref({
        entityType: "page",
        entityId: "page_1",
        label: null,
      }),
    ).toBe("/sources?tab=pages&selected=page_1");
  });

  it("preserves the shared reporting context without leaking issue state", () => {
    expect(
      dataHealthEntityHref(
        {
          entityType: "ad_account",
          entityId: "act_123",
          label: null,
        },
        {
          currency: "VND",
          compare: "previous_period",
          selected: "issue_old",
          tab: "technical",
        },
      ),
    ).toBe(
      "/sources?tab=ad-accounts&selected=act_123&currency=VND&compare=previous_period",
    );
  });
});
