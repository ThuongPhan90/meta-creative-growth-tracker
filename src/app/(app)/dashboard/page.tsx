import { DashboardOverview } from "@/components/dashboard-overview";
import { getApplicationSnapshot } from "@/lib/app-data";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const snapshot = await getApplicationSnapshot();
  return <DashboardOverview data={snapshot.dashboard} />;
}
