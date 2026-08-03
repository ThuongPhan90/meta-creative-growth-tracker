import { describe, expect, it } from "vitest";

import { PRIMARY_NAVIGATION } from "@/lib/navigation/routes";

import {
  isUiV3Route,
  shouldUseUiV3Shell,
  UI_V3_ROUTE_MATRIX,
  UI_V3_ROUTE_PATHS,
} from "./ui-version";

const V6_PRIMARY_ROUTE_PATHS = [
  "/overview",
  "/creatives",
  "/library",
  "/campaigns",
  "/sources",
  "/data-health",
  "/settings",
] as const;

function pathnameFromHref(href: string) {
  return href.split("?", 1)[0];
}

describe("V6 V3 route-matrix acceptance", () => {
  it("releases every primary information-architecture route behind the same V3 gate", () => {
    expect(UI_V3_ROUTE_PATHS).toEqual(V6_PRIMARY_ROUTE_PATHS);
    expect(UI_V3_ROUTE_MATRIX.map((route) => route.pathname)).toEqual(
      V6_PRIMARY_ROUTE_PATHS,
    );
    expect(PRIMARY_NAVIGATION.map((item) => pathnameFromHref(item.href))).toEqual(
      V6_PRIMARY_ROUTE_PATHS,
    );
  });

  it("keeps V3 active for supported detail routes without matching near-miss paths", () => {
    const supported = [
      "/overview",
      "/overview/",
      "/creatives/cf_123",
      "/library",
      "/campaigns/campaign_456",
      "/sources/businesses/bm_123",
      "/sources/ad-accounts/act_789",
      "/sources/pages/page_456",
      "/data-health/",
      "/settings",
    ];
    const unsupported = [
      "/assets",
      "/connect",
      "/creative",
      "/creatives-archive",
      "/campaign",
      "/campaigns-archive",
      "/source",
      "/sources-copy",
      "/sources/unknown/asset_1",
      "/data-healthcheck",
      "/settings-legacy",
    ];

    for (const pathname of supported) {
      expect(isUiV3Route(pathname)).toBe(true);
      expect(shouldUseUiV3Shell(pathname, true)).toBe(true);
      expect(shouldUseUiV3Shell(pathname, false)).toBe(false);
    }
    for (const pathname of unsupported) {
      expect(isUiV3Route(pathname)).toBe(false);
      expect(shouldUseUiV3Shell(pathname, true)).toBe(false);
    }
  });
});
