import {
  SettingsV2,
  type SettingsResultRegistry,
  type SettingsTab,
} from "@/components/settings-v2";
import { V3SurfacePage } from "@/components/ui-v3/surface-page";
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
import {
  DEFAULT_RESULT_DEFINITIONS,
  hydrateResultDefinitions,
  type PersistedResultMapping,
  type ResultDefinition,
} from "@/lib/reporting/result-definition";
import { isUiV3 } from "@/lib/presentation/ui-version";

export const dynamic = "force-dynamic";

const TABS: SettingsTab[] = [
  "reporting",
  "results",
  "benchmark",
  "sync",
];

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

function cloneBuiltInDefinitions(): ResultDefinition[] {
  return DEFAULT_RESULT_DEFINITIONS.filter(
    (definition) => definition.enabled,
  ).map((definition) => ({
    ...definition,
    objectiveKeys: [...definition.objectiveKeys],
    rawActionTypes: [...definition.rawActionTypes],
    rawValueActionTypes: [
      ...(definition.rawValueActionTypes ?? []),
    ],
  }));
}

function builtInMappings(
  definitions: readonly ResultDefinition[],
): PersistedResultMapping[] {
  return definitions.flatMap((definition) => [
    ...definition.rawActionTypes.map((rawActionType, priority) => ({
      id: `built_in:${definition.canonicalKey}:action:${priority}`,
      canonicalResultKey: definition.canonicalKey,
      rawActionType,
      metricSource: "action" as const,
      priority,
      mappingSource: "system" as const,
      enabled: true,
    })),
    ...(definition.rawValueActionTypes ?? []).map(
      (rawActionType, priority) => ({
        id: `built_in:${definition.canonicalKey}:action_value:${priority}`,
        canonicalResultKey: definition.canonicalKey,
        rawActionType,
        metricSource: "action_value" as const,
        priority,
        mappingSource: "system" as const,
        enabled: true,
      }),
    ),
  ]);
}

function fallbackResultRegistry(
  warning: string | null,
): SettingsResultRegistry {
  const definitions = cloneBuiltInDefinitions();
  return {
    definitions,
    mappings: builtInMappings(definitions),
    campaignOverrides: [],
    source: "built_in_defaults",
    warning,
  };
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
  const normalizedTab = tabValue === "events" ? "results" : tabValue;
  const activeTab = TABS.includes(normalizedTab as SettingsTab)
    ? (normalizedTab as SettingsTab)
    : "reporting";
  const canSave =
    !snapshot.demoMode &&
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
    metricDisplayPresets: { version: 1, presets: {} },
    lastInitialSyncAt: null,
    updatedAt: new Date(0).toISOString(),
  };
  let settings = fallback;
  let auditRecords: SettingsAuditRecord[] = snapshot.demoMode
    ? [...demoSettingsAuditRecords]
    : [];
  let resultRegistry = fallbackResultRegistry(
    snapshot.demoMode
      ? null
      : "Cần phiên owner hợp lệ để tải Result Registry đã lưu.",
  );
  if (snapshot.authenticated && snapshot.connection) {
    const repository = await createTrackerRepository();
    const resultRegistryPromise = Promise.all([
      repository.listResultDefinitions(),
      repository.listResultMappings(),
      repository.listCampaignResultOverrides(
        snapshot.connection.connectionId,
      ),
    ])
      .then(([definitions, mappings, campaignOverrides]) => {
        if (definitions.length === 0) {
          throw new Error("Result registry has no definitions.");
        }
        return {
          definitions: hydrateResultDefinitions({
            definitions,
            mappings,
          }).filter((definition) => definition.enabled),
          mappings,
          campaignOverrides,
          source: "database" as const,
          warning: null,
        };
      })
      .catch((error): SettingsResultRegistry => {
        console.error("[settings-result-registry-fallback]", error);
        return fallbackResultRegistry(
          "Không thể tải registry đã lưu; đang hiển thị built-in defaults chỉ đọc.",
        );
      });
    [settings, auditRecords, resultRegistry] = await Promise.all([
      repository.getSettings(),
      repository.listSettingsAuditLog(),
      resultRegistryPromise,
    ]);
  }

  const reportingContract = {
    reportingTimezoneMode: "account_local" as const,
    currencyMode: settings.reportingCurrency
      ? ("single" as const)
      : ("split" as const),
    businessIds:
      snapshot.reportingScope?.selected.businessIds ?? [],
    adAccountIds:
      snapshot.reportingScope?.selected.adAccountIds ?? [],
    defaultObjectiveKey: "all",
    defaultPrimaryResultKey: null,
    attributionSettingKey: "account_default",
    actionReportTime: "mixed" as const,
    syncVersion: snapshot.freshness.syncVersion ?? "latest",
  };

  const content = (
    <SettingsV2
      initial={settings}
      activeTab={activeTab}
      reportingContract={reportingContract}
      resultRegistry={resultRegistry}
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

  return isUiV3() ? (
    <V3SurfacePage surface="settings">{content}</V3SurfacePage>
  ) : (
    content
  );
}
