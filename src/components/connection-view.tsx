"use client";

import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  KeyRound,
  Link2,
  LogOut,
  MoreHorizontal,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { PageHeader } from "@/components/ui/page-header";
import type { MetaConnectionLifecycle } from "@/lib/meta";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function formatExpiry(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(date);
}

export function ConnectionView({
  configured,
  connected,
  ownerName,
  expiresAt,
  dataAccessExpiresAt,
  lifecycle,
  initialMessage,
  embedded = false,
}: {
  configured: boolean;
  connected: boolean;
  ownerName: string | null;
  expiresAt: string | null;
  dataAccessExpiresAt: string | null;
  lifecycle: MetaConnectionLifecycle | null;
  initialMessage?: string | null;
  embedded?: boolean;
}) {
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(
    initialMessage ?? null,
  );
  const overflowButtonRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const expiryLabel = formatExpiry(expiresAt);
  const dataAccessExpiryLabel = formatExpiry(dataAccessExpiresAt);

  useEffect(() => {
    if (!confirmOpen) return;
    const previousOverflow = document.body.style.overflow;
    const restoreTarget = overflowButtonRef.current;
    document.body.style.overflow = "hidden";
    cancelButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      restoreTarget?.focus();
    };
  }, [confirmOpen]);

  function closeConfirm() {
    if (disconnecting) return;
    setConfirmOpen(false);
  }

  function trapConfirmFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeConfirm();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      confirmRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
    ).filter((element) => !element.hidden);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/meta/disconnect", {
        method: "POST",
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Không thể ngắt kết nối.");
      }
      setConfirmOpen(false);
      setMenuOpen(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Có lỗi xảy ra.");
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="connection-page">
      {!embedded ? (
        <PageHeader
          title="Kết nối Meta"
          description="Xác thực chủ sở hữu và cấp quyền đọc dữ liệu Marketing API."
        />
      ) : null}

      {!configured ? (
        <section className="connection-state connection-state--warning">
          <span aria-hidden="true">
            <AlertCircle size={22} />
          </span>
          <div>
            <h2>Live mode chưa sẵn sàng</h2>
            <p>
              Hoàn tất database, Meta App, khóa bảo mật và thông tin pháp lý
              trong Setup Wizard, sau đó redeploy.
            </p>
          </div>
          <Link className="button button--primary" href="/setup">
            Mở Setup Wizard
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </section>
      ) : connected ? (
        <section className="connection-state connection-state--success">
          <span aria-hidden="true">
            <CheckCircle2 size={23} />
          </span>
          <div>
            <h2>Meta đã kết nối</h2>
            <p>
              Chủ sở hữu: <strong>{ownerName ?? "Meta user"}</strong>
              {expiryLabel ? ` · Token hết hạn ${expiryLabel}` : ""}
              {dataAccessExpiryLabel
                ? ` · Quyền dữ liệu hết hạn ${dataAccessExpiryLabel}`
                : ""}
              {lifecycle === "expiring_soon"
                ? " · Nên kết nối lại trong 7 ngày"
                : lifecycle === "unknown"
                  ? " · Meta chưa trả thời hạn truy cập"
                  : ""}
            </p>
          </div>
          <div className="connection-overflow">
            <button
              ref={overflowButtonRef}
              className="v2-icon-button"
              type="button"
              aria-label="Tùy chọn kết nối"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => setMenuOpen((current) => !current)}
            >
              <MoreHorizontal aria-hidden="true" size={19} />
            </button>
            {menuOpen ? (
              <div className="connection-overflow__menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setConfirmOpen(true);
                    setMenuOpen(false);
                  }}
                >
                  <LogOut aria-hidden="true" size={16} />
                  Ngắt kết nối
                </button>
              </div>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="connect-hero">
          <span className="connect-hero__icon" aria-hidden="true">
            <Link2 size={26} />
          </span>
          <h2>Kết nối tài khoản Meta của bạn</h2>
          <p>
            Hệ thống chỉ xin quyền đọc để quét các tài sản mà tài khoản hiện tại
            đang được phép quản lý.
          </p>
          <form
            className="owner-connect-form"
            action="/api/auth/meta/start"
            method="post"
          >
            <label>
              <span>Mã thiết lập owner</span>
              <input
                name="setupSecret"
                type="password"
                autoComplete="off"
                minLength={32}
                required
                placeholder="OWNER_SETUP_SECRET"
              />
            </label>
            <button className="button button--primary" type="submit">
              Tiếp tục với Meta
              <ArrowRight aria-hidden="true" size={16} />
            </button>
          </form>
          <small>
            Mã chỉ gửi trực tiếp tới backend qua HTTPS; không lưu trong browser.
          </small>
        </section>
      )}

      {message ? (
        <p className="inline-notice" role="alert">
          {message}
        </p>
      ) : null}

      {confirmOpen ? (
        <div className="disconnect-confirm-layer">
          <button
            type="button"
            className="disconnect-confirm-layer__backdrop"
            aria-label="Hủy ngắt kết nối"
            onClick={closeConfirm}
          />
          <section
            ref={confirmRef}
            className="disconnect-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="disconnect-confirm-title"
            aria-describedby="disconnect-confirm-description"
            onKeyDown={trapConfirmFocus}
          >
            <button
              className="v2-icon-button disconnect-confirm__close"
              type="button"
              aria-label="Đóng xác nhận"
              onClick={closeConfirm}
            >
              <X aria-hidden="true" size={19} />
            </button>
            <span className="disconnect-confirm__icon" aria-hidden="true">
              <LogOut size={21} />
            </span>
            <h2 id="disconnect-confirm-title">Ngắt kết nối Meta?</h2>
            <p id="disconnect-confirm-description">
              Token và dữ liệu kết nối cục bộ sẽ bị xóa. Thao tác này không thay
              đổi Campaign, Ads hoặc ngân sách trong Meta.
            </p>
            <div>
              <button
                ref={cancelButtonRef}
                className="button button--secondary"
                type="button"
                disabled={disconnecting}
                onClick={closeConfirm}
              >
                Giữ kết nối
              </button>
              <button
                className="button button--danger"
                type="button"
                disabled={disconnecting}
                onClick={disconnect}
              >
                <LogOut aria-hidden="true" size={16} />
                {disconnecting ? "Đang ngắt…" : "Xác nhận ngắt"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <section className="permission-grid" aria-label="Quyền và phạm vi">
        <article>
          <span aria-hidden="true">
            <ShieldCheck size={19} />
          </span>
          <h2>Read-only</h2>
          <p>Quyền chính là ads_read và quyền liệt kê tài sản doanh nghiệp.</p>
        </article>
        <article>
          <span aria-hidden="true">
            <Building2 size={19} />
          </span>
          <h2>Tất cả tài sản được cấp quyền</h2>
          <p>BM, tài khoản quảng cáo, Trang, campaign, ads và creative.</p>
        </article>
        <article>
          <span aria-hidden="true">
            <KeyRound size={19} />
          </span>
          <h2>Token được mã hóa</h2>
          <p>Access token chỉ tồn tại ở backend và được mã hóa trước khi lưu.</p>
        </article>
      </section>
    </div>
  );
}
