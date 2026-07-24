import { describe, expect, it, vi } from "vitest";
import {
  buildMetaAuthorizationUrl,
  exchangeMetaAuthorizationCode,
  missingMetaOAuthScopes,
  revokeMetaAuthorization,
} from "./oauth";

describe("Meta OAuth helpers", () => {
  it("builds a signed-state authorization URL with read-oriented scopes", () => {
    const url = buildMetaAuthorizationUrl({
      appId: "123456789",
      redirectUri: "https://tracker.example/api/meta/callback",
      state: "signed-state",
    });

    expect(url.origin).toBe("https://www.facebook.com");
    expect(url.searchParams.get("client_id")).toBe("123456789");
    expect(url.searchParams.get("state")).toBe("signed-state");
    expect(url.searchParams.get("scope")).toBe(
      "ads_read,business_management,pages_show_list",
    );
  });

  it("rejects known write permissions", () => {
    expect(() =>
      buildMetaAuthorizationUrl({
        appId: "123",
        redirectUri: "http://localhost:3000/api/meta/callback",
        state: "state",
        scopes: ["ads_read", "ads_management"],
      }),
    ).toThrow(/read-only mode/);
  });

  it("fails closed when any required read permission is missing", () => {
    expect(
      missingMetaOAuthScopes([
        "ads_read",
        "pages_show_list",
      ]),
    ).toEqual(["business_management"]);

    expect(
      missingMetaOAuthScopes([
        "business_management",
        "pages_show_list",
        "ads_read",
      ]),
    ).toEqual([]);
  });

  it("exchanges a code without putting the app secret in the URL", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          access_token: "user-token",
          token_type: "bearer",
          expires_in: 3600,
        }),
        { status: 200 },
      ),
    );

    const result = await exchangeMetaAuthorizationCode({
      appId: "123",
      appSecret: "app-secret-that-stays-server-side",
      redirectUri: "https://tracker.example/api/meta/callback",
      code: "one-time-code",
      fetchImpl: fetchMock as typeof fetch,
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).not.toContain("app-secret");
    expect(init.method).toBe("POST");
    expect(String(init.body)).toContain(
      "client_secret=app-secret-that-stays-server-side",
    );
    expect(result).toEqual({
      accessToken: "user-token",
      tokenType: "bearer",
      expiresInSeconds: 3600,
    });
  });

  it("revokes only the app authorization and keeps the token out of the URL", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    await revokeMetaAuthorization({
      accessToken: "user-token",
      version: "v24.0",
      fetchImpl: fetchMock as typeof fetch,
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      "https://graph.facebook.com/v24.0/me/permissions",
    );
    expect(url).not.toContain("user-token");
    expect(init.method).toBe("DELETE");
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer user-token",
    );
  });
});
