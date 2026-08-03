import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getApplicationOperationalSnapshot: vi.fn(),
  setupWizard: vi.fn(() => null),
}));

vi.mock("@/lib/app-data", () => ({
  getApplicationOperationalSnapshot:
    mocks.getApplicationOperationalSnapshot,
}));

vi.mock("@/components/setup-wizard", () => ({
  SetupWizard: mocks.setupWizard,
}));

import SetupPage from "./page";

describe("Setup page data contract", () => {
  beforeEach(() => {
    vi.stubEnv("APP_URL", "https://tracker.example");
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses operational health so partial discovery can unlock initial sync", async () => {
    const checks = [{ id: "sync", status: "ready" }];
    mocks.getApplicationOperationalSnapshot.mockResolvedValue({
      setupChecks: checks,
    });

    const element = await SetupPage();

    expect(
      mocks.getApplicationOperationalSnapshot,
    ).toHaveBeenCalledOnce();
    expect(element.type).toBe(mocks.setupWizard);
    expect(element.props.checks).toBe(checks);
    expect(element.props.callbackUrl).toBe(
      "https://tracker.example/api/auth/meta/callback",
    );
  });
});
