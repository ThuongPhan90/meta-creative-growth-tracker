import { describe, expect, it } from "vitest";

import {
  formatMetaVerificationStatus,
  sourceAssetStatus,
} from "./source-status";

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

describe("Meta source activity presentation", () => {
  it("never infers Page activity from discovery or category metadata", () => {
    expect(
      sourceAssetStatus({
        kind: "Page",
        status: "ACTIVE",
        isCurrent: true,
      }),
    ).toEqual({
      label: "Đã phát hiện · Meta không trả activity status",
      tone: "ready",
    });
  });

  it("keeps inactive and unavailable source states explicit", () => {
    expect(
      sourceAssetStatus({
        kind: "Ad Account",
        status: "INACTIVE",
        isCurrent: true,
      }),
    ).toEqual({
      label: "Không hoạt động",
      tone: "pending",
    });
    expect(
      sourceAssetStatus({
        kind: "Business",
        status: "ACTIVE",
        isCurrent: false,
      }),
    ).toEqual({
      label: "Không còn trong lần đồng bộ mới nhất",
      tone: "warning",
    });
  });
});
