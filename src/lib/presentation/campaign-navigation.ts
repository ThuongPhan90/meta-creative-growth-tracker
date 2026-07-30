import {
  parseNavigationQuery,
  SHARED_NAVIGATION_KEYS,
  type NavigationQueryInput,
} from "@/lib/navigation";

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
