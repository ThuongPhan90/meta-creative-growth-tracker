import type { SyncRunStatus } from "@/lib/db/types";

export type SyncHttpOutcome = {
  ok: boolean;
  status: number;
  message: string;
  code?: "SYNC_IN_PROGRESS" | "SYNC_FAILED" | "SYNC_CANCELLED";
};

export function syncHttpOutcome(status: SyncRunStatus): SyncHttpOutcome {
  switch (status) {
    case "queued":
    case "running":
      return {
        ok: true,
        status: 202,
        message: "Yêu cầu đồng bộ đang được xử lý.",
        code: "SYNC_IN_PROGRESS",
      };
    case "succeeded":
      return {
        ok: true,
        status: 200,
        message: "Đồng bộ Meta đã hoàn tất.",
      };
    case "partial":
      return {
        ok: true,
        status: 200,
        message:
          "Đồng bộ hoàn tất một phần; mở Sức khỏe dữ liệu để xem cảnh báo.",
      };
    case "failed":
      return {
        ok: false,
        status: 500,
        message: "Lần đồng bộ Meta này đã thất bại.",
        code: "SYNC_FAILED",
      };
    case "cancelled":
      return {
        ok: false,
        status: 409,
        message: "Lần đồng bộ Meta này đã bị hủy.",
        code: "SYNC_CANCELLED",
      };
  }
}
