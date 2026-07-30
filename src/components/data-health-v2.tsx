import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Clock3,
  Database,
  Gauge,
  Link2,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";

import { CopyIdButton } from "@/components/ui/copy-id-button";
import { EntityDrawer } from "@/components/ui/entity-drawer";
import { StatusPill } from "@/components/ui/status-pill";
import { buildDataHealthIssuesFromRuns } from "@/lib/data-contract";
import {
  formatNumber,
  formatPercent,
} from "@/lib/presentation/formatters";
import { buildDataHealthCoverage } from "@/lib/presentation/data-health-coverage";
import { dataHealthEntityHref } from "@/lib/presentation/data-health-links";
import type {
  CreativeRow,
  DashboardViewModel,
  DataHealthIssue,
  ReadinessStatus,
  SyncRunView,
} from "@/types/view-models";

type Query = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function href(
  query: Query,
  overrides: Record<string, string | null | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(query)) {
    const value = first(raw);
    if (value) params.set(key, value.slice(0, 500));
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (!value) params.delete(key);
    else params.set(key, value);
  }
  return `/data-health${params.size ? `?${params.toString()}` : ""}`;
}

function overallStatus(
  latest: SyncRunView | undefined,
  connected: boolean,
): {
  label: string;
  detail: string;
  status: ReadinessStatus;
  tone: "healthy" | "warning" | "partial" | "error";
} {
  if (!connected) {
    return {
      label: "Chưa có nguồn dữ liệu",
      detail: "Kết nối Meta để bắt đầu đánh giá chất lượng.",
      status: "locked",
      tone: "error",
    };
  }
  if (!latest) {
    return {
      label: "Chưa đồng bộ",
      detail: "Chạy đồng bộ lần đầu để đánh giá coverage và độ mới.",
      status: "pending",
      tone: "warning",
    };
  }
  if (latest.status === "failed") {
    return {
      label: "Có lỗi",
      detail: "Lần đồng bộ mới nhất thất bại.",
      status: "error",
      tone: "error",
    };
  }
  if (latest.status === "partial") {
    return {
      label: "Hoàn thành có cảnh báo",
      detail: `${latest.warnings.length} cảnh báo trong lần đồng bộ mới nhất.`,
      status: "warning",
      tone: "partial",
    };
  }
  if (latest.status === "running") {
    return {
      label: "Đang cập nhật",
      detail: "Kết quả sẽ được làm mới khi đồng bộ hoàn tất.",
      status: "pending",
      tone: "warning",
    };
  }
  return {
    label: "Tốt",
    detail: "Lần đồng bộ mới nhất hoàn tất không có cảnh báo.",
    status: "ready",
    tone: "healthy",
  };
}

function issueTone(issue: DataHealthIssue) {
  if (issue.severity === "critical" || issue.severity === "error") {
    return "danger";
  }
  if (issue.severity === "warning") return "warning";
  return "accent";
}

