import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { DashboardViewModel } from "@/types/view-models";

import { SourcesV2 } from "./sources-v2";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
}));

const dashboard: DashboardViewModel = {
  mode: "connected",
  ownerName: "Owner",
  connectionLabel: "Đang hoạt động",
  connectionDetail: "Kết nối chỉ đọc",
  lastSyncAt: "30/07/2026 08:00",
  hasDelivery: true,
  counts: {
    businesses: 2,
    adAccounts: 3,
    pages: 4,
    creatives: 5,
  },
  events: [],
  checklist: [],
};

describe("Sources summary navigation", () => {
  it("drills each count into the matching tab and retains shared context", () => {
    const html = renderToStaticMarkup(
      createElement(SourcesV2, {
        activeTab: "connection",
        query: {
          from: "2026-07-01",
          to: "2026-07-30",
          account: "act_123",
          currency: "VND",
          compare: "previous_period",
          selected: "must-not-leak",
          ignored: "must-not-propagate",
        },
        assets: [],
        dashboard,
        connected: true,
        connectionContent: createElement("div", null, "Connection"),
      }),
    ).replaceAll("&amp;", "&");

    for (const tab of ["connection", "businesses", "ad-accounts", "pages"]) {
      expect(html).toContain(
        `href="/sources?tab=${tab}&from=2026-07-01&to=2026-07-30&account=act_123&currency=VND&compare=previous_period"`,
      );
    }
    expect(html).toContain(
      'href="/data-health?from=2026-07-01&to=2026-07-30&account=act_123&currency=VND&compare=previous_period"',
    );
    const summary = html.match(
      /<section class="v2-source-summary">([\s\S]*?)<\/section>/,
    )?.[1];
    expect(summary).toBeDefined();
    expect(summary).not.toContain("must-not-leak");
    expect(summary).not.toContain("must-not-propagate");
  });
});
