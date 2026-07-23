import { HealthView } from "@/components/health-view";
import { getApplicationSnapshot } from "@/lib/app-data";

export const dynamic = "force-dynamic";

export default async function HealthPage() {
  const snapshot = await getApplicationSnapshot();
  return (
    <HealthView
      checklist={snapshot.dashboard.checklist}
      syncRuns={snapshot.syncRuns}
    />
  );
}
