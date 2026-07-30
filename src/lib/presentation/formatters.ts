export function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: digits,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    notation: Math.abs(value) >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatMoney(
  value: number | null,
  currency: string,
  maximumFractionDigits = 0,
) {
  if (value === null || !Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      maximumFractionDigits,
    }).format(value);
  } catch {
    return `${currency} ${formatNumber(value, maximumFractionDigits)}`;
  }
}

export function formatPercent(
  value: number | null,
  maximumFractionDigits = 1,
) {
  return value === null || !Number.isFinite(value)
    ? "—"
    : `${formatNumber(value, maximumFractionDigits)}%`;
}

export function formatDelta(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "Chưa đủ dữ liệu";
  if (value === 0) return "Không đổi";
  return `${value > 0 ? "+" : ""}${formatNumber(value, 1)}%`;
}

export function formatDateRange(dateFrom: string, dateTo: string) {
  const date = (value: string) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime())
      ? new Intl.DateTimeFormat("vi-VN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          timeZone: "UTC",
        }).format(parsed)
      : value;
  };
  return `${date(dateFrom)} – ${date(dateTo)}`;
}

export function formatFreshnessLabel(
  freshness: {
    lastSyncedAt: string | null;
    dataThroughAt: string | null;
    syncStatus: "healthy" | "warning" | "partial" | "error";
  },
  timeZone = "Asia/Ho_Chi_Minh",
  now = new Date(),
) {
  const dataThrough = freshness.dataThroughAt
    ? new Date(freshness.dataThroughAt)
    : null;
  const synced = freshness.lastSyncedAt
    ? new Date(freshness.lastSyncedAt)
    : null;
  const throughLabel =
    dataThrough && Number.isFinite(dataThrough.getTime())
      ? new Intl.DateTimeFormat("vi-VN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          timeZone,
        }).format(dataThrough)
      : "chưa xác định";
  let syncLabel = "chưa có lần đồng bộ thành công";
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
  const status =
    freshness.syncStatus === "partial"
      ? " · Đồng bộ một phần"
      : freshness.syncStatus === "error"
        ? " · Cần kiểm tra"
        : "";
  return `Dữ liệu đến ${throughLabel} · Đồng bộ ${syncLabel}${status}`;
}
