import {
  SettingsV2,
  type SettingsTab,
} from "@/components/settings-v2";
import { getApplicationSnapshot } from "@/lib/app-data";
import {
  createTrackerRepository,
  type SettingsAuditRecord,
  type TrackerSettings,
} from "@/lib/db";
import {
  demoSettingsAuditRecords,
  toSettingsAuditView,
} from "@/lib/settings-audit";

export const dynamic = "force-dynamic";

const TABS: SettingsTab[] = ["reporting", "events", "benchmark", "sync"];

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatExpiry(value: string | null, timeZone: string) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(date);
}

export default async function SettingsPage({
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
  const tabValue = first(query.tab);
  const activeTab = TABS.includes(tabValue as SettingsTab)
    ? (tabValue as SettingsTab)
    : "reporting";
  const canSave =
    snapshot.authenticated &&
    snapshot.connection?.status === "connected";
  const fallback: TrackerSettings = {
    ownerId: 1,
    reportingTimezone: snapshot.settings.timezone,
    reportingCurrency: snapshot.settings.currency,
    syncLookbackDays: snapshot.settings.lookbackDays,
    minimumInstallThreshold: snapshot.settings.minimumInstallThreshold,
    minimumRegistrationThreshold: 10,
    benchmarkMode: "custom",
    benchmarkWindowDays: 30,
    benchmarkByOs: true,
    benchmarkByFormat: true,
    numberFormat: "vi-VN",
    compareDefault: "previous_period",
    scoringWeights: { cpi: 40, cpa: 40, hook: 10, hold: 10 },
    syncCadence: "deployment",
    alertChannel: "none",
    installActionTypes: snapshot.settings.installActionTypes,
    registrationActionTypes: snapshot.settings.registrationActionTypes,
    lastInitialSyncAt: null,
    updatedAt: new Date(0).toISOString(),
  };
  let settings = fallback;
  let auditRecords: SettingsAuditRecord[] = snapshot.demoMode
    ? [...demoSettingsAuditRecords]
    : [];
  if (snapshot.authenticated && snapshot.connection) {
    const repository = await createTrackerRepository();
    [settings, auditRecords] = await Promise.all([
      repository.getSettings(),
      repository.listSettingsAuditLog(),
    ]);
  }

  return (
    <SettingsV2
      initial={settings}
      activeTab={activeTab}
      auditLog={toSettingsAuditView(
        auditRecords,
        settings.reportingTimezone,
      )}
      canSave={canSave}
      tokenExpiresAt={formatExpiry(
        snapshot.connection?.tokenExpiresAt ?? null,
        settings.reportingTimezone,
      )}
      dataAccessExpiresAt={formatExpiry(
        snapshot.connection?.dataAccessExpiresAt ?? null,
        settings.reportingTimezone,
      )}
      grantedScopes={snapshot.connection?.grantedScopes ?? []}
    />
  );
}
