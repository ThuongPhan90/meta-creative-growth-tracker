# Biến môi trường

Copy `.env.example` thành `.env.local` khi chạy Next.js local. Trên Vercel, khai
báo tại Project → Settings → Environment Variables và chọn đúng scope
Production/Preview/Development.

## Bảng cấu hình

| Biến | Bắt buộc | Phạm vi | Mô tả |
|---|---:|---|---|
| `APP_URL` | Có | Server | Origin cuối cùng, không có slash cuối/path/query; local là `http://localhost:3000`, production là HTTPS |
| `LEGAL_ENTITY_NAME` | Live | Server | Tên cá nhân/đơn vị vận hành hiển thị trên trang pháp lý; tối thiểu 2 ký tự |
| `PRIVACY_CONTACT_EMAIL` | Live | Server | Email liên hệ thật hiển thị trên trang pháp lý |
| `META_APP_ID` | Live | Server | App ID dạng số của Meta App riêng cho deployment |
| `META_APP_SECRET` | Live | Server secret | App Secret, chỉ dùng server-side |
| `META_GRAPH_VERSION` | Live | Server | Phiên bản Graph API có dạng `vN.N`; source hiện mặc định `v25.0` |
| `TOKEN_ENCRYPTION_KEY` | Live | Server secret | Khóa 32 byte, mã hóa hex thành đúng 64 ký tự |
| `SESSION_SECRET` | Live | Server secret | Secret độc lập, tối thiểu 32 byte UTF-8, để ký owner session/OAuth state |
| `OWNER_SETUP_SECRET` | Live | Server secret | Mã bootstrap độc lập, tối thiểu 32 byte UTF-8, owner nhập trước OAuth |
| `DATABASE_URL` | Live | Server secret | Pooled/serverless Postgres connection string riêng của deployment |
| `CRON_SECRET` | Production | Server secret | Secret tối thiểu 32 byte; Vercel gửi dưới dạng Bearer tới cron route |
| `DEMO_MODE` | Có | Server | Mặc định an toàn là Demo; chỉ chuỗi `false` mới bật Live |

Không biến nào cần tiền tố `NEXT_PUBLIC_`. Không đưa secret vào Deploy Button URL,
GitHub Actions log, screenshot hoặc client bundle.

`LEGAL_ENTITY_NAME` và `PRIVACY_CONTACT_EMAIL` là gate kỹ thuật trước khi backend
mở Meta OAuth. Chúng không thay thế việc owner đọc lại nội dung thực tế tại:

```text
https://YOUR-DOMAIN/privacy
https://YOUR-DOMAIN/data-deletion
```

## Settings là nguồn cấu hình KPI/sync

Live mode lưu cấu hình báo cáo trong `tracker.app_settings`. Owner chỉnh tại
**Cài đặt**:

- reporting timezone;
- lookback 7/14/30/90 ngày;
- ngưỡng tối thiểu để creative được xem là đủ dữ liệu;
- danh sách Meta action type cho Install;
- danh sách Meta action type cho Registration.

Cron, manual sync và báo cáo Live đọc các giá trị đã lưu này. Không thêm
`SYNC_LOOKBACK_DAYS`, `REPORTING_TIMEZONE`, `INSTALL_ACTION_TYPES` hoặc
`REGISTRATION_ACTION_TYPES` vào Vercel để cấu hình Live; đó không phải contract
triển khai hiện tại. Sau khi đổi action type hoặc lookback, chạy sync lại khoảng
liên quan và đối chiếu với Ads Manager.

## Tạo secret

macOS/Linux/Git Bash:

```bash
openssl rand -hex 32
openssl rand -base64 32
openssl rand -base64 32
openssl rand -base64 32
```

Lần lượt dùng cho `TOKEN_ENCRYPTION_KEY`, `SESSION_SECRET`,
`OWNER_SETUP_SECRET`, `CRON_SECRET`. Tạo bốn giá trị độc lập.

PowerShell:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToHexString($bytes).ToLower()
```

Lệnh trên tạo giá trị phù hợp cho `TOKEN_ENCRYPTION_KEY`. Với ba secret còn lại,
có thể chạy lại với byte array mới và dùng chuỗi hex vừa tạo; 64 ký tự hex đáp
ứng yêu cầu tối thiểu 32 byte UTF-8. Không dùng chung một giá trị.

`OWNER_SETUP_SECRET` chỉ được nhập vào biểu mẫu kết nối owner. Backend nhận bằng
POST qua HTTPS, so sánh constant-time rồi mới tạo OAuth `state`; không đưa secret
vào query string, localStorage hoặc GitHub.

## Phạm vi Vercel

- Production: credential, legal identity và database production.
- Preview: giữ Demo mode; nếu cần test Live thì dùng Meta App và database sandbox
  riêng.
- Development: local/sandbox.

Environment Variables mới chỉ có hiệu lực với deployment mới. Sau mỗi thay đổi,
redeploy đúng environment. Không áp production token/database cho Preview; pull
request từ fork không được nhận secrets.

Vercel có thể đánh dấu biến nhạy cảm là Sensitive. Giá trị Sensitive có thể
không đọc lại được qua dashboard/CLI; lưu bản gốc trong password manager. Nếu
Marketplace tạo biến connection string với tên khác, tạo `DATABASE_URL` trỏ tới
pooled/serverless URL đúng provider.

## Graph version và token

Giữ `META_GRAPH_VERSION` cố định thay vì gọi phiên bản “latest” ngầm. Rà Meta
changelog/deprecation định kỳ; trước lần Live đầu tiên và trước mỗi lần nâng:

1. kiểm tra phiên bản còn được Meta hỗ trợ trong App Dashboard/tài liệu chính
   thức;
2. thử OAuth, asset discovery và một ngày Insights trên sandbox/Preview;
3. đổi env và redeploy;
4. đối chiếu action types, attribution và pagination.

Long-lived user token không phải token vĩnh viễn. Ứng dụng lưu thời điểm hết hạn
nếu Meta trả về nhưng không tự gia hạn. Owner phải reconnect khi token hết hạn,
bị thu hồi, quyền thay đổi hoặc Meta yêu cầu xác nhận quyền truy cập dữ liệu.

## Rotate

Rotate ngay khi secret xuất hiện trong commit, screenshot, log hoặc chat:

1. thu hồi/đổi secret tại nguồn;
2. cập nhật Vercel Environment Variables;
3. redeploy;
4. xóa/reconnect token hoặc session cũ nếu cần;
5. kiểm tra Git history và logs.

Đổi `TOKEN_ENCRYPTION_KEY` cần kế hoạch re-encrypt hoặc kết nối Meta lại; nếu chỉ
đổi key mà không migrate, token cũ sẽ không giải mã được.
