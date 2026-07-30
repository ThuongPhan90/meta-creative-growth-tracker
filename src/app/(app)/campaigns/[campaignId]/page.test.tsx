import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getApplicationSnapshot,
  type ApplicationSnapshot,
} from "@/lib/app-data";
import { createTrackerRepository } from "@/lib/db";
import CampaignDetailPage from "./page";

vi.mock("@/lib/app-data", () => ({
  getApplicationSnapshot: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  createTrackerRepository: vi.fn(),
}));

vi.mock("server-only", () => ({}));

const SHARED_CONTEXT = {
  from: "2026-07-01",
  to: "2026-07-30",
  account: "act_600000000000001",
  campaign: "700000000000001",
  os: "android",
  format: "video",
  performance: "watch",
  data_status: "partial",
  currency: "VND",
  compare: "previous_period",
} as const;

function demoSnapshot() {
  return {
    demoMode: true,
    authenticated: false,
    configuredForLive: false,
    connection: null,
    settings: {
      timezone: "Asia/Ho_Chi_Minh",
      lookbackDays: 30,
      currency: "VND",
      compareDefault: "previous_period",
      minimumInstallThreshold: 20,
      installActionTypes: ["mobile_app_install"],
      registrationActionTypes: ["complete_registration"],
    },
  } as ApplicationSnapshot;
}

async function renderCampaign(
  query: Record<string, string | string[] | undefined>,
) {
  const element = await CampaignDetailPage({
    params: Promise.resolve({ campaignId: "700000000000001" }),
    searchParams: Promise.resolve(query),
  });

  return renderToStaticMarkup(element);
}

function hrefFor(markup: string, path: string) {
  const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markup.match(
    new RegExp(`href="([^"]*${escapedPath}[^"]*)"`),
  );
  expect(match?.[1]).toBeDefined();
  return new URL(
    match![1].replaceAll("&amp;", "&"),
    "https://tracker.test",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getApplicationSnapshot).mockResolvedValue(demoSnapshot());
});

describe("Campaign full page in demo mode", () => {
  it("renders the canonical Campaign instead of returning 404", async () => {
    const markup = await renderCampaign({
      ...SHARED_CONTEXT,
      tab: "structure",
      q: "onboarding",
      status: "ACTIVE",
      page: "2",
    });

    expect(markup).toContain("App Growth · Onboarding");
    expect(markup).toContain("Chỉ đọc");
    expect(markup).toContain("Ad Set → Ads → Creative Family");
    expect(markup).toContain("800000000000111");
    expect(createTrackerRepository).not.toHaveBeenCalled();

    const creativeHref = hrefFor(
      markup,
      "/creatives/cf_111111111111111111111111",
    );
    expect(creativeHref.searchParams.get("tab")).toBe("usage");
    for (const [key, value] of Object.entries(SHARED_CONTEXT)) {
      expect(creativeHref.searchParams.get(key)).toBe(value);
    }

    const backHref = hrefFor(markup, "/campaigns?");
    expect(backHref.searchParams.get("q")).toBe("onboarding");
    expect(backHref.searchParams.get("status")).toBe("ACTIVE");
    expect(backHref.searchParams.get("page")).toBe("2");
    expect(backHref.searchParams.get("tab")).toBeNull();
  });

  it("keeps shared context when linking to the Campaign ad account", async () => {
    const markup = await renderCampaign(SHARED_CONTEXT);
    const accountHref = hrefFor(markup, "/sources?");

    expect(accountHref.searchParams.get("tab")).toBe("ad-accounts");
    expect(accountHref.searchParams.get("selected")).toBe(
      "act_600000000000001",
    );
    for (const [key, value] of Object.entries(SHARED_CONTEXT)) {
      expect(accountHref.searchParams.get(key)).toBe(value);
    }
  });
});
