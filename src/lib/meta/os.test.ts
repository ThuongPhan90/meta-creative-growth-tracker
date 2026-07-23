import { describe, expect, it } from "vitest";
import { normalizeOperatingSystem } from "./os";

describe("normalizeOperatingSystem", () => {
  it.each([
    ["Android", "ANDROID"],
    ["android_smartphone", "ANDROID"],
    ["Android Tablet", "ANDROID"],
    ["iOS", "IOS"],
    ["iPhone", "IOS"],
    ["i_pad", "IOS"],
  ] as const)("normalizes %s to %s", (input, expected) => {
    expect(normalizeOperatingSystem(input)).toBe(expected);
  });

  it.each([undefined, null, "", "Windows", "mobile_app", "other"])(
    "keeps unsupported values as UNKNOWN",
    (input) => {
      expect(normalizeOperatingSystem(input)).toBe("UNKNOWN");
    },
  );
});
