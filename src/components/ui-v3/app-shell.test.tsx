import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock("next/navigation", () => navigation);

import { AppShellV3 } from "./app-shell";

function render(
  pathname = "/creatives",
  query = "from=2026-07-03&to=2026-08-01&account_ids=act_1,act_2",
) {
  navigation.usePathname.mockReturnValue(pathname);
  navigation.useSearchParams.mockReturnValue(new URLSearchParams(query));

  return renderToStaticMarkup(
    <AppShellV3
      ownerName="Phan Van Thuong"
      isConnected
      reportingCurrency="VND"
      reportingTimezone="Asia/Ho_Chi_Minh"
      freshnessLabel="01/08/2026 · 3 giờ trước"
    >
      <p>Nội dung báo cáo</p>
    </AppShellV3>,
  );
}

describe("AppShellV3", () => {
  it("uses the final V5 labels without the legacy marketing or setup CTA", () => {
    const markup = render();

    expect(markup).toContain("Meta Growth Tracker");
    expect(markup).toContain("by DonHub");
    expect(markup).toContain("Creative Tracker");
    expect(markup).toContain("Phân phối");
    expect(markup).toContain("Chất lượng dữ liệu");
    expect(markup).toContain("Chế độ chỉ đọc");
    expect(markup).not.toContain("Trung tâm hiệu quả Creative");
    expect(markup).not.toContain("Setup Wizard");
  });

  it("keeps the shared reporting context on navigation links", () => {
    const markup = render();

    expect(markup).toContain(
      'href="/creatives?from=2026-07-03&amp;to=2026-08-01&amp;account_ids=act_1%2Cact_2"',
    );
    expect(markup).toContain(
      'href="/campaigns?from=2026-07-03&amp;to=2026-08-01&amp;account_ids=act_1%2Cact_2"',
    );
    expect(markup).toContain("2 Ad Account đã chọn");
  });

  it("renders compact operational metadata instead of a marketing topbar", () => {
    const markup = render("/overview");

    expect(markup).toContain("Meta đã kết nối");
    expect(markup).toContain("01/08/2026 · 3 giờ trước");
    expect(markup).toContain("Phan Van Thuong");
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('aria-label="Mở menu"');
  });
});
