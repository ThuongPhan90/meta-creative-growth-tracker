import type {
  MetaAssetRow,
  ReadinessStatus,
} from "@/types/view-models";

const VERIFICATION_LABELS: Record<string, string> = {
  VERIFIED: "Đã xác minh",
  NOT_VERIFIED: "Chưa xác minh",
  UNVERIFIED: "Chưa xác minh",
  PENDING: "Đang chờ xác minh",
  PENDING_REVIEW: "Đang được xem xét",
  IN_REVIEW: "Đang được xem xét",
  REJECTED: "Không được xác minh",
};

export function formatMetaVerificationStatus(value?: string | null) {
  if (!value?.trim()) return "Meta chưa trả trạng thái xác minh";
  return (
    VERIFICATION_LABELS[value.trim().toUpperCase()] ??
    "Trạng thái xác minh chưa được hỗ trợ"
  );
}

export function sourceAssetStatus(
  asset: Pick<MetaAssetRow, "kind" | "status" | "isCurrent">,
): {
  label: string;
  tone: Extract<ReadinessStatus, "ready" | "pending" | "warning">;
} {
  const normalized = asset.status.trim().toUpperCase();
  if (asset.isCurrent === false) {
    return {
      label: "Không còn trong lần đồng bộ mới nhất",
      tone: "warning",
    };
  }
  if (asset.kind === "Page") {
    return {
      label: "Đã phát hiện · Meta không trả activity status",
      tone: "ready",
    };
  }
  if (normalized === "ACTIVE") {
    return { label: "Đang hoạt động", tone: "ready" };
  }
  if (normalized === "INACTIVE") {
    return { label: "Không hoạt động", tone: "pending" };
  }
  if (
    asset.kind === "Ad Account" &&
    ["DISABLED", "UNSETTLED", "PENDING_RISK_REVIEW"].includes(
      normalized,
    )
  ) {
    return {
      label: "Cần kiểm tra trên Meta",
      tone: "warning",
    };
  }
  return { label: "Chưa xác định", tone: "pending" };
}
