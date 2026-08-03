export const UI_VERSIONS = ["v2", "v3"] as const;
/**
 * V3 is intentionally an explicit release flag, not an automatic redesign.
 * A route is listed here only when its page surface and any reachable detail
 * route share the V3 shell. V2 remains the server-side default.
 */
export const UI_V3_ROUTE_PATHS = [
  "/overview",
  "/creatives",
  "/library",
  "/campaigns",
  "/sources",
  "/data-health",
  "/settings",
] as const;

export const UI_V3_ROUTE_MATRIX = [
  {
    pathname: "/overview",
    detailStrategy: "no-detail-route",
  },
  {
    pathname: "/creatives",
    detailStrategy: "creative-family-detail-uses-v3-shell",
  },
  {
    pathname: "/library",
    detailStrategy: "drawer-and-creative-detail-use-v3-shell",
  },
  {
    pathname: "/campaigns",
    detailStrategy: "campaign-detail-uses-v3-shell",
  },
  {
    pathname: "/sources",
    detailStrategy: "source-entity-detail-uses-v3-shell",
  },
  {
    pathname: "/data-health",
    detailStrategy: "drawer-state-stays-on-v3-route",
  },
  {
    pathname: "/settings",
    detailStrategy: "tab-state-stays-on-v3-route",
  },
] as const;

export type UiVersion = (typeof UI_VERSIONS)[number];

/**
 * Presentation migration gate. Keep the legacy surface as the safe default
 * until the V3 flag is explicitly enabled in the server environment.
 */
export function resolveUiVersion(value = process.env.UI_VERSION): UiVersion {
  return value?.trim().toLowerCase() === "v3" ? "v3" : "v2";
}

export function isUiV3(value = process.env.UI_VERSION) {
  return resolveUiVersion(value) === "v3";
}

function normalizePathname(pathname: string | null | undefined) {
  const normalizedPathname = pathname?.replace(/\/+$/, "") || "/";
  return normalizedPathname.startsWith("/")
    ? normalizedPathname
    : `/${normalizedPathname}`;
}

function isV3DetailRoute(pathname: string) {
  return (
    /^\/creatives\/[^/]+$/.test(pathname) ||
    /^\/campaigns\/[^/]+$/.test(pathname) ||
    /^\/sources\/(?:businesses|ad-accounts|pages)\/[^/]+$/.test(pathname)
  );
}

/**
 * V3 is migrated route by route. Detail patterns are deliberately explicit:
 * a V3 top-level page must never navigate to a legacy shell just because the
 * destination has an entity ID. Unknown nested paths stay outside the gate.
 */
export function isUiV3Route(pathname: string | null | undefined) {
  const normalizedPathname = normalizePathname(pathname);

  return (
    UI_V3_ROUTE_PATHS.some((routePath) => routePath === normalizedPathname) ||
    isV3DetailRoute(normalizedPathname)
  );
}

export function shouldUseUiV3Shell(
  pathname: string | null | undefined,
  v3Enabled: boolean,
) {
  return v3Enabled && isUiV3Route(pathname);
}
