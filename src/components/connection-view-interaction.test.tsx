// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConnectionView } from "./connection-view";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh,
  }),
}));

afterEach(() => {
  document.body.replaceChildren();
  document.body.style.overflow = "";
  vi.clearAllMocks();
});

describe("Connection disconnect confirmation", () => {
  it("focuses the safe action, traps focus, closes on Escape and restores focus", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(ConnectionView, {
          configured: true,
          connected: true,
          ownerName: "Owner",
          expiresAt: null,
          dataAccessExpiresAt: null,
          lifecycle: "healthy",
        }),
      );
    });

    const overflow = container.querySelector<HTMLButtonElement>(
      '[aria-label="Tùy chọn kết nối"]',
    );
    await act(async () => overflow?.click());
    const disconnect = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    ).find((button) => button.textContent?.includes("Ngắt kết nối"));
    await act(async () => disconnect?.click());

    const dialog = container.querySelector<HTMLElement>(
      '[role="alertdialog"]',
    );
    expect(dialog).not.toBeNull();
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement?.textContent).toContain("Giữ kết nối");

    const confirm = Array.from(
      dialog?.querySelectorAll<HTMLButtonElement>("button") ?? [],
    ).find((button) => button.textContent?.includes("Xác nhận ngắt"));
    confirm?.focus();
    await act(async () => {
      confirm?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          bubbles: true,
        }),
      );
    });
    expect(document.activeElement).toBe(
      dialog?.querySelector('[aria-label="Đóng xác nhận"]'),
    );

    await act(async () => {
      dialog?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
        }),
      );
    });
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(overflow);

    await act(async () => root.unmount());
  });
});
