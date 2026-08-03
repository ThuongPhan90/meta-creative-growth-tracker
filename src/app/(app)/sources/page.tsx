import { ConnectionView } from "@/components/connection-view";
import {
  SourcesV2,
  type SourceTab,
  type SourcesResultRegistry,
} from "@/components/sources-v2";
import { V3SurfacePage } from "@/components/ui-v3/surface-page";
import {
  getApplicationAssetsSnapshot,
  getApplicationResultRegistry,
  type ApplicationSnapshot,
} from "@/lib/app-data";
import { evaluateMetaConnectionLifecycle } from "@/lib/meta";
import { isUiV3 } from "@/lib/presentation/ui-version";
import {
  DEFAULT_RESULT_DEFINITIONS,
  type PersistedResultMapping,
  type ResultDefinition,
} from "@/lib/reporting/result-definition";

export const dynamic = "force-dynamic";

const SOURCE_TABS: SourceTab[] = [
  "connection",
  "businesses",
  "ad-accounts",
  "pages",
  "reporting-scope",
  "results",
];

const oauthErrors: Record<string, string> = {
  META_OAUTH_CANCELLED: "Meta OAuth đã bị hủy hoặc chưa cấp đủ quyền.",
  META_OAUTH_INVALID_CALLBACK: "OAuth callback không hợp lệ hoặc đã hết hạn.",
  OWNER_MISMATCH: "Deployment đã khóa với một Meta owner khác.",
  META_OAUTH_FAILED: "Không thể hoàn tất Meta OAuth. Hãy kiểm tra cấu hình.",
  INVALID_OWNER_SECRET: "Mã thiết lập owner không đúng.",
  DEMO_MODE_ACTIVE:
    "Deployment đang ở Demo mode. Đặt DEMO_MODE=false và redeploy trước khi kết nối Meta.",
  LEGAL_CONFIGURATION_REQUIRED:
    "Hãy cấu hình LEGAL_ENTITY_NAME và PRIVACY_CONTACT_EMAIL trước khi kết nối Meta.",
  META_PERMISSIONS_REQUIRED:
    "Meta chưa cấp đủ ads_read, business_management và pages_show_list. Hãy kết nối lại và chấp nhận đủ ba quyền chỉ đọc.",
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function sourceTab(value: string | undefined): SourceTab {
  if (value === "events") return "results";
  if (value === "scope") return "reporting-scope";
  return SOURCE_TABS.includes(value as SourceTab)
    ? (value as SourceTab)
    : "connection";
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
): SourcesResultRegistry {
  const definitions = cloneBuiltInDefinitions();
  return {
    definitions,
    mappings: builtInMappings(definitions),
    source: "built_in_defaults",
    warning,
  };
}

export async function loadSourcesResultRegistry(
  snapshot: ApplicationSnapshot,
): Promise<SourcesResultRegistry> {
  if (snapshot.demoMode) return fallbackResultRegistry(null);
  if (!snapshot.authenticated || !snapshot.connection) {
    return fallbackResultRegistry(
      "Cần phiên owner hợp lệ để tải Result Registry đã lưu.",
    );
  }

  try {
    const { definitions, mappings } =
      await getApplicationResultRegistry(snapshot);
    if (definitions.length === 0) {
      throw new Error("Result registry has no definitions.");
    }
    return {
      definitions,
      mappings,
      source: "database",
      warning: null,
    };
  } catch (error) {
    console.error("[sources-result-registry-fallback]", error);
    return fallbackResultRegistry(
      "Không thể tải registry đã lưu; đang hiển thị built-in defaults.",
    );
  }
}

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<
    Record<string, string | string[] | undefined>
  >;
}) {
  const [snapshot, query] = await Promise.all([
    getApplicationAssetsSnapshot(),
    searchParams,
  ]);
  const activeTab = sourceTab(first(query.tab));
  const errorCode = first(query.error);
  const connectionLifecycle = snapshot.connection
    ? evaluateMetaConnectionLifecycle(snapshot.connection)
    : null;
  const connected =
    snapshot.authenticated &&
    snapshot.connection?.status === "connected" &&
    connectionLifecycle !== "needs_reauth";
  const resultRegistry = await loadSourcesResultRegistry(snapshot);

  const content = (
    <SourcesV2
      activeTab={activeTab}
      query={query}
      assets={snapshot.assets}
      dashboard={snapshot.dashboard}
      connected={connected}
      reportingScope={snapshot.reportingScope}
      resultRegistry={resultRegistry}
      scopePersistEnabled={connected && !snapshot.demoMode}
      connectionContent={
        <ConnectionView
          configured={snapshot.configuredForLive}
          connected={connected}
          ownerName={
            connected ? snapshot.connection?.metaUserName ?? null : null
          }
          expiresAt={
            connected ? snapshot.connection?.tokenExpiresAt ?? null : null
          }
          dataAccessExpiresAt={
            connected
              ? snapshot.connection?.dataAccessExpiresAt ?? null
              : null
          }
          lifecycle={connectionLifecycle}
          initialMessage={
            errorCode ? oauthErrors[errorCode] ?? null : null
          }
          embedded
        />
      }
    />
  );

  return isUiV3() ? (
    <V3SurfacePage surface="sources">{content}</V3SurfacePage>
  ) : (
    content
  );
}
