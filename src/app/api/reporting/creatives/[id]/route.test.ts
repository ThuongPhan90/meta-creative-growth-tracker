import { describe, expect, it, vi } from "vitest";

vi.mock("../../../creative-families/[id]/route", () => ({
  GET: vi.fn(),
}));

import { reportingCreativeDetailEnvelope } from "./route";

describe("reporting Creative detail response", () => {
  it("promotes the exact context and freshness into common metadata", () => {
    const response = reportingCreativeDetailEnvelope({
      creative_family_id: "cf_111111111111111111111111",
      reporting_context: {
        business_ids: ["bm_1"],
        ad_account_ids: ["act_1"],
        date_from: "2026-07-01",
        date_to: "2026-07-31",
        compare_mode: "previous_period",
        objective_key: "outcome_leads",
        primary_result_key: "lead",
        currency: "USD",
        currency_mode: "single",
        reporting_timezone_mode: "account_local",
        attribution_setting_key: "7d_click_1d_view",
        action_report_time: "conversion",
        sync_version: "sync_42",
      },
      freshness: {
        last_synced_at: "2026-07-31T08:14:00.000Z",
        data_through_at: "2026-07-30T23:59:59.000Z",
        sync_status: "warning",
      },
      usage_summary: { linked_ads: 2 },
      entity_links: { campaign_ids: ["campaign_1"] },
    });

    expect(response).not.toHaveProperty("ok");
    expect(response.meta.context).toMatchObject({
      businessIds: ["bm_1"],
      adAccountIds: ["act_1"],
      objectiveKey: "outcome_leads",
      primaryResultKey: "lead",
      currency: "USD",
      actionReportTime: "conversion",
      syncVersion: "sync_42",
    });
    expect(response.meta).toMatchObject({
      dataThrough: "2026-07-30",
      lastSuccessfulSyncAt: "2026-07-31T08:14:00.000Z",
      syncStatus: "completed_with_warnings",
      warnings: [],
    });
  });

  it("makes missing hierarchy linkage fail visibly", () => {
    const response = reportingCreativeDetailEnvelope({
      creative_family_id: "cf_222222222222222222222222",
      reporting_context: {
        business_ids: [],
        ad_account_ids: ["act_2"],
        date_from: "2026-07-01",
        date_to: "2026-07-31",
        compare_mode: "none",
        objective_key: "all",
        primary_result_key: null,
        currency: null,
        currency_mode: "split",
        reporting_timezone_mode: "account_local",
        attribution_setting_key: "account_default",
        action_report_time: "mixed",
        sync_version: "sync_43",
      },
      freshness: {
        last_synced_at: null,
        data_through_at: null,
        sync_status: "partial",
      },
      usage_summary: { linked_ads: 0 },
      entity_links: { campaign_ids: [] },
    });

    expect(response.meta.coverage.adLinkage.ratio).toBe(0);
    expect(response.meta.coverage.campaignLinkage.ratio).toBe(0);
    expect(response.meta.warnings[0]?.code).toBe(
      "CREATIVE_DETAIL_LINKAGE_GAP",
    );
  });
});
