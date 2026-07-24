import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  PerformanceRating,
  performanceRatingTone,
} from "./performance-rating";

describe("PerformanceRating", () => {
  it.each([
    ["TỐT", "good"],
    ["ỔN", "stable"],
    ["KÉM", "poor"],
    ["KHÔNG INSTALL", "poor"],
    ["ÍT DỮ LIỆU", "limited"],
  ] as const)("maps %s to the %s tone", (rating, tone) => {
    expect(performanceRatingTone(rating)).toBe(tone);
  });

  it("renders a distinct class for poor performance", () => {
    const html = renderToStaticMarkup(
      createElement(PerformanceRating, { rating: "KÉM" }),
    );

    expect(html).toContain("performance-rating--poor");
    expect(html).toContain("KÉM");
  });
});
