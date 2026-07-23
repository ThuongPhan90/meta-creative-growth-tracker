import { SettingsView } from "@/components/settings-view";
import { getApplicationSnapshot } from "@/lib/app-data";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const snapshot = await getApplicationSnapshot();
  return (
    <SettingsView
      initialTimezone={snapshot.settings.timezone}
      initialLookback={snapshot.settings.lookbackDays}
      initialMinimumInstalls={
        snapshot.settings.minimumInstallThreshold
      }
      initialInstallActionTypes={
        snapshot.settings.installActionTypes
      }
      initialRegistrationActionTypes={
        snapshot.settings.registrationActionTypes
      }
      canSave={
        snapshot.authenticated &&
        snapshot.connection?.status === "connected"
      }
    />
  );
}
