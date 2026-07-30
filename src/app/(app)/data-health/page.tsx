import { DataHealthV2 } from "@/components/data-health-v2";
import { getApplicationSnapshot } from "@/lib/app-data";

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
  return (
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
    />
  );
}
