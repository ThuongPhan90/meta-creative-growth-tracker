import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createTrackerRepository: vi.fn(),
  assertLiveMode: vi.fn(),
  assertOwnerSessionBinding: vi.fn(),
  assertSameOrigin: vi.fn(),
  requireOwnerSession: vi.fn(() => ({ connectionId: "connection-1" })),
  routeErrorResponse: vi.fn(() => {
    throw new Error("Unexpected route error.");
  }),
}));

vi.mock("@/lib/db", () => ({
  createTrackerRepository: mocks.createTrackerRepository,
}));

vi.mock("@/lib/server", () => ({
  assertLiveMode: mocks.assertLiveMode,
  assertOwnerSessionBinding: mocks.assertOwnerSessionBinding,
  assertSameOrigin: mocks.assertSameOrigin,
  requireOwnerSession: mocks.requireOwnerSession,
  routeErrorResponse: mocks.routeErrorResponse,
}));

import { POST } from "./route";

const appUrl = "https://tracker.example";

function settingsRequest(overrides: Record<string, unknown> = {}) {
  return new NextRequest(`${appUrl}/api/settings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: appUrl,
    },
    body: JSON.stringify({
      timezone: "Asia/Ho_Chi_Minh",
      lookbackDays: 30,
      minimumInstallThreshold: 10,
      installActionTypes: ["mobile_app_install"],
      registrationActionTypes: ["complete_registration"],
      ...overrides,
    }),
  });
}

describe("settings route action type mapping", () => {
  const updateSettings = vi.fn(
    (input: {
      reportingTimezone: string;
      syncLookbackDays: number;
      minimumInstallThreshold: number;
      installActionTypes: string[];
      registrationActionTypes: string[];
    }) => ({
      reportingTimezone: input.reportingTimezone,
      syncLookbackDays: input.syncLookbackDays,
      minimumInstallThreshold: input.minimumInstallThreshold,
      installActionTypes: input.installActionTypes,
      registrationActionTypes: input.registrationActionTypes,
    }),
  );

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createTrackerRepository.mockResolvedValue({
      getConnection: vi.fn().mockResolvedValue({
        connectionId: "connection-1",
      }),
      updateSettings,
    });
  });

  it("trims and deduplicates action types before saving", async () => {
    const response = await POST(
      settingsRequest({
        installActionTypes: [
          " mobile_app_install ",
          "mobile_app_install",
          " omni_app_install ",
          " ",
        ],
        registrationActionTypes: [
          " complete_registration ",
          "complete_registration",
        ],
      }),
    );

    expect(response.status).toBe(200);
    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        installActionTypes: [
          "mobile_app_install",
          "omni_app_install",
        ],
        registrationActionTypes: ["complete_registration"],
      }),
    );
  });

  it("rejects an action type present in both groups before saving", async () => {
    const response = await POST(
      settingsRequest({
        installActionTypes: [
          "mobile_app_install",
          " complete_registration ",
        ],
        registrationActionTypes: ["complete_registration"],
      }),
    );
    const body = (await response.json()) as {
      ok: boolean;
      code: string;
      error: string;
    };

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      ok: false,
      code: "ACTION_TYPE_MAPPING_CONFLICT",
    });
    expect(body.error).toContain('"complete_registration"');
    expect(body.error).toContain("cả Install và Registration");
    expect(mocks.createTrackerRepository).not.toHaveBeenCalled();
    expect(updateSettings).not.toHaveBeenCalled();
  });
});
