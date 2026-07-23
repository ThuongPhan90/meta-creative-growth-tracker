export type CreativeCodeResult = {
  rawName: string;
  normalizedName: string;
  code: string;
  reason:
    | "known_promotion_alias"
    | "known_traffic_alias"
    | "recognized_code"
    | "fallback_name";
  normalizerVersion: 1;
};

const COPY_SUFFIX = /\s*-\s*copy(?:\s+\d+)?\s*$/i;

function cleanName(value: string) {
  return value
    .trim()
    .replace(COPY_SUFFIX, "")
    .replace(/_/g, "-")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A deliberately conservative alias normalizer. Physical deduplication must
 * still use video_id/image_hash; this code is only a business reporting alias.
 */
export function normalizeCreativeCode(rawName: string): CreativeCodeResult {
  const normalizedName = cleanName(rawName);
  const upper = normalizedName.toUpperCase();

  if (
    upper.includes("NEW APP PROMOTION AD") ||
    upper.includes("QUẢNG CÁO ỨNG DỤNG MỚI")
  ) {
    return {
      rawName,
      normalizedName,
      code: "CHƯA RÕ MÃ – NEW APP",
      reason: "known_promotion_alias",
      normalizerVersion: 1,
    };
  }

  if (upper.includes("NEW TRAFFIC AD")) {
    return {
      rawName,
      normalizedName,
      code: "CHƯA RÕ MÃ – TRAFFIC",
      reason: "known_traffic_alias",
      normalizerVersion: 1,
    };
  }

  const recognized = upper.match(
    /\b(V\d+-(?:2606-TTDL|P\d+|2606(?:-VA)?|2607(?:-VA)?|VA))\b/,
  )?.[1];

  if (recognized) {
    const code =
      /^V\d+-2606$/i.test(recognized) ? `${recognized}-VA` : recognized;
    return {
      rawName,
      normalizedName,
      code,
      reason: "recognized_code",
      normalizerVersion: 1,
    };
  }

  return {
    rawName,
    normalizedName,
    code: normalizedName || "CHƯA RÕ MÃ",
    reason: "fallback_name",
    normalizerVersion: 1,
  };
}
