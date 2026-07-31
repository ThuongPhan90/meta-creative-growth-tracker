import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { DEFAULT_RESULT_DEFINITIONS } from "@/lib/reporting";

const mocks = vi.hoisted(() => ({
  requireOwnerDetailSnapshot: vi.fn(),
  resolveSnapshotReportingRequest: vi.fn(),
  detailErrorResponse: vi.fn(() =>
    Response.json(
      { code: "OWNER_SESSION_REQUIRED" },
      {
        status: 401,
        headers: {
          "Cache-Control": "private, no-store",
          Vary: "Cookie",
        },
      },
    ),
  ),
}));

vi.mock("@/lib/detail-api", () => ({
  requireOwnerDetailSnapshot:
    mocks.requireOwnerDetailSnapshot,
  detailErrorResponse: mocks.detailErrorResponse,
}));
vi.mock("@/lib/reporting/snapshot-reporting-request", () => ({
  resolveSnapshotReportingRequest:
    mocks.resolveSnapshotReportingRequest,
}));

import { GET } from "./route";

describe("GET /api/result-definitions", () => {
  const listResultDefinitions = vi.fn();
  const listResultMappings = vi.fn();
  const listCampaignResultOverrides = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveSnapshotReportingRequest.mockReturnValue({
      context: {
        businessIds: ["bm_1"],
        adAccountIds: ["act_1"],
        dateFrom: "2026-07-01",
        dateTo: "2026-07-31",
        compareMode: "none",
        objectiveKey: "all",
        currency: "USD",
        currencyMode: "single",
        reportingTimezoneMode: "account_local",
        attributionSettingKey: "account_default",
        actionReportTime: "mixed",
        syncVersion: "sync_1",
      },
      warnings: [],
    });
    listResultDefinitions.mockResolvedValue(
      DEFAULT_RESULT_DEFINITIONS,
    );
    listResultMappings.mockResolvedValue([
      {
        id: "mapping_1",
        canonicalResultKey: "purchase",
        rawActionType: "owner_purchase",
        metricSource: "action",
        priority: 0,
        mappingSource: "owner",
        enabled: true,
      },
    ]);
    listCampaignResultOverrides.mockResolvedValue([]);
    mocks.requireOwnerDetailSnapshot.mockResolvedValue({
      connection: { connectionId: "connection_1" },
      repository: {
        listResultDefinitions,
        listResultMappings,
        listCampaignResultOverrides,
      },
      snapshot: {
        freshness: {
          dataThroughAt: "2026-07-30T23:59:59.000Z",
          lastSyncedAt: "2026-07-31T08:14:00.000Z",
          syncStatus: "healthy",
        },
      },
    });
  });

  it("prefers hydrated database definitions filtered by objective", async () => {
    const response = await GET(
      new NextRequest(
        "https://tracker.example/api/result-definitions" +
          "?objective=OUTCOME_SALES",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store",
    );
    expect(body.data.source).toBe("database");
    expect(body.data.objectiveKey).toBe("sales");
    expect(
      body.data.resultDefinitions.map(
        (definition: { canonicalKey: string }) =>
          definition.canonicalKey,
      ),
    ).toEqual(["purchase", "purchase_value"]);
    expect(body.data.resultDefinitions[0].rawActionTypes).toEqual([
      "owner_purchase",
    ]);
    expect(body.meta.context).toMatchObject({
      objectiveKey: "sales",
      syncVersion: "sync_1",
    });
    expect(body.meta).toMatchObject({
      dataThrough: "2026-07-30",
      lastSuccessfulSyncAt: "2026-07-31T08:14:00.000Z",
      syncStatus: "completed",
      warnings: [],
    });
    expect(body.meta.coverage.resultDefinitions).toMatchObject({
      covered: 2,
      total: 2,
      ratio: 1,
    });
    expect(body).not.toHaveProperty("warnings");
    expect(body).not.toHaveProperty("ok");
  });

  it("falls back to built-ins with an explicit warning", async () => {
    listResultDefinitions.mockRejectedValue(
      new Error("relation does not exist"),
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const response = await GET(
      new NextRequest(
        "https://tracker.example/api/result-definitions" +
          "?objective=OUTCOME_APP_PROMOTION",
      ),
    );
    const body = await response.json();

    expect(body.data.source).toBe("built_in_defaults");
    expect(
      body.data.resultDefinitions.map(
        (definition: { canonicalKey: string }) =>
          definition.canonicalKey,
      ),
    ).toContain("install");
    expect(body.meta.warnings).toContainEqual(
      expect.objectContaining({
        code: "RESULT_REGISTRY_FALLBACK",
        source: "reporting",
      }),
    );
    consoleError.mockRestore();
  });

  it("requires an owner-bound detail context", async () => {
    const error = new Error("OWNER_SESSION_REQUIRED");
    mocks.requireOwnerDetailSnapshot.mockRejectedValue(error);

    const response = await GET(
      new NextRequest(
        "https://tracker.example/api/result-definitions",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      code: "OWNER_SESSION_REQUIRED",
    });
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store",
    );
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(mocks.detailErrorResponse).toHaveBeenCalledWith(error);
  });
});
