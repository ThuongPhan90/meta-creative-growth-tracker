import { ConnectionView } from "@/components/connection-view";
import { getApplicationSnapshot } from "@/lib/app-data";
import { evaluateMetaConnectionLifecycle } from "@/lib/meta";

export const dynamic = "force-dynamic";

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

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [snapshot, query] = await Promise.all([
    getApplicationSnapshot(),
    searchParams,
  ]);
  const errorMessage = query.error ? oauthErrors[query.error] ?? null : null;
  const connectionLifecycle = snapshot.connection
    ? evaluateMetaConnectionLifecycle(snapshot.connection)
    : null;
  const connected =
    snapshot.authenticated &&
    snapshot.connection?.status === "connected" &&
    connectionLifecycle !== "needs_reauth";
  return (
    <ConnectionView
      configured={snapshot.configuredForLive}
      connected={connected}
      ownerName={connected ? snapshot.connection?.metaUserName ?? null : null}
      expiresAt={connected ? snapshot.connection?.tokenExpiresAt ?? null : null}
      dataAccessExpiresAt={
        connected
          ? snapshot.connection?.dataAccessExpiresAt ?? null
          : null
      }
      lifecycle={connectionLifecycle}
      initialMessage={errorMessage}
    />
  );
}
