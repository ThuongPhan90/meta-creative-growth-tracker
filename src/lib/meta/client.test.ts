import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  MetaGraphApiError,
  MetaGraphClient,
  MetaGraphRequestError,
} from "./client";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("MetaGraphClient", () => {
  it("keeps the access token in the Authorization header", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: "me" }));
    const client = new MetaGraphClient({
      accessToken: "secret-access-token",
      fetchImpl: fetchMock as typeof fetch,
    });

    await client.request<{ id: string }>("/me", { fields: ["id", "name"] });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(url.searchParams.has("access_token")).toBe(false);
    expect(url.searchParams.get("fields")).toBe("id,name");
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer secret-access-token",
    );
    expect(init.method).toBe("GET");
  });

  it("adds a server-generated appsecret_proof without exposing the App Secret", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: "me" }));
    const client = new MetaGraphClient({
      accessToken: "secret-access-token",
      appSecret: "meta-app-secret",
      fetchImpl: fetchMock as typeof fetch,
    });

    await client.request("/me");

    const [url] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.searchParams.get("appsecret_proof")).toBe(
      createHmac("sha256", "meta-app-secret")
        .update("secret-access-token")
        .digest("hex"),
    );
    expect(url.toString()).not.toContain("meta-app-secret");
  });

  it("does not allow a caller header or alternate host to redirect credentials", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: "me" }));
    const client = new MetaGraphClient({
      accessToken: "actual-token",
      fetchImpl: fetchMock as typeof fetch,
    });

    await client.request("/me", {}, {
      headers: { Authorization: "Bearer wrong-token" },
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer actual-token",
    );
    expect(
      () =>
        new MetaGraphClient({
          accessToken: "token",
          baseUrl: "https://attacker.invalid",
        }),
    ).toThrow(/graph\.facebook\.com/);
  });

  it("paginates with cursors without following an arbitrary next URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "1" }],
          paging: {
            cursors: { after: "cursor-2" },
            next: "https://attacker.invalid/steal?after=cursor-2",
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "2" }] }));
    const client = new MetaGraphClient({
      accessToken: "token",
      fetchImpl: fetchMock as typeof fetch,
    });

    await expect(client.getAll<{ id: string }>("/me/adaccounts")).resolves.toEqual(
      [{ id: "1" }, { id: "2" }],
    );
    const secondUrl = fetchMock.mock.calls[1][0] as URL;
    expect(secondUrl.origin).toBe("https://graph.facebook.com");
    expect(secondUrl.searchParams.get("after")).toBe("cursor-2");
  });

  it("retries transient Graph errors and honors Retry-After", async () => {
    const delays: number[] = [];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              code: 4,
              message: "Application request limit reached",
              is_transient: true,
            },
          },
          { status: 429, headers: { "retry-after": "2" } },
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ id: "ok" }));
    const client = new MetaGraphClient({
      accessToken: "token",
      fetchImpl: fetchMock as typeof fetch,
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
    });

    await expect(client.request<{ id: string }>("/me")).resolves.toEqual({
      id: "ok",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(delays).toEqual([2_000]);
  });

  it("does not retry a non-transient permission error", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        { error: { code: 200, message: "Permissions error" } },
        { status: 403 },
      ),
    );
    const client = new MetaGraphClient({
      accessToken: "sensitive-token",
      fetchImpl: fetchMock as typeof fetch,
    });

    const error = await client.request("/me").catch((cause) => cause);
    expect(error).toBeInstanceOf(MetaGraphApiError);
    expect(String(error)).not.toContain("sensitive-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("redacts a token if Meta echoes it in a user-facing error field", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        {
          error: {
            code: 200,
            error_user_msg: "Do not use Bearer sensitive-token here",
          },
        },
        { status: 403 },
      ),
    );
    const client = new MetaGraphClient({
      accessToken: "sensitive-token",
      fetchImpl: fetchMock as typeof fetch,
    });

    const error = await client.request("/me").catch((cause) => cause);
    expect(error).toBeInstanceOf(MetaGraphApiError);
    if (!(error instanceof MetaGraphApiError)) {
      throw new Error("Expected a MetaGraphApiError.");
    }
    expect(error.userMessage).toBe("Do not use [redacted] here");
    expect(error.userMessage).not.toContain("sensitive-token");
  });

  it("detects repeated cursors instead of looping forever", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: [],
        paging: { cursors: { after: "same-cursor" } },
      }),
    );
    const client = new MetaGraphClient({
      accessToken: "token",
      fetchImpl: fetchMock as typeof fetch,
    });

    const error = await client.getAll("/me/accounts").catch((cause) => cause);
    expect(error).toBeInstanceOf(MetaGraphRequestError);
    if (!(error instanceof MetaGraphRequestError)) {
      throw new Error("Expected a MetaGraphRequestError.");
    }
    expect(error.kind).toBe("PAGINATION_LOOP");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
