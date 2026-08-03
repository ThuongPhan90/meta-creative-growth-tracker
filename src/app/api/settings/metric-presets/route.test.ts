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

vi.mock("@/lib/db", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db")>(
    "@/lib/db",
  );
  return {
    ...actual,
    createTrackerRepository: mocks.createTrackerRepository,
  };
});

vi.mock("@/lib/server", () => ({
  assertLiveMode: mocks.assertLiveMode,
  assertOwnerSessionBinding: mocks.assertOwnerSessionBinding,
  assertSameOrigin: mocks.assertSameOrigin,
  requireOwnerSession: mocks.requireOwnerSession,
  routeErrorResponse: mocks.routeErrorResponse,
}));

import { SettingsUpdateConflictError } from "@/lib/db/errors";
import { DEFAULT_RESULT_DEFINITIONS } from "@/lib/reporting";
import { GET, PATCH } from "./route";

const appUrl = "https://tracker.example";
const updatedAt = "2026-08-01T10:00:00.000Z";

const settings = {
  ownerId: 1,
  reportingTimezone: "Asia/Ho_Chi_Minh",
  reportingCurrency: "VND",
  syncLookbackDays: 30,
  minimumInstallThreshold: 20,
  minimumRegistrationThreshold: 10,
  benchmarkMode: "os" as const,
  benchmarkWindowDays: 30,
  benchmarkByOs: true,
  benchmarkByFormat: true,
  numberFormat: "vi-VN" as const,
  compareDefault: "previous_period" as const,
  scoringWeights: { cpi: 40, cpa: 40, hook: 10, hold: 10 },
  syncCadence: "manual" as const,
  alertChannel: "none" as const,
  installActionTypes: ["mobile_app_install"],
  registrationActionTypes: ["complete_registration"],
  metricDisplayPresets: { version: 1 as const, presets: {} },
  lastInitialSyncAt: null,
  updatedAt,
};

function request(
  method: "GET" | "PATCH",
  body?: Record<string, unknown>,
) {
  return new NextRequest(`${appUrl}/api/settings/metric-presets`, {
    method,
    headers: body
      ? {
          "Content-Type": "application/json",
          Origin: appUrl,
        }
      : undefined,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("metric preset settings API", () => {
  const updateSettings = vi.fn(async (input: Record<string, unknown>) => ({
    ...settings,
    metricDisplayPresets: input.metricDisplayPresets,
    updatedAt: "2026-08-01T10:01:00.000Z",
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createTrackerRepository.mockResolvedValue({
      getConnection: vi.fn().mockResolvedValue({
        connectionId: "connection-1",
      }),
      getSettings: vi.fn().mockResolvedValue(settings),
      listResultDefinitions: vi
        .fn()
        .mockResolvedValue(DEFAULT_RESULT_DEFINITIONS),
      updateSettings,
    });
  });

  it("returns only the owner-scoped versioned preference with no-store headers", async () => {
    const response = await GET(request("GET"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      metricDisplayPresets: { version: 1, presets: {} },
      updatedAt,
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.assertOwnerSessionBinding).toHaveBeenCalledWith(
      { connectionId: "connection-1" },
      "connection-1",
    );
  });

  it("validates, canonicalizes and persists a preset only after same-origin owner checks", async () => {
    const response = await PATCH(
      request("PATCH", {
        expectedUpdatedAt: updatedAt,
        metricDisplayPresets: {
          version: 1,
          presets: {
            "sales:purchase": [
              "spend",
              "result:purchase",
              "meta_roas",
            ],
          },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.assertSameOrigin).toHaveBeenCalledOnce();
    expect(mocks.assertOwnerSessionBinding).toHaveBeenCalledOnce();
    expect(updateSettings).toHaveBeenCalledWith({
      expectedUpdatedAt: updatedAt,
      metricDisplayPresets: {
        version: 1,
        presets: {
          "sales:purchase": [
            "spend",
            "result:purchase",
            "efficiency:purchase",
            "efficiency:purchase_value",
          ],
        },
      },
    });
  });

  it("rejects arbitrary account/date identities before writing settings", async () => {
    const response = await PATCH(
      request("PATCH", {
        expectedUpdatedAt: updatedAt,
        metricDisplayPresets: {
          version: 1,
          presets: { "sales:purchase": ["account:act_123"] },
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "UNKNOWN_METRIC_IDENTITY",
    });
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("returns a conflict instead of silently overwriting a newer tab", async () => {
    updateSettings.mockRejectedValueOnce(new SettingsUpdateConflictError());

    const response = await PATCH(
      request("PATCH", {
        expectedUpdatedAt: updatedAt,
        metricDisplayPresets: { version: 1, presets: {} },
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "SETTINGS_CONFLICT",
    });
  });
});
