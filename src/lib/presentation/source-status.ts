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
