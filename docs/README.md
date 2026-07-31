# Tài liệu

## Lộ trình đọc

### Người muốn chạy thử

1. [Demo mode và Live mode](demo-live-modes.md)
2. [Biến môi trường](environment-variables.md)
3. [Triển khai Vercel](vercel-deployment.md)

### Người cấu hình dữ liệu Meta thật

1. [Triển khai Vercel](vercel-deployment.md) để có production URL ổn định
2. [Privacy và data deletion](privacy-data-deletion.md)
3. [Thiết lập Meta App](meta-app-setup.md)
4. [Biến môi trường](environment-variables.md)
5. [Kiến trúc](architecture.md)
6. [Fidelity ledger](fidelity-ledger.md)
7. [Ngữ nghĩa dữ liệu](data-semantics.md)
8. [Universal Buyer V2](universal-buyer-v2.md)
9. [Troubleshooting](troubleshooting.md)

### Người dùng repo cho khóa học

Đọc [course-guide.md](course-guide.md) để biết checkpoint, phạm vi bài tập và
quy tắc không chia sẻ credential.

### Người cần tái kết nối

Đọc [connection-recovery.md](connection-recovery.md) để kiểm tra và khôi phục
GitHub, Vercel hoặc Meta mà không lưu secret trong repo.

## Nguyên tắc nguồn chuẩn

- Meta Marketing API là nguồn dữ liệu vận hành.
- Database là lớp cache/snapshot của từng deployment.
- `tracker.app_settings` là nguồn cấu hình KPI/sync của Live mode.
- Dashboard là lớp đọc/diễn giải, không phải nguồn chuẩn của campaign state.
- File Google Sheets cũ chỉ là nguồn tham chiếu logic; không tự động trở thành
  nguồn dữ liệu production.
