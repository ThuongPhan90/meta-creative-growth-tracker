// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import type { MetaAssetRow } from "@/types/view-models";
import {
  AssetsView,
  filterMetaAssets,
  getAssetStatusPresentation,
  isInactiveAdAccount,
} from "./assets-view";

const assets: MetaAssetRow[] = [
  {
    id: "business-1",
    name: "Business",
    kind: "Business",
    parentName: null,
    status: "VERIFIED",
  },
  {
    id: "account-active",
    name: "Active account",
    kind: "Ad Account",
    parentName: "Business",
    status: "ACTIVE",
  },
  {
    id: "account-inactive",
    name: "Inactive account",
    kind: "Ad Account",
    parentName: "Business",
    status: "INACTIVE",
  },
  {
    id: "account-disabled",
    name: "Disabled account",
    kind: "Ad Account",
    parentName: "Business",
    status: "STATUS 2",
  },
  {
    id: "page-1",
    name: "Page",
    kind: "Page",
    parentName: null,
    status: "Sports",
  },
];

describe("Meta asset visibility", () => {
  it("hides only non-active ad accounts by default", () => {
    const result = filterMetaAssets(assets, false);

    expect(result.visible.map((asset) => asset.id)).toEqual([
      "business-1",
      "account-active",
      "page-1",
    ]);
    expect(result.activeAdAccountCount).toBe(1);
    expect(result.inactiveAdAccountCount).toBe(2);
    expect(result.needsAttentionAdAccountCount).toBe(0);
  });

  it("restores all assets when inactive ad accounts are enabled", () => {
    const result = filterMetaAssets(assets, true);

    expect(result.visible).toEqual(assets);
    expect(result.activeAdAccountCount).toBe(1);
    expect(result.inactiveAdAccountCount).toBe(2);
    expect(result.needsAttentionAdAccountCount).toBe(0);
  });

  it("keeps actionable inactive accounts hidden but reports them separately", () => {
    const result = filterMetaAssets(
      [
        ...assets,
        {
          ...assets[1],
          id: "account-unsettled",
          status: "UNSETTLED",
        },
      ],
      false,
    );

    expect(result.visible.some((asset) => asset.id === "account-unsettled"))
      .toBe(false);
    expect(result.inactiveAdAccountCount).toBe(3);
    expect(result.needsAttentionAdAccountCount).toBe(1);
  });

  it("never hides an inactive non-ad-account asset", () => {
    expect(
      isInactiveAdAccount({
        id: "page-inactive",
        name: "Inactive Page",
        kind: "Page",
        parentName: null,
        status: "INACTIVE",
      }),
    ).toBe(false);
  });

  it("renders the safe default and an accessible visibility control", () => {
    const html = renderToStaticMarkup(
      createElement(AssetsView, {
        assets,
        connected: false,
      }),
    );

    expect(html).toContain("Business");
    expect(html).toContain("Active account");
    expect(html).toContain("Page");
    expect(html).not.toContain("Inactive account");
    expect(html).not.toContain("Disabled account");
    expect(html).toContain('aria-controls="meta-assets-results"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("2 không hoạt động đã ẩn");
    expect(html).toContain("Xem 2 tài khoản đã ẩn");
  });

  it("shows and hides inactive ad accounts through the toggle", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(AssetsView, {
          assets,
          connected: false,
        }),
      );
    });

    const toggle = container.querySelector<HTMLButtonElement>(
      ".assets-visibility-toggle",
    );
    expect(toggle).not.toBeNull();
    expect(container.textContent).not.toContain("Inactive account");

    await act(async () => {
      toggle?.click();
    });
    expect(toggle?.getAttribute("aria-pressed")).toBe("true");
    expect(container.textContent).toContain("Inactive account");
    expect(container.textContent).toContain("Disabled account");

    await act(async () => {
      toggle?.click();
    });
    expect(toggle?.getAttribute("aria-pressed")).toBe("false");
    expect(container.textContent).not.toContain("Inactive account");

    await act(async () => {
      root.unmount();
    });
  });
});

describe("Meta asset status labels", () => {
  it("translates active and inactive statuses", () => {
    expect(getAssetStatusPresentation(assets[1])).toEqual({
      label: "Hoạt động",
      tone: "active",
    });
    expect(getAssetStatusPresentation(assets[2])).toEqual({
      label: "Không hoạt động",
      tone: "inactive",
    });
  });

  it("keeps Meta status codes visible without guessing their meaning", () => {
    expect(getAssetStatusPresentation(assets[3])).toEqual({
      label: "Không hoạt động · Meta 2",
      tone: "inactive",
    });
  });

  it("preserves the last Meta status when an account leaves latest discovery", () => {
    expect(
      getAssetStatusPresentation({
        ...assets[1],
        isCurrent: false,
        status: "UNSETTLED",
      }),
    ).toEqual({
      label:
        "Không còn trong dữ liệu mới nhất · Meta gần nhất: Chưa thanh toán",
      tone: "attention",
    });
  });

  it.each([
    ["CLOSED", "Không hoạt động · Đã đóng", "inactive"],
    ["DISABLED", "Không hoạt động · Đã vô hiệu hóa", "attention"],
    ["UNSETTLED", "Không hoạt động · Chưa thanh toán", "attention"],
    [
      "PENDING_RISK_REVIEW",
      "Không hoạt động · Chờ đánh giá rủi ro",
      "attention",
    ],
    [
      "PENDING_SETTLEMENT",
      "Không hoạt động · Chờ thanh toán",
      "attention",
    ],
    ["PENDING_CLOSURE", "Không hoạt động · Chờ đóng", "inactive"],
    [
      "IN_GRACE_PERIOD",
      "Không hoạt động · Trong thời gian gia hạn",
      "attention",
    ],
    [
      "PENDING_OTHER",
      "Không hoạt động · Đang chờ Meta xử lý",
      "attention",
    ],
  ] as const)("marks %s as non-operational", (rawStatus, label, tone) => {
    expect(
      getAssetStatusPresentation({
        ...assets[1],
        status: rawStatus,
      }),
    ).toEqual({
      label,
      tone,
    });
  });
});
