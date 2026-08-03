import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getApplicationAssetsSnapshot: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock("@/lib/app-data", () => ({
  getApplicationAssetsSnapshot: mocks.getApplicationAssetsSnapshot,
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}));

import SourceEntityPage from "./page";

describe("Source asset detail", () => {
  beforeEach(() => {
    vi.stubEnv("UI_VERSION", "v2");
    vi.clearAllMocks();
    mocks.getApplicationAssetsSnapshot.mockResolvedValue({
      assets: [
        {
          id: "page_1",
          kind: "Page",
          name: "Foxscore Page",
          parentName: "Foxscore Business",
          category: "Thể thao",
          status: "ACTIVE",
          isCurrent: true,
          verificationStatus: "not_verified",
          lastSeenAt: "2026-08-01T00:00:00.000Z",
        },
      ],
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("loads the full asset inventory for Page-only metadata", async () => {
    const element = await SourceEntityPage({
      params: Promise.resolve({ kind: "pages", entityId: "page_1" }),
      searchParams: Promise.resolve({ tab: "pages" }),
    });
    const markup = renderToStaticMarkup(element);

    expect(mocks.getApplicationAssetsSnapshot).toHaveBeenCalledOnce();
    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(markup).toContain("Foxscore Page");
    expect(markup).toContain("Foxscore Business");
    expect(markup).toContain("Thể thao");
  });
});
