# Bộ khôi phục kết nối GitHub · Vercel · Meta

Tài liệu này giúp tái kết nối nhanh trên máy mới, sau khi phiên đăng nhập hết hạn
hoặc sau khi rotate secret. Bộ khôi phục **không** lưu mật khẩu Facebook, access
token, App Secret, database URL hoặc bất kỳ secret nào trong Git.

## Asset có sẵn

| Asset | Mục đích |
|---|---|
| `ops/connection-profile.json` | Định danh công khai của GitHub repo, Vercel project và Meta App |
| `.env.example` | Danh sách biến bắt buộc, không chứa giá trị thật |
| `pnpm connections:check` | Kiểm tra read-only Git, CLI, Vercel link và Production health |
| `pnpm connections:check -- --offline` | Kiểm tra workspace mà không gọi dịch vụ mạng |

Nguồn bí mật chuẩn là **Vercel Production Environment Variables**. Nếu cần giữ
bản dự phòng của `OWNER_SETUP_SECRET`, lưu trong password manager cá nhân, không
lưu trong file, clipboard lâu dài, ảnh chụp, issue, commit hoặc chat.

## Kiểm tra nhanh

Từ thư mục repo:

```powershell
pnpm connections:check
```

Kết quả `PASS` xác nhận:

- remote GitHub đúng repo;
- workspace đang ở nhánh dự kiến;
- phiên GitHub/Vercel CLI nếu các CLI đã được cài;
- Production đang ở Live mode;
- database, Meta runtime, security, cron và legal config đã đủ.

Public health không đọc token Meta đã mã hóa. Để kiểm tra token thật, đăng nhập
owner rồi mở **Sức khỏe dữ liệu** trong webapp.

## 1. Tái kết nối GitHub

Định danh chuẩn:

```text
Host: github.com
Repo: ThuongPhan90/meta-creative-growth-tracker
Branch: main
Remote: https://github.com/ThuongPhan90/meta-creative-growth-tracker.git
```

Nếu GitHub CLI chưa có phiên:

```powershell
gh auth login --hostname github.com --web --git-protocol https
gh auth setup-git
gh auth status --hostname github.com
```

Không tạo Personal Access Token nếu đăng nhập trình duyệt bằng `gh` đã đáp ứng.
Không đặt token vào remote URL. Nếu remote sai:

```powershell
git remote set-url origin https://github.com/ThuongPhan90/meta-creative-growth-tracker.git
```

## 2. Tái kết nối Vercel

Định danh chuẩn:

```text
Team: mrphanthuong2112-1637s-projects
Project: meta-creative-growth-tracker
Production: https://meta-creative-growth-tracker.vercel.app
```

Đăng nhập và link workspace:

```powershell
vercel login
vercel link --yes --project meta-creative-growth-tracker --scope mrphanthuong2112-1637s-projects
vercel whoami
```

Nếu cần chạy local, chỉ kéo env vào file đã được `.gitignore` bảo vệ:

```powershell
vercel env pull .env.local --yes --environment=development
```

`vercel env pull` ghi đè file đích. Không dùng Production database/token cho
Preview hoặc Development. Khi thay biến Production, luôn tạo deployment
Production mới để giá trị có hiệu lực.

Sau lần `vercel link` đầu tiên, có thể sao chép `orgId` và `projectId` từ
`.vercel/project.json` vào `ops/connection-profile.json`. Đây là định danh công
khai, không phải secret. Khi hai giá trị này còn là `null`, connection doctor chỉ
xác nhận tên project và sẽ cảnh báo rằng chưa chứng minh được đúng team.

Các biến cần tồn tại được liệt kê trong `.env.example` và
`ops/connection-profile.json`. Không có biến bí mật nào mang tiền tố
`NEXT_PUBLIC_`.

## 3. Tái kết nối Meta/Facebook

Định danh chuẩn:

```text
Meta App ID: 1340474971049571
App domain: meta-creative-growth-tracker.vercel.app
OAuth callback:
https://meta-creative-growth-tracker.vercel.app/api/auth/meta/callback
```

Quyền read-only cần xin:

