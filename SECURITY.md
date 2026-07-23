# Chính sách bảo mật

## Phiên bản được hỗ trợ

Personal v1 chỉ nhận bản vá bảo mật trên nhánh `main` mới nhất.

## Báo cáo lỗ hổng

Không mở public issue nếu phát hiện:

- lộ Meta access token, App Secret hoặc database URL;
- bypass owner session;
- đọc dữ liệu ngoài phạm vi owner;
- SSRF, SQL injection, XSS hoặc route cron không được bảo vệ;
- token được ghi log hoặc trả về browser.

Hãy gửi báo cáo riêng cho maintainer qua kênh liên hệ bảo mật của repository.
Nếu repo chưa cấu hình địa chỉ liên hệ, dùng chức năng private vulnerability
reporting trong GitHub Security. Bao gồm phiên bản/commit, bước tái hiện, tác
động và đề xuất giảm thiểu nếu có.

Maintainer sẽ cố gắng xác nhận trong 5 ngày làm việc. Không khai thác dữ liệu
thật và không công bố trước khi bản vá sẵn sàng.

## Trách nhiệm của người triển khai

Mỗi deployment phải có:

- Meta App credentials riêng;
- `TOKEN_ENCRYPTION_KEY`, `SESSION_SECRET`, `OWNER_SETUP_SECRET`,
  `CRON_SECRET` riêng;
- Postgres riêng được kết nối qua Vercel Marketplace;
- HTTPS và redirect URI đúng production domain;
- quyền Meta tối thiểu cần thiết;
- quy trình thu hồi token và xóa dữ liệu.

Không dùng lại secret giữa local, preview và production. Không đưa secret vào
biến có tiền tố `NEXT_PUBLIC_`.

## Xử lý sự cố

1. Thu hồi access token trong Meta.
2. Rotate App Secret, encryption/session/cron secrets và database password.
3. Redeploy production sau khi cập nhật environment variables.
4. Kiểm tra Vercel logs, Meta App activity và database audit.
5. Xóa log/export chứa credential; thông báo chủ dữ liệu nếu cần.
6. Ghi lại nguyên nhân, phạm vi, thời điểm và biện pháp ngăn tái diễn.

Chi tiết privacy và data deletion: [docs/privacy-data-deletion.md](docs/privacy-data-deletion.md).
