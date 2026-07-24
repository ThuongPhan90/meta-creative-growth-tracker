import { describe, expect, it } from "vitest";

import { groupSyncWarnings } from "./warning-groups";

describe("groupSyncWarnings", () => {
  it("groups repeated warnings and preserves distinct resources", () => {
    expect(
      groupSyncWarnings([
        { code: "A", resource: "one", message: "Fallback used." },
        { code: "A", resource: "two", message: "Fallback used." },
        { code: "A", resource: "one", message: "Fallback used." },
        { code: "B", resource: null, message: "Needs attention." },
      ]),
    ).toEqual([
      {
        code: "A",
        message: "Fallback used.",
        count: 3,
        resources: ["one", "two"],
      },
      {
        code: "B",
        message: "Needs attention.",
        count: 1,
        resources: [],
      },
    ]);
  });

  it("does not merge the same code when the meaning differs", () => {
    expect(
      groupSyncWarnings([
        { code: "A", resource: null, message: "First" },
        { code: "A", resource: null, message: "Second" },
      ]),
    ).toHaveLength(2);
  });
});
