// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContextualEntityLink } from "./contextual-entity-link";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("ContextualEntityLink", () => {
  it("opens a drawer for a primary click and preserves full-page navigation for modified clicks", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ContextualEntityLink
          href="/sources/ad-accounts/act_123?currency=VND"
          drawerHref="/sources?tab=ad-accounts&selected=act_123&currency=VND"
          entityId="act_123"
        >
          Demo account
        </ContextualEntityLink>,
      );
    });

    const link = container.querySelector<HTMLAnchorElement>("a");
    expect(link?.getAttribute("href")).toBe(
      "/sources/ad-accounts/act_123?currency=VND",
    );
    expect(link?.dataset.entityTrigger).toBe("act_123");

    await act(async () => {
      link?.dispatchEvent(
        new MouseEvent("click", {
          button: 0,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(push).toHaveBeenCalledWith(
      "/sources?tab=ad-accounts&selected=act_123&currency=VND",
      { scroll: false },
    );

    push.mockClear();
    const modified = new MouseEvent("click", {
      button: 0,
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
    });
    link?.addEventListener("click", (event) => event.preventDefault(), {
      once: true,
    });
    await act(async () => {
      link?.dispatchEvent(modified);
    });
    expect(push).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });
});
