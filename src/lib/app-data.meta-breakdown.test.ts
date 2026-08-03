import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server", () => ({}));
vi.mock("@/lib/db", () => ({
  createTrackerRepository: vi.fn(),
}));

import {
  getMetaBreakdownForReport,
  type ApplicationSnapshot,
} from "./app-data";
import type { MetaBreakdownMetricRow, MetaConnectionRecord } from "./db";
import type { ReportingContext } from "./reporting";

const connection: MetaConnectionRecord = {
  connectionId: "connection-1",
  ownerId: 1,
  metaUserId: "meta-user-1",
  metaUserName: "Owner",
  grantedScopes: ["ads_read"],
  declinedScopes: [],
  tokenExpiresAt: "2099-01-01T00:00:00.000Z",
  dataAccessExpiresAt: "2099-01-01T00:00:00.000Z",
  status: "connected",
  lastValidatedAt: null,
  lastErrorCode: null,
  lastErrorMessage: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const snapshot = {
  demoMode: false,
  authenticated: true,
  configuredForLive: true,
  connection,
  freshness: {
    lastSyncedAt: "2026-08-01T00:00:00.000Z",
    dataThroughAt: "2026-08-01T00:00:00.000Z",
    syncStatus: "healthy",
    freshnessSeconds: 60,
    syncMode: "manual",
    syncVersion: "run-8",
  },
  settings: {
    timezone: "Asia/Ho_Chi_Minh",
    lookbackDays: 30,
    currency: "VND",
    compareDefault: "none",
    minimumInstallThreshold: 20,
    installActionTypes: [],
    registrationActionTypes: [],
  },
} as unknown as ApplicationSnapshot;

const context: ReportingContext = {
  businessIds: [],
  adAccountIds: ["act_1"],
  dateFrom: "2026-07-01",
  dateTo: "2026-07-31",
  compareMode: "none",
  objectiveKey: "leads",
  primaryResultKey: "lead",
  currency: "VND",
  currencyMode: "single",
  reportingTimezoneMode: "account_local",
  attributionSettingKey: "account_default",
  actionReportTime: "mixed",
  syncVersion: "run-8",
};

const detailRow: MetaBreakdownMetricRow = {
  adAccountMetaId: "act_1",
  adAccountName: "Foxscore",
  campaignMetaId: "campaign-1",
  campaignName: "Lead form",
  objectiveKey: "leads",
  publisherPlatform: "facebook",
  platformPosition: "feed",
  currency: "VND",
  spend: 125000,
  impressions: 5000,
  linkClicks: 42,
};

describe("getMetaBreakdownForReport", () => {
  it("uses the exact Reporting Context and a real detail read", async () => {
    const getMetaBreakdownMetrics = vi.fn().mockResolvedValue([detailRow]);

    const result = await getMetaBreakdownForReport({
      snapshot,
      context,
      campaignMetaId: "campaign-1",
      repository: { getMetaBreakdownMetrics },
    });

    expect(getMetaBreakdownMetrics).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: "connection-1",
        dateFrom: "2026-07-01",
        dateTo: "2026-07-31",
        adAccountMetaIds: ["act_1"],
        campaignMetaIds: ["campaign-1"],
        currency: "VND",
        attributionWindow: "account_default",
        actionReportTime: "mixed",
        syncVersion: "run-8",
        objectiveRawKeys: ["LEADS", "OUTCOME_LEADS", "LEAD_GENERATION"],
      }),
    );
    expect(result.dimensions.ad_account.rows).toEqual([
      expect.objectContaining({ id: "act_1", spend: 125000 }),
    ]);
  });

  it("does not call the repository or invent a distribution for split currency", async () => {
    const getMetaBreakdownMetrics = vi.fn();

    const result = await getMetaBreakdownForReport({
      snapshot,
      context: { ...context, currency: undefined, currencyMode: "split" },
      repository: { getMetaBreakdownMetrics },
    });

    expect(getMetaBreakdownMetrics).not.toHaveBeenCalled();
    expect(result.dimensions.ad_account).toEqual({
      state: "unavailable",
      rows: [],
      reason: "split_currency",
    });
  });

  it("keeps demo mode explicitly unavailable instead of projecting its aggregate data", async () => {
    const getMetaBreakdownMetrics = vi.fn();

    const result = await getMetaBreakdownForReport({
      snapshot: { ...snapshot, demoMode: true },
      context,
      repository: { getMetaBreakdownMetrics },
    });

    expect(getMetaBreakdownMetrics).not.toHaveBeenCalled();
    expect(result.dimensions.campaign).toEqual({
      state: "unavailable",
      rows: [],
      reason: "detail_unavailable",
    });
  });
});
