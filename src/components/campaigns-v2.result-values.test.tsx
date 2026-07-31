import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CampaignsV2 } from "./campaigns-v2";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("Campaign canonical Result rendering", () => {
  it("does not fall back to legacy installs when live canonical values are explicitly unavailable", () => {
    const markup = renderToStaticMarkup(
      createElement(CampaignsV2, {
        data: {
          items: [
            {
              campaignId: "db_campaign_1",
              metaCampaignId: "campaign_1",
              name: "Live App Campaign",
              objective: "OUTCOME_APP_PROMOTION",
              status: "ACTIVE",
              effectiveStatus: "ACTIVE",
              isActive: true,
              metaAdAccountId: "act_1",
              adAccountName: "Account 1",
              adSetCount: 1,
              adCount: 1,
              creativeAssetCount: 1,
              performance: [
                {
                  currency: "VND",
                  spend: 1_000_000,
                  impressions: 10_000,
                  installs: 999,
                  registrations: 888,
                  cpi: 1_001,
                  costPerRegistration: 1_126,
                  resultValues: { install: null },
                },
              ],
              lastSeenAt: "2026-07-30T10:00:00.000Z",
            },
          ],
          total: 1,
          limit: 50,
          offset: 0,
        },
        delivery: [],
        query: {},
        connected: true,
        dateFrom: "2026-07-01",
        dateTo: "2026-07-30",
        account: "act_1",
        accounts: [{ id: "act_1", name: "Account 1" }],
        reportingCurrency: "VND",
        currencyOptions: ["VND"],
        compare: "none",
        freshness: "Dá»¯ liá»‡u má»›i",
        reportingBar: {
          businesses: [],
          scopeAccounts: [],
          selectedBusinessIds: [],
          selectedAccountIds: ["act_1"],
          persistScope: false,
          objective: "app_promotion",
          objectives: [],
          result: "install",
          results: [],
        },
        resultMetrics: {
          kpiCards: [],
          dynamicTableColumns: [
            {
              key: "result:install",
              label: "Install",
              valueType: "count",
              attribution: "meta_attributed",
              canonicalResultKey: "install",
              sortable: true,
              formula: "Meta-attributed Install",
            },
          ],
        },
      } as never),
    );

    expect(markup).toContain("Meta-attributed Install");
    expect(markup).not.toContain(">999<");
    expect(markup).toContain(">—<");
  });

  it("renders an exact delivery result after the adapter puts it in the canonical container", () => {
    const markup = renderToStaticMarkup(
      createElement(CampaignsV2, {
        data: {
          items: [
            {
              campaignId: "db_campaign_2",
              metaCampaignId: "campaign_2",
              name: "Awareness Campaign",
              objective: "OUTCOME_AWARENESS",
              status: "ACTIVE",
              effectiveStatus: "ACTIVE",
              isActive: true,
              metaAdAccountId: "act_1",
              adAccountName: "Account 1",
              adSetCount: 1,
              adCount: 1,
              creativeAssetCount: 1,
              performance: [
                {
                  currency: "VND",
                  spend: 500_000,
                  impressions: 12_345,
                  installs: 999,
                  registrations: 888,
                  cpi: null,
                  costPerRegistration: null,
                  resultValues: { impressions: 12_345 },
                },
              ],
              lastSeenAt: "2026-07-30T10:00:00.000Z",
            },
          ],
          total: 1,
          limit: 50,
          offset: 0,
        },
        delivery: [],
        query: {},
        connected: true,
        dateFrom: "2026-07-01",
        dateTo: "2026-07-30",
        account: "act_1",
        accounts: [{ id: "act_1", name: "Account 1" }],
        reportingCurrency: "VND",
        currencyOptions: ["VND"],
        compare: "none",
        freshness: "Dữ liệu mới",
        reportingBar: {
          businesses: [],
          scopeAccounts: [],
          selectedBusinessIds: [],
          selectedAccountIds: ["act_1"],
          persistScope: false,
          objective: "awareness",
          objectives: [],
          result: "impressions",
          results: [],
        },
        resultMetrics: {
          kpiCards: [],
          dynamicTableColumns: [
            {
              key: "result:impressions",
              label: "Impressions",
              valueType: "count",
              attribution: "delivery",
              canonicalResultKey: "impressions",
              sortable: true,
              formula: "Meta-reported Impressions",
            },
          ],
        },
      } as never),
    );

    expect(markup).toContain(">12,3");
    expect(markup).not.toContain(">999<");
  });

  it("keeps an archived Campaign visible with an explicit archived status", () => {
    const markup = renderToStaticMarkup(
      createElement(CampaignsV2, {
        data: {
          items: [
            {
              campaignId: "db_campaign_archived",
              metaCampaignId: "campaign_archived",
              name: "Archived Leads Campaign",
              objective: "OUTCOME_LEADS",
              status: "ARCHIVED",
              effectiveStatus: "ARCHIVED",
              isActive: true,
              metaAdAccountId: "act_1",
              adAccountName: "Account 1",
              adSetCount: 2,
              adCount: 3,
              creativeAssetCount: 2,
              performance: [],
              lastSeenAt: "2026-07-29T10:00:00.000Z",
            },
          ],
          total: 1,
          limit: 50,
          offset: 0,
        },
        delivery: [],
        query: { showInactive: "1" },
        connected: true,
        dateFrom: "2026-07-01",
        dateTo: "2026-07-30",
        account: "act_1",
        accounts: [{ id: "act_1", name: "Account 1" }],
        reportingCurrency: "VND",
        currencyOptions: ["VND"],
        compare: "none",
        freshness: "Dữ liệu mới",
        reportingBar: {
          businesses: [],
          scopeAccounts: [],
          selectedBusinessIds: [],
          selectedAccountIds: ["act_1"],
          persistScope: false,
          objective: "all",
          objectives: [],
          results: [],
        },
        resultMetrics: {
          kpiCards: [],
          dynamicTableColumns: [],
        },
      } as never),
    );

    expect(markup).toContain("Archived Leads Campaign");
    expect(markup).toContain("Đã lưu trữ");
    expect(markup).toContain("/campaigns/campaign_archived");
  });
});
