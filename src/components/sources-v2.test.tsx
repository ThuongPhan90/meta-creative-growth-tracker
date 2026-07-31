import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { DashboardViewModel } from "@/types/view-models";
import {
  buildCanonicalReportingScope,
  DEFAULT_RESULT_DEFINITIONS,
  type PersistedResultMapping,
} from "@/lib/reporting";

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

const reportingScope = buildCanonicalReportingScope({
  inventory: {
    businesses: [
      {
        id: "biz_1",
        name: "Business One",
        isActive: true,
        adAccountIds: ["act_1", "act_inactive"],
      },
      {
        id: "biz_2",
        name: "Business Two",
        isActive: true,
        adAccountIds: [],
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
        id: "act_inactive",
        name: "Inactive Account",
        isActive: false,
        accountStatus: 2,
        currency: "USD",
        timezone: "America/Los_Angeles",
        businessIds: ["biz_1"],
      },
      {
        id: "act_orphan",
        name: "Orphan Account",
        isActive: true,
        accountStatus: 1,
        currency: "VND",
        timezone: "Asia/Ho_Chi_Minh",
        businessIds: [],
      },
    ],
  },
  persisted: {
    businessIds: ["biz_1"],
    adAccountIds: ["act_1", "act_orphan"],
    confirmedAt: "2026-07-31T01:00:00.000Z",
    updatedAt: "2026-07-31T01:00:00.000Z",
  },
});

const resultDefinitions = DEFAULT_RESULT_DEFINITIONS.filter(
  (definition) =>
    definition.canonicalKey === "lead" ||
    definition.canonicalKey === "install",
).map((definition) => ({
  ...definition,
  objectiveKeys: [...definition.objectiveKeys],
  rawActionTypes: [...definition.rawActionTypes],
  rawValueActionTypes: [
    ...(definition.rawValueActionTypes ?? []),
  ],
}));
const resultMappings: PersistedResultMapping[] =
  resultDefinitions.flatMap((definition) =>
    definition.rawActionTypes.map((rawActionType, priority) => ({
      id: `${definition.canonicalKey}:${priority}`,
      canonicalResultKey: definition.canonicalKey,
      rawActionType,
      metricSource: "action",
      priority,
      mappingSource:
        definition.canonicalKey === "lead" ? "owner" : "system",
      enabled: true,
    })),
  );

const resultRegistry = {
  definitions: resultDefinitions,
  mappings: resultMappings,
  source: "database" as const,
  warning: null,
};

const sourceAssets: Parameters<typeof SourcesV2>[0]["assets"] = [
  {
    id: "biz_1",
    name: "Business One",
    kind: "Business",
    parentName: null,
    status: "ACTIVE",
    isCurrent: true,
  },
  {
    id: "biz_2",
    name: "Business Two",
    kind: "Business",
    parentName: null,
    status: "ACTIVE",
    isCurrent: true,
  },
  {
    id: "act_1",
    name: "Account One",
    kind: "Ad Account",
    parentName: "Business One",
    status: "ACTIVE",
    isCurrent: true,
    currency: "USD",
  },
  {
    id: "act_inactive",
    name: "Inactive Account",
    kind: "Ad Account",
    parentName: "Business One",
    status: "INACTIVE",
    isCurrent: true,
    currency: "USD",
  },
  {
    id: "act_orphan",
    name: "Orphan Account",
    kind: "Ad Account",
    parentName: null,
    status: "ACTIVE",
    isCurrent: true,
    currency: "VND",
  },
];

function renderSources(
  props: Partial<Parameters<typeof SourcesV2>[0]> = {},
) {
  return renderToStaticMarkup(
    createElement(SourcesV2, {
      activeTab: "connection",
      query: {},
      assets: [],
      dashboard,
      connected: true,
      reportingScope,
      resultRegistry,
      scopePersistEnabled: true,
      connectionContent: createElement("div", null, "Connection"),
      ...props,
    }),
  ).replaceAll("&amp;", "&");
}

