import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { demoCreatives } from "@/lib/demo-data";
import {
  CreativeDrawerContent,
  CreativePerformanceV2,
  creativeDetailBackHref,
  creativeDetailBackLabel,
  creativeDrawerTabHref,
  creativeFullDetailHref,
  creativeScatterPointStyle,
  groupCreativeFamiliesForView,
} from "./creative-performance-v2";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

const family = groupCreativeFamiliesForView(demoCreatives)[0];

function anchorByLabel(markup: string, label: string) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tag = markup.match(
    new RegExp(`<a[^>]*aria-label="${escapedLabel}"[^>]*>`),
  )?.[0];
  expect(tag).toBeDefined();
  const encodedHref = tag?.match(/href="([^"]+)"/)?.[1];
  expect(encodedHref).toBeDefined();
  return new URL(
    encodedHref!.replaceAll("&amp;", "&"),
    "https://tracker.test",
  );
}

describe("Creative V2 navigation and audit interactions", () => {
  it.each(["/overview", "/library"] as const)(
    "keeps drawer tabs on the %s origin with its query",
    (originPathname) => {
      const target = new URL(
        creativeDrawerTabHref({
          familyId: family.id,
          query: {
            from: "2026-07-01",
            to: "2026-07-30",
            currency: "VND",
            view: "grid",
            selected: family.id,
            tab: "preview",
          },
          tab: "rating",
          originPathname,
        }),
        "https://tracker.test",
      );

      expect(target.pathname).toBe(originPathname);
      expect(target.searchParams.get("selected")).toBe(family.id);
      expect(target.searchParams.get("tab")).toBe("rating");
      expect(target.searchParams.get("view")).toBe("grid");
      expect(target.searchParams.get("from")).toBe("2026-07-01");
      expect(target.searchParams.get("currency")).toBe("VND");
    },
  );

  it("keeps a whitelisted origin through full detail tabs and Back", () => {
    const initialDetail = new URL(
      creativeFullDetailHref({
        familyId: family.id,
        query: {
          from: "2026-07-01",
          currency: "VND",
          view: "grid",
          selected: family.id,
        },
        tab: "preview",
        originPathname: "/library",
      }),
      "https://tracker.test",
    );
    expect(initialDetail.pathname).toBe(`/creatives/${family.id}`);
    expect(initialDetail.searchParams.get("origin")).toBe("library");
    expect(initialDetail.searchParams.get("tab")).toBe("preview");
    expect(initialDetail.searchParams.get("selected")).toBeNull();
    expect(initialDetail.searchParams.get("view")).toBe("grid");

    const detailTab = new URL(
      creativeDrawerTabHref({
        familyId: family.id,
        query: {
          from: "2026-07-01",
          currency: "VND",
          origin: "library",
          tab: "preview",
        },
        tab: "rating",
        fullPage: true,
      }),
      "https://tracker.test",
    );
    expect(detailTab.pathname).toBe(`/creatives/${family.id}`);
    expect(detailTab.searchParams.get("origin")).toBe("library");
    expect(detailTab.searchParams.get("tab")).toBe("rating");

    const back = new URL(
      creativeDetailBackHref({
        from: "2026-07-01",
        currency: "VND",
        view: "grid",
        q: "motion",
        origin: "library",
        selected: family.id,
        tab: "rating",
      }),
      "https://tracker.test",
    );
    expect(back.pathname).toBe("/library");
    expect(back.searchParams.get("from")).toBe("2026-07-01");
    expect(back.searchParams.get("currency")).toBe("VND");
    expect(back.searchParams.get("view")).toBe("grid");
    expect(back.searchParams.get("q")).toBe("motion");
    expect(back.searchParams.has("origin")).toBe(false);
    expect(back.searchParams.has("selected")).toBe(false);
    expect(back.searchParams.has("tab")).toBe(false);
    expect(creativeDetailBackLabel({ origin: "library" })).toBe(
      "Quay lại Thư viện Creative",
    );
    expect(
      creativeDetailBackHref({
        origin: "https://malicious.example",
        from: "2026-07-01",
      }),
    ).toBe("/creatives?from=2026-07-01");
  });

  it("renders canonical Ads and a clear Campaign structure CTA in usage", () => {
    const markup = renderToStaticMarkup(
      <CreativeDrawerContent
        family={family}
        query={{
          from: "2026-07-01",
          to: "2026-07-30",
          currency: "VND",
          selected: family.id,
          tab: "usage",
        }}
        originPathname="/library"
      />,
    );

    expect(markup).toContain("Ads");
    expect(markup).toContain("800000000000001");
    expect(markup).toContain("Sao chép Ad ID");
    expect(markup).toContain("Ad Set → Ads");
    expect(markup).toContain("Mở cấu trúc Campaign 700000000000001");
    expect(markup).toContain(
      "/campaigns/700000000000001?from=2026-07-01&amp;to=2026-07-30&amp;currency=VND&amp;tab=structure",
    );
    expect(markup).toContain(
      `/library?from=2026-07-01&amp;to=2026-07-30&amp;currency=VND&amp;selected=${family.id}&amp;tab=rating`,
    );
    expect(markup).toContain(
      `/creatives/${family.id}?from=2026-07-01&amp;to=2026-07-30&amp;currency=VND&amp;tab=usage&amp;origin=library`,
    );
  });

  it("makes table Ads count and rating open their matching detail tabs", () => {
    const markup = renderToStaticMarkup(
      <CreativePerformanceV2
        creatives={[demoCreatives[0]]}
        connected
        query={{
          from: "2026-07-01",
          to: "2026-07-30",
          currency: "VND",
          view: "table",
        }}
        dateFrom="2026-07-01"
        dateTo="2026-07-30"
        accounts={[]}
        account=""
        reportingCurrency="VND"
        currencyOptions={["VND"]}
        compare="previous_period"
        freshness="Dữ liệu mới"
      />,
    );

    const usage = anchorByLabel(
      markup,
      `Xem ${family.adCount} Ads đang dùng ${family.name}`,
    );
    expect(usage.pathname).toBe("/creatives");
    expect(usage.searchParams.get("selected")).toBe(family.id);
    expect(usage.searchParams.get("tab")).toBe("usage");

    const rating = anchorByLabel(
      markup,
      `Mở chi tiết đánh giá ${family.name}`,
    );
    expect(rating.pathname).toBe("/creatives");
    expect(rating.searchParams.get("selected")).toBe(family.id);
    expect(rating.searchParams.get("tab")).toBe("rating");
  });

  it("keeps visual bubble sizing separate from the CSS hitbox", () => {
    expect(creativeScatterPointStyle(32, 48, 19)).toEqual({
      left: "32%",
      top: "48%",
      "--bubble-size": "19px",
    });
    expect(creativeScatterPointStyle(32, 48, 19)).not.toHaveProperty(
      "width",
    );
    expect(creativeScatterPointStyle(32, 48, 19)).not.toHaveProperty(
      "height",
    );
  });
});
