import { AppShell } from "@/components/app-shell";
import { getApplicationSnapshot } from "@/lib/app-data";

export const dynamic = "force-dynamic";

export default async function ProductLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const snapshot = await getApplicationSnapshot();
  return (
    <AppShell
      demoMode={snapshot.demoMode}
      ownerName={snapshot.dashboard.ownerName}
      isConnected={
        snapshot.authenticated &&
        snapshot.connection?.status === "connected"
      }
      reportingCurrency={snapshot.settings.currency}
      reportingTimezone={snapshot.settings.timezone}
    >
      {children}
    </AppShell>
  );
}
