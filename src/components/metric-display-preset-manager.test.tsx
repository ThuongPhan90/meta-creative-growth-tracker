// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_RESULT_DEFINITIONS,
  type ResultDefinition,
} from "@/lib/reporting/result-definition";
import type { MetricDisplayPresets } from "@/lib/reporting/metric-preset";

import { MetricDisplayPresetManager } from "./metric-display-preset-manager";

const refresh = vi.fn();

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const resultDefinitions = DEFAULT_RESULT_DEFINITIONS.filter((definition) =>
  ["lead", "install", "purchase", "purchase_value"].includes(
    definition.canonicalKey,
  ),
).map((definition) => ({
  ...definition,
  objectiveKeys: [...definition.objectiveKeys],
  rawActionTypes: [...definition.rawActionTypes],
  rawValueActionTypes: [...(definition.rawValueActionTypes ?? [])],
})) as ResultDefinition[];

const presets: MetricDisplayPresets = {
  version: 1 as const,
  presets: {
    all: ["spend", "impressions", "link_clicks", "link_ctr"],
    "leads:lead": [
      "spend",
      "result:lead",
      "efficiency:lead",
      "link_ctr",
    ],
  },
};

async function renderManager({
  canSave = true,
  currencyMode = "single" as const,
}: {
  canSave?: boolean;
  currencyMode?: "single" | "split";
} = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <MetricDisplayPresetManager
        initialPresets={presets}
        initialUpdatedAt="2026-08-01T00:00:00.000Z"
        resultDefinitions={resultDefinitions}
        currencyMode={currencyMode}
        canSave={canSave}
        onRefresh={refresh}
      />,
    );
  });
  return { container, root };
}

async function unmount(root: Root) {
  await act(async () => root.unmount());
}

afterEach(() => {
  document.body.replaceChildren();
  refresh.mockReset();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("MetricDisplayPresetManager", () => {
  it("shows saved presets by Objective + Primary Result with formula and contract eligibility, without account-level controls", async () => {
    const { container, root } = await renderManager();

    expect(container.textContent).toContain("2 preset đã lưu");
    expect(container.textContent).toContain("Tất cả mục tiêu");
    expect(container.textContent).toContain(
      "Khách hàng tiềm năng · Meta-attributed Lead",
    );
    expect(container.textContent).toContain("Σ spend");
    expect(container.textContent).toContain("Spend / Meta-attributed Lead");
    expect(container.textContent).toContain(
      "Hợp lệ theo Objective + Primary Result.",
    );
    expect(container.textContent).toContain(
      "không theo Ad Account, Campaign, Business hoặc khoảng ngày",
    );
    expect(container.querySelectorAll("input, select")).toHaveLength(0);
    expect(
      container.querySelector('a[href="/overview?objective=leads&result=lead"]')
        ?.textContent,
    ).toContain("Xem trên Tổng quan");

    await unmount(root);
  });

  it("resets one saved context through the optimistic-concurrency API and preserves other presets", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        metricDisplayPresets: {
          version: 1,
          presets: {
            all: ["spend", "impressions", "link_clicks", "link_ctr"],
          },
        },
        updatedAt: "2026-08-01T00:01:00.000Z",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { container, root } = await renderManager();

    const reset = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Đặt lại preset Khách hàng tiềm năng · Meta-attributed Lead về mặc định"]',
    );
    await act(async () => {
      reset?.click();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/settings/metric-presets",
    );
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(request.method).toBe("PATCH");
    expect(JSON.parse(String(request.body))).toEqual({
      metricDisplayPresets: {
        version: 1,
        presets: {
          all: ["spend", "impressions", "link_clicks", "link_ctr"],
        },
      },
      expectedUpdatedAt: "2026-08-01T00:00:00.000Z",
    });
    expect(container.textContent).toContain("1 preset đã lưu");
    expect(container.textContent).not.toContain(
      "Khách hàng tiềm năng · Meta-attributed Lead",
    );
    expect(container.textContent).toContain(
      "Đã đặt lại preset. Tổng quan sẽ dùng bộ chỉ số mặc định.",
    );

    await unmount(root);
  });

  it("disables reset without an owner session and reloads rather than overwriting a conflicting revision", async () => {
    const { container, root } = await renderManager({ canSave: false });
    const disabledReset = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Đặt lại preset Khách hàng tiềm năng · Meta-attributed Lead về mặc định"]',
    );
    expect(disabledReset?.disabled).toBe(true);
    expect(container.textContent).toContain(
      "Cần phiên owner đã kết nối Meta để đặt lại preset.",
    );
    await unmount(root);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        ok: false,
        code: "SETTINGS_CONFLICT",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const next = await renderManager();
    const reset = next.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Đặt lại preset Khách hàng tiềm năng · Meta-attributed Lead về mặc định"]',
    );
    await act(async () => {
      reset?.click();
      await Promise.resolve();
    });

    expect(refresh).toHaveBeenCalledOnce();
    expect(next.container.textContent).toContain(
      "Preset đã được thay đổi ở một phiên khác",
    );
    await unmount(next.root);
  });
});
