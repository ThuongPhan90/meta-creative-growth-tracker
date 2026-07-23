import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  LockKeyhole,
  TriangleAlert,
} from "lucide-react";
import type { ReadinessStatus } from "@/types/view-models";

const statusConfig: Record<
  ReadinessStatus,
  { label: string; icon: typeof CheckCircle2 }
> = {
  ready: { label: "Sẵn sàng", icon: CheckCircle2 },
  pending: { label: "Chưa kiểm tra", icon: CircleDashed },
  warning: { label: "Cần chú ý", icon: TriangleAlert },
  error: { label: "Có lỗi", icon: AlertCircle },
  locked: { label: "Chưa mở khóa", icon: LockKeyhole },
};

export function StatusPill({
  status,
  label,
  compact = false,
}: {
  status: ReadinessStatus;
  label?: string;
  compact?: boolean;
}) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span
      className={`status-pill status-pill--${status}${
        compact ? " status-pill--compact" : ""
      }`}
    >
      <Icon aria-hidden="true" size={compact ? 13 : 14} strokeWidth={2} />
      <span>{label ?? config.label}</span>
    </span>
  );
}
