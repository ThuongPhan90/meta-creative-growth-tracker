import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

import { POST } from "./route";

const appUrl = "https://tracker.example";
const ownerSetupSecret = "owner-secret-".padEnd(48, "o");

function ownerRequest(setupSecret: string) {
  return new NextRequest(`${appUrl}/connect`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: appUrl,
    },
    body: new URLSearchParams({ setupSecret }),
  });
}

describe("Meta OAuth start route", () => {
  beforeEach(() => {
    vi.stubEnv("APP_URL", appUrl);
    vi.stubEnv("DEMO_MODE", "false");
    vi.stubEnv("LEGAL_ENTITY_NAME", "Example Owner");
    vi.stubEnv("PRIVACY_CONTACT_EMAIL", "privacy@example.com");
    vi.stubEnv("META_APP_ID", "123456789");
    vi.stubEnv("META_APP_SECRET", "meta-app-secret-with-safe-length");
    vi.stubEnv("META_GRAPH_VERSION", "v25.0");
    vi.stubEnv("SESSION_SECRET", "session-secret-".padEnd(48, "s"));
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "a".repeat(64));
    vi.stubEnv("OWNER_SETUP_SECRET", ownerSetupSecret);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses a body-dropping 303 to the exact Meta dialog origin", async () => {
    const response = await POST(ownerRequest(ownerSetupSecret));
    const location = response.headers.get("location");

    expect(response.status).toBe(303);
    expect(location).not.toBeNull();

    const authorizationUrl = new URL(location as string);
    expect(authorizationUrl.origin).toBe("https://www.facebook.com");
    expect(authorizationUrl.pathname).toBe("/v25.0/dialog/oauth");
    expect(location).not.toContain("setupSecret");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("set-cookie")).toContain("meta_oauth_nonce=");
  });

  it("rejects an invalid owner secret without issuing an OAuth nonce", async () => {
    const response = await POST(ownerRequest("wrong-owner-secret"));
    const location = response.headers.get("location");

    expect(response.status).toBe(303);
    expect(location).toBe(
      `${appUrl}/connect?error=INVALID_OWNER_SECRET`,
    );
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
