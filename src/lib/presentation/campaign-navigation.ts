import {
  buildNavigationHref,
  parseNavigationQuery,
  SHARED_NAVIGATION_KEYS,
  type NavigationQueryInput,
} from "@/lib/navigation";

export const CAMPAIGNS_ROUTE_TABS = ["campaigns", "ads"] as const;
export const CAMPAIGNS_ROUTE_STATUSES = [
  "all",
  "active",
  "paused",
] as const;
export const CAMPAIGNS_ROUTE_DELIVERIES = [
  "all",
  "latest",
  "missing",
] as const;

export type CampaignsRouteTab = (typeof CAMPAIGNS_ROUTE_TABS)[number];
export type CampaignsRouteStatus =
  (typeof CAMPAIGNS_ROUTE_STATUSES)[number];
export type CampaignsRouteDelivery =
  (typeof CAMPAIGNS_ROUTE_DELIVERIES)[number];

export type CampaignsRouteFilters = {
  tab: CampaignsRouteTab;
  status: CampaignsRouteStatus;
  delivery: CampaignsRouteDelivery;
  q: string | null;
  page: number;
};

export type CampaignsRouteFilterOverrides = Partial<{
  tab: CampaignsRouteTab | null;
  status: CampaignsRouteStatus | null;
  delivery: CampaignsRouteDelivery | null;
  q: string | null;
  page: number | null;
}>;

type CampaignsRouteQuery = NavigationQueryInput &
  Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function textFilter(
  value: string | string[] | undefined,
  maxLength: number,
) {
  const normalized = first(value)?.trim().slice(0, maxLength);
  return normalized || null;
}

function pageFilter(value: string | string[] | undefined) {
  const normalized = first(value)?.trim();
  if (!normalized || !/^\d{1,6}$/.test(normalized)) return null;
  const page = Number.parseInt(normalized, 10);
  return page >= 1 && page <= 100_000 ? String(page) : null;
}

function routeTab(value: unknown): CampaignsRouteTab {
  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "ads" ? "ads" : "campaigns";
}

function routeStatus(value: unknown): CampaignsRouteStatus {
  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "active") return "active";
  if (normalized === "paused") return "paused";
  return "all";
}

function routeDelivery(value: unknown): CampaignsRouteDelivery {
  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "latest") return "latest";
  if (normalized === "missing") return "missing";
  return "all";
}

function routePage(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    return 1;
  }
  return Math.min(Math.max(value, 1), 100_000);
}

function normalizeCampaignsRouteFilters(input: {
  tab: unknown;
  status: unknown;
  delivery: unknown;
  q: unknown;
  page: unknown;
}): CampaignsRouteFilters {
  const delivery = routeDelivery(input.delivery);
  return {
    tab: routeTab(input.tab),
    // Delivery filters always describe the current ACTIVE comparable set.
    // This prevents `status=paused&delivery=latest` from changing the
    // semantics of the Overview status-rail deep link.
    status: delivery === "all" ? routeStatus(input.status) : "active",
    delivery,
    q:
      typeof input.q === "string"
        ? input.q.trim().slice(0, 200) || null
        : null,
    page: routePage(input.page),
  };
}

/**
 * Parses only `/campaigns` list state. Shared reporting filters deliberately
 * remain in `ReportingContext` / navigation helpers rather than this contract.
 */
export function parseCampaignsRouteFilters(
  query: CampaignsRouteQuery,
): CampaignsRouteFilters {
  const page = pageFilter(query.page);
  return normalizeCampaignsRouteFilters({
    tab: first(query.tab),
    status: first(query.status),
    delivery: first(query.delivery),
    q: first(query.q),
    page: page ? Number.parseInt(page, 10) : 1,
  });
}

/**
 * Serializes only non-default `/campaigns` list state. `delivery` is already
 * an ACTIVE-only filter, so its implied status is not repeated in the URL.
 */
export function serializeCampaignsRouteFilters(
  filters: CampaignsRouteFilters,
) {
  const normalized = normalizeCampaignsRouteFilters(filters);
  const params = new URLSearchParams();
  if (normalized.tab === "ads") params.set("tab", normalized.tab);
  if (normalized.delivery !== "all") {
    params.set("delivery", normalized.delivery);
  } else if (normalized.status !== "all") {
    params.set("status", normalized.status);
  }
  if (normalized.q) params.set("q", normalized.q);
  if (normalized.page > 1) params.set("page", String(normalized.page));
  return params;
}

/**
 * Builds a Campaign list URL while retaining every valid global reporting
 * filter. It intentionally does not promote tab/status/delivery into the
 * global navigation contract.
 */
export function buildCampaignsRouteHref(
  query: CampaignsRouteQuery,
  overrides: CampaignsRouteFilterOverrides = {},
) {
  const current = parseCampaignsRouteFilters(query);
  const normalized = normalizeCampaignsRouteFilters({
    tab: overrides.tab === undefined ? current.tab : overrides.tab,
    status:
      overrides.status === undefined ? current.status : overrides.status,
    delivery:
      overrides.delivery === undefined
        ? current.delivery
        : overrides.delivery,
    q: overrides.q === undefined ? current.q : overrides.q,
    page: overrides.page === undefined ? current.page : overrides.page,
  });
  const sharedHref = buildNavigationHref("/campaigns", query);
  const queryIndex = sharedHref.indexOf("?");
  const params = new URLSearchParams(
    queryIndex >= 0 ? sharedHref.slice(queryIndex + 1) : "",
  );
  if (first(query.showInactive) === "1") {
    params.set("showInactive", "1");
  }
  for (const [key, value] of serializeCampaignsRouteFilters(normalized)) {
    params.set(key, value);
  }
  return `/campaigns${params.size ? `?${params.toString()}` : ""}`;
}

/**
 * Returns from Campaign detail to the inventory without leaking detail-only
 * state. Shared reporting values pass through the shared sanitizer; q/status/
 * page are the only route-local list filters retained.
 */
export function campaignInventoryBackHref(
  query: NavigationQueryInput &
    Record<string, string | string[] | undefined>,
) {
  const shared = parseNavigationQuery(query);
  const params = new URLSearchParams();
  for (const key of SHARED_NAVIGATION_KEYS) {
    const value = shared[key];
    if (value) params.set(key, value);
  }

  const q = textFilter(query.q, 200);
  const status = textFilter(query.status, 64);
  const page = pageFilter(query.page);
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (page) params.set("page", page);

  return `/campaigns${params.size ? `?${params.toString()}` : ""}`;
}
