// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TrackerSettings } from "@/lib/db";

import { SettingsV2 } from "./settings-v2";

vi.mock("@/components/sync-button", () => ({
  SyncButton: () => <button type="button">Đồng bộ ngay</button>,
}));

const initial: TrackerSettings = {
  ownerId: 1,
  reportingTimezone: "Asia/Ho_Chi_Minh",
  reportingCurrency: "VND",
  syncLookbackDays: 30,
  minimumInstallThreshold: 20,
  minimumRegistrationThreshold: 10,
  benchmarkMode: "custom",
  benchmarkWindowDays: 30,
  benchmarkByOs: true,
  benchmarkByFormat: true,
  numberFormat: "vi-VN",
  compareDefault: "previous_period",
  scoringWeights: { cpi: 40, cpa: 40, hook: 10, hold: 10 },
  syncCadence: "deployment",
  alertChannel: "none",
  installActionTypes: ["mobile_app_install"],
  registrationActionTypes: ["complete_registration"],
  lastInitialSyncAt: null,
  updatedAt: "2026-07-29T09:42:00.000Z",
};

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState(null, "", "/");
  vi.clearAllMocks();
});

describe("Settings V2 tabs and audit", () => {
  it("keeps unsaved form state while updating the tab URL and renders read-only history", async () => {
    window.history.replaceState(null, "", "/settings?tab=reporting");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SettingsV2
          initial={initial}
          activeTab="reporting"
          auditLog={[
            {
              id: "audit-1",
              changedAt: "2026-07-29T09:42:00.000Z",
              changedAtLabel: "16:42 29 thg 7, 2026",
              actorLabel: "Owner",
              changes: [
                {
                  key: "reportingCurrency",
                  label: "Tiền tệ báo cáo",
                  before: "Theo từng tài khoản",
                  after: "VND",
                },
              ],
              hasHiddenChanges: false,
            },
          ]}
          canSave={false}
          tokenExpiresAt={null}
          dataAccessExpiresAt={null}
          grantedScopes={[]}
        />,
      );
    });

    const currency = Array.from(
      container.querySelectorAll<HTMLSelectElement>("select"),
    ).find((select) =>
      Array.from(select.options).some((option) => option.value === "USD"),
    );
    expect(currency).toBeDefined();
    await act(async () => {
      if (!currency) return;
      currency.value = "USD";
      currency.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const syncTab = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".v2-tab"),
    ).find((button) => button.textContent?.includes("Đồng bộ & bảo mật"));
    await act(async () => syncTab?.click());

    expect(window.location.search).toBe("?tab=sync");
    expect(container.textContent).toContain("Nhật ký cài đặt");
    expect(container.textContent).toContain("Tiền tệ báo cáo");
    expect(container.textContent).toContain("Chỉ đọc · 1 bản ghi");

    const reportingTab = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".v2-tab"),
    ).find((button) => button.textContent?.includes("Báo cáo"));
    await act(async () => reportingTab?.click());

    expect(window.location.search).toBe("?tab=reporting");
    const currentCurrency = Array.from(
      container.querySelectorAll<HTMLSelectElement>("select"),
    ).find((select) =>
      Array.from(select.options).some((option) => option.value === "USD"),
    );
    expect(currentCurrency?.value).toBe("USD");

    await act(async () => root.unmount());
  });
});
