export const SHARED_NAVIGATION_KEYS = [
  "from",
  "to",
  "business_ids",
  "account_ids",
  "account",
  "objective",
  "result",
  "campaign",
  "os",
  "format",
  "performance",
  "data_status",
  "currency",
  "compare",
  "attribution",
  "action_report_time",
  "sync_version",
] as const;

export const DETAIL_NAVIGATION_KEYS = [
  "selected",
  "tab",
  "compare_ids",
  "metric",
  "sort",
] as const;

export const CREATIVE_DRILLDOWN_METRICS = [
  "spend",
  "impressions",
  "reach",
  "frequency",
  "cpm",
  "link_clicks",
  "link_ctr",
  "cpc_link",
  "primary_result",
  "cost_per_result",
  "result_rate",
  "value",
  "roas",
  // Legacy URL values remain readable so existing saved links do not break.
  "installs",
  "registrations",
  "cpi",
  "cpa",
  "conversion",
] as const;

export const SORT_DIRECTIONS = ["asc", "desc"] as const;

export const NAVIGATION_QUERY_KEYS = [
  ...SHARED_NAVIGATION_KEYS,
  ...DETAIL_NAVIGATION_KEYS,
] as const;

export type SharedNavigationKey =
  (typeof SHARED_NAVIGATION_KEYS)[number];
export type DetailNavigationKey =
  (typeof DETAIL_NAVIGATION_KEYS)[number];
export type NavigationQueryKey =
  (typeof NAVIGATION_QUERY_KEYS)[number];
export type CreativeDrilldownMetric =
  (typeof CREATIVE_DRILLDOWN_METRICS)[number];
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

type StringNavigationKey = Exclude<
  NavigationQueryKey,
  "metric" | "sort"
>;

export type NavigationQuery = Partial<
  Record<StringNavigationKey, string>
> & {
  metric?: CreativeDrilldownMetric;
  sort?: SortDirection;
};

export type NavigationQueryInput =
  | Pick<URLSearchParams, "entries">
  | Record<string, string | string[] | undefined>;

export type NavigationQueryOverrides = Partial<
  Record<StringNavigationKey, string | null | undefined>
> & {
  metric?: CreativeDrilldownMetric | null;
  sort?: SortDirection | null;
};

const DATE_KEYS = new Set<NavigationQueryKey>(["from", "to"]);
const ID_LIST_KEYS = new Set<NavigationQueryKey>([
  "business_ids",
  "account_ids",
]);
const MAX_VALUE_LENGTH: Record<NavigationQueryKey, number> = {
  from: 10,
  to: 10,
  business_ids: 2_000,
  account_ids: 2_000,
  account: 160,
  objective: 128,
  result: 128,
  campaign: 160,
  os: 64,
  format: 64,
  performance: 64,
  data_status: 64,
  currency: 3,
  compare: 15,
  attribution: 64,
  action_report_time: 10,
  sync_version: 160,
  selected: 160,
  tab: 64,
  compare_ids: 500,
  metric: 32,
  sort: 4,
};

function isDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function sanitizeNavigationValue(
  key: NavigationQueryKey,
  value: string | undefined,
) {
  if (value === undefined) return undefined;
  const normalized = value.trim().slice(0, MAX_VALUE_LENGTH[key]);
  if (!normalized) return undefined;
  if (DATE_KEYS.has(key) && !isDate(normalized)) return undefined;
  if (ID_LIST_KEYS.has(key)) {
    const ids = normalized
      .split(",")
      .map((id) => id.trim())
      .filter((id) => /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(id))
      .slice(0, 50);
    return ids.length ? [...new Set(ids)].join(",") : undefined;
  }
  if (key === "currency") {
    const currency = normalized.toUpperCase();
    return /^[A-Z]{3}$/.test(currency) ? currency : undefined;
  }
  if (key === "compare") {
    return normalized === "previous_period" || normalized === "none"
      ? normalized
      : undefined;
  }
  if (key === "objective") {
    return normalized === "all" ||
      /^[a-z0-9][a-z0-9._-]{0,127}$/.test(normalized)
      ? normalized
      : undefined;
  }
  if (key === "result") {
    return /^[a-z0-9][a-z0-9._-]{0,127}$/.test(normalized)
      ? normalized
      : undefined;
  }
  if (key === "action_report_time") {
    return ["impression", "conversion", "mixed"].includes(normalized)
      ? normalized
      : undefined;
  }
  if (key === "attribution" || key === "sync_version") {
    return /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(normalized)
      ? normalized
      : undefined;
  }
  if (key === "metric") {
    return (
      CREATIVE_DRILLDOWN_METRICS as readonly string[]
    ).includes(normalized)
      ? normalized
      : undefined;
  }
  if (key === "sort") {
    return (SORT_DIRECTIONS as readonly string[]).includes(normalized)
      ? normalized
      : undefined;
  }
  if (key === "compare_ids") {
    const ids = normalized
      .split(",")
      .map((id) => id.trim())
      .filter((id) => /^cf_[a-f0-9]{24}$/.test(id))
      .slice(0, 4);
    return ids.length ? [...new Set(ids)].join(",") : undefined;
  }
  return normalized;
}

