import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dataHealthV2: vi.fn(() => null),
  getApplicationContextSnapshot: vi.fn(),
  getApplicationOperationalSnapshot: vi.fn(),
  getDataHealthCreativeReferenceSnapshot: vi.fn(),
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
  getApplicationOperationalSnapshot:
    mocks.getApplicationOperationalSnapshot,
  getDataHealthCreativeReferenceSnapshot:
    mocks.getDataHealthCreativeReferenceSnapshot,
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
  creativeReferencesTruncated: boolean;
  liveDelivery: unknown;
  query: Record<string, string | string[] | undefined>;
}>;

describe("Data Health page loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isUiV3.mockReturnValue(false);
  });

  it("uses the compact Creative projection and live delivery in parallel", async () => {
    const contextSnapshot = {
      demoMode: false,
      authenticated: true,
      connection: {
        connectionId: "connection_1",
        status: "connected",
      },
      dashboard: { events: [] },
      syncRuns: [],
    };
    const snapshot = {
      ...contextSnapshot,
      dashboard: { events: [{ name: "Install" }] },
    };
    const query = { selected: "issue_1" };
    const context = { adAccountIds: ["act_1"] };
    const creatives = [{ id: "asset_1" }];
    const liveDelivery = { state: "ready" };
    mocks.getApplicationContextSnapshot.mockResolvedValue(contextSnapshot);
    let resolveOperational!: (value: typeof snapshot) => void;
    mocks.getApplicationOperationalSnapshot.mockReturnValue(
      new Promise((resolve) => {
        resolveOperational = resolve;
      }),
    );
    mocks.resolveApplicationReportContext.mockReturnValue(context);
    mocks.getDataHealthCreativeReferenceSnapshot.mockResolvedValue({
      items: creatives,
      truncated: true,
    });
    mocks.getLiveDeliveryForReport.mockResolvedValue(liveDelivery);

    const loading = DataHealthPage({
      searchParams: Promise.resolve(query),
    });

    await vi.waitFor(() => {
      expect(mocks.getApplicationOperationalSnapshot).toHaveBeenCalledOnce();
      expect(
        mocks.getDataHealthCreativeReferenceSnapshot,
      ).toHaveBeenCalledWith(contextSnapshot);
      expect(mocks.getLiveDeliveryForReport).toHaveBeenCalledWith({
        snapshot: contextSnapshot,
        context,
      });
    });
    resolveOperational(snapshot);
    const element = (await loading) as DataHealthPageElement;

    expect(mocks.getApplicationContextSnapshot).toHaveBeenCalledOnce();
    expect(mocks.getApplicationOperationalSnapshot).toHaveBeenCalledOnce();
    expect(mocks.resolveApplicationReportContext).toHaveBeenCalledWith(
      contextSnapshot,
      query,
    );
    expect(element.type).toBe(mocks.dataHealthV2);
    expect(element.props.creatives).toBe(creatives);
    expect(element.props.creativeReferencesTruncated).toBe(true);
    expect(element.props.liveDelivery).toBe(liveDelivery);
    expect(element.props.query).toBe(query);
  });
});
