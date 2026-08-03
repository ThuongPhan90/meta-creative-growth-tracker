import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { DashboardViewModel } from "@/types/view-models";

import { DataHealthV2 } from "./data-health-v2";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

const setupDashboard: DashboardViewModel = {
  mode: "setup",
  ownerName: "Owner",
  connectionLabel: "Chưa kết nối Meta",
  connectionDetail: "Nhập mã owner để mở Meta OAuth read-only.",
  lastSyncAt: null,
  hasDelivery: false,
  counts: {
    businesses: 0,
    adAccounts: 0,
    pages: 0,
    creatives: 0,
  },
  events: [
    {
      name: "Install",
      android: "locked",
      ios: "locked",
      total: null,
    },
    {
      name: "CompleteRegistration",
      android: "locked",
      ios: "locked",
      total: null,
    },
  ],
  checklist: [
    {
      label: "Quyền truy cập",
      status: "locked",
      detail: "Chưa xác thực Meta",
    },
    {
      label: "Event mapping",
      status: "locked",
      detail: "Chưa có dữ liệu Insights để xác minh",
    },
  ],
};

describe("DataHealthV2 setup state", () => {
  it("does not present zero or demo coverage as measured data", () => {
    const html = renderToStaticMarkup(
      createElement(DataHealthV2, {
        dashboard: setupDashboard,
        creatives: [],
        syncRuns: [],
        connected: false,
        query: {},
      }),
    );

    expect(html).toContain("Trạng thái tổng thể: Chưa có nguồn dữ liệu");
    expect(html).toContain("Chưa khả dụng");
    expect(html).toContain("Kết nối Meta để xác định mẫu số coverage.");
    expect(html).toContain("Kết nối Meta để tải phạm vi nguồn");
    expect(html).not.toContain("2 tài khoản");
    expect(html).not.toContain("4 Creative assets");
    expect(html).not.toContain("30/07/2026, 15:10");
    expect(html).toContain('aria-valuetext="Chưa khả dụng"');
    expect(html).not.toContain('aria-valuenow="0"');
  });

  it.each(["campaign", "event"])(
    "keeps the %s coverage drawer unavailable before Meta connection",
    (coverage) => {
      const html = renderToStaticMarkup(
        createElement(DataHealthV2, {
          dashboard: setupDashboard,
          creatives: [],
          syncRuns: [],
          connected: false,
          query: { coverage },
        }),
      );

      expect(html).toContain("<h3>Chưa có mẫu số</h3>");
      expect(html).toContain("Kết nối Meta để xác định mẫu số coverage.");
      expect(html).toContain("Hệ thống chưa thể đánh giá thiếu hoặc đủ.");
      expect(html).toContain("<dd>—</dd>");
      expect(html).not.toContain(
        "Không có Creative Family thiếu liên kết",
      );
      expect(html).not.toContain("Chưa có mapping");
      expect(html).not.toContain("<dd>0</dd>");
    },
  );

  it("does not diagnose a disconnected source when only delivery is unavailable", () => {
    const html = renderToStaticMarkup(
      createElement(DataHealthV2, {
        dashboard: setupDashboard,
        creatives: [],
        syncRuns: [],
        connected: true,
        query: { coverage: "delivery_ready_account" },
        liveDelivery: {
          selectedAccountCount: 1,
          deliveryEligibleAccountCount: 1,
          deliveryReadyAccountCount: 0,
          state: "unavailable",
        },
      }),
    );

    expect(html).toContain("Snapshot delivery chưa khả dụng cho scope hiện tại");
    expect(html).toContain("Hệ thống chưa thể đánh giá thiếu hoặc đủ.");
    expect(html).not.toContain("Kết nối Meta để tải dữ liệu nguồn trước");
    expect(html).not.toContain("Kết nối Meta để xác định mẫu số coverage.");
  });
});
