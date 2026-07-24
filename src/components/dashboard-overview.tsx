import {
  Activity,
  ArrowRight,
  Building2,
  CircleDot,
  Flag,
  Images,
  Link2,
  Megaphone,
  RefreshCcw,
  Smartphone,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import type { DashboardViewModel } from "@/types/view-models";

const workflow = [
  {
    index: 1,
    title: "Kết nối tài khoản",
    description: "Xác thực Meta và cấp quyền chỉ đọc.",
  },
  {
    index: 2,
    title: "Quét tài sản",
    description: "Tìm BM, tài khoản quảng cáo, Trang và creative.",
  },
  {
    index: 3,
    title: "Map sự kiện",
    description: "Xác nhận Install và CompleteRegistration.",
  },
  {
    index: 4,
    title: "Chờ phân phối",
    description: "Mở khóa hiệu quả khi có dữ liệu delivery.",
  },
];

const counterMeta = [
  { key: "businesses", label: "BM", detail: "Business portfolios", icon: Building2 },
  {
    key: "adAccounts",
    label: "Tài khoản quảng cáo",
    detail: "Ad accounts",
    icon: Megaphone,
  },
  { key: "pages", label: "Trang", detail: "Meta Pages", icon: Flag },
  {
    key: "creatives",
    label: "Creative đã đồng bộ",
    detail: "Video & banner",
    icon: Images,
  },
] as const;

function formatStatus(status: string) {
  if (status === "ready") return "Đã nhận dữ liệu";
  if (status === "warning") return "Cần kiểm tra";
  if (status === "error") return "Có lỗi";
  return "Chưa kiểm tra";
}

export function DashboardOverview({
  data,
}: {
  data: DashboardViewModel;
}) {
  const isConnected = data.mode === "connected";

  return (
    <div className="dashboard-page">
      <PageHeader
        title="Tổng quan tăng trưởng"
        description="Kiểm tra mức độ sẵn sàng trước khi quảng cáo bắt đầu phân phối."
        actions={
          data.lastSyncAt ? (
            <span className="last-sync">
              <RefreshCcw aria-hidden="true" size={14} />
              Đồng bộ {data.lastSyncAt}
            </span>
          ) : null
        }
      />

      <section className="connection-band" aria-labelledby="connection-title">
        <div className="connection-band__intro">
          <span className="connection-band__icon" aria-hidden="true">
            <Link2 size={20} />
          </span>
          <div>
            <h2 id="connection-title">
              {isConnected
                ? "Meta đã kết nối"
                : "Kết nối Meta để bắt đầu theo dõi"}
            </h2>
            <p>{data.connectionDetail}</p>
            <div className="connection-band__actions">
              <Link className="button button--primary" href="/connect">
                {isConnected ? "Xem kết nối" : "Kết nối Meta"}
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
              <Link className="button button--secondary" href="/setup">
                Xem cách hoạt động
              </Link>
            </div>
          </div>
        </div>

        <ol className="workflow">
          {workflow.map((step, position) => (
            <li className="workflow__step" key={step.index}>
              <div className="workflow__marker">
                <span>{step.index}</span>
                {position < workflow.length - 1 ? (
                  <i aria-hidden="true" />
                ) : null}
              </div>
              <strong>{step.title}</strong>
              <p>{step.description}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="dashboard-grid">
        <div className="dashboard-grid__main">
          <section className="counter-rail" aria-label="Phạm vi tài sản">
            {counterMeta.map((item) => {
              const Icon = item.icon;
              return (
                <article className="counter" key={item.key}>
                  <span className="counter__icon" aria-hidden="true">
                    <Icon size={19} />
                  </span>
                  <strong>{data.counts[item.key]}</strong>
                  <span>{item.label}</span>
                  <small>{item.detail}</small>
                </article>
              );
            })}
          </section>

          <section className="event-panel">
            <div className="section-heading">
              <div>
                <h2>Sức khỏe sự kiện</h2>
                <p>
                  Meta-attributed actions được kiểm tra theo từng hệ điều hành.
                </p>
              </div>
              <Smartphone aria-hidden="true" size={19} />
            </div>
            <div
              className="event-table"
              role="table"
              aria-label="Bảng sức khỏe sự kiện, có thể cuộn ngang"
              tabIndex={0}
            >
              <div className="event-table__header" role="row">
                <span role="columnheader">Tên sự kiện</span>
                <span role="columnheader">Android</span>
                <span role="columnheader">iOS</span>
                <span role="columnheader">Trạng thái</span>
              </div>
              {data.events.map((event) => {
                const overall =
                  event.android === "error" || event.ios === "error"
                    ? "error"
                    : event.android === "warning" || event.ios === "warning"
                      ? "warning"
                      : event.android === "ready" && event.ios === "ready"
                        ? "ready"
                        : "pending";

                return (
                  <div className="event-table__row" role="row" key={event.name}>
                    <span className="event-name" role="cell">
                      <CircleDot aria-hidden="true" size={16} />
                      {event.name}
                    </span>
                    <span role="cell">{formatStatus(event.android)}</span>
                    <span role="cell">{formatStatus(event.ios)}</span>
                    <span role="cell">
                      <StatusPill status={overall} compact />
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="readiness-panel" aria-label="Checklist sẵn sàng">
          <div className="section-heading">
            <div>
              <h2>Checklist sẵn sàng</h2>
              <p>Chỉ mở khóa hiệu quả khi dữ liệu đủ điều kiện.</p>
            </div>
            <Activity aria-hidden="true" size={19} />
          </div>
          <ul>
            {data.checklist.map((item) => (
              <li key={item.label}>
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </div>
                <StatusPill status={item.status} compact />
              </li>
            ))}
          </ul>
        </aside>
      </div>

      <section className="cold-empty-state">
        <span className="cold-empty-state__icon" aria-hidden="true">
          <Activity size={23} />
        </span>
        <h2>
          {data.hasDelivery
            ? "Dữ liệu hiệu quả đã sẵn sàng"
            : "Chưa có dữ liệu quảng cáo"}
        </h2>
        <p>
          {data.hasDelivery
            ? "Mở Creative Library để xem Spend, Link CTR, CPI, CPA, Hook, Hold và xếp hạng theo baseline OS."
            : "Khi chiến dịch bắt đầu phân phối, hệ thống sẽ tự mở khóa Link CTR, CPI, CPA, Hook và Hold."}
        </p>
        <div>
          <Link
            className="button button--primary"
            href={
              data.hasDelivery
                ? "/tracker"
                : isConnected
                  ? "/health"
                  : "/connect"
            }
          >
            {data.hasDelivery
              ? "Xem Creative Tracker"
              : isConnected
                ? "Kiểm tra đồng bộ"
                : "Kết nối Meta"}
          </Link>
          <Link
            className="button button--secondary"
            href={
              data.hasDelivery
                ? "/health"
                : isConnected
                  ? "/campaigns"
                  : "/creatives"
            }
          >
            {data.hasDelivery
              ? "Kiểm tra sức khỏe dữ liệu"
              : isConnected
                ? "Xem Campaigns & Ads"
                : "Xem Creative Library"}
          </Link>
        </div>
      </section>
    </div>
  );
}
