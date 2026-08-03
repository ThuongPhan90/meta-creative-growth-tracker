import { describe, expect, it } from "vitest";
import {
  isNavigationItemActive,
  PRIMARY_NAVIGATION,
} from "./routes";

describe("primary navigation", () => {
  it("matches the connected-navigation information architecture", () => {
    expect(
      PRIMARY_NAVIGATION.map(({ href, label }) => ({ href, label })),
    ).toEqual([
      { href: "/overview", label: "Tổng quan" },
      { href: "/creatives", label: "Creative Tracker" },
      { href: "/library", label: "Thư viện Creative" },
      { href: "/campaigns", label: "Phân phối" },
      { href: "/sources?tab=connection", label: "Nguồn dữ liệu" },
      { href: "/data-health", label: "Chất lượng dữ liệu" },
      { href: "/settings?tab=reporting", label: "Cài đặt" },
    ]);
  });

  it("matches nested detail pages without prefix collisions", () => {
    const creatives = PRIMARY_NAVIGATION[1];
    expect(isNavigationItemActive("/creatives", creatives)).toBe(true);
    expect(
      isNavigationItemActive("/creatives/family-123", creatives),
    ).toBe(true);
    expect(isNavigationItemActive("/creatives-archive", creatives)).toBe(
      false,
    );
  });
});
