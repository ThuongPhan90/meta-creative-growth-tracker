import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_RESULT_DEFINITIONS } from "@/lib/reporting/result-definition";

const mocks = vi.hoisted(() => ({
  getApplicationContextSnapshot: vi.fn(),
  createTrackerRepository: vi.fn(),
  evaluateMetaConnectionLifecycle: vi.fn(() => "healthy"),
  SourcesV2: vi.fn(() => null),
}));

vi.mock("@/lib/app-data", () => ({
  getApplicationContextSnapshot: mocks.getApplicationContextSnapshot,
}));

vi.mock("@/lib/db", () => ({
  createTrackerRepository: mocks.createTrackerRepository,
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
  const listResultDefinitions = vi.fn();
  const listResultMappings = vi.fn();

  beforeEach(() => {
    vi.stubEnv("UI_VERSION", "v2");
    vi.clearAllMocks();
    listResultDefinitions.mockResolvedValue(
      DEFAULT_RESULT_DEFINITIONS,
    );
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
    mocks.createTrackerRepository.mockResolvedValue({
      listResultDefinitions,
      listResultMappings,
    });
    mocks.getApplicationContextSnapshot.mockResolvedValue(snapshot);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("hydrates live definitions from independent repository reads", async () => {
    const registry = await loadSourcesResultRegistry(
      snapshot as never,
    );

    expect(mocks.createTrackerRepository).toHaveBeenCalledOnce();
    expect(listResultDefinitions).toHaveBeenCalledOnce();
    expect(listResultMappings).toHaveBeenCalledOnce();
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
    expect(mocks.createTrackerRepository).not.toHaveBeenCalled();
  });

  it("shows an explicit built-in fallback warning when live DB reads fail", async () => {
    listResultDefinitions.mockRejectedValue(
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
