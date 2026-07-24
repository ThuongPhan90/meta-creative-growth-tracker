import { describe, expect, it } from "vitest";

import {
  normalizeActionTypes,
  parseActionTypesInput,
  validateActionTypeMapping,
} from "./action-type-mapping";

describe("action type mapping", () => {
  it("trims, removes blank values and deduplicates in original order", () => {
    expect(
      normalizeActionTypes([
        " mobile_app_install ",
        "",
        "mobile_app_install",
        " omni_app_install ",
        "   ",
      ]),
    ).toEqual(["mobile_app_install", "omni_app_install"]);

    expect(
      parseActionTypesInput(
        " mobile_app_install, mobile_app_install, omni_app_install ",
      ),
    ).toEqual(["mobile_app_install", "omni_app_install"]);
  });

  it("rejects an action type assigned to both event groups", () => {
    const result = validateActionTypeMapping({
      installActionTypes: [
        "mobile_app_install",
        " complete_registration ",
      ],
      registrationActionTypes: [
        "complete_registration",
        "omni_complete_registration",
      ],
    });

    expect(result).toMatchObject({
      ok: false,
      code: "ACTION_TYPE_MAPPING_CONFLICT",
      installActionTypes: [
        "mobile_app_install",
        "complete_registration",
      ],
      registrationActionTypes: [
        "complete_registration",
        "omni_complete_registration",
      ],
    });
    expect(result.ok ? "" : result.error).toContain(
      '"complete_registration"',
    );
    expect(result.ok ? "" : result.error).toContain(
      "cả Install và Registration",
    );
  });

  it("accepts two normalized, disjoint event groups", () => {
    expect(
      validateActionTypeMapping({
        installActionTypes: [
          " mobile_app_install ",
          "mobile_app_install",
        ],
        registrationActionTypes: [" complete_registration "],
      }),
    ).toEqual({
      ok: true,
      installActionTypes: ["mobile_app_install"],
      registrationActionTypes: ["complete_registration"],
    });
  });
});
