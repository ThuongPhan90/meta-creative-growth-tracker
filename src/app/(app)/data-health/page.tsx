import { DataHealthV2 } from "@/components/data-health-v2";
import { V3SurfacePage } from "@/components/ui-v3/surface-page";
import {
  getApplicationSnapshot,
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
  const [snapshot, query] = await Promise.all([
    getApplicationSnapshot(),
    searchParams,
  ]);
  const context = resolveApplicationReportContext(snapshot, query);
  const liveDelivery = await getLiveDeliveryForReport({ snapshot, context });
  const content = (
    <DataHealthV2
      dashboard={snapshot.dashboard}
      creatives={snapshot.creatives}
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
