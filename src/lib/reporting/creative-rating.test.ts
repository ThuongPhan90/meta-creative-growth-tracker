import { describe, expect, it } from "vitest";

import {
  baselineKey,
  computeOsCpiBaselines,
  rateCreativeCpi,
} from "./creative-rating";

describe("rateCreativeCpi", () => {
  it.each([
    [{ installs: 0, cpi: null, osBaselineCpi: 10 }, "KHÔNG INSTALL"],
    [{ installs: 19, cpi: 7, osBaselineCpi: 10 }, "ÍT DỮ LIỆU"],
    [{ installs: 20, cpi: 8, osBaselineCpi: 10 }, "TỐT"],
    [{ installs: 20, cpi: 12, osBaselineCpi: 10 }, "ỔN"],
    [{ installs: 20, cpi: 12.01, osBaselineCpi: 10 }, "KÉM"],
  ] as const)("rates the sheet thresholds", (input, expected) => {
    expect(rateCreativeCpi(input)).toBe(expected);
  });
});

describe("computeOsCpiBaselines", () => {
  it("separates OS and currency", () => {
    const result = computeOsCpiBaselines([
      { operatingSystem: "ANDROID", currency: "USD", spend: 100, installs: 10 },
      { operatingSystem: "ANDROID", currency: "USD", spend: 50, installs: 5 },
      { operatingSystem: "IOS", currency: "USD", spend: 200, installs: 10 },
      { operatingSystem: "ANDROID", currency: "VND", spend: 250_000, installs: 5 },
    ]);

    expect(result.get(baselineKey("ANDROID", "USD"))).toBe(10);
    expect(result.get(baselineKey("IOS", "USD"))).toBe(20);
    expect(result.get(baselineKey("ANDROID", "VND"))).toBe(50_000);
  });
});
