// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TrackerSettings } from "@/lib/db";
import {
  DEFAULT_RESULT_DEFINITIONS,
  type PersistedResultMapping,
} from "@/lib/reporting/result-definition";

import {
  SettingsV2,
  type SettingsReportingContract,
  type SettingsResultRegistry,
  type SettingsTab,
} from "./settings-v2";

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
  metricDisplayPresets: { version: 1, presets: {} },
  lastInitialSyncAt: null,
  updatedAt: "2026-07-29T09:42:00.000Z",
};

const reportingContract: SettingsReportingContract = {
  reportingTimezoneMode: "account_local",
  currencyMode: "single",
  businessIds: ["biz_1"],
  adAccountIds: ["act_1"],
  defaultObjectiveKey: "all",
  defaultPrimaryResultKey: null,
  attributionSettingKey: "account_default",
  actionReportTime: "mixed",
  syncVersion: "sync_2026_07_31",
};

const definitions = DEFAULT_RESULT_DEFINITIONS.filter((definition) =>
  ["lead", "install", "purchase"].includes(definition.canonicalKey),
).map((definition) => ({
  ...definition,
  objectiveKeys: [...definition.objectiveKeys],
  rawActionTypes: [...definition.rawActionTypes],
  rawValueActionTypes: [...(definition.rawValueActionTypes ?? [])],
}));

const mappings: PersistedResultMapping[] = definitions.flatMap(
  (definition) =>
    definition.rawActionTypes.map((rawActionType, priority) => ({
      id: `${definition.canonicalKey}:${priority}`,
      canonicalResultKey: definition.canonicalKey,
      rawActionType,
      metricSource: "action" as const,
      priority,
      mappingSource: "system" as const,
      enabled: true,
    })),
);

const resultRegistry: SettingsResultRegistry = {
  definitions,
  mappings,
  campaignOverrides: [
    {
      campaignId: "campaign_1",
      canonicalResultKey: "lead",
      enabled: true,
    },
  ],
  source: "database",
  warning: null,
};

const auditLog = [
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
];

async function renderSettings({
  activeTab = "reporting",
  canSave = false,
  registry = resultRegistry,
}: {
  activeTab?: SettingsTab;
  canSave?: boolean;
  registry?: SettingsResultRegistry;
} = {}) {
  window.history.replaceState(null, "", `/settings?tab=${activeTab}`);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <SettingsV2
        initial={initial}
        activeTab={activeTab}
        reportingContract={reportingContract}
        resultRegistry={registry}
        auditLog={auditLog}
        canSave={canSave}
        tokenExpiresAt={null}
        dataAccessExpiresAt={null}
        grantedScopes={["ads_read", "business_management"]}
      />,
    );
  });
  return { container, root };
}

async function clickTab(container: HTMLElement, text: string) {
  const tab = Array.from(
    container.querySelectorAll<HTMLButtonElement>(".v2-tab"),
  ).find((button) => button.textContent?.includes(text));
  await act(async () => tab?.click());
}

async function unmount(root: Root) {
  await act(async () => root.unmount());
}

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Settings V2 reporting contract and tabs", () => {
  it("uses the four final tabs and keeps unsaved state across URL tab changes", async () => {
    const { container, root } = await renderSettings();
    expect(
      Array.from(container.querySelectorAll(".v2-tab")).map((tab) =>
        tab.textContent?.trim(),
      ),
    ).toEqual([
      "Báo cáo",
      "Chỉ số hiển thị",
      "Benchmark & Đánh giá",
      "Đồng bộ & Bảo mật",
    ]);

    const currency = Array.from(
      container.querySelectorAll<HTMLSelectElement>("select"),
    ).find((select) =>
      Array.from(select.options).some((option) => option.value === "USD"),
    );
    await act(async () => {
      if (!currency) return;
      currency.value = "USD";
      currency.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await clickTab(container, "Đồng bộ & Bảo mật");
    expect(window.location.search).toBe("?tab=sync");
    expect(container.textContent).toContain("Nhật ký cài đặt");
    expect(container.textContent).toContain("Tiền tệ báo cáo");
    expect(container.textContent).toContain("Chỉ đọc · 1 bản ghi");

    await clickTab(container, "Báo cáo");
    expect(window.location.search).toBe("?tab=reporting");
    const currentCurrency = Array.from(
      container.querySelectorAll<HTMLSelectElement>("select"),
    ).find((select) =>
      Array.from(select.options).some((option) => option.value === "USD"),
    );
    expect(currentCurrency?.value).toBe("USD");
    await unmount(root);
  });

  it("shows attribution, report-time, scope and unavailable defaults honestly", async () => {
    const { container, root } = await renderSettings();
    expect(container.textContent).toContain("account_local");
    expect(container.textContent).toContain("account_default");
    expect(container.textContent).toContain("mixed");
    expect(container.textContent).toContain("sync_2026_07_31");
    expect(container.textContent).toContain(
      "Chưa có API lưu workspace default",
    );

    const disabledDefaults = Array.from(
      container.querySelectorAll<HTMLInputElement>("input:disabled"),
    ).map((input) => input.value);
    expect(disabledDefaults).toContain("1 Business · 1 Ad Account");
    expect(disabledDefaults).toContain("all");
    expect(disabledDefaults).toContain(
      "Theo Objective + Result Registry",
    );
    await unmount(root);
  });
});

