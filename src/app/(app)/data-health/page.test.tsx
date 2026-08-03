import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dataHealthV2: vi.fn(() => null),
  getApplicationContextSnapshot: vi.fn(),
  getDataHealthCreativeReferences: vi.fn(),
  getLiveDeliveryForReport: vi.fn(),
  resolveApplicationReportContext: vi.fn(),
  isUiV3: vi.fn(() => false),
  v3SurfacePage: vi.fn(() => null),
}));

vi.mock("@/components/data-health-v2", () => ({
  DataHealthV2: mocks.dataHealthV2,
}));

vi.mock("@/components/ui-v3/surface-page", () => ({
  V3SurfacePage: mocks.v3SurfacePage,
}));

vi.mock("@/lib/app-data", () => ({
  getApplicationContextSnapshot:
    mocks.getApplicationContextSnapshot,
  getDataHealthCreativeReferences:
    mocks.getDataHealthCreativeReferences,
  getLiveDeliveryForReport: mocks.getLiveDeliveryForReport,
  resolveApplicationReportContext:
    mocks.resolveApplicationReportContext,
}));

vi.mock("@/lib/presentation/ui-version", () => ({
  isUiV3: mocks.isUiV3,
}));

import DataHealthPage from "./page";

type DataHealthPageElement = ReactElement<{
  creatives: unknown[];
  liveDelivery: unknown;
  query: Record<string, string | string[] | undefined>;
}>;

describe("Data Health page loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isUiV3.mockReturnValue(false);
  });

  it("uses the compact Creative projection and live delivery in parallel", async () => {
    const snapshot = {
      demoMode: false,
      authenticated: true,
      connection: {
        connectionId: "connection_1",
        status: "connected",
      },
      dashboard: { events: [] },
      syncRuns: [],
    };
    const query = { selected: "issue_1" };
    const context = { adAccountIds: ["act_1"] };
    const creatives = [{ id: "asset_1" }];
    const liveDelivery = { state: "ready" };
    mocks.getApplicationContextSnapshot.mockResolvedValue(snapshot);
    mocks.resolveApplicationReportContext.mockReturnValue(context);
    mocks.getDataHealthCreativeReferences.mockResolvedValue(creatives);
    mocks.getLiveDeliveryForReport.mockResolvedValue(liveDelivery);

    const element = (await DataHealthPage({
      searchParams: Promise.resolve(query),
    })) as DataHealthPageElement;

    expect(mocks.getApplicationContextSnapshot).toHaveBeenCalledOnce();
    expect(mocks.resolveApplicationReportContext).toHaveBeenCalledWith(
      snapshot,
      query,
    );
    expect(mocks.getDataHealthCreativeReferences).toHaveBeenCalledWith(
      snapshot,
    );
    expect(mocks.getLiveDeliveryForReport).toHaveBeenCalledWith({
      snapshot,
      context,
    });
    expect(element.type).toBe(mocks.dataHealthV2);
    expect(element.props.creatives).toBe(creatives);
    expect(element.props.liveDelivery).toBe(liveDelivery);
    expect(element.props.query).toBe(query);
  });
});
