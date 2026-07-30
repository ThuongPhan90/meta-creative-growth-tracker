import { createHash } from "node:crypto";

export type CreativeFamilyIdentityInput = {
  assetKey?: string | null;
  metaVideoId?: string | null;
  metaImageHash?: string | null;
  internalStableIdentifier?: string | null;
};

export type CreativeFamilyIdentity = {
  creativeFamilyId: string;
  canonicalIdentity: string;
  source: "physical_asset" | "internal_stable_identifier";
};

const CANONICAL_ASSET_TYPES = new Set(["video", "image", "unknown"]);

function requiredTrimmed(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Resolves identity strictly from a physical asset key or an explicit stable
 * internal identifier. Creative names and reporting aliases are intentionally
 * absent from this contract and therefore cannot merge unrelated assets.
 */
export function resolveCreativeFamilyIdentity(
  input: CreativeFamilyIdentityInput,
): Omit<CreativeFamilyIdentity, "creativeFamilyId"> {
  const assetKey = requiredTrimmed(input.assetKey);
  if (assetKey) {
    const separator = assetKey.indexOf(":");
    const assetType =
      separator > 0 ? assetKey.slice(0, separator).toLowerCase() : "";
    const identifier =
      separator > 0 ? requiredTrimmed(assetKey.slice(separator + 1)) : null;

    if (!CANONICAL_ASSET_TYPES.has(assetType) || !identifier) {
      throw new Error(
        "assetKey must use video:<id>, image:<hash>, or unknown:<stable-id>",
      );
    }

    return {
      canonicalIdentity: `${assetType}:${identifier}`,
      source:
        assetType === "unknown"
          ? "internal_stable_identifier"
          : "physical_asset",
    };
  }

  const metaVideoId = requiredTrimmed(input.metaVideoId);
  if (metaVideoId) {
    return {
      canonicalIdentity: `video:${metaVideoId}`,
      source: "physical_asset",
    };
  }

  const metaImageHash = requiredTrimmed(input.metaImageHash);
  if (metaImageHash) {
    return {
      canonicalIdentity: `image:${metaImageHash}`,
      source: "physical_asset",
    };
  }

  const internalStableIdentifier = requiredTrimmed(
    input.internalStableIdentifier,
  );
  if (internalStableIdentifier) {
    return {
      canonicalIdentity: `internal:${internalStableIdentifier}`,
      source: "internal_stable_identifier",
    };
  }

  throw new Error(
    "A canonical physical asset or internal stable identifier is required",
  );
}

/**
 * The 96-bit digest is a compact route-safe identifier. MD5 is used only as a
 * deterministic database-compatible digest, never for security.
 */
export function buildCreativeFamilyId(
  input: CreativeFamilyIdentityInput,
): string {
  const { canonicalIdentity } = resolveCreativeFamilyIdentity(input);
  const digest = createHash("md5")
    .update(canonicalIdentity, "utf8")
    .digest("hex")
    .slice(0, 24);
  return `cf_${digest}`;
}

export function createCreativeFamilyIdentity(
  input: CreativeFamilyIdentityInput,
): CreativeFamilyIdentity {
  const identity = resolveCreativeFamilyIdentity(input);
  return {
    ...identity,
    creativeFamilyId: buildCreativeFamilyId(input),
  };
}
