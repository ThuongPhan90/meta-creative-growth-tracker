export type FreshnessPresentation = {
  dataThrough: string;
  lastSuccessfulSync: string;
  status: string;
  tone: "success" | "warning" | "danger" | "neutral";
};

export function formatFreshnessFields(
  freshness: {
    lastSyncedAt: string | null;
    dataThroughAt: string | null;
    syncStatus: "healthy" | "warning" | "partial" | "error";
  },
  timeZone = "Asia/Ho_Chi_Minh",
  now = new Date(),
): FreshnessPresentation {
  const dataThrough = freshness.dataThroughAt
    ? new Date(freshness.dataThroughAt)
    : null;
  const synced = freshness.lastSyncedAt
    ? new Date(freshness.lastSyncedAt)
    : null;
  const dataThroughLabel =
    dataThrough && Number.isFinite(dataThrough.getTime())
      ? new Intl.DateTimeFormat("vi-VN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          timeZone,
        }).format(dataThrough)
      : "chưa xác định";

  let syncLabel = "chưa có";
  if (synced && Number.isFinite(synced.getTime())) {
    const minutes = Math.max(
      0,
      Math.floor((now.getTime() - synced.getTime()) / 60_000),
    );
    syncLabel =
      minutes < 1
        ? "vừa xong"
        : minutes < 60
          ? `${minutes} phút trước`
          : minutes < 1_440
            ? `${Math.floor(minutes / 60)} giờ trước`
            : `${Math.floor(minutes / 1_440)} ngày trước`;
  }

  return {
    dataThrough: dataThroughLabel,
    lastSuccessfulSync: syncLabel,
    status:
      freshness.syncStatus === "partial"
        ? "Đồng bộ một phần"
        : freshness.syncStatus === "error"
          ? "Cần kiểm tra"
          : freshness.syncStatus === "warning"
            ? "Có cảnh báo"
            : "Hoàn tất",
    tone:
      freshness.syncStatus === "healthy"
        ? "success"
        : freshness.syncStatus === "error"
          ? "danger"
          : freshness.syncStatus === "partial" ||
              freshness.syncStatus === "warning"
            ? "warning"
            : "neutral",
  };
}
