import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_RESULT_DEFINITIONS } from "@/lib/reporting/result-definition";

const mocks = vi.hoisted(() => ({
  getApplicationAssetsSnapshot: vi.fn(),
  getApplicationResultRegistry: vi.fn(),
  evaluateMetaConnectionLifecycle: vi.fn(() => "healthy"),
  SourcesV2: vi.fn(() => null),
}));

vi.mock("@/lib/app-data", () => ({
  getApplicationAssetsSnapshot: mocks.getApplicationAssetsSnapshot,
  getApplicationResultRegistry: mocks.getApplicationResultRegistry,
}));

vi.mock("@/lib/meta", () => ({
  evaluateMetaConnectionLifecycle:
    mocks.evaluateMetaConnectionLifecycle,
}));

vi.mock("@/components/sources-v2", () => ({
  SourcesV2: mocks.SourcesV2,
}));

vi.mock("@/components/connection-view", () => ({
  ConnectionView: () => null,
}));

import SourcesPage, { loadSourcesResultRegistry } from "./page";

const snapshot = {
  demoMode: false,
  authenticated: true,
  configuredForLive: true,
  connection: {
    connectionId: "connection_1",
    status: "connected",
    metaUserName: "Owner",
    tokenExpiresAt: null,
    dataAccessExpiresAt: null,
  },
  dashboard: {
    counts: { businesses: 1, adAccounts: 1, pages: 0 },
  },
  assets: [],
  reportingScope: {
    selected: {
      businessIds: ["biz_1"],
      adAccountIds: ["act_1"],
    },
  },
};

describe("Sources page result registry loading", () => {
  beforeEach(() => {
    vi.stubEnv("UI_VERSION", "v2");
    vi.clearAllMocks();
    mocks.getApplicationResultRegistry.mockResolvedValue({
      definitions: DEFAULT_RESULT_DEFINITIONS.filter(
        (definition) => definition.enabled,
      ).map((definition) =>
        definition.canonicalKey === "lead"
          ? { ...definition, rawActionTypes: ["owner_lead"] }
          : definition,
      ),
      mappings: [
        {
          id: "mapping_1",
          canonicalResultKey: "lead",
          rawActionType: "owner_lead",
          metricSource: "action",
          priority: 0,
          mappingSource: "owner",
          enabled: true,
        },
      ],
    });
    mocks.getApplicationAssetsSnapshot.mockResolvedValue(snapshot);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reuses the Result registry loaded by the application context", async () => {
    const registry = await loadSourcesResultRegistry(
      snapshot as never,
    );

    expect(mocks.getApplicationResultRegistry).toHaveBeenCalledWith(
      snapshot,
    );
    expect(registry).toMatchObject({
      source: "database",
      warning: null,
    });
    expect(
      registry.definitions.find(
        (definition) => definition.canonicalKey === "lead",
      )?.rawActionTypes,
    ).toEqual(["owner_lead"]);
  });

  it("passes snapshot scope and hydrated registry to SourcesV2", async () => {
    const element = await SourcesPage({
      searchParams: Promise.resolve({ tab: "results" }),
    });

    expect(element.props.activeTab).toBe("results");
    expect(element.props.reportingScope).toBe(
      snapshot.reportingScope,
    );
    expect(element.props.resultRegistry.source).toBe("database");
    expect(element.props.scopePersistEnabled).toBe(true);
    expect(mocks.getApplicationAssetsSnapshot).toHaveBeenCalledOnce();
  });

  it("accepts the final /sources?tab=scope route while preserving the internal panel key", async () => {
    const element = await SourcesPage({
      searchParams: Promise.resolve({ tab: "scope" }),
    });

    expect(element.props.activeTab).toBe("reporting-scope");
  });

  it("uses built-in defaults in demo without opening the database", async () => {
    const registry = await loadSourcesResultRegistry({
      ...snapshot,
      demoMode: true,
      authenticated: false,
      connection: null,
    } as never);

    expect(registry.source).toBe("built_in_defaults");
    expect(registry.warning).toBeNull();
    expect(
      registry.definitions.some(
        (definition) => definition.canonicalKey === "install",
      ),
    ).toBe(true);
    expect(mocks.getApplicationResultRegistry).not.toHaveBeenCalled();
  });

  it("shows an explicit built-in fallback warning when live DB reads fail", async () => {
    mocks.getApplicationResultRegistry.mockRejectedValue(
      new Error("relation unavailable"),
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const registry = await loadSourcesResultRegistry(
      snapshot as never,
    );

    expect(registry.source).toBe("built_in_defaults");
    expect(registry.warning).toContain("built-in defaults");
    consoleError.mockRestore();
  });
});
