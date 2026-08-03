import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock("next/navigation", () => navigation);

import { VersionedAppShell } from "./versioned-app-shell";

function render(pathname: string, v3Enabled: boolean) {
  navigation.usePathname.mockReturnValue(pathname);
  navigation.useSearchParams.mockReturnValue(
    new URLSearchParams("from=2026-07-03&to=2026-08-01&account_ids=act_1"),
  );

  return renderToStaticMarkup(
    <VersionedAppShell
      v3Enabled={v3Enabled}
      ownerName="Phan Van Thuong"
      isConnected
      reportingCurrency="VND"
      reportingTimezone="Asia/Ho_Chi_Minh"
      freshnessLabel="01/08/2026 · 3 giờ trước"
    >
      <p>Nội dung báo cáo</p>
    </VersionedAppShell>,
  );
}

describe("VersionedAppShell", () => {
  it("uses V3 for a released top-level route when V3 is enabled", () => {
    const markup = render("/overview", true);

    expect(markup).toContain('class="v3-app-shell"');
    expect(markup).toContain("by DonHub");
    expect(markup).toContain("01/08/2026 · 3 giờ trước");
  });

  it("uses V3 for Creative Tracker while preserving the report query", () => {
    const markup = render("/creatives", true);

    expect(markup).toContain('class="v3-app-shell"');
    expect(markup).toContain("Creative Tracker");
    expect(markup).toContain("by DonHub");
    expect(markup).toContain(
      'href="/overview?from=2026-07-03&amp;to=2026-08-01&amp;account_ids=act_1"',
    );
  });

  it("keeps the V3 shell on a supported Campaign detail route", () => {
    const markup = render("/campaigns/campaign_456", true);

    expect(markup).toContain('class="v3-app-shell"');
    expect(markup).toContain("Phân phối");
    expect(markup).toContain('aria-current="page"');
    expect(markup).not.toContain('class="app-shell"');
  });

  it("keeps compatibility-only routes on the legacy shell", () => {
    const markup = render("/dashboard", true);

    expect(markup).toContain('class="app-shell"');
    expect(markup).not.toContain('class="v3-app-shell"');
  });

  it("keeps V2 as the default even on Overview", () => {
    const markup = render("/overview", false);

    expect(markup).toContain('class="app-shell"');
    expect(markup).not.toContain('class="v3-app-shell"');
  });
});