describe("Settings V2 result, benchmark and sync behavior", () => {
  it("renders universal Result definitions and saves an owner raw mapping through the real API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { message: "Đã lưu Result Mapping." },
        meta: { warnings: [] },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { container, root } = await renderSettings({
      activeTab: "results",
      canSave: true,
    });

    expect(container.textContent).toContain(
      "Install chỉ là một Result, không phải mặc định bắt buộc",
    );
    expect(container.textContent).toContain("Meta-attributed Lead");
    expect(container.textContent).toContain("Meta-attributed Purchase");
    expect(container.textContent).toContain("Mapping coverage preview");
    expect(container.textContent).toContain("1 override · chỉ đọc");
    expect(container.textContent).toContain("Secondary Result");
    expect(container.textContent).toContain("Chưa có API lưu");
    expect(container.textContent).toContain("Chưa có preset đã lưu");

    const coverageLink = container.querySelector<HTMLAnchorElement>(
      'a[aria-label="Mở chi tiết Mapping coverage"]',
    );
    const coverageTarget = container.querySelector<HTMLElement>(
      "#result-mapping-coverage",
    );
    expect(coverageLink?.getAttribute("href")).toBe(
      "#result-mapping-coverage",
    );
    expect(coverageTarget?.getAttribute("aria-label")).toBe(
      "Chi tiết Mapping coverage",
    );

    window.history.replaceState(
      null,
      "",
      "/settings?tab=results&business_ids=bm_1&account_ids=act_1&objective=leads&result=lead",
    );
    await act(async () => {
      coverageLink?.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          window.history.pushState(
            null,
            "",
            coverageLink.getAttribute("href") ?? "",
          );
        },
        { once: true },
      );
      coverageLink?.click();
    });
    expect(window.location.search).toBe(
      "?tab=results&business_ids=bm_1&account_ids=act_1&objective=leads&result=lead",
    );
    expect(window.location.hash).toBe("#result-mapping-coverage");

    const leadInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Raw action type cho Meta-attributed Lead"]',
    );
    await act(async () => {
      if (!leadInput) return;
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(leadInput, "owner_lead");
      leadInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const addButton = leadInput
      ?.closest(".v2-action-editor")
      ?.querySelector<HTMLButtonElement>(".button--secondary");
    await act(async () => addButton?.click());

    const saveButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.includes("Lưu Result Mapping"));
    await act(async () => saveButton?.click());

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/result-mappings");
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as {
      mappings: Array<{ rawActionType: string }>;
    };
    expect(
      body.mappings.some(
        (mapping) => mapping.rawActionType === "owner_lead",
      ),
    ).toBe(true);
    expect(container.textContent).toContain("Đã lưu Result Mapping.");
    await unmount(root);
  });

  it("labels fallback mapping read-only and exposes transparent benchmark and sync limits", async () => {
    const { container, root } = await renderSettings({
      activeTab: "results",
      canSave: true,
      registry: {
        ...resultRegistry,
        source: "built_in_defaults",
        warning: "Không thể tải registry đã lưu.",
      },
    });
    expect(container.textContent).toContain("fallback chỉ đọc");
    expect(container.textContent).toContain("Result Mapping chỉ đọc");
    expect(
      Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("Result Mapping chỉ đọc"),
      )?.disabled,
    ).toBe(true);

    await clickTab(container, "Benchmark & Đánh giá");
    const benchmarkWindow = Array.from(
      container.querySelectorAll<HTMLSelectElement>("select"),
    ).find((select) =>
      Array.from(select.options).some(
        (option) => option.textContent === "14 ngày",
      ),
    );
    expect(
      Array.from(benchmarkWindow?.options ?? []).map((option) => option.value),
    ).toEqual(["7", "14", "30"]);
    expect(container.textContent).toContain("±15% · chưa có API lưu");
    expect(container.textContent).toContain("Không dựng benchmark giả");
    expect(container.textContent).toContain(
      "Selected Business + Objective + Result + Format",
    );
    expect(container.textContent).toContain("Chưa đủ mẫu so sánh");
    expect(container.textContent).toContain(
      "không tự đổi budget, pause ad",
    );

    await clickTab(container, "Đồng bộ & Bảo mật");
    expect(
      Array.from(
        container.querySelectorAll<HTMLInputElement>("input:disabled"),
      ).map((input) => input.value),
    ).toContain("Chưa có API backfill tại Settings");
    expect(container.textContent).toContain(
      "ads_read, business_management",
    );
    expect(container.textContent).toContain("Không có thao tác nào ghi sang Meta");
    await unmount(root);
  });
});
