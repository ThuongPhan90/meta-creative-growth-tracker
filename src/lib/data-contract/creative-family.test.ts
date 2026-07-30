import { describe, expect, it } from "vitest";

import {
  buildCreativeFamilyId,
  createCreativeFamilyIdentity,
} from "./creative-family";

describe("Creative Family identity", () => {
  it("is stable for the same canonical physical asset", () => {
    const first = buildCreativeFamilyId({ assetKey: "video:12345" });
    const second = buildCreativeFamilyId({ metaVideoId: "12345" });

    expect(first).toBe(second);
    expect(first).toMatch(/^cf_[a-f0-9]{24}$/);
  });

  it("does not merge different assets that share a reporting code", () => {
    const creativeCode = "V29-VA";
    const first = {
      creativeCode,
      id: buildCreativeFamilyId({ assetKey: "video:111" }),
    };
    const second = {
      creativeCode,
      id: buildCreativeFamilyId({ assetKey: "video:222" }),
    };

    expect(first.creativeCode).toBe(second.creativeCode);
    expect(first.id).not.toBe(second.id);
  });

  it("supports an explicit internal stable identifier without using a name", () => {
    expect(
      createCreativeFamilyIdentity({
        internalStableIdentifier: "legacy-asset-42",
      }),
    ).toMatchObject({
      canonicalIdentity: "internal:legacy-asset-42",
      source: "internal_stable_identifier",
    });
  });
});
