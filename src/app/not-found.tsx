import Link from "next/link";

export default function NotFound() {
  return (
    <main className="legal-page">
      <div className="legal-page__card legal-page__card--center">
        <strong className="error-code">404</strong>
        <h1>Không tìm thấy trang</h1>
        <p>Đường dẫn này không tồn tại hoặc đã được di chuyển.</p>
        <Link className="button button--primary" href="/dashboard">
          Về Tổng quan
        </Link>
      </div>
    </main>
  );
}
