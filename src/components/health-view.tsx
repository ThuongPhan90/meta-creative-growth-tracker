import {
  Activity,
  CalendarClock,
  CheckCircle2,
  Database,
  Info,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { groupSyncWarnings } from "@/lib/sync/warning-groups";
import type { ChecklistItem, SyncRunView } from "@/types/view-models";

const syncStatusLabels: Record<SyncRunView["status"], string> = {
  running: "Đang chạy",
  success: "Hoàn tất",
  partial: "Một phần",
  failed: "Thất bại",
  cancelled: "Đã hủy",
};

export function HealthView({
  checklist,
  syncRuns,
}: {
  checklist: ChecklistItem[];
  syncRuns: SyncRunView[];
}) {
  return (
    <div className="health-page">
      <PageHeader
        title="Sức khỏe dữ liệu"
        description="Theo dõi quyền truy cập, freshness, mapping và lịch sử đồng bộ."
      />

      <section className="health-grid">
        {checklist.map((item) => {
          const Icon =
            item.label === "App events trong Insights"
              ? Activity
              : item.label === "Quyền truy cập"
                ? ShieldCheck
                : item.label === "Event mapping"
                  ? CheckCircle2
                  : CalendarClock;
          return (
            <article key={item.label}>
              <span aria-hidden="true">
                <Icon size={19} />
              </span>
              <div>
                <h2>{item.label}</h2>
                <p>{item.detail}</p>
              </div>
              <StatusPill status={item.status} compact />
            </article>
          );
        })}
      </section>

      <section className="sync-panel">
        <div className="section-heading">
          <div>
            <h2>Lịch sử đồng bộ</h2>
            <p>Initial sync, manual sync và Vercel Cron.</p>
          </div>
          <RefreshCcw aria-hidden="true" size={18} />
        </div>
        {syncRuns.length ? (
          <div className="sync-list">
            {syncRuns.map((run) => {
              const warningGroups = groupSyncWarnings(run.warnings);
              return (
                <article key={run.id}>
                  <span aria-hidden="true">
                    <Database size={16} />
                  </span>
                  <div>
                    <strong>{run.kind}</strong>
                    <p>{run.summary}</p>
                    {run.warnings.length ? (
                      <details className="sync-warning-details">
                        <summary>
                          Xem {run.warnings.length} cảnh báo ·{" "}
                          {warningGroups.length} nhóm
                        </summary>
                        <ul>
                          {warningGroups.map((warning) => {
                            const visibleResources =
                              warning.resources.slice(0, 3);
                            const remainingResources =
                              warning.resources.length -
                              visibleResources.length;
                            return (
                              <li
                                key={`${warning.code}:${warning.message}`}
                              >
                                <div>
                                  <strong>{warning.code}</strong>
                                  <span>
                                    {warning.count.toLocaleString("vi-VN")}{" "}
                                    lần
                                  </span>
                                </div>
                                <p>{warning.message}</p>
                                {visibleResources.length ? (
                                  <small>
                                    {visibleResources.join(" · ")}
                                    {remainingResources > 0
                                      ? ` · +${remainingResources} tài nguyên`
                                      : ""}
                                  </small>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                  <StatusPill
                    status={
                      run.status === "success"
                        ? "ready"
                        : run.status === "partial"
                          ? "warning"
                          : run.status === "failed"
                            ? "error"
                            : run.status === "cancelled"
                              ? "warning"
                              : "pending"
                    }
                    label={syncStatusLabels[run.status]}
                    compact
                  />
                  <time>{run.startedAt}</time>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="sync-empty">
            <Database aria-hidden="true" size={22} />
            <strong>Chưa có lần đồng bộ nào</strong>
            <p>Lịch sử sẽ xuất hiện sau khi Meta được kết nối.</p>
          </div>
        )}
      </section>

      <section className="semantics-note">
        <Info aria-hidden="true" size={18} />
        <div>
          <h2>Định nghĩa dữ liệu</h2>
          <p>
            Install và Registration là chỉ số được Meta attribution trong
            Insights, không phải tổng người dùng thực tế của app. Hook/Hold chỉ
            áp dụng cho video; banner luôn hiển thị N/A.
          </p>
        </div>
      </section>
    </div>
  );
}
