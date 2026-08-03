import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReportingToolbar } from "./reporting-toolbar";

describe("ReportingToolbar", () => {
  it("keeps operational reporting controls direct and context controls in the advanced filter", () => {
    const markup = renderToStaticMarkup(
      <ReportingToolbar
        action="/overview"
        dateFrom="2026-07-03"
        dateTo="2026-08-01"
        reportingBar={{
          businesses: [],
          scopeAccounts: [],
          selectedBusinessIds: [],
          selectedAccountIds: [],
          persistScope: false,
          objective: "all",
          objectives: [],
          results: [],
        }}
        currency="VND"
        compare="previous_period"
        attribution="account_default"
        actionReportTime="mixed"
        syncVersion="latest"
        resetHref="/overview"
      />,
    );

    expect(markup).toContain('name="from"');
    expect(markup).toContain('name="to"');
    expect(markup).toContain('name="currency"');
    expect(markup).toContain("Bộ lọc thêm");
    expect(markup).toContain('name="compare"');
    expect(markup).toContain('name="attribution"');
    expect(markup).toContain('name="action_report_time"');
    expect(markup).toContain('name="sync_version"');
    expect(markup).toContain('value="account_default"');
    expect(markup).toContain('value="latest"');
    expect(markup).not.toContain("Dữ liệu đến");
  });
});
