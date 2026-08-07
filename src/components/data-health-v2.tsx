import {
  AlertTriangle,
  ArrowUpRight,
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
import {
  buildDataHealthIssuesFromRuns,
  dataHealthRunEvidence,
} from "@/lib/data-contract";
import {
  formatNumber,
  formatPercent,
} from "@/lib/presentation/formatters";
import {
  buildDataHealthCoverage,
  type DeliveryReadyAccountCoverage,
} from "@/lib/presentation/data-health-coverage";
import { formatDataHealthEntityType } from "@/lib/presentation/data-health-entity-label";
import { dataHealthEntityHref } from "@/lib/presentation/data-health-links";
import { buildContextHref } from "@/lib/navigation/query";
import type {
  DataHealthCreativeReference,
  DashboardViewModel,
  DataHealthIssue,
  EventHealth,
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
  if (latest.status === "cancelled") {
    return {
      label: "Đã hủy",
      detail:
        "Lần đồng bộ mới nhất đã bị hủy; dữ liệu vẫn giữ ở snapshot thành công trước đó.",
      status: "warning",
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
  creatives,
}: {
  issue: DataHealthIssue;
  query: Query;
  creatives: DataHealthCreativeReference[];
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
              <dt>Bản ghi cảnh báo</dt>
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
              const entityHref = dataHealthEntityHref(entity, {
                query,
                creatives,
              });
              return (
                <li key={`${entity.entityType}:${entity.entityId}`}>
                  <span className="v2-chip">
                    {formatDataHealthEntityType(entity.entityType)}
                  </span>
                  <strong>{entity.label ?? entity.entityId}</strong>
                  <Link className="v2-link" href={entityHref}>
                    Mở thực thể
                  </Link>
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

function CoverageDrawer({
  dimension,
  query,
  creatives,
  events,
}: {
  dimension: ReturnType<typeof buildDataHealthCoverage>[number];
  query: Query;
  creatives: DataHealthCreativeReference[];
  events: EventHealth[];
}) {
  const unavailable = dimension.state === "unavailable";
  const missing = dimension.missingFamilyIds.flatMap((familyId) => {
    const creative = creatives.find(
      (item) => (item.creativeFamilyId?.trim() || item.id) === familyId,
    );
    return creative ? [creative] : [];
  });
  const missingEvents =
    dimension.key === "event" && !unavailable
      ? events.flatMap((event) =>
          (["android", "ios"] as const).flatMap((platform) =>
            event[platform] === "ready"
              ? []
              : [
                  {
                    key: `${event.name}:${platform}`,
                    label: event.name,
                    platform,
                    status: event[platform],
                  },
                ],
          ),
        )
      : [];
  const isDeliveryCoverage = dimension.key === "delivery_ready_account";
  const missingDeliveryAccounts = isDeliveryCoverage
    ? (dimension.missingAccountMetaIds ?? [])
    : [];

  return (
    <EntityDrawer
      title={`${dimension.label} · ${unavailable ? "chưa khả dụng" : "danh sách thiếu"}`}
      closeHref={href(query, { coverage: null })}
      restoreFocusId={`coverage-${dimension.key}`}
    >
      <div className="v2-drawer__body">
        <section className="v2-drawer__section">
          <h3>Định nghĩa</h3>
          <p className="v2-muted">{dimension.detail}</p>
          <dl className="v2-detail-list">
            <div>
              <dt>Đã đủ</dt>
              <dd>{unavailable ? "—" : formatNumber(dimension.covered)}</dd>
            </div>
            <div>
              <dt>
                {dimension.state === "partial"
                  ? "Số Family đã kiểm tra"
                  : "Tổng đã đồng bộ"}
              </dt>
              <dd>{unavailable ? "—" : formatNumber(dimension.total)}</dd>
            </div>
            <div>
              <dt>
                {dimension.state === "partial"
                  ? "Thiếu trong phần đã kiểm tra"
                  : "Còn thiếu"}
              </dt>
              <dd>
                {unavailable
                  ? "—"
                  : formatNumber(
                      Math.max(0, dimension.total - dimension.covered),
                    )}
              </dd>
            </div>
          </dl>
        </section>
        <section className="v2-drawer__section">
          <h3>
            {unavailable
              ? "Chưa có mẫu số"
              : dimension.key === "event"
              ? "Mapping cần kiểm tra"
              : isDeliveryCoverage
                ? "Ad Account cần kiểm tra"
              : "Creative Family cần kiểm tra"}
          </h3>
          {unavailable ? (
            <div className="v2-compact-empty">
              <Clock3 aria-hidden="true" size={22} />
              <p>
                {dimension.detail} Hệ thống chưa thể đánh giá thiếu hoặc đủ.
              </p>
            </div>
          ) : missing.length ? (
            <ul className="v2-affected-entities">
              {missing.map((creative) => (
                <li key={creative.id}>
                  <span className="v2-chip">{creative.format}</span>
                  <strong>{creative.name}</strong>
                  <Link
                    className="v2-link"
                    href={buildContextHref("/creatives", query, {
                      selected:
                        creative.creativeFamilyId?.trim() || creative.id,
                      tab: "usage",
                    })}
                  >
                    Mở Creative
                  </Link>
                </li>
              ))}
            </ul>
          ) : missingEvents.length ? (
            <ul className="v2-affected-entities">
              {missingEvents.map((event) => (
                <li key={event.key}>
                  <span className="v2-chip">
                    {event.platform === "android" ? "Android" : "iOS"}
                  </span>
                  <strong>{event.label}</strong>
                  <small>
                    {event.status === "warning"
                      ? "Mapping cần kiểm tra"
                      : "Chưa có mapping"}
                  </small>
                  <Link
                    className="v2-link"
                    href={buildContextHref("/settings", query, {
                      tab: "results",
                    })}
                  >
                    Mở cài đặt mapping
                  </Link>
                </li>
              ))}
            </ul>
          ) : isDeliveryCoverage ? (
            missingDeliveryAccounts.length ? (
              <ul className="v2-affected-entities">
                {missingDeliveryAccounts.map((accountId) => (
                  <li key={accountId}>
                    <span className="v2-chip">Ad Account</span>
                    <strong>{accountId}</strong>
                    <Link
                      className="v2-link"
                      href={buildContextHref("/sources", query, {
                        account_ids: accountId,
                      })}
                    >
                      Mở Nguồn dữ liệu
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="v2-compact-empty">
                <Clock3 aria-hidden="true" size={22} />
                <p>
                  {dimension.state === "partial"
                    ? "Các account delivery-ready không cùng ngày dữ liệu; hệ thống giữ trạng thái một phần thay vì đánh dấu đạt."
                    : dimension.total > 0
                      ? "Không có Ad Account thiếu riêng lẻ; mở Nguồn dữ liệu để đối chiếu scope delivery."
                      : "Không có mẫu số delivery-ready trong scope hiện tại; hệ thống không suy diễn coverage 100%."}
                </p>
                <Link className="v2-link" href={buildContextHref("/sources", query)}>
                  Mở Nguồn dữ liệu
                </Link>
              </div>
            )
          ) : dimension.state === "partial" ? (
            <div className="v2-compact-empty">
              <Clock3 aria-hidden="true" size={22} />
              <p>
                Projection Creative đã chạm giới hạn tải. Danh sách này chỉ
                phản ánh phần đã kiểm tra và không được xem là toàn bộ dữ liệu.
              </p>
            </div>
          ) : (
            <div className="v2-compact-empty">
              <CheckCircle2 aria-hidden="true" size={22} />
              <p>
                Không có Creative Family thiếu liên kết trong dữ liệu đã đồng bộ.
              </p>
            </div>
          )}
        </section>
      </div>
    </EntityDrawer>
  );
}

export function DataHealthV2({
  dashboard,
  creatives,
  creativeReferencesTruncated = false,
  syncRuns,
  connected,
  query,
  liveDelivery,
}: {
  dashboard: DashboardViewModel;
  creatives: DataHealthCreativeReference[];
  creativeReferencesTruncated?: boolean;
  syncRuns: SyncRunView[];
  connected: boolean;
  query: Query;
  liveDelivery?: DeliveryReadyAccountCoverage;
}) {
  const latest = syncRuns[0];
  const coverage = buildDataHealthCoverage(
    creatives,
    dashboard.events,
    liveDelivery,
    { creativeReferencesTruncated },
  );
  const visibleCoverage = connected
    ? coverage
    : coverage.map((dimension) => ({
        ...dimension,
        covered: 0,
        total: 0,
        ratio: null,
        state: "unavailable" as const,
        detail: "Kết nối Meta để xác định mẫu số coverage.",
        missingFamilyIds: [],
        missingAccountMetaIds: [],
      }));
  const overall = overallStatus(latest, connected);
  const issues = buildDataHealthIssuesFromRuns(syncRuns);
  const selectedId = first(query.selected);
  const selected = selectedId
    ? issues.find((issue) => issue.issueId === selectedId)
    : undefined;
  const selectedCoverageKey = first(query.coverage);
  const selectedCoverage = visibleCoverage.find(
    (dimension) => dimension.key === selectedCoverageKey,
  );
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
            freshness và Kết quả &amp; Mapping; raw code chỉ nằm trong chi tiết kỹ thuật.
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
          {issues.length ? (
            <Link
              className="v2-overall-health__action"
              href={`${href(query, { selected: null, coverage: null })}#health-issues`}
            >
              Xem {issues.length} vấn đề <ArrowUpRight aria-hidden="true" size={14} />
            </Link>
          ) : null}
        </div>
        <StatusPill status={overall.status} />
      </section>
      <section className="v2-health-dimensions" aria-label="Các chiều chất lượng">
        <article id="health-access">
          <ShieldCheck aria-hidden="true" size={19} />
          <span>Quyền truy cập</span>
          <strong>
            {!connected
              ? "Chưa khả dụng"
              : permission?.status === "ready"
                ? "Đầy đủ"
                : "Cần kiểm tra"}
          </strong>
          <small>{permission?.detail ?? "Chưa có đánh giá"}</small>
        </article>
        <article>
          <Gauge aria-hidden="true" size={19} />
          <span>Coverage Kết quả &amp; Mapping</span>
          <strong>
            {connected ? formatPercent(eventCoverage * 100, 0) : "—"}
          </strong>
          <small>{eventMapping?.detail ?? "Chưa có Kết quả & Mapping"}</small>
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
          <strong>
            {connected ? `${dashboard.counts.adAccounts} tài khoản` : "—"}
          </strong>
          <small>
            {connected
              ? `${dashboard.counts.creatives} Creative assets · ${dashboard.counts.pages} Pages`
              : "Kết nối Meta để tải phạm vi nguồn"}
          </small>
        </article>
      </section>
      <section className="v2-panel v2-coverage-panel">
        <div className="v2-panel__header">
          <div>
            <h2>Độ đầy đủ</h2>
            <p>
              Mỗi chiều dùng đúng mẫu số: Creative Family đã đồng bộ, mapping
              Objective/OS hoặc Ad Account đủ điều kiện delivery. Không suy
              diễn danh mục Meta khi nguồn chưa trả về mẫu số.
            </p>
          </div>
          <Gauge aria-hidden="true" size={18} />
        </div>
        <div className="v2-coverage-grid">
          {visibleCoverage.map((dimension) => (
            <Link
              className={`v2-coverage-card${
                dimension.ratio === null ||
                dimension.state === "partial" ||
                dimension.ratio < 0.8
                  ? " v2-coverage-card--warning"
                  : ""
              }`}
              href={href(query, {
                coverage: dimension.key,
                selected: null,
              })}
              id={`coverage-${dimension.key}`}
              key={dimension.key}
              aria-haspopup="dialog"
            >
              <span>{dimension.label}</span>
              <strong>
                {dimension.ratio === null
                  ? "—"
                  : formatPercent(dimension.ratio * 100, 0)}
                <small>
                  {dimension.state === "partial"
                    ? " · Một phần"
                    : dimension.ratio === null
                      ? " · Chưa khả dụng"
                    : dimension.ratio < 0.8
                    ? " · Cần kiểm tra"
                    : " · Đạt"}
                </small>
              </strong>
              <div
                className="v2-coverage-meter"
                role="progressbar"
                aria-label={dimension.label}
                aria-valuemin={0}
                aria-valuemax={100}
                {...(dimension.ratio === null
                  ? {
                      "aria-valuetext":
                        dimension.state === "partial"
                          ? "Coverage một phần"
                          : "Chưa khả dụng",
                    }
                  : { "aria-valuenow": Math.round(dimension.ratio * 100) })}
              >
                <i style={{ width: `${(dimension.ratio ?? 0) * 100}%` }} />
              </div>
              <small>{dimension.detail}</small>
              <small className="v2-link">
                {dimension.state === "partial"
                  ? "Xem phạm vi đã kiểm tra"
                  : dimension.ratio === null
                    ? "Xem định nghĩa mẫu số"
                  : `Xem ${Math.max(0, dimension.total - dimension.covered)} mục thiếu`}
              </small>
            </Link>
          ))}
        </div>
      </section>
      <section className="v2-panel" id="health-issues">
        <div className="v2-panel__header">
          <div>
            <h2>Vấn đề cần kiểm tra</h2>
            <p>
              Gộp các bản ghi cảnh báo theo mã ổn định và đúng tập thực thể bị
              ảnh hưởng qua nhiều lần đồng bộ.
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
                href={href(query, {
                  selected: issue.issueId,
                  coverage: null,
                })}
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
                  {issue.occurrenceCount} bản ghi cảnh báo ·{" "}
                  {issue.affectedGroupCount} nhóm
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
      <section className="v2-panel" id="sync-history">
        <div className="v2-panel__header">
          <div>
            <h2>Lịch sử đồng bộ</h2>
            <p>
              Dòng cần kiểm tra do sync run báo cáo và số bản ghi cảnh báo là
              hai số độc lập; hệ thống không tự phân bổ dòng vào từng issue.
            </p>
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
              <span role="columnheader">Dòng cần kiểm tra / cảnh báo</span>
              <span role="columnheader">Trạng thái</span>
            </div>
            {syncRuns.map((run) => {
              const evidence = dataHealthRunEvidence(run);
              return (
                <div className="v2-sync-table__row" role="row" key={run.id}>
                  <span role="cell">
                    <strong>{run.kind}</strong>
                    <small>{run.summary}</small>
                    {run.technicalSummary ? (
                      <small>{run.technicalSummary}</small>
                    ) : null}
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
                    <strong>
                      {evidence.reportedRowCount === null
                        ? "Nguồn không báo số dòng"
                        : `${formatNumber(
                            evidence.reportedRowCount,
                          )} dòng`}
                    </strong>
                    <small>
                      {formatNumber(evidence.warningEntryCount)} bản ghi cảnh báo
                    </small>
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
              );
            })}
          </div>
        ) : (
          <div className="v2-compact-empty">
            <Link2 aria-hidden="true" size={22} />
            <p>Chưa có lịch sử đồng bộ.</p>
          </div>
        )}
      </section>
      {selected ? (
        <IssueDrawer
          issue={selected}
          query={query}
          creatives={creatives}
        />
      ) : null}
      {selectedCoverage ? (
        <CoverageDrawer
          dimension={selectedCoverage}
          query={query}
          creatives={creatives}
          events={dashboard.events}
        />
      ) : null}
    </div>
  );
}

export {
  buildDataHealthIssuesFromRuns as buildDataHealthIssuesForView,
};
