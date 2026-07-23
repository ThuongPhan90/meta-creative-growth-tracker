import { createHmac } from "node:crypto";

import type {
  MetaGraphErrorPayload,
  MetaGraphErrorResponse,
  MetaGraphPage,
  MetaGraphQuery,
  MetaGraphQueryValue,
} from "./types";

const DEFAULT_GRAPH_ORIGIN = "https://graph.facebook.com";
const DEFAULT_GRAPH_VERSION = "v25.0";
const RETRYABLE_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const RETRYABLE_META_ERROR_CODES = new Set([1, 2, 4, 17, 32, 341, 613]);

export type MetaGraphErrorKind =
  | "GRAPH_API"
  | "NETWORK"
  | "INVALID_RESPONSE"
  | "PAGINATION_LIMIT"
  | "PAGINATION_LOOP";

export class MetaGraphApiError extends Error {
  readonly kind = "GRAPH_API" as const;
  readonly httpStatus: number;
  readonly metaCode: number | null;
  readonly metaSubcode: number | null;
  readonly metaType: string | null;
  readonly requestId: string | null;
  readonly userTitle: string | null;
  readonly userMessage: string | null;
  readonly isTransient: boolean;
  readonly retryAfterMs: number | null;
  readonly requestPath: string;

  constructor(
    payload: MetaGraphErrorPayload,
    details: {
      httpStatus: number;
      retryAfterMs: number | null;
      requestPath: string;
    },
  ) {
    const codeLabel =
      typeof payload.code === "number" ? `, code ${payload.code}` : "";
    const subcodeLabel =
      typeof payload.error_subcode === "number"
        ? `, subcode ${payload.error_subcode}`
        : "";

    super(
      `Meta Graph API request failed (HTTP ${details.httpStatus}${codeLabel}${subcodeLabel}).`,
    );
    this.name = "MetaGraphApiError";
    this.httpStatus = details.httpStatus;
    this.metaCode = payload.code ?? null;
    this.metaSubcode = payload.error_subcode ?? null;
    this.metaType = payload.type ?? null;
    this.requestId = payload.fbtrace_id ?? null;
    this.userTitle = payload.error_user_title ?? null;
    this.userMessage = payload.error_user_msg ?? null;
    this.isTransient =
      payload.is_transient === true ||
      RETRYABLE_HTTP_STATUSES.has(details.httpStatus) ||
      (typeof payload.code === "number" &&
        RETRYABLE_META_ERROR_CODES.has(payload.code));
    this.retryAfterMs = details.retryAfterMs;
    this.requestPath = details.requestPath;
  }
}

export class MetaGraphRequestError extends Error {
  readonly kind: Exclude<MetaGraphErrorKind, "GRAPH_API">;
  readonly requestPath: string;

  constructor(
    kind: Exclude<MetaGraphErrorKind, "GRAPH_API">,
    requestPath: string,
    options?: ErrorOptions,
  ) {
    const messages: Record<typeof kind, string> = {
      NETWORK: "Meta Graph API could not be reached.",
      INVALID_RESPONSE: "Meta Graph API returned an invalid response.",
      PAGINATION_LIMIT: "Meta Graph API pagination safety limit was reached.",
      PAGINATION_LOOP: "Meta Graph API returned a repeated pagination cursor.",
    };
    super(messages[kind], options);
    this.name = "MetaGraphRequestError";
    this.kind = kind;
    this.requestPath = requestPath;
  }
}

export interface MetaGraphClientOptions {
  accessToken: string;
  appSecret?: string;
  version?: string;
  fetchImpl?: typeof fetch;
  maxAttempts?: number;
  baseUrl?: string;
  baseRetryDelayMs?: number;
  maxRetryDelayMs?: number;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
}

export interface MetaGraphRequestOptions {
  signal?: AbortSignal;
  headers?: Readonly<Record<string, string>>;
}

export interface MetaGraphPaginationOptions extends MetaGraphRequestOptions {
  maxPages?: number;
  maxItems?: number;
}

function assertGraphVersion(version: string): string {
  if (!/^v\d+\.\d+$/.test(version)) {
    throw new TypeError("Meta Graph version must use the form v25.0.");
  }
  return version;
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1_000;
  }

  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

function defaultSleep(
  milliseconds: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(signal.reason);
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, milliseconds);

    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(signal.reason);
      },
      { once: true },
    );
  });
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

