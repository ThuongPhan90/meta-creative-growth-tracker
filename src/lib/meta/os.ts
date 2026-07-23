export const OPERATING_SYSTEMS = ["ANDROID", "IOS", "UNKNOWN"] as const;

export type OperatingSystem = (typeof OPERATING_SYSTEMS)[number];

/**
 * Normalizes an explicit Meta OS breakdown value.
 *
 * This deliberately does not infer an OS from a creative name. Unknown values
 * remain UNKNOWN so they cannot silently contaminate an Android benchmark.
 */
export function normalizeOperatingSystem(
  value: string | null | undefined,
): OperatingSystem {
  if (!value) {
    return "UNKNOWN";
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

  if (
    normalized === "android" ||
    normalized === "androidsmartphone" ||
    normalized === "androidtablet"
  ) {
    return "ANDROID";
  }

  if (
    normalized === "ios" ||
    normalized === "iphone" ||
    normalized === "ipad" ||
    normalized === "ipod"
  ) {
    return "IOS";
  }

  return "UNKNOWN";
}
