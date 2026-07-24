// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CreativeRow } from "@/types/view-models";
import { CreativeLibrary } from "./creative-library";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

function creative(id: string, name: string): CreativeRow {
  return {
    id,
    name,
    assetKey: `video:${id}`,
    aliases: [],
    format: "Video",
    platform: "Android",
    linkLabel: "Ads",
    linkCount: 1,
    currentAdCount: 1,
    activeAdCount: 1,
    readiness: "Sẵn sàng",
    performanceLabel: "Chưa có dữ liệu",
    imageUrl: "/creative-placeholder.svg",
    duration: null,
    ratio: null,
    pageName: null,
    eventMapping: { install: true, registration: true },
    performance: null,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Creative Library detail interactions", () => {
  it("scrolls the mobile detail into view and restores focus on close", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        media: "(max-width: 980px)",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(
      (callback) => {
        callback(0);
        return 1;
      },
    );

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(CreativeLibrary, {
          creatives: [
            creative("onboarding", "Onboarding Motion"),
            creative("registration", "Registration Motion"),
          ],
          truncated: false,
          isConnected: false,
        }),
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>(
      '[aria-label="Mở chi tiết Registration Motion"]',
    );
    expect(trigger).not.toBeNull();

    await act(async () => {
      trigger?.click();
    });

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(
      container.querySelector("#creative-detail-panel h2")?.textContent,
    ).toBe("Registration Motion");

    const closeButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Đóng chi tiết"]',
    );
    closeButton?.focus();

    await act(async () => {
      closeButton?.click();
    });

    expect(container.querySelector("#creative-detail-panel")).toBeNull();
    expect(document.activeElement).toBe(trigger);

    await act(async () => {
      trigger?.click();
    });

    const detailPanel = container.querySelector<HTMLElement>(
      "#creative-detail-panel",
    );
    expect(detailPanel).not.toBeNull();

    await act(async () => {
      detailPanel?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
        }),
      );
    });

    expect(container.querySelector("#creative-detail-panel")).toBeNull();
    expect(document.activeElement).toBe(trigger);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
