import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReportingContext } from "./reporting-context";

describe("ReportingContext", () => {
  it("renders a native collapsible filter sheet for narrow viewports", () => {
    const markup = renderToStaticMarkup(
      <ReportingContext
        action="/overview"
        dateFrom="2026-07-01"
        dateTo="2026-07-31"
        currency="USD"
        currencies={["USD"]}
        compare="previous_period"
        freshness={{
          dataThrough: "31/07/2026",
          lastSuccessfulSync: "31/07/2026 08:00",
          status: "Mới",
          tone: "success",
        }}
      />,
    );

    expect(markup).toContain("<details");
    expect(markup).toContain('class="v2-report-context-shell"');
    expect(markup).not.toContain("<details open");
    expect(markup).toContain("Bộ lọc báo cáo");
    expect(markup).toContain("31/07/2026 · Mới");
    expect(markup).toContain('action="/overview"');
    expect(markup).toContain('href="/overview"');
    expect(markup).toContain("Đặt lại");
  });

  it("surfaces a scope warning in the mobile summary", () => {
    const markup = renderToStaticMarkup(
      <ReportingContext
        action="/campaigns"
        dateFrom="2026-07-01"
        dateTo="2026-07-31"
        currency="VND"
        compare="none"
        freshness="Đồng bộ 2 phút trước"
        scopeWarning="Một tài khoản không thuộc Business đã chọn."
      />,
    );

    expect(markup).toContain("Cần chú ý");
    expect(markup).toContain("Một tài khoản không thuộc Business đã chọn.");
  });
});