- `ads_read`;
- `business_management`;
- `pages_show_list`.

Fast path:

1. Đối chiếu toàn bộ `requiredEnvironmentVariables` trong
   `ops/connection-profile.json`. Production phải có `APP_URL`,
   `LEGAL_ENTITY_NAME`, `PRIVACY_CONTACT_EMAIL`, `META_APP_ID`,
   `META_APP_SECRET`, `META_GRAPH_VERSION`, `TOKEN_ENCRYPTION_KEY`,
   `SESSION_SECRET`, `OWNER_SETUP_SECRET`, `DATABASE_URL`, `CRON_SECRET` và
   `DEMO_MODE`.
2. Xác nhận `DEMO_MODE=false`.
3. Redeploy Production nếu vừa sửa env.
4. Mở
   `https://meta-creative-growth-tracker.vercel.app/connect`.
5. Nhập **giá trị** của `OWNER_SETUP_SECRET`, không nhập tên biến.
6. Hoàn tất hộp thoại cấp quyền Meta bằng đúng tài khoản owner.
7. Mở **Sức khỏe dữ liệu**, sau đó chạy một manual sync nhỏ để xác minh.

Nếu mất `OWNER_SETUP_SECRET`, tạo một chuỗi ngẫu nhiên mới ít nhất 32 byte, rotate
biến trên Vercel, redeploy Production rồi dùng đúng giá trị mới. Không dùng
`META_APP_SECRET` thay cho owner setup secret.

Access token Meta được backend đổi sang long-lived token và lưu mã hóa trong
database. Repo hiện không tự gia hạn token vô hạn. Khi token hết hạn, user thu
hồi Business Integration, quyền asset thay đổi hoặc App Secret bị rotate, owner
phải chạy lại OAuth.

## 4. Xác nhận vận hành liên tục

Tắt máy hoặc đóng trình duyệt không dừng Vercel. Cron Production gọi:

```text
GET /api/cron/sync
Authorization: Bearer <CRON_SECRET>
```

Lịch hiện tại là `01:00 UTC` mỗi ngày, tương đương khoảng `08:00` tại Việt Nam.
Owner session trong trình duyệt không cần tồn tại để cron chạy.

Kiểm tra sau mỗi lần reconnect:

1. `pnpm connections:check`;
2. Vercel deployment là **Ready · Production · Current**;
3. Vercel **Settings → Cron Jobs** có `/api/cron/sync`;
4. webapp **Sức khỏe dữ liệu** không báo `needs_reauth`;
5. lần sync gần nhất thành công và có dữ liệu mới.

## Ma trận xử lý nhanh

| Triệu chứng | Xử lý |
|---|---|
| `git push` trả 401/403 | Chạy lại `gh auth login --web`, rồi `gh auth setup-git` |
| Workspace link sai Vercel project | Chạy lại `vercel link` với đúng project và team ở trên |
| Owner setup secret không đúng | Kiểm tra scope Production, rotate nếu cần, rồi redeploy |
| OAuth callback mismatch | Đối chiếu chính xác callback trong profile và Meta App Dashboard |
| Meta báo token hết hạn | Mở `/connect` và hoàn tất OAuth lại |
| Vừa rotate Meta App Secret | Cập nhật `META_APP_SECRET`, redeploy, rồi reconnect Meta |
| Cron không có dữ liệu mới | Xem Vercel Cron logs và **Sức khỏe dữ liệu**; cron lỗi không tự retry |
| Database không ready | Kiểm tra Neon integration và `DATABASE_URL`; không nối nhầm Preview database |

## Lịch kiểm tra đề xuất

- Hàng tuần: xem lần sync cuối và warning trong **Sức khỏe dữ liệu**.
- Hàng tháng: chạy `pnpm connections:check`.
- Sau khi đổi mật khẩu/quyền Meta, rotate secret, chuyển team hoặc đổi domain:
  chạy toàn bộ checklist reconnect.
- Khi secret xuất hiện trong log, ảnh chụp hoặc commit: rotate ngay tại nguồn,
  redeploy và reconnect nếu secret đó ảnh hưởng token/session.
