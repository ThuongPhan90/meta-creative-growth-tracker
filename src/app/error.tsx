"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="legal-page">
      <div className="legal-page__card legal-page__card--center">
        <strong className="error-code">!</strong>
        <h1>Không thể tải dữ liệu</h1>
        <p>Kiểm tra kết nối database, biến môi trường hoặc thử lại.</p>
        <button className="button button--primary" type="button" onClick={reset}>
          Thử lại
        </button>
      </div>
    </main>
  );
}
