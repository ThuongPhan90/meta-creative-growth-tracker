import type {
  MetaAccessToken,
  MetaAccessTokenResponse,
  MetaGraphErrorResponse,
} from "./types";

const FACEBOOK_DIALOG_ORIGIN = "https://www.facebook.com";
const META_GRAPH_ORIGIN = "https://graph.facebook.com";
const DEFAULT_GRAPH_VERSION = "v25.0";

/**
 * Minimum read-oriented permissions used by the personal deployment.
 *
 * business_management is needed to enumerate Business assets. The application
 * itself enforces read-only behavior by exposing GET-only Graph helpers.
 * A deployment must still request only the permissions its own flow needs.
 */
export const DEFAULT_META_OAUTH_SCOPES = [
  "ads_read",
  "business_management",
  "pages_show_list",
] as const;

const KNOWN_WRITE_SCOPES = new Set([
  "ads_management",
  "pages_manage_ads",
  "pages_manage_engagement",
  "pages_manage_metadata",
  "pages_manage_posts",
]);

export class MetaOAuthError extends Error {
  readonly code: number | null;
  readonly subcode: number | null;
  readonly requestId: string | null;
  readonly httpStatus: number;

  constructor(details: {
    httpStatus: number;
    code?: number;
    subcode?: number;
    requestId?: string;
  }) {
    super(
      `Meta OAuth request failed (HTTP ${details.httpStatus}${
        details.code === undefined ? "" : `, code ${details.code}`
      }${
        details.subcode === undefined
          ? ""
          : `, subcode ${details.subcode}`
      }).`,
    );
    this.name = "MetaOAuthError";
    this.code = details.code ?? null;
    this.subcode = details.subcode ?? null;
    this.requestId = details.requestId ?? null;
    this.httpStatus = details.httpStatus;
  }
}

export interface BuildMetaAuthorizationUrlOptions {
  appId: string;
  redirectUri: string;
  state: string;
  version?: string;
  scopes?: readonly string[];
  rerequestDeclinedPermissions?: boolean;
}

export interface MetaOAuthCredentials {
  appId: string;
  appSecret: string;
  version?: string;
}

export interface MetaOAuthRequestOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export interface ExchangeMetaAuthorizationCodeOptions
  extends MetaOAuthCredentials,
    MetaOAuthRequestOptions {
  code: string;
  redirectUri: string;
}

export interface ExchangeMetaLongLivedTokenOptions
  extends MetaOAuthCredentials,
    MetaOAuthRequestOptions {
  shortLivedAccessToken: string;
}

export interface RevokeMetaAuthorizationOptions
  extends MetaOAuthRequestOptions {
  accessToken: string;
  version?: string;
}

function assertGraphVersion(version: string): string {
  if (!/^v\d+\.\d+$/.test(version)) {
    throw new TypeError("Meta Graph version must use the form v25.0.");
  }
  return version;
}

function assertAppId(appId: string): string {
  if (!/^\d+$/.test(appId)) {
    throw new TypeError("Meta App ID must contain digits only.");
  }
  return appId;
}

function assertRedirectUri(redirectUri: string): string {
  const url = new URL(redirectUri);
  const isLocalhost =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";

  if (url.username || url.password) {
    throw new TypeError("Meta OAuth redirect URI cannot contain credentials.");
  }
  if (url.protocol !== "https:" && !(isLocalhost && url.protocol === "http:")) {
    throw new TypeError(
      "Meta OAuth redirect URI must use HTTPS (HTTP is allowed on localhost).",
    );
  }
  if (url.hash) {
    throw new TypeError("Meta OAuth redirect URI cannot contain a fragment.");
  }

  return url.toString();
}

function normalizeScopes(scopes: readonly string[]): string[] {
  const unique = new Set<string>();
  for (const scope of scopes) {
    const normalized = scope.trim();
    if (!/^[a-z][a-z0-9_]+$/.test(normalized)) {
      throw new TypeError(`Invalid Meta OAuth permission name: ${scope}`);
    }
    if (KNOWN_WRITE_SCOPES.has(normalized)) {
      throw new TypeError(
        `Write-capable Meta permission is not allowed in read-only mode: ${normalized}`,
      );
    }
    unique.add(normalized);
  }

  if (unique.size === 0) {
    throw new TypeError("At least one Meta OAuth permission is required.");
  }
  return [...unique];
}

function isGraphErrorResponse(value: unknown): value is MetaGraphErrorResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "object" &&
    value.error !== null
  );
}

function isAccessTokenResponse(
  value: unknown,
): value is MetaAccessTokenResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "access_token" in value &&
    typeof value.access_token === "string" &&
    value.access_token.length > 0
  );
}

