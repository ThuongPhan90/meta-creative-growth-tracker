"use client";

import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  KeyRound,
  Link2,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";

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
  initialMessage,
}: {
  configured: boolean;
  connected: boolean;
  ownerName: string | null;
  expiresAt: string | null;
  initialMessage?: string | null;
}) {
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState<string | null>(
    initialMessage ?? null,
  );
  const expiryLabel = formatExpiry(expiresAt);

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
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Có lỗi xảy ra.");
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="connection-page">
      <PageHeader
        title="Kết nối Meta"
        description="Xác thực chủ sở hữu và cấp quyền đọc dữ liệu Marketing API."
      />

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
            </p>
          </div>
          <button
            className="button button--danger"
            type="button"
            disabled={disconnecting}
            onClick={disconnect}
          >
            <LogOut aria-hidden="true" size={16} />
            {disconnecting ? "Đang ngắt" : "Ngắt kết nối"}
          </button>
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
