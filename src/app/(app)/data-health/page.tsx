import { DataHealthV2 } from "@/components/data-health-v2";
import { V3SurfacePage } from "@/components/ui-v3/surface-page";
import {
  getApplicationContextSnapshot,
  getApplicationOperationalSnapshot,
  getDataHealthCreativeReferences,
  getLiveDeliveryForReport,
  resolveApplicationReportContext,
} from "@/lib/app-data";
import { isUiV3 } from "@/lib/presentation/ui-version";

export const dynamic = "force-dynamic";

export default async function DataHealthPage({
  searchParams,
}: {
  searchParams: Promise<
    Record<string, string | string[] | undefined>
  >;
}) {
  const [contextSnapshot, query] = await Promise.all([
    getApplicationContextSnapshot(),
    searchParams,
  ]);
  const context = resolveApplicationReportContext(contextSnapshot, query);
  // Operational health, Creative identity and current delivery are independent
  // read-only projections. Start them together so a slower projection does not
  // impose a barrier before the other pool work can begin.
  const [snapshot, creatives, liveDelivery] = await Promise.all([
    getApplicationOperationalSnapshot(),
    getDataHealthCreativeReferences(contextSnapshot),
    getLiveDeliveryForReport({ snapshot: contextSnapshot, context }),
  ]);
  const content = (
    <DataHealthV2
      dashboard={snapshot.dashboard}
      creatives={creatives}
      syncRuns={snapshot.syncRuns}
      connected={
        snapshot.demoMode ||
        (snapshot.authenticated &&
          snapshot.connection?.status === "connected")
      }
      query={query}
      liveDelivery={liveDelivery}
    />
  );

  return isUiV3() ? (
    <V3SurfacePage surface="data-health">{content}</V3SurfacePage>
  ) : (
    content
  );
}