describe("Sources summary navigation", () => {
  it("drills each count into the matching tab and retains shared context", () => {
    const html = renderSources({
      query: {
        from: "2026-07-01",
        to: "2026-07-30",
        account: "act_123",
        currency: "VND",
        compare: "previous_period",
        selected: "must-not-leak",
        ignored: "must-not-propagate",
      },
    });

    for (const tab of [
      "connection",
      "businesses",
      "ad-accounts",
      "pages",
      "scope",
      "results",
    ]) {
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

  it("shows persisted tri-state scope, inactive and orphan accounts with a save control", () => {
    const html = renderSources({
      activeTab: "reporting-scope",
    });

    expect(html).toContain("Phạm vi báo cáo");
    expect(html).toContain("Chọn một phần");
    expect(html).toContain("Orphan Account");
    expect(html).toContain("Inactive Account");
    expect(html).toContain("Lưu mặc định");
    expect(html).toContain('name="business_ids"');
    expect(html).toContain('name="account_ids"');
    expect(html).toContain("URL vẫn là nguồn ưu tiên");
  });

  it("renders data-driven result aliases and mapping provenance as read-only Meta-attributed data", () => {
    const html = renderSources({
      activeTab: "results",
    });

    expect(html).toContain("Kết quả & Mapping");
    expect(html).toContain("Meta-attributed");
    expect(html).toContain("Owner override");
    expect(html).toContain("Seed hệ thống");
    expect(html).toContain("action:onsite_conversion.lead_grouped");
    expect(html).toContain("action:mobile_app_install");
    expect(html).toContain("không có Result mặc định chung");
    expect(html).toContain("không chỉnh Campaign");
  });

  it("drills a Business into its filtered Ad Accounts and keeps report context", () => {
    const html = renderSources({
      activeTab: "businesses",
      assets: sourceAssets,
      query: {
        from: "2026-07-01",
        to: "2026-07-30",
        account_ids: "act_1,act_orphan",
        objective: "leads",
        result: "lead",
        currency: "USD",
        selected: "biz_1",
        tab: "businesses",
      },
    });
    const rawHref = html.match(
      /href="([^"]+)"[^>]*>Xem Ad Account thuộc Business/,
    )?.[1];

    expect(rawHref).toBeDefined();
    const url = new URL(rawHref!, "https://tracker.test");
    expect(url.pathname).toBe("/sources");
    expect(url.searchParams.get("tab")).toBe("ad-accounts");
    expect(url.searchParams.get("source_business")).toBe("biz_1");
    expect(url.searchParams.get("account_ids")).toBe(
      "act_1,act_orphan",
    );
    expect(url.searchParams.get("objective")).toBe("leads");
    expect(url.searchParams.get("result")).toBe("lead");
    expect(url.searchParams.has("selected")).toBe(false);
  });

  it("filters Ad Accounts by Business and drills one Account into Campaigns", () => {
    const html = renderSources({
      activeTab: "ad-accounts",
      assets: sourceAssets,
      query: {
        from: "2026-07-01",
        to: "2026-07-30",
        business_ids: "biz_1,biz_2",
        account_ids: "act_1,act_orphan",
        objective: "leads",
        result: "lead",
        currency: "USD",
        source_business: "biz_1",
        selected: "act_1",
        tab: "ad-accounts",
      },
    });
    const rawHref = html.match(
      /href="([^"]+)"[^>]*>Xem Campaign của tài khoản/,
    )?.[1];

    expect(html).toContain("Account One");
    expect(html).toContain("Inactive Account");
    expect(html).not.toContain("Orphan Account");
    expect(html).toContain("thuộc Business One");
    expect(html).toContain("Xóa lọc Business");
    expect(rawHref).toBeDefined();
    const url = new URL(rawHref!, "https://tracker.test");
    expect(url.pathname).toBe("/campaigns");
    expect(url.searchParams.get("account_ids")).toBe("act_1");
    expect(url.searchParams.get("account")).toBe("act_1");
    expect(url.searchParams.get("from")).toBe("2026-07-01");
    expect(url.searchParams.get("to")).toBe("2026-07-30");
    expect(url.searchParams.get("objective")).toBe("leads");
    expect(url.searchParams.get("result")).toBe("lead");
    expect(url.searchParams.has("selected")).toBe(false);
    expect(url.searchParams.has("tab")).toBe(false);
  });
});
