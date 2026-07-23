import {
  ArrowRight,
  Check,
  CircleDashed,
  Database,
  ExternalLink,
  FileText,
  KeyRound,
  Link2,
  LockKeyhole,
  Server,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import type { SetupCheck } from "@/types/view-models";

const iconMap = {
  app: Server,
  database: Database,
  meta: Link2,
  security: KeyRound,
  legal: FileText,
  connection: LockKeyhole,
  sync: CircleDashed,
};

export function SetupWizard({
  checks,
  callbackUrl,
}: {
  checks: SetupCheck[];
  callbackUrl: string;
}) {
  const completed = checks.filter((check) => check.status === "ready").length;
  const percent = Math.round((completed / checks.length) * 100);

  return (
    <div className="setup-page">
      <PageHeader
        title="Setup Wizard"
        description="Hoàn tất một lần để chuyển từ Demo Mode sang dữ liệu Meta thật."
      />

      <section className="setup-progress" aria-label="Tiến độ cài đặt">
        <div>
          <strong>{completed}/{checks.length} bước hoàn tất</strong>
          <span>{percent}%</span>
        </div>
        <progress max={checks.length} value={completed}>
          {percent}%
        </progress>
      </section>

      <ol className="setup-checks">
        {checks.map((check, index) => {
          const Icon = iconMap[check.id];
          return (
            <li className="setup-check" key={check.id}>
              <span className="setup-check__number">{index + 1}</span>
              <span className="setup-check__icon" aria-hidden="true">
                <Icon size={18} />
              </span>
              <div>
                <h2>{check.label}</h2>
                <p>{check.description}</p>
              </div>
              <StatusPill status={check.status} />
              {check.actionHref && check.actionLabel ? (
                <Link href={check.actionHref}>
                  {check.actionLabel}
                  <ArrowRight aria-hidden="true" size={14} />
                </Link>
              ) : null}
            </li>
          );
        })}
      </ol>

      <section className="setup-guide" id="database">
        <div className="setup-guide__title">
          <span aria-hidden="true">
            <Database size={18} />
          </span>
          <div>
            <h2>1. Cài Postgres trong Vercel</h2>
            <p>Không cần tự vận hành database server.</p>
          </div>
        </div>
        <ol>
          <li>Vào Vercel Project → Storage.</li>
          <li>Chọn Create Database → Neon Postgres hoặc Supabase.</li>
          <li>Kết nối database với project Production.</li>
          <li>Vercel sẽ tự thêm biến DATABASE_URL.</li>
          <li>Redeploy project để biến môi trường có hiệu lực.</li>
        </ol>
      </section>

      <section className="setup-guide" id="meta">
        <div className="setup-guide__title">
          <span aria-hidden="true">
            <Link2 size={18} />
          </span>
          <div>
            <h2>2. Tạo Meta Developer App</h2>
            <p>Mỗi deployment dùng App ID và App Secret riêng.</p>
          </div>
        </div>
        <ol>
          <li>Tạo Business App tại Meta for Developers.</li>
          <li>Thêm Marketing API và Facebook Login for Business.</li>
          <li>Thêm OAuth redirect URI chính xác như bên dưới.</li>
        </ol>
        <div className="code-field">
          <code>{callbackUrl}</code>
        </div>
        <p className="setup-guide__note">
          Sau đó thêm META_APP_ID và META_APP_SECRET vào Vercel Environment
          Variables.
        </p>
      </section>

      <section className="setup-guide" id="security">
        <div className="setup-guide__title">
          <span aria-hidden="true">
            <KeyRound size={18} />
          </span>
          <div>
            <h2>3. Tạo khóa bảo mật</h2>
            <p>Không commit bất kỳ giá trị bí mật nào vào GitHub.</p>
          </div>
        </div>
        <div className="env-grid">
          <div>
            <strong>TOKEN_ENCRYPTION_KEY</strong>
            <code>openssl rand -hex 32</code>
          </div>
          <div>
            <strong>SESSION_SECRET</strong>
            <code>openssl rand -base64 32</code>
          </div>
          <div>
            <strong>CRON_SECRET</strong>
            <code>openssl rand -base64 32</code>
          </div>
          <div>
            <strong>OWNER_SETUP_SECRET</strong>
            <code>openssl rand -base64 32</code>
          </div>
        </div>
        <p className="setup-guide__note">
          OWNER_SETUP_SECRET chỉ dùng khi owner mở Meta OAuth. Không gửi qua URL
          và không lưu trong localStorage.
        </p>
      </section>

      <section className="setup-finish">
        <span aria-hidden="true">
          <Check size={20} />
        </span>
        <div>
          <h2>Sẵn sàng kết nối</h2>
          <p>
            Khi các biến môi trường đã có, redeploy một lần rồi kết nối tài
            khoản Meta của chủ sở hữu.
          </p>
        </div>
        <Link className="button button--primary" href="/connect">
          Đi tới Kết nối Meta
        </Link>
        <a
          className="button button--secondary"
          href="https://developers.facebook.com/apps/"
          target="_blank"
          rel="noreferrer"
        >
          Meta for Developers
          <ExternalLink aria-hidden="true" size={15} />
        </a>
      </section>
    </div>
  );
}
