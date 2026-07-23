import { describe, expect, it } from "vitest";
import {
  createMetaOAuthState,
  generateMetaOAuthNonce,
  verifyMetaOAuthState,
} from "./oauth-state";
import { SignedTokenError } from "./signed-token";

const SECRET = "oauth-state-secret-with-at-least-32-characters";

describe("Meta OAuth state", () => {
  it("binds signed state to an HttpOnly-cookie nonce and safe return path", () => {
    const nonce = generateMetaOAuthNonce();
    const state = createMetaOAuthState(
      { nonce, returnTo: "/creative?os=IOS" },
      {
        secret: SECRET,
        nowSeconds: 1_000,
        stateId: "oauth-flow-1",
      },
    );

    expect(
      verifyMetaOAuthState(state, {
        secret: SECRET,
        expectedNonce: nonce,
        nowSeconds: 1_100,
      }),
    ).toMatchObject({
      kind: "meta_oauth_state",
      returnTo: "/creative?os=IOS",
      jti: "oauth-flow-1",
    });
    expect(state).not.toContain(nonce);
  });

  it("rejects nonce mismatch and external return URLs", () => {
    const nonce = generateMetaOAuthNonce();
    const state = createMetaOAuthState(
      { nonce, returnTo: "/" },
      { secret: SECRET, nowSeconds: 1_000 },
    );

    expect(() =>
      verifyMetaOAuthState(state, {
        secret: SECRET,
        expectedNonce: generateMetaOAuthNonce(),
        nowSeconds: 1_001,
      }),
    ).toThrow(SignedTokenError);

    expect(() =>
      createMetaOAuthState(
        { nonce, returnTo: "https://attacker.invalid" },
        { secret: SECRET, nowSeconds: 1_000 },
      ),
    ).toThrowError(
      expect.objectContaining({ code: "INVALID_CLAIMS" }),
    );
  });
});
