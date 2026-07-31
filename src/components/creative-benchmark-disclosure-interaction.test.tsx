// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { CreativeBenchmarkDisclosure } from "./creative-performance-v2";

afterEach(() => {
  document.body.replaceChildren();
});

describe("CreativeBenchmarkDisclosure", () => {
  it("opens a native accessible explanation with the complete benchmark context", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CreativeBenchmarkDisclosure
          resultLabel="Meta-attributed Lead"
          metricLabel="Cost/Lead"
          actualLabel="100 ₫"
          benchmarkLabel="125 ₫"
          deltaLabel="-20%"
          peerGroupLabel="Account 1 · leads · Lead · image · VND"
          sampleSize={8}
          reasons={[
            "Cost/Lead thấp hơn benchmark 20%.",
            "Cần theo dõi thêm xu hướng.",
          ]}
        />,
      );
    });

    const details = container.querySelector<HTMLDetailsElement>(
      "#benchmark-explanation",
    );
    const summary = details?.querySelector<HTMLElement>("summary");

    expect(details?.open).toBe(false);
    expect(summary?.getAttribute("aria-label")).toBe(
      "Giải thích benchmark cho Meta-attributed Lead",
    );

    await act(async () => summary?.click());

    expect(details?.open).toBe(true);
    expect(container.textContent).toContain("Metric");
    expect(container.textContent).toContain("Cost/Lead");
    expect(container.textContent).toContain("Giá trị hiện tại");
    expect(container.textContent).toContain("100 ₫");
    expect(container.textContent).toContain("Benchmark");
    expect(container.textContent).toContain("125 ₫");
    expect(container.textContent).toContain("Chênh lệch");
    expect(container.textContent).toContain("-20%");
    expect(container.textContent).toContain("Peer group");
    expect(container.textContent).toContain(
      "Account 1 · leads · Lead · image · VND",
    );
    expect(container.textContent).toContain("Cỡ mẫu");
    expect(container.textContent).toContain("8 Creative Family");
    expect(container.textContent).toContain(
      "Cost/Lead thấp hơn benchmark 20%.",
    );

    await act(async () => root.unmount());
  });
});
