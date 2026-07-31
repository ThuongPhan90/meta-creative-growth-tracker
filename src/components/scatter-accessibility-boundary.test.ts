import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const scatterComponents = [
  "creative-performance-v2.tsx",
  "overview-v2.tsx",
].map((file) => ({
  file,
  source: readFileSync(new URL(file, import.meta.url), "utf8"),
}));

describe("scatter accessibility boundary", () => {
  it.each(scatterComponents)(
    "$file uses the shared legend, status, axis, label, and tooltip contracts",
    ({ source }) => {
      expect(source).toContain("<CreativeScatterLegend");
      expect(source).toContain("<CreativeScatterTooltip");
      expect(source).toContain("creativePerformanceStatus(");
      expect(source).toContain("scatterAxisLabel({");
      expect(source).toContain(
        "ariaLabel={scatterBubbleAriaLabel({",
      );
    },
  );

  it("keeps shared scatter accessibility code result-agnostic", () => {
    const sharedSource = [
      readFileSync(
        new URL(
          "../lib/presentation/creative-performance-status.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFileSync(
        new URL(
          "ui/creative-scatter-accessibility.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
    ].join("\n");

    expect(sharedSource).not.toMatch(
      /\b(?:install|registration|cpi)\b/i,
    );
  });
});
