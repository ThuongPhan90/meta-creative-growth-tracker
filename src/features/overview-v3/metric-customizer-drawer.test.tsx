// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  DisplayMetric,
  DisplayMetricIdentity,
  DisplayMetricKey,
  DisplayMetricKind,
  MetricDisplayPresets,
} from "@/lib/reporting/metric-preset";

import { MetricCustomizerDrawer } from "./metric-customizer-drawer";

function metric({
  key = "spend",
  identity = "delivery:spend",
  kind = "delivery",
  label = "Spend",
  locked = false,
  recommended = false,
  eligible = true,
  disabledReason,
}: {
  key?: DisplayMetricKey;
  identity?: DisplayMetricIdentity;
  kind?: DisplayMetricKind;
  label?: string;
  locked?: boolean;
  recommended?: boolean;
  eligible?: boolean;
  disabledReason?: string;
} = {}): DisplayMetric {
  return {
    key,
    identity,
    kind,
    label,
    value: 100,
    state: "ready",
    ...(disabledReason ? { disabledReason } : {}),
    source: "meta_delivery",
    formula: `${label} formula`,
    valueType: "count",
    direction: "neutral",
    slotRole: locked ? "core" : "optional",
    eligible,
    locked,
    recommended,
    current: {
      value: 100,
      state: "ready",
    },
    previous: null,
    comparison: {
      mode: "none",
      state: "not_requested",
      previousValue: null,
      deltaValue: null,
      deltaPercent: null,
      tone: "neutral",
    },
  };
}

const coreMetrics = [
  metric({
    key: "spend",
    identity: "delivery:spend",
    label: "Spend",
    locked: true,
  }),
  metric({
    key: "result:lead",
    identity: "result:lead",
    kind: "result",
    label: "Lead",
    locked: true,
  }),
  metric({
    key: "efficiency:lead",
    identity: "efficiency:lead",
    kind: "efficiency",
    label: "Cost/Lead",
    locked: true,
  }),
];

const recommendedCtr = metric({
  key: "link_ctr",
  identity: "delivery:link_ctr",
  label: "CTR (Link)",
  recommended: true,
});
const linkClicks = metric({
  key: "link_clicks",
  identity: "delivery:link_clicks",
  label: "Link Clicks",
});
const impressions = metric({
  key: "impressions",
  identity: "delivery:impressions",
  label: "Impressions",
});
const cpm = metric({
  key: "cpm",
  identity: "delivery:cpm",
  label: "CPM",
});
const unavailableFrequency = metric({
  key: "frequency",
  identity: "delivery:frequency",
  label: "Frequency",
  eligible: false,
  disabledReason: "Cần exact-period Reach hợp lệ.",
});

function inputFor(container: HTMLElement, identity: string) {
  return container.querySelector<HTMLInputElement>(
    `#metric-${identity.replace(/[^a-z0-9]+/gi, "-")}`,
  );
}

function selectedCount(container: HTMLElement) {
  return Array.from(container.querySelectorAll("strong"))
    .map((element) => element.textContent?.trim())
    .find((value) => /^\d+\/6$/.test(value ?? ""));
}

async function renderDrawer({
  metrics = [...coreMetrics, recommendedCtr, linkClicks, impressions],
  availableMetrics = [
    ...coreMetrics,
    recommendedCtr,
    linkClicks,
    impressions,
    cpm,
    unavailableFrequency,
  ],
  preset = {
    key: "leads:lead",
    value: { version: 1, presets: {} } as MetricDisplayPresets,
  },
  expectedUpdatedAt = "2026-08-01T00:00:00.000Z",
  onClose = vi.fn(),
  onSaved = vi.fn(),
}: Partial<React.ComponentProps<typeof MetricCustomizerDrawer>> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <MetricCustomizerDrawer
        open
        onClose={onClose}
        onSaved={onSaved}
        metrics={metrics}
        availableMetrics={availableMetrics}
        preset={preset}
        expectedUpdatedAt={expectedUpdatedAt}
      />,
    );
  });
  return { container, root, onClose, onSaved };
}

async function unmount(root: Root) {
  await act(async () => root.unmount());
}

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("MetricCustomizerDrawer", () => {
  it("keeps core metrics outside the selectable controls, explains disabled metrics, and enforces the six-metric ceiling", async () => {
    const { container, root } = await renderDrawer();

    expect(container.textContent).toContain("Chỉ số lõi");
    expect(container.textContent).toContain("Spend");
    expect(container.textContent).toContain("Lead");
    expect(container.textContent).toContain("Cost/Lead");
    expect(inputFor(container, "delivery:spend")).toBeNull();
    expect(inputFor(container, "result:lead")).toBeNull();
    expect(selectedCount(container)).toBe("6/6");

    const extra = inputFor(container, "delivery:cpm");
    const invalid = inputFor(container, "delivery:frequency");
    expect(extra?.disabled).toBe(true);
    expect(invalid?.disabled).toBe(true);
    expect(container.textContent).toContain("Đã chọn tối đa 6 chỉ số.");
    expect(container.textContent).toContain("Cần exact-period Reach hợp lệ.");

    const clickInput = inputFor(container, "delivery:link_clicks");
    await act(async () => clickInput?.click());
    expect(selectedCount(container)).toBe("5/6");
    expect(extra?.disabled).toBe(false);

    await act(async () => extra?.click());
    expect(selectedCount(container)).toBe("6/6");
    expect(extra?.checked).toBe(true);
    expect(clickInput?.checked).toBe(false);

    await unmount(root);
  });

  it("restores the deterministic core plus recommended default before saving the controlled preset", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    const { container, root, onClose, onSaved } = await renderDrawer();

    const reset = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("Khôi phục mặc định"));
    await act(async () => reset?.click());

    expect(selectedCount(container)).toBe("4/6");
    expect(inputFor(container, "delivery:link_ctr")?.checked).toBe(true);
    expect(inputFor(container, "delivery:link_clicks")?.checked).toBe(false);
    expect(inputFor(container, "delivery:impressions")?.checked).toBe(false);

    const save = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("Lưu preset"));
    await act(async () => {
      save?.click();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/settings/metric-presets");
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(request.method).toBe("PATCH");
    expect(JSON.parse(String(request.body))).toEqual({
      metricDisplayPresets: {
        version: 1,
        presets: {
          "leads:lead": [
            "spend",
            "result:lead",
            "efficiency:lead",
            "link_ctr",
          ],
        },
      },
      expectedUpdatedAt: "2026-08-01T00:00:00.000Z",
    });
    expect(onSaved).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();

    await unmount(root);
  });
});
