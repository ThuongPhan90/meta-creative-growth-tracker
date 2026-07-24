import { describe, expect, it } from "vitest";

import { syncHttpOutcome } from "./http-status";

describe("syncHttpOutcome", () => {
  it.each(["queued", "running"] as const)(
    "returns an in-progress 202 for %s runs",
    (status) => {
      expect(syncHttpOutcome(status)).toMatchObject({
        ok: true,
        status: 202,
        code: "SYNC_IN_PROGRESS",
      });
      expect(syncHttpOutcome(status).message).not.toContain("đã hoàn tất");
    },
  );

  it("reports only a succeeded run as fully completed", () => {
    expect(syncHttpOutcome("succeeded")).toEqual({
      ok: true,
      status: 200,
      message: "Đồng bộ Meta đã hoàn tất.",
    });
  });

  it.each([
    ["failed", 500, "SYNC_FAILED"],
    ["cancelled", 409, "SYNC_CANCELLED"],
  ] as const)("does not report a %s run as successful", (status, http, code) => {
    expect(syncHttpOutcome(status)).toMatchObject({
      ok: false,
      status: http,
      code,
    });
  });
});
