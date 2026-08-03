import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TrackerSettings } from "@/lib/db";
import { DEFAULT_RESULT_DEFINITIONS } from "@/lib/reporting/result-definition";

const mocks = vi.hoisted(() => ({
  getApplicationContextSnapshot: vi.fn(),
  createTrackerRepository: vi.fn(),
  SettingsV2: vi.fn(() => null),
}));

vi.mock("@/lib/app-data", () => ({
  getApplicationContextSnapshot: mocks.getApplicationContextSnapshot,
}));

vi.mock("@/lib/db", () => ({
  createTrackerRepository: mocks.createTrackerRepository,
}));

vi.mock("@/components/settings-v2", () => ({
  SettingsV2: mocks.SettingsV2,
}));

import SettingsPage from "./page";

const settings: TrackerSettings = {
  ownerId: 1,
  reportingTimezone: "Asia/Ho_Chi_Minh",
  reportingCurrency: null,
  syncLookbackDays: 30,
  minimumInstallThreshold: 20,
  minimumRegistrationThreshold: 10,
  benchmarkMode: "custom",
  benchmarkWindowDays: 30,
  benchmarkByOs: true,
  benchmarkByFormat: true,
  numberFormat: "vi-VN",
  compareDefault: "previous_period",
  scoringWeights: { cpi: 40, cpa: 40, hook: 10, hold: 10 },
  syncCadence: "deployment",
  alertChannel: "none",
  installActionTypes: ["mobile_app_install"],
  registrationActionTypes: ["complete_registration"],
  metricDisplayPresets: { version: 1, presets: {} },
  lastInitialSyncAt: null,
  updatedAt: "2026-07-31T00:00:00.000Z",
};

const snapshot = {
  demoMode: false,
  authenticated: true,
  configuredForLive: true,
  connection: {
    connectionId: "connection_1",
    status: "connected",
    tokenExpiresAt: null,
    dataAccessExpiresAt: null,
    grantedScopes: ["ads_read"],
  },
  reportingScope: {
    selected: {
      businessIds: ["biz_1"],
      adAccountIds: ["act_1", "act_2"],
    },
  },
  freshness: {
    syncVersion: "sync_42",
  },
  settings: {
    timezone: "Asia/Ho_Chi_Minh",
    currency: null,
    lookbackDays: 30,
    minimumInstallThreshold: 20,
    installActionTypes: ["mobile_app_install"],
    registrationActionTypes: ["complete_registration"],
  },
};

describe("Settings page V2 contract loading", () => {
  const getSettings = vi.fn();
  const listSettingsAuditLog = vi.fn();
  const listResultDefinitions = vi.fn();
  const listResultMappings = vi.fn();
  const listCampaignResultOverrides = vi.fn();

  beforeEach(() => {
    vi.stubEnv("UI_VERSION", "v2");
    vi.clearAllMocks();
    getSettings.mockResolvedValue(settings);
    listSettingsAuditLog.mockResolvedValue([]);
    listResultDefinitions.mockResolvedValue(DEFAULT_RESULT_DEFINITIONS);
    listResultMappings.mockResolvedValue([
      {
        id: "mapping_1",
        canonicalResultKey: "lead",
        rawActionType: "owner_lead",
        metricSource: "action",
        priority: 0,
        mappingSource: "owner",
        enabled: true,
      },
    ]);
    listCampaignResultOverrides.mockResolvedValue([
      {
        campaignId: "campaign_1",
        canonicalResultKey: "lead",
        enabled: true,
      },
    ]);
    mocks.createTrackerRepository.mockResolvedValue({
      getSettings,
      listSettingsAuditLog,
      listResultDefinitions,
      listResultMappings,
      listCampaignResultOverrides,
    });
    mocks.getApplicationContextSnapshot.mockResolvedValue(snapshot);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("maps the legacy events URL to Results and loads independent registry reads", async () => {
    const element = await SettingsPage({
      searchParams: Promise.resolve({ tab: "events" }),
    });

    expect(element.props.activeTab).toBe("results");
    expect(mocks.createTrackerRepository).toHaveBeenCalledOnce();
    expect(getSettings).toHaveBeenCalledOnce();
    expect(listSettingsAuditLog).toHaveBeenCalledOnce();
    expect(listResultDefinitions).toHaveBeenCalledOnce();
    expect(listResultMappings).toHaveBeenCalledOnce();
    expect(listCampaignResultOverrides).toHaveBeenCalledWith(
      "connection_1",
    );
    expect(element.props.resultRegistry).toMatchObject({
      source: "database",
      warning: null,
      campaignOverrides: [
        {
          campaignId: "campaign_1",
          canonicalResultKey: "lead",
        },
      ],
    });
    expect(
      element.props.resultRegistry.definitions.find(
        (definition: { canonicalKey: string }) =>
          definition.canonicalKey === "lead",
      ).rawActionTypes,
    ).toEqual(["owner_lead"]);
    expect(element.props.reportingContract).toEqual({
      reportingTimezoneMode: "account_local",
      currencyMode: "split",
      businessIds: ["biz_1"],
      adAccountIds: ["act_1", "act_2"],
      defaultObjectiveKey: "all",
      defaultPrimaryResultKey: null,
      attributionSettingKey: "account_default",
      actionReportTime: "mixed",
      syncVersion: "sync_42",
    });
  });

  it("keeps Settings available and labels built-in fallback when registry reads fail", async () => {
    listResultDefinitions.mockRejectedValue(
      new Error("result table unavailable"),
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const element = await SettingsPage({
      searchParams: Promise.resolve({ tab: "results" }),
    });

    expect(element.props.resultRegistry.source).toBe(
      "built_in_defaults",
    );
    expect(element.props.resultRegistry.warning).toContain(
      "built-in defaults",
    );
    expect(element.props.initial).toBe(settings);
    expect(
      element.props.resultRegistry.definitions.some(
        (definition: { canonicalKey: string }) =>
          definition.canonicalKey === "install",
      ),
    ).toBe(true);
    consoleError.mockRestore();
  });

  it("uses read-only built-in definitions in demo without opening the database", async () => {
    mocks.getApplicationContextSnapshot.mockResolvedValue({
      ...snapshot,
      demoMode: true,
      authenticated: false,
      connection: null,
    });

    const element = await SettingsPage({
      searchParams: Promise.resolve({ tab: "results" }),
    });

    expect(mocks.createTrackerRepository).not.toHaveBeenCalled();
    expect(element.props.resultRegistry.source).toBe(
      "built_in_defaults",
    );
    expect(element.props.resultRegistry.warning).toBeNull();
    expect(element.props.canSave).toBe(false);
  });
});
