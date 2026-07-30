import { ConnectionView } from "@/components/connection-view";
import {
  SourcesV2,
  type SourceTab,
} from "@/components/sources-v2";
import { getApplicationSnapshot } from "@/lib/app-data";
import { evaluateMetaConnectionLifecycle } from "@/lib/meta";

export const dynamic = "force-dynamic";

const SOURCE_TABS: SourceTab[] = [
  "connection",
  "businesses",
  "ad-accounts",
  "pages",
  "events",
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
  return SOURCE_TABS.includes(value as SourceTab)
    ? (value as SourceTab)
    : "connection";
}

export default async function SourcesPage({
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
  const activeTab = sourceTab(first(query.tab));
  const errorCode = first(query.error);
  const connectionLifecycle = snapshot.connection
    ? evaluateMetaConnectionLifecycle(snapshot.connection)
    : null;
  const connected =
    snapshot.authenticated &&
    snapshot.connection?.status === "connected" &&
    connectionLifecycle !== "needs_reauth";

  return (
    <SourcesV2
      activeTab={activeTab}
      query={query}
      assets={snapshot.assets}
      dashboard={snapshot.dashboard}
      connected={connected}
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
}
