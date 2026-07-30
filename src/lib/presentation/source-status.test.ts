import { describe, expect, it } from "vitest";

import { formatMetaVerificationStatus } from "./source-status";

describe("Meta verification status presentation", () => {
  it.each([
    ["VERIFIED", "Đã xác minh"],
    ["not_verified", "Chưa xác minh"],
    ["pending_review", "Đang được xem xét"],
    ["REJECTED", "Không được xác minh"],
  ])("translates %s without exposing raw API values", (raw, label) => {
    expect(formatMetaVerificationStatus(raw)).toBe(label);
  });

  it("uses safe copy for missing and unknown values", () => {
    expect(formatMetaVerificationStatus(null)).toBe(
      "Meta chưa trả trạng thái xác minh",
    );
    expect(formatMetaVerificationStatus("future_state")).toBe(
      "Trạng thái xác minh chưa được hỗ trợ",
    );
  });
});