function nextCursorFromPage(page: MetaGraphPage<unknown>): string | null {
  const directCursor = page.paging?.cursors?.after;
  if (directCursor) {
    return directCursor;
  }

  if (!page.paging?.next) {
    return null;
  }

  try {
    return new URL(page.paging.next).searchParams.get("after");
  } catch {
    return null;
  }
}

function safeRequestPath(url: URL): string {
  return url.pathname;
}

function redactMetaText(
  value: string | undefined,
  accessToken: string,
): string | undefined {
  if (!value) {
    return value;
  }
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "[redacted]")
    .replace(/access_token=[^&\s]+/gi, "access_token=[redacted]")
    .replaceAll(accessToken, "[redacted]")
    .slice(0, 1_000);
}

function sanitizeGraphError(
  payload: MetaGraphErrorPayload,
  accessToken: string,
): MetaGraphErrorPayload {
  return {
    ...payload,
    message: redactMetaText(payload.message, accessToken),
    error_user_title: redactMetaText(payload.error_user_title, accessToken),
    error_user_msg: redactMetaText(payload.error_user_msg, accessToken),
  };
}

export class MetaGraphClient {
  private readonly accessToken: string;
  private readonly appSecretProof: string | null;
  private readonly version: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxAttempts: number;
  private readonly baseUrl: URL;
  private readonly baseRetryDelayMs: number;
  private readonly maxRetryDelayMs: number;
  private readonly sleepImpl: (
    milliseconds: number,
    signal?: AbortSignal,
  ) => Promise<void>;
  private readonly random: () => number;

  constructor(options: MetaGraphClientOptions) {
    if (!options.accessToken.trim()) {
      throw new TypeError("A Meta access token is required.");
    }

    const baseUrl = new URL(options.baseUrl ?? DEFAULT_GRAPH_ORIGIN);
    if (
      baseUrl.protocol !== "https:" ||
      baseUrl.hostname !== "graph.facebook.com" ||
      baseUrl.username ||
      baseUrl.password
    ) {
      throw new TypeError(
        "Meta Graph API base URL must be https://graph.facebook.com.",
      );
    }

    this.accessToken = options.accessToken;
    this.appSecretProof = options.appSecret?.trim()
      ? createHmac("sha256", options.appSecret.trim())
          .update(options.accessToken)
          .digest("hex")
      : null;
    this.version = assertGraphVersion(
      options.version ??
        process.env.META_GRAPH_VERSION ??
        DEFAULT_GRAPH_VERSION,
    );
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxAttempts = Math.min(Math.max(options.maxAttempts ?? 4, 1), 8);
    this.baseUrl = baseUrl;
    this.baseRetryDelayMs = Math.max(options.baseRetryDelayMs ?? 500, 0);
    this.maxRetryDelayMs = Math.max(options.maxRetryDelayMs ?? 30_000, 0);
    this.sleepImpl = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
  }

  private buildUrl(path: string, query: MetaGraphQuery): URL {
    if (!path.trim()) {
      throw new TypeError("A Meta Graph API path is required.");
    }

    const normalizedPath = path.replace(/^\/+/, "");
    const versionPrefix = `${this.version}/`;
    const versionedPath = normalizedPath.startsWith(versionPrefix)
      ? normalizedPath
      : `${versionPrefix}${normalizedPath}`;
    const url = new URL(versionedPath, `${this.baseUrl.origin}/`);

    for (const [key, rawValue] of Object.entries(query)) {
      if (
        key.toLowerCase() === "access_token" ||
        key.toLowerCase() === "appsecret_proof"
      ) {
        throw new TypeError(
          "Pass Meta credentials to MetaGraphClient, not as query values.",
        );
      }
      if (rawValue === undefined || rawValue === null) {
        continue;
      }

      const value = Array.isArray(rawValue)
        ? rawValue.join(",")
        : String(rawValue);
      url.searchParams.set(key, value);
    }
    if (this.appSecretProof) {
      url.searchParams.set("appsecret_proof", this.appSecretProof);
    }

    return url;
  }

  private retryDelay(
    attempt: number,
    retryAfterMs: number | null,
  ): number {
    if (retryAfterMs !== null) {
      return Math.min(retryAfterMs, this.maxRetryDelayMs);
    }

    const exponentialDelay =
      this.baseRetryDelayMs * Math.pow(2, Math.max(attempt - 1, 0));
    const jitterMultiplier = 0.75 + this.random() * 0.5;
    return Math.min(
      Math.round(exponentialDelay * jitterMultiplier),
      this.maxRetryDelayMs,
    );
  }

