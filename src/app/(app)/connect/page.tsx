import { ConnectionView } from "@/components/connection-view";
import { getApplicationSnapshot } from "@/lib/app-data";

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
  const connected =
    snapshot.authenticated &&
    snapshot.connection?.status === "connected";
  return (
    <ConnectionView
      configured={snapshot.configuredForLive}
      connected={connected}
      ownerName={connected ? snapshot.connection?.metaUserName ?? null : null}
      expiresAt={connected ? snapshot.connection?.tokenExpiresAt ?? null : null}
      initialMessage={errorMessage}
    />
  );
}