function queryEntries(
  input: NavigationQueryInput,
): Array<[string, string]> {
  if ("entries" in input && typeof input.entries === "function") {
    return Array.from(input.entries());
  }

  return Object.entries(input).flatMap(([key, value]) => {
    if (Array.isArray(value)) {
      return value.map((item): [string, string] => [key, item]);
    }
    return typeof value === "string"
      ? ([[key, value]] satisfies Array<[string, string]>)
      : [];
  });
}

function navigationKey(value: string): value is NavigationQueryKey {
  return (NAVIGATION_QUERY_KEYS as readonly string[]).includes(value);
}

export function parseNavigationQuery(
  input: NavigationQueryInput,
): NavigationQuery {
  const parsed: NavigationQuery = {};

  for (const [key, rawValue] of queryEntries(input)) {
    if (!navigationKey(key)) continue;
    const repeatedIdList = ID_LIST_KEYS.has(key);
    if (!repeatedIdList && parsed[key] !== undefined) continue;
    const value = sanitizeNavigationValue(
      key,
      repeatedIdList && parsed[key]
        ? `${parsed[key]},${rawValue}`
        : rawValue,
    );
    if (value !== undefined) {
      const writable = parsed as Partial<
        Record<NavigationQueryKey, string>
      >;
      writable[key] = value;
    }
  }

  return parsed;
}

const REPORTING_HIDDEN_KEYS = [
  "business_ids",
  "account_ids",
  "objective",
  "result",
  "attribution",
  "action_report_time",
  "sync_version",
] as const satisfies readonly SharedNavigationKey[];

/**
 * Preserves V2 fields that are not yet represented by native controls in the
 * compact reporting form. This prevents Apply from dropping a shared scope,
 * result selection, attribution contract, or pinned sync snapshot.
 */
export function reportingContextHiddenFields(
  input: NavigationQueryInput,
): Record<string, string> {
  const parsed = parseNavigationQuery(input);
  return Object.fromEntries(
    REPORTING_HIDDEN_KEYS.flatMap((key) =>
      parsed[key] ? [[key, parsed[key]]] : [],
    ),
  );
}

function splitDestination(destination: string) {
  const hashIndex = destination.indexOf("#");
  const hash = hashIndex >= 0 ? destination.slice(hashIndex) : "";
  const withoutHash =
    hashIndex >= 0 ? destination.slice(0, hashIndex) : destination;
  const queryIndex = withoutHash.indexOf("?");

  return {
    pathname:
      queryIndex >= 0
        ? withoutHash.slice(0, queryIndex)
        : withoutHash,
    params: new URLSearchParams(
      queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : "",
    ),
    hash,
  };
}

function formatDestination(
  pathname: string,
  params: URLSearchParams,
  hash: string,
) {
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}${hash}`;
}

/**
 * Builds a top-level navigation link while retaining the global reporting
 * context. Drawer/detail state is intentionally route-local by default.
 */
export function buildNavigationHref(
  destination: string,
  current: NavigationQueryInput,
  options: { includeDetailState?: boolean } = {},
) {
  const { pathname, params, hash } = splitDestination(destination);
  const parsed = parseNavigationQuery(current);
  const keys = options.includeDetailState
    ? NAVIGATION_QUERY_KEYS
    : SHARED_NAVIGATION_KEYS;

  for (const key of keys) {
    const value = parsed[key];
    if (value !== undefined && !params.has(key)) params.set(key, value);
  }

  return formatDestination(pathname, params, hash);
}

/**
 * Builds an in-screen link (filters, selected entity, or detail tab) and keeps
 * both the global reporting context and the current detail state.
 */
export function buildContextHref(
  destination: string,
  current: NavigationQueryInput,
  overrides: NavigationQueryOverrides = {},
) {
  const contextual = buildNavigationHref(destination, current, {
    includeDetailState: true,
  });
  const { pathname, params, hash } = splitDestination(contextual);

  for (const [key, rawValue] of Object.entries(overrides) as Array<
    [NavigationQueryKey, string | null | undefined]
  >) {
    if (rawValue === null || rawValue === undefined) {
      params.delete(key);
      continue;
    }
    const value = sanitizeNavigationValue(key, rawValue);
    if (value === undefined) params.delete(key);
    else params.set(key, value);
  }

  return formatDestination(pathname, params, hash);
}

/**
 * Keeps legacy route parameters during redirects. Destination parameters win,
 * which lets `/connect` force `tab=connection` without losing OAuth errors.
 */
export function buildCompatibilityHref(
  destination: string,
  legacy: NavigationQueryInput,
) {
  const { pathname, params: destinationParams, hash } =
    splitDestination(destination);
  const params = new URLSearchParams();

  for (const [key, rawValue] of queryEntries(legacy)) {
    const value = rawValue.trim().slice(0, 500);
    if (key && value) params.append(key.slice(0, 80), value);
  }
  for (const [key, value] of destinationParams.entries()) {
    params.delete(key);
    params.append(key, value);
  }

  return formatDestination(pathname, params, hash);
}