  private async execute<T>(
    url: URL,
    options: MetaGraphRequestOptions,
  ): Promise<T> {
    const requestPath = safeRequestPath(url);

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const response = await this.fetchImpl(url, {
          method: "GET",
          cache: "no-store",
          signal: options.signal,
          headers: {
            Accept: "application/json",
            ...options.headers,
            Authorization: `Bearer ${this.accessToken}`,
          },
        });

        let payload: unknown;
        try {
          payload = await response.json();
        } catch (cause) {
          throw new MetaGraphRequestError(
            "INVALID_RESPONSE",
            requestPath,
            { cause },
          );
        }

        if (!response.ok || isGraphErrorResponse(payload)) {
          const graphPayload = isGraphErrorResponse(payload)
            ? sanitizeGraphError(payload.error, this.accessToken)
            : {};
          throw new MetaGraphApiError(graphPayload, {
            httpStatus: response.status,
            retryAfterMs: parseRetryAfter(
              response.headers.get("retry-after"),
            ),
            requestPath,
          });
        }

        return payload as T;
      } catch (cause) {
        if (options.signal?.aborted) {
          throw options.signal.reason ?? cause;
        }

        const normalizedError =
          cause instanceof MetaGraphApiError ||
          cause instanceof MetaGraphRequestError
            ? cause
            : new MetaGraphRequestError("NETWORK", requestPath, { cause });
        const retryable =
          normalizedError instanceof MetaGraphApiError
            ? normalizedError.isTransient
            : normalizedError.kind === "NETWORK";

        if (!retryable || attempt >= this.maxAttempts) {
          throw normalizedError;
        }

        await this.sleepImpl(
          this.retryDelay(
            attempt,
            normalizedError instanceof MetaGraphApiError
              ? normalizedError.retryAfterMs
              : null,
          ),
          options.signal,
        );
      }
    }

    throw new MetaGraphRequestError("NETWORK", requestPath);
  }

  async request<T>(
    path: string,
    query: MetaGraphQuery = {},
    options: MetaGraphRequestOptions = {},
  ): Promise<T> {
    return this.execute<T>(this.buildUrl(path, query), options);
  }

  async *paginate<T>(
    path: string,
    query: MetaGraphQuery = {},
    options: MetaGraphPaginationOptions = {},
  ): AsyncGenerator<T[], void, undefined> {
    const maxPages = Math.min(Math.max(options.maxPages ?? 100, 1), 10_000);
    const maxItems = Math.min(
      Math.max(options.maxItems ?? 100_000, 1),
      1_000_000,
    );
    const paginationQuery: Record<
      string,
      MetaGraphQueryValue | readonly (string | number)[]
    > = { ...query };
    const seenCursors = new Set<string>();
    let pageCount = 0;
    let itemCount = 0;

    while (true) {
      if (pageCount >= maxPages) {
        throw new MetaGraphRequestError("PAGINATION_LIMIT", path);
      }

      const page = await this.request<MetaGraphPage<T>>(
        path,
        paginationQuery,
        options,
      );
      if (!Array.isArray(page.data)) {
        throw new MetaGraphRequestError("INVALID_RESPONSE", path);
      }

      pageCount += 1;
      const remainingItems = maxItems - itemCount;
      const emittedItems = page.data.slice(0, remainingItems);
      itemCount += emittedItems.length;
      yield emittedItems;

      if (itemCount >= maxItems) {
        if (
          page.data.length > emittedItems.length ||
          nextCursorFromPage(page) !== null
        ) {
          throw new MetaGraphRequestError("PAGINATION_LIMIT", path);
        }
        return;
      }

      const nextCursor = nextCursorFromPage(page);
      if (!nextCursor) {
        return;
      }
      if (seenCursors.has(nextCursor)) {
        throw new MetaGraphRequestError("PAGINATION_LOOP", path);
      }

      seenCursors.add(nextCursor);
      paginationQuery.after = nextCursor;
    }
  }

  async getAll<T>(
    path: string,
    query: MetaGraphQuery = {},
    options: MetaGraphPaginationOptions = {},
  ): Promise<T[]> {
    const items: T[] = [];
    for await (const page of this.paginate<T>(path, query, options)) {
      items.push(...page);
    }
    return items;
  }
}
