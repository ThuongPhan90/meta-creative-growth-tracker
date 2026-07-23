import { NextRequest, NextResponse } from "next/server";

import { buildMetaAuthorizationUrl } from "@/lib/meta";
import {
  createMetaOAuthState,
  generateMetaOAuthNonce,
  getMetaServerEnv,
  getSecurityServerEnv,
  META_OAUTH_NONCE_COOKIE,
  META_OAUTH_NONCE_COOKIE_OPTIONS,
} from "@/lib/security";
import {
  assertLegalConfiguration,
  assertLiveMode,
  assertOwnerSetupSecret,
  assertSameOrigin,
  RequestSecurityError,
  routeErrorResponse,
} from "@/lib/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    assertLiveMode();
    assertLegalConfiguration();
    const formData = await request.formData();
    const setupSecret = formData.get("setupSecret");
    assertOwnerSetupSecret(
      typeof setupSecret === "string" ? setupSecret : undefined,
    );

    const meta = getMetaServerEnv();
    const security = getSecurityServerEnv();
    const nonce = generateMetaOAuthNonce();
    const state = createMetaOAuthState(
      {
        nonce,
        returnTo: "/assets?connected=1&sync=initial",
      },
      { secret: security.sessionSecret },
    );
    const redirectUri = `${meta.appUrl}/api/auth/meta/callback`;
    const authorizationUrl = buildMetaAuthorizationUrl({
      appId: meta.metaAppId,
      version: meta.metaGraphVersion,
      redirectUri,
      state,
    });

    const response = NextResponse.redirect(authorizationUrl, 303);
    response.cookies.set(
      META_OAUTH_NONCE_COOKIE,
      nonce,
      META_OAUTH_NONCE_COOKIE_OPTIONS,
    );
    return response;
  } catch (error) {
    if (
      error instanceof RequestSecurityError &&
      [
        "INVALID_OWNER_SECRET",
        "DEMO_MODE_ACTIVE",
        "LEGAL_CONFIGURATION_REQUIRED",
      ].includes(error.code)
    ) {
      const url = new URL(
        "/connect",
        process.env.APP_URL ?? request.nextUrl.origin,
      );
      url.searchParams.set("error", error.code);
      return NextResponse.redirect(url, 303);
    }
    return routeErrorResponse(error);
  }
}

export function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: "Meta OAuth phải được mở từ biểu mẫu owner bằng POST.",
    },
    { status: 405, headers: { Allow: "POST" } },
  );
}
