export const PRIMARY_NAVIGATION = [
  {
    id: "overview",
    href: "/overview",
    matchPath: "/overview",
    label: "Tổng quan",
  },
  {
    id: "creatives",
    href: "/creatives",
    matchPath: "/creatives",
    label: "Creative Tracker",
  },
  {
    id: "library",
    href: "/library",
    matchPath: "/library",
    label: "Thư viện Creative",
  },
  {
    id: "campaigns",
    href: "/campaigns",
    matchPath: "/campaigns",
    label: "Phân phối",
  },
  {
    id: "sources",
    href: "/sources?tab=connection",
    matchPath: "/sources",
    label: "Nguồn dữ liệu",
  },
  {
    id: "data-health",
    href: "/data-health",
    matchPath: "/data-health",
    label: "Chất lượng dữ liệu",
  },
  {
    id: "settings",
    href: "/settings?tab=reporting",
    matchPath: "/settings",
    label: "Cài đặt",
  },
] as const;

export type PrimaryNavigationItem =
  (typeof PRIMARY_NAVIGATION)[number];

export function isNavigationItemActive(
  pathname: string,
  item: Pick<PrimaryNavigationItem, "matchPath">,
) {
  return (
    pathname === item.matchPath ||
    pathname.startsWith(`${item.matchPath}/`)
  );
}
