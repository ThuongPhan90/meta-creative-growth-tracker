import { VersionedAppShell } from "@/components/versioned-app-shell";
import { getApplicationSnapshot } from "@/lib/app-data";
import { formatFreshnessLabel } from "@/lib/presentation/formatters";
import { isUiV3 } from "@/lib/presentation/ui-version";

export const dynamic = "force-dynamic";

export default async function ProductLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const snapshot = await getApplicationSnapshot();
  const shellProps = {
    demoMode: snapshot.demoMode,
    ownerName: snapshot.dashboard.ownerName,
    isConnected:
      snapshot.authenticated &&
      snapshot.connection?.status === "connected",
    reportingCurrency: snapshot.settings.currency,
    reportingTimezone: snapshot.settings.timezone,
  };
  const v3Enabled = isUiV3();

  return (
    <VersionedAppShell
      {...shellProps}
      v3Enabled={v3Enabled}
      freshnessLabel={
        v3Enabled
          ? formatFreshnessLabel(
              snapshot.freshness,
              snapshot.settings.timezone,
            )
          : undefined
      }
    >
      {children}
    </VersionedAppShell>
  );
}
