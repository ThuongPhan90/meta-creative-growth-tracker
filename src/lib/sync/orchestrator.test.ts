import { describe, expect, it } from "vitest";

import { stagesForSyncKind } from "./orchestrator";

describe("sync stage plans", () => {
  it("runs only validation and inventory for an asset sync", () => {
    expect(stagesForSyncKind("assets")).toEqual(["validate", "assets"]);
  });

  it("does not fetch assets during an insights-only retry", () => {
    expect(stagesForSyncKind("insights")).toEqual(["validate", "insights"]);
  });

  it.each(["full", "incremental"] as const)(
    "runs the full ordered pipeline for %s",
    (kind) => {
      expect(stagesForSyncKind(kind)).toEqual([
        "validate",
        "assets",
        "insights",
      ]);
    },
  );
});
