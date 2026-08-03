"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="vi">
      <body>
        <main className="legal-page">
          <div className="legal-page__card legal-page__card--center">
            <strong className="error-code">!</strong>
            <h1>Ứng dụng gặp sự cố</h1>
            <p>Hãy thử tải lại. Nếu lỗi tiếp diễn, kiểm tra trạng thái hệ thống.</p>
            <button
              className="button button--primary"
              type="button"
              onClick={reset}
            >
              Thử lại
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
