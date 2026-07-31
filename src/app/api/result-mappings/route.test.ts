import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { DEFAULT_RESULT_DEFINITIONS } from "@/lib/reporting";

const mocks = vi.hoisted(() => ({
  requireOwnerDetailSnapshot: vi.fn(),
  resolveSnapshotReportingRequest: vi.fn(),
  detailErrorResponse: vi.fn(
    () => Response.json({ ok: false }, { status: 500 }),
  ),
  assertLiveMode: vi.fn(),
  assertSameOrigin: vi.fn(),
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

vi.mock("@/lib/server", () => ({
  assertLiveMode: mocks.assertLiveMode,
  assertSameOrigin: mocks.assertSameOrigin,
}));

import { POST } from "./route";

const appUrl = "https://tracker.example";

function request(mappings: unknown) {
  return new NextRequest(`${appUrl}/api/result-mappings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: appUrl,
    },
    body: JSON.stringify({ mappings }),
  });
}

describe("POST /api/result-mappings", () => {
  const listResultDefinitions = vi.fn();
  const saveResultMappings = vi.fn();

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
    saveResultMappings.mockImplementation(
      (input: {
        mappings: Array<{
          canonicalResultKey: string;
          rawActionType: string;
          metricSource: "action" | "action_value";
          priority: number;
          enabled: boolean;
        }>;
      }) =>
        input.mappings.map((mapping, index) => ({
          id: String(index + 1),
          ...mapping,
          mappingSource: "owner",
        })),
    );
    mocks.requireOwnerDetailSnapshot.mockResolvedValue({
      connection: { connectionId: "connection_1" },
      repository: {
        listResultDefinitions,
        saveResultMappings,
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

  it("saves validated owner mappings without writing to Meta", async () => {
    const response = await POST(
      request([
        {
          canonicalResultKey: "purchase",
          rawActionType: " owner_purchase ",
          metricSource: "action",
          priority: 0,
          enabled: true,
        },
        {
          canonicalResultKey: "purchase_value",
          rawActionType: "owner_purchase",
          metricSource: "action_value",
          priority: 0,
          enabled: true,
        },
      ]),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store",
    );
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(mocks.assertSameOrigin).toHaveBeenCalledOnce();
    expect(mocks.assertLiveMode).toHaveBeenCalledOnce();
    expect(
      mocks.requireOwnerDetailSnapshot,
    ).toHaveBeenCalledOnce();
    expect(saveResultMappings).toHaveBeenCalledWith({
      connectionId: "connection_1",
      mappings: [
        {
          canonicalResultKey: "purchase",
          rawActionType: "owner_purchase",
          metricSource: "action",
          priority: 0,
          enabled: true,
        },
        {
          canonicalResultKey: "purchase_value",
          rawActionType: "owner_purchase",
          metricSource: "action_value",
          priority: 0,
          enabled: true,
        },
      ],
    });
    expect(body.data.metaWritePerformed).toBe(false);
    expect(body.data.message).toBe(
      "Đã lưu Result Mapping cho báo cáo chỉ đọc.",
    );
    expect(body.meta.context).toMatchObject({
      adAccountIds: ["act_1"],
      syncVersion: "sync_1",
    });
    expect(body.meta).toMatchObject({
      dataThrough: "2026-07-30",
      lastSuccessfulSyncAt: "2026-07-31T08:14:00.000Z",
      syncStatus: "completed",
      warnings: [],
    });
    expect(body).not.toHaveProperty("ok");
  });

  it("rejects raw action ownership conflicts before the transaction", async () => {
    const response = await POST(
      request([
        {
          canonicalResultKey: "purchase",
          rawActionType: "purchase",
          metricSource: "action",
          priority: 0,
          enabled: true,
        },
        {
          canonicalResultKey: "lead",
          rawActionType: "purchase",
          metricSource: "action",
          priority: 0,
          enabled: true,
        },
      ]),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("RAW_ACTION_OWNERSHIP_CONFLICT");
    expect(saveResultMappings).not.toHaveBeenCalled();
  });

  it("rejects unknown result definitions before persistence", async () => {
    const response = await POST(
      request([
        {
          canonicalResultKey: "made_up_result",
          rawActionType: "purchase",
          metricSource: "action",
          priority: 0,
          enabled: true,
        },
      ]),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("UNKNOWN_RESULT_DEFINITION");
    expect(saveResultMappings).not.toHaveBeenCalled();
  });

  it("rejects malformed or empty replacement sets", async () => {
    const response = await POST(request([]));

    expect(response.status).toBe(400);
    expect(saveResultMappings).not.toHaveBeenCalled();
  });
});
