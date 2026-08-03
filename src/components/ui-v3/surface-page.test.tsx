import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { V3SurfacePage, V3_SURFACE_COPY } from "./surface-page";

describe("V3SurfacePage", () => {
  it("gives every migrated top-level surface a V3 title and read-only boundary", () => {
    for (const [surface, copy] of Object.entries(V3_SURFACE_COPY)) {
      const markup = renderToStaticMarkup(
        <V3SurfacePage surface={surface as keyof typeof V3_SURFACE_COPY}>
          <div className="v2-page">
            <header className="v2-page-header">Legacy title</header>
            <section className="v2-panel">Verified child data</section>
          </div>
        </V3SurfacePage>,
      );

      expect(markup).toContain(`data-v3-surface="${surface}"`);
      expect(markup).toContain(copy.title);
      expect(markup).toContain("Chỉ đọc");
      expect(markup).toContain("Verified child data");
    }
  });

  it("keeps a provided detail back href without changing its report context", () => {
    const href =
      "/campaigns?from=2026-07-03&to=2026-08-01&attribution=account_default&action_report_time=mixed&sync_version=latest";
    const markup = renderToStaticMarkup(
      <V3SurfacePage
        surface="campaigns"
        title="Campaign A"
        backHref={href}
        backLabel="Quay lại Phân phối"
      >
        <div className="v2-page">Chi tiết canonical</div>
      </V3SurfacePage>,
    );

    expect(markup).toContain("Campaign A");
    expect(markup).toContain("Quay lại Phân phối");
    expect(markup).toContain(
      "attribution=account_default&amp;action_report_time=mixed&amp;sync_version=latest",
    );
  });
});