async function requestToken(
  version: string,
  body: URLSearchParams,
  requestOptions: MetaOAuthRequestOptions,
): Promise<MetaAccessToken> {
  const fetchImpl = requestOptions.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `${META_GRAPH_ORIGIN}/${version}/oauth/access_token`,
    {
      method: "POST",
      cache: "no-store",
      signal: requestOptions.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new MetaOAuthError({ httpStatus: response.status });
  }

  if (!response.ok || isGraphErrorResponse(payload)) {
    const error = isGraphErrorResponse(payload) ? payload.error : {};
    throw new MetaOAuthError({
      httpStatus: response.status,
      code: error.code,
      subcode: error.error_subcode,
      requestId: error.fbtrace_id,
    });
  }

  if (!isAccessTokenResponse(payload)) {
    throw new MetaOAuthError({ httpStatus: response.status });
  }

  const expiresInSeconds =
    typeof payload.expires_in === "number" &&
    Number.isFinite(payload.expires_in) &&
    payload.expires_in >= 0
      ? payload.expires_in
      : null;

  return {
    accessToken: payload.access_token,
    tokenType: payload.token_type ?? "bearer",
    expiresInSeconds,
  };
}

export function buildMetaAuthorizationUrl(
  options: BuildMetaAuthorizationUrlOptions,
): URL {
  const appId = assertAppId(options.appId);
  const redirectUri = assertRedirectUri(options.redirectUri);
  const version = assertGraphVersion(
    options.version ?? process.env.META_GRAPH_VERSION ?? DEFAULT_GRAPH_VERSION,
  );
  const state = options.state.trim();
  if (!state) {
    throw new TypeError("A signed Meta OAuth state is required.");
  }

  const scopes = normalizeScopes(
    options.scopes ?? DEFAULT_META_OAUTH_SCOPES,
  );
  const url = new URL(`/${version}/dialog/oauth`, FACEBOOK_DIALOG_ORIGIN);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scopes.join(","));
  url.searchParams.set("return_scopes", "true");
  if (options.rerequestDeclinedPermissions) {
    url.searchParams.set("auth_type", "rerequest");
  }
  return url;
}

export async function exchangeMetaAuthorizationCode(
  options: ExchangeMetaAuthorizationCodeOptions,
): Promise<MetaAccessToken> {
  const version = assertGraphVersion(
    options.version ?? process.env.META_GRAPH_VERSION ?? DEFAULT_GRAPH_VERSION,
  );
  const appId = assertAppId(options.appId);
  const redirectUri = assertRedirectUri(options.redirectUri);
  if (!options.appSecret) {
    throw new TypeError("Meta App Secret is required.");
  }
  if (!options.code.trim()) {
    throw new TypeError("Meta OAuth authorization code is required.");
  }

  return requestToken(
    version,
    new URLSearchParams({
      client_id: appId,
      client_secret: options.appSecret,
      redirect_uri: redirectUri,
      code: options.code,
    }),
    options,
  );
}

export async function exchangeForLongLivedMetaToken(
  options: ExchangeMetaLongLivedTokenOptions,
): Promise<MetaAccessToken> {
  const version = assertGraphVersion(
    options.version ?? process.env.META_GRAPH_VERSION ?? DEFAULT_GRAPH_VERSION,
  );
  const appId = assertAppId(options.appId);
  if (!options.appSecret) {
    throw new TypeError("Meta App Secret is required.");
  }
  if (!options.shortLivedAccessToken.trim()) {
    throw new TypeError("A short-lived Meta access token is required.");
  }

  return requestToken(
    version,
    new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: options.appSecret,
      fb_exchange_token: options.shortLivedAccessToken,
    }),
    options,
  );
}

/**
 * Explicit disconnect primitive. It never mutates ads or account settings; it
 * only revokes this app's authorization for the current Meta user.
 */
export async function revokeMetaAuthorization(
  options: RevokeMetaAuthorizationOptions,
): Promise<void> {
  const version = assertGraphVersion(
    options.version ?? process.env.META_GRAPH_VERSION ?? DEFAULT_GRAPH_VERSION,
  );
  if (!options.accessToken.trim()) {
    throw new TypeError("A Meta access token is required for revocation.");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `${META_GRAPH_ORIGIN}/${version}/me/permissions`,
    {
      method: "DELETE",
      cache: "no-store",
      signal: options.signal,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${options.accessToken}`,
      },
    },
  );

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new MetaOAuthError({ httpStatus: response.status });
  }
  if (!response.ok || isGraphErrorResponse(payload)) {
    const error = isGraphErrorResponse(payload) ? payload.error : {};
    throw new MetaOAuthError({
      httpStatus: response.status,
      code: error.code,
      subcode: error.error_subcode,
      requestId: error.fbtrace_id,
    });
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("success" in payload) ||
    payload.success !== true
  ) {
    throw new MetaOAuthError({ httpStatus: response.status });
  }
}
