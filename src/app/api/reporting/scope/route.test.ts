import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireOwnerDetailContext: vi.fn(),
  detailErrorResponse: vi.fn(
    () => Response.json({ ok: false }, { status: 500 }),
  ),
  assertLiveMode: vi.fn(),
  assertSameOrigin: vi.fn(),
}));

vi.mock("@/lib/detail-api", () => ({
  requireOwnerDetailContext: mocks.requireOwnerDetailContext,
  detailErrorResponse: mocks.detailErrorResponse,
}));

vi.mock("@/lib/server", () => ({
  assertLiveMode: mocks.assertLiveMode,
  assertSameOrigin: mocks.assertSameOrigin,
}));

import { GET, POST } from "./route";

const appUrl = "https://tracker.example";
const inventory = {
  businesses: [
    {
      id: "biz_1",
      name: "Business One",
      isActive: true,
      adAccountIds: ["act_1"],
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
      id: "act_orphan",
      name: "Unassigned Account",
      isActive: true,
      accountStatus: 1,
      currency: "VND",
      timezone: "Asia/Ho_Chi_Minh",
      businessIds: [],
    },
  ],
};
const persisted = {
  businessIds: ["biz_1"],
  adAccountIds: ["act_1"],
  confirmedAt: "2026-07-31T01:00:00.000Z",
  updatedAt: "2026-07-31T01:00:00.000Z",
};

describe("/api/reporting/scope", () => {
  const listReportingScopeInventory = vi.fn();
  const getReportingScope = vi.fn();
  const saveReportingScope = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    listReportingScopeInventory.mockResolvedValue(inventory);
    getReportingScope.mockResolvedValue(persisted);
    saveReportingScope.mockImplementation(
      (input: {
        businessIds: string[];
        adAccountIds: string[];
      }) => ({
        businessIds: input.businessIds,
        adAccountIds: input.adAccountIds,
        confirmedAt: "2026-07-31T02:00:00.000Z",
        updatedAt: "2026-07-31T02:00:00.000Z",
      }),
    );
    mocks.requireOwnerDetailContext.mockResolvedValue({
      connection: { connectionId: "connection-1" },
      repository: {
        listReportingScopeInventory,
        getReportingScope,
        saveReportingScope,
      },
    });
  });

  it("returns owner-scoped available and persisted selections", async () => {
    const response = await GET(
      new NextRequest(`${appUrl}/api/reporting/scope`),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store",
    );
    expect(mocks.requireOwnerDetailContext).toHaveBeenCalledOnce();
    expect(body.scope).toMatchObject({
      available: {
        businesses: [{ id: "biz_1" }],
        adAccounts: [
          { id: "act_1", isOrphan: false },
          { id: "act_orphan", isOrphan: true },
        ],
      },
      selected: {
        businessIds: ["biz_1"],
        adAccountIds: ["act_1"],
        source: {
          businesses: "persisted",
          adAccounts: "persisted",
        },
      },
    });
  });

  it("uses plural URL scope as the read authority without persisting it", async () => {
    const response = await GET(
      new NextRequest(
        `${appUrl}/api/reporting/scope?business_ids=&account_ids=act_orphan`,
      ),
    );
    const body = await response.json();

    expect(body.scope.selected).toMatchObject({
      businessIds: [],
      adAccountIds: ["act_orphan"],
      source: {
        businesses: "url",
        adAccounts: "url",
      },
    });
    expect(saveReportingScope).not.toHaveBeenCalled();
  });

  it("persists an explicitly selected orphan account", async () => {
    const response = await POST(
      new NextRequest(`${appUrl}/api/reporting/scope`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: appUrl,
        },
        body: JSON.stringify({
          businessIds: [],
          adAccountIds: ["act_orphan"],
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.assertSameOrigin).toHaveBeenCalledOnce();
    expect(mocks.assertLiveMode).toHaveBeenCalledOnce();
    expect(saveReportingScope).toHaveBeenCalledWith({
      connectionId: "connection-1",
      businessIds: [],
      adAccountIds: ["act_orphan"],
    });
    expect(body.scope.available.adAccounts[1]).toMatchObject({
      id: "act_orphan",
      selected: true,
      isOrphan: true,
    });
  });

  it("rejects members outside the current owner connection", async () => {
    const response = await POST(
      new NextRequest(`${appUrl}/api/reporting/scope`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: appUrl,
        },
        body: JSON.stringify({
          businessIds: ["biz_missing"],
          adAccountIds: ["act_missing"],
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      ok: false,
      code: "INVALID_REPORTING_SCOPE",
      invalidBusinessIds: ["biz_missing"],
      invalidAdAccountIds: ["act_missing"],
    });
    expect(saveReportingScope).not.toHaveBeenCalled();
  });

  it("rejects malformed input before opening the owner repository", async () => {
    const response = await POST(
      new NextRequest(`${appUrl}/api/reporting/scope`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: appUrl,
        },
        body: JSON.stringify({ businessIds: "biz_1" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.requireOwnerDetailContext).not.toHaveBeenCalled();
    expect(saveReportingScope).not.toHaveBeenCalled();
  });
});
