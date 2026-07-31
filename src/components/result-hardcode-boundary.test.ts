import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const componentSources = [
  "campaigns-v2.tsx",
  "creative-library-v2.tsx",
  "creative-performance-v2.tsx",
  "overview-v2.tsx",
].map((file) => ({
  file,
  source: readFileSync(new URL(file, import.meta.url), "utf8"),
}));

describe("shared Result UI boundary", () => {
  it.each(componentSources)(
    "$file does not read legacy Install, Registration, or CPI fields",
    ({ source }) => {
      expect(source).not.toMatch(
        /\.(?:installs|registrations|cpi|costPerRegistration)\b/,
      );
      expect(source).not.toContain("ratingExplanation");
      expect(source).not.toContain("PerformanceRating");
      expect(source).not.toContain("legacyInstallFallback");
    },
  );

  it.each(componentSources)(
    "$file does not branch rendering on Install or Registration keys",
    ({ source }) => {
      expect(source).not.toMatch(
        /(?:resultKey|primaryResultKey|canonicalResultKey)\s*===\s*["'](?:install|complete_registration)["']/,
      );
      expect(source).not.toMatch(
        /Chi phí\/(?:Install|Registration)|\bCPI\b/,
      );
    },
  );
});
