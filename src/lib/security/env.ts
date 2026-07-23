export type EnvironmentVariableName =
  | "APP_URL"
  | "META_APP_ID"
  | "META_APP_SECRET"
  | "META_GRAPH_VERSION"
  | "TOKEN_ENCRYPTION_KEY"
  | "SESSION_SECRET"
  | "OWNER_SETUP_SECRET";

export class EnvironmentValidationError extends Error {
  readonly variables: readonly EnvironmentVariableName[];

  constructor(variables: readonly EnvironmentVariableName[]) {
    const uniqueVariables = [...new Set(variables)].sort();
    super(
      `Invalid or missing server environment variables: ${uniqueVariables.join(
        ", ",
      )}.`,
    );
    this.name = "EnvironmentValidationError";
    this.variables = uniqueVariables;
  }
}

export interface MetaServerEnvironment {
  appUrl: string;
  metaAppId: string;
  metaAppSecret: string;
  metaGraphVersion: string;
}

export interface SecurityServerEnvironment {
  sessionSecret: string;
  tokenEncryptionKey: string;
  ownerSetupSecret: string;
}

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

function validAppUrl(rawValue: string | undefined): string | null {
  if (!rawValue) {
    return null;
  }

  try {
    const url = new URL(rawValue);
    const isLocalhost =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]";
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== "https:" &&
        !(isLocalhost && url.protocol === "http:"))
    ) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

export function getMetaServerEnv(
  environment: EnvironmentSource = process.env,
): Readonly<MetaServerEnvironment> {
  const invalid: EnvironmentVariableName[] = [];
  const appUrl = validAppUrl(environment.APP_URL);
  const metaAppId = environment.META_APP_ID?.trim();
  const metaAppSecret = environment.META_APP_SECRET;
  const metaGraphVersion =
    environment.META_GRAPH_VERSION?.trim() || "v25.0";

  if (!appUrl) {
    invalid.push("APP_URL");
  }
  if (!metaAppId || !/^\d+$/.test(metaAppId)) {
    invalid.push("META_APP_ID");
  }
  if (!metaAppSecret || metaAppSecret.length < 16) {
    invalid.push("META_APP_SECRET");
  }
  if (!/^v\d+\.\d+$/.test(metaGraphVersion)) {
    invalid.push("META_GRAPH_VERSION");
  }

  if (invalid.length > 0) {
    throw new EnvironmentValidationError(invalid);
  }

  return Object.freeze({
    appUrl: appUrl as string,
    metaAppId: metaAppId as string,
    metaAppSecret: metaAppSecret as string,
    metaGraphVersion,
  });
}

export function getSecurityServerEnv(
  environment: EnvironmentSource = process.env,
): Readonly<SecurityServerEnvironment> {
  const invalid: EnvironmentVariableName[] = [];
  const sessionSecret = environment.SESSION_SECRET;
  const tokenEncryptionKey = environment.TOKEN_ENCRYPTION_KEY;
  const ownerSetupSecret = environment.OWNER_SETUP_SECRET;

  if (!sessionSecret || Buffer.byteLength(sessionSecret, "utf8") < 32) {
    invalid.push("SESSION_SECRET");
  }
  if (!tokenEncryptionKey || !/^[a-fA-F0-9]{64}$/.test(tokenEncryptionKey)) {
    invalid.push("TOKEN_ENCRYPTION_KEY");
  }
  if (!ownerSetupSecret || Buffer.byteLength(ownerSetupSecret, "utf8") < 32) {
    invalid.push("OWNER_SETUP_SECRET");
  }

  if (invalid.length > 0) {
    throw new EnvironmentValidationError(invalid);
  }

  return Object.freeze({
    sessionSecret: sessionSecret as string,
    tokenEncryptionKey: (tokenEncryptionKey as string).toLowerCase(),
    ownerSetupSecret: ownerSetupSecret as string,
  });
}