function duration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds < 60) return `${seconds} giây`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes} phút ${rest ? `${rest} giây` : ""}`.trim();
}

function IssueDrawer({
  issue,
  query,
}: {
  issue: DataHealthIssue;
  query: Query;
}) {
  return (
    <EntityDrawer
      title="Chi tiết vấn đề dữ liệu"
      closeHref={href(query, { selected: null })}
      restoreFocusId={issue.issueId}
    >
      <div className="v2-drawer__body">
        <span className={`v2-chip v2-chip--${issueTone(issue)}`}>
          {issue.severity === "warning"
            ? "Cảnh báo"
            : issue.severity === "info"
              ? "Thông tin"
              : "Có lỗi"}
        </span>
        <h3 className="v2-issue-title">{issue.userMessage}</h3>
        <div className="v2-id-line">
          <code>{issue.issueId}</code>
          <CopyIdButton value={issue.issueId} />
        </div>
        <section className="v2-drawer__section">
          <h3>Tác động</h3>
          <p className="v2-muted">{issue.impact}</p>
          <dl className="v2-detail-list">
            <div>
              <dt>Số lần xuất hiện</dt>
              <dd>{formatNumber(issue.occurrenceCount)}</dd>
            </div>
            <div>
              <dt>Nhóm bị ảnh hưởng</dt>
              <dd>{formatNumber(issue.affectedGroupCount)}</dd>
            </div>
            <div>
              <dt>Lần đầu</dt>
              <dd>{issue.firstOccurredAt ?? "Chưa có timestamp"}</dd>
            </div>
            <div>
              <dt>Gần nhất</dt>
              <dd>{issue.lastOccurredAt ?? "Chưa có timestamp"}</dd>
            </div>
          </dl>
        </section>
        <section className="v2-drawer__section">
          <h3>Thực thể bị ảnh hưởng</h3>
          <ul className="v2-affected-entities">
            {issue.affectedEntities.map((entity) => {
              const entityHref = dataHealthEntityHref(entity, query);
              return (
                <li key={`${entity.entityType}:${entity.entityId}`}>
                  <span className="v2-chip">{entity.entityType}</span>
                  <strong>{entity.label ?? entity.entityId}</strong>
                  {entityHref ? (
                    <Link className="v2-link" href={entityHref}>
                      Mở thực thể
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
        <details className="v2-technical-details">
          <summary>Chi tiết kỹ thuật</summary>
          <dl className="v2-detail-list">
            <div>
              <dt>Mã kỹ thuật</dt>
              <dd>{issue.technicalCode}</dd>
            </div>
            <div>
              <dt>Issue ID</dt>
              <dd>{issue.issueId}</dd>
            </div>
          </dl>
        </details>
      </div>
    </EntityDrawer>
  );
}

export function DataHealthV2({
  dashboard,
  creatives,
  syncRuns,
  connected,
  query,
}: {
  dashboard: DashboardViewModel;
  creatives: CreativeRow[];
  syncRuns: SyncRunView[];
  connected: boolean;
  query: Query;
}) {
  const latest = syncRuns[0];
  const coverage = buildDataHealthCoverage(creatives, dashboard.events);
  const overall = overallStatus(latest, connected);
  const issues = buildDataHealthIssuesFromRuns(syncRuns);
  const selectedId = first(query.selected);
  const selected = selectedId
    ? issues.find((issue) => issue.issueId === selectedId)
    : undefined;
  const permission = dashboard.checklist.find(
    (item) => item.label === "Quyền truy cập",
  );
  const eventMapping = dashboard.checklist.find(
    (item) => item.label === "Event mapping",
  );
  const readyEvents = dashboard.events.reduce(
    (sum, event) =>
      sum +
      [event.android, event.ios].filter((status) => status === "ready").length,
    0,
  );
  const eventCoverage = dashboard.events.length
    ? readyEvents / (dashboard.events.length * 2)
    : 0;

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div>
          <h1>Chất lượng dữ liệu</h1>
          <p>
            Một trạng thái thống nhất từ lần đồng bộ mới nhất, coverage,
            freshness và event mapping; raw code chỉ nằm trong chi tiết kỹ thuật.
          </p>
        </div>
        <span className={`v2-health-badge v2-health-badge--${overall.tone}`}>
          {overall.label}
        </span>
      </header>
      <section className={`v2-overall-health v2-overall-health--${overall.tone}`}>
        <span aria-hidden="true">
          {overall.status === "ready" ? (
            <CheckCircle2 size={24} />
          ) : (
            <TriangleAlert size={24} />
          )}
        </span>
        <div>
          <strong>Trạng thái tổng thể: {overall.label}</strong>
          <p>{overall.detail}</p>
        </div>
        <StatusPill status={overall.status} />
      </section>
      <section className="v2-health-dimensions" aria-label="Các chiều chất lượng">
        <article>
          <ShieldCheck aria-hidden="true" size={19} />
          <span>Quyền truy cập</span>
          <strong>
            {permission?.status === "ready" ? "Đầy đủ" : "Cần kiểm tra"}
          </strong>
          <small>{permission?.detail ?? "Chưa có đánh giá"}</small>
        </article>
        <article>
          <Gauge aria-hidden="true" size={19} />
          <span>Coverage sự kiện</span>
          <strong>{formatPercent(eventCoverage * 100, 0)}</strong>
          <small>{eventMapping?.detail ?? "Chưa có event mapping"}</small>
        </article>
        <article>
          <Clock3 aria-hidden="true" size={19} />
          <span>Độ mới</span>
          <strong>{dashboard.lastSyncAt ?? "Chưa đồng bộ"}</strong>
          <small>
            {latest?.status === "partial"
              ? "Lần mới nhất hoàn thành có cảnh báo"
              : latest?.status === "success"
                ? "Lần mới nhất hoàn tất"
                : "Chưa có lần thành công"}
          </small>
        </article>
        <article>
          <Database aria-hidden="true" size={19} />
          <span>Phạm vi nguồn</span>
          <strong>{dashboard.counts.adAccounts} tài khoản</strong>
          <small>
            {dashboard.counts.creatives} Creative assets ·{" "}
            {dashboard.counts.pages} Pages
          </small>
        </article>
      </section>
      <section className="v2-panel v2-coverage-panel">
        <div className="v2-panel__header">
          <div>
            <h2>Độ đầy đủ</h2>
            <p>
              Tính trên Creative Family đã đồng bộ; không suy diễn tổng danh
              mục Meta khi nguồn chưa trả về mẫu số.
            </p>
          </div>
          <Gauge aria-hidden="true" size={18} />
        </div>
        <div className="v2-coverage-grid">
          {coverage.map((dimension) => (
            <article key={dimension.key}>
              <span>{dimension.label}</span>
              <strong>{formatPercent(dimension.ratio * 100, 0)}</strong>
              <div
                className="v2-coverage-meter"
                role="progressbar"
                aria-label={dimension.label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(dimension.ratio * 100)}
              >
                <i style={{ width: `${dimension.ratio * 100}%` }} />
              </div>
              <small>{dimension.detail}</small>
            </article>
          ))}
        </div>
      </section>
      <section className="v2-panel">
        <div className="v2-panel__header">
          <div>
            <h2>Vấn đề cần kiểm tra</h2>
            <p>
              Gộp theo mã ổn định và đúng tập thực thể bị ảnh hưởng qua nhiều lần
              đồng bộ.
            </p>
          </div>
          <span className="v2-chip v2-chip--warning">
            {issues.length} vấn đề
          </span>
        </div>
        {issues.length ? (
          <div className="v2-issues-list">
            {issues.map((issue) => (
              <Link
                href={href(query, { selected: issue.issueId })}
                key={issue.issueId}
                data-entity-trigger={issue.issueId}
                aria-haspopup="dialog"
              >
                <span
                  className={`v2-issue-icon v2-issue-icon--${issueTone(issue)}`}
                  aria-hidden="true"
                >
                  <AlertTriangle size={17} />
                </span>
                <div>
                  <strong>{issue.userMessage}</strong>
                  <small>{issue.impact}</small>
                </div>
                <span>
                  {issue.occurrenceCount} lần · {issue.affectedGroupCount} nhóm
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="v2-compact-empty">
            <CheckCircle2 aria-hidden="true" size={22} />
            <p>Không có cảnh báo trong lịch sử đồng bộ đang hiển thị.</p>
          </div>
        )}
      </section>
      <section className="v2-panel">
        <div className="v2-panel__header">
          <div>
            <h2>Lịch sử đồng bộ</h2>
            <p>Trạng thái, thời lượng, số bản ghi và lỗi theo từng lần chạy.</p>
          </div>
          <CircleDot aria-hidden="true" size={18} />
        </div>
        {syncRuns.length ? (
          <div
            className="v2-sync-table"
            role="table"
            aria-label="Lịch sử đồng bộ"
            tabIndex={0}
          >
            <div className="v2-sync-table__head" role="row">
              <span role="columnheader">Loại</span>
              <span role="columnheader">Bắt đầu</span>
              <span role="columnheader">Hoàn tất</span>
              <span role="columnheader">Thời lượng</span>
              <span role="columnheader">Bản ghi</span>
              <span role="columnheader">Lỗi / thiếu</span>
              <span role="columnheader">Trạng thái</span>
            </div>
            {syncRuns.map((run) => (
              <div className="v2-sync-table__row" role="row" key={run.id}>
                <span role="cell">
                  <strong>{run.kind}</strong>
                  <small>{run.summary}</small>
                </span>
                <span role="cell">{run.startedAt}</span>
                <span role="cell">{run.finishedAt ?? "Đang chạy"}</span>
                <span role="cell">{duration(run.durationSeconds)}</span>
                <span role="cell">
                  {run.recordCount === null ||
                  run.recordCount === undefined
                    ? "Không có trong run này"
                    : formatNumber(run.recordCount)}
                </span>
                <span role="cell">
                  {run.errorCount === null || run.errorCount === undefined
                    ? run.warnings.length
                      ? `${run.warnings.length} cảnh báo`
                      : "0"
                    : formatNumber(run.errorCount)}
                </span>
                <span role="cell">
                  <span
                    className={`v2-chip ${
                      run.status === "success"
                        ? "v2-chip--success"
                        : run.status === "partial"
                          ? "v2-chip--warning"
                          : run.status === "failed"
                            ? "v2-chip--danger"
                            : ""
                    }`}
                  >
                    {run.status === "success"
                      ? "Hoàn tất"
                      : run.status === "partial"
                        ? "Hoàn thành có cảnh báo"
                        : run.status === "failed"
                          ? "Thất bại"
                          : run.status === "running"
                            ? "Đang chạy"
                            : "Đã hủy"}
                  </span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="v2-compact-empty">
            <Link2 aria-hidden="true" size={22} />
            <p>Chưa có lịch sử đồng bộ.</p>
          </div>
        )}
      </section>
      {selected ? <IssueDrawer issue={selected} query={query} /> : null}
    </div>
  );
}

export {
  buildDataHealthIssuesFromRuns as buildDataHealthIssuesForView,
};
