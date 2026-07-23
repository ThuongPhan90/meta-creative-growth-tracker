# Troubleshooting

## OAuth redirect URI mismatch

Triệu chứng: Meta báo URL bị chặn hoặc redirect URI không hợp lệ.

Kiểm tra:

- `APP_URL` không có slash cuối;
- callback path đúng source;
- HTTPS ở production;
- URI trong Meta khớp tuyệt đối;
- bạn đang mở đúng domain, không phải preview URL khác.

Sau khi sửa env, redeploy.

## Không mở được Meta OAuth dù owner secret đúng

Kiểm tra Setup Wizard và `/api/health`. Live OAuth yêu cầu đồng thời:

- `DEMO_MODE=false`;
- `APP_URL`, Meta credentials và security secrets hợp lệ;
- `LEGAL_ENTITY_NAME` và `PRIVACY_CONTACT_EMAIL` hợp lệ.

Hai trang `/privacy` và `/data-deletion` phải render đúng owner sau khi redeploy.
Không thêm secret vào URL để thử lại.

## App ở Development mode nhưng owner không đăng nhập được

Thêm tài khoản vào app role (admin/developer/tester) và chấp nhận lời mời. Asset
permission trong BM vẫn phải được cấp riêng; app role không tự cấp quyền ad
account/Page.

## Không thấy BM/ad account/Page

- Xác nhận owner thấy asset trong Meta Business settings.
- Kiểm tra permission token và access level.
- Kiểm tra app đã discovery hết cursor pagination.
- Không suy ra “không có asset” từ trang kết quả đầu tiên.
- Log Meta request ID/error code, không log token.

“Toàn bộ” chỉ là toàn bộ tài sản token được phép đọc.

## Permission denied

- Token có thể thiếu `ads_read`/`business_management` hoặc Page permission phù
  hợp.
- App Review/Business Verification có thể chưa đạt cho user ngoài app roles.
- Ad account có thể bị gỡ quyền sau lần sync trước.
- API version có thể thay đổi yêu cầu.

Yêu cầu lại login chỉ sau khi xác định permission thiếu; không xin quyền rộng hơn
vì phỏng đoán.

## Invalid hoặc expired token

1. Đánh dấu connection cần reconnect.
2. Không retry vô hạn.
3. Không hiển thị token trong lỗi.
4. Owner kết nối Meta lại.
5. Nếu App Secret bị rotate, cập nhật Vercel trước.

Long-lived user token không phải vĩnh viễn và repo không tự refresh. Ngoài expiry,
kiểm tra user có gỡ Business Integration, mất asset permission hoặc Meta App có
Data Use Checkup/xác nhận truy cập dữ liệu quá hạn hay không.

## Số không khớp Ads Manager

Đối chiếu theo [data-semantics.md](data-semantics.md):

- account/timezone/currency;
- date range inclusive;
- level và breakdown;
- attribution window/action report time;
- action type install/registration;
- API version;
- dữ liệu còn đang cập nhật;
- Reach không được cộng như metric additive.

So sánh một ad, một ngày trước khi so cả BM.

## Meta-attributed Install hoặc Registration bằng 0

- Kiểm tra action array gốc của Meta.
- Mở **Cài đặt** và kiểm tra Install/Registration action types đã lưu.
- Tránh chọn đồng thời action type trùng ý nghĩa gây double-count.
- Xác nhận app event và attribution trong Ads Manager.
- Sau khi đổi action type, sync lại khoảng liên quan; thao tác Save không tự viết
  lại mọi daily metric lịch sử.
- Không đối chiếu trực tiếp với backend/app-store nếu chưa thống nhất attribution,
  timezone và định nghĩa conversion.
- Phân biệt `null` (không có dữ liệu) và `0` (có dữ liệu bằng zero).

## Creative bị gộp sai

- Xem raw ad name, normalized code và normalizer version.
- Kiểm tra video/banner cùng code.
- Drill-down theo physical `video_id`/`image_hash`, `creative_id`, `ad_id`,
  account và Page.
- Không dùng normalized code/name làm khóa dedup asset; đó chỉ là alias nghiệp vụ.
- Sửa rule bằng version mới; không rewrite lịch sử âm thầm.

## Database connection failed

- Vercel project đã connect đúng Marketplace resource chưa?
- `DATABASE_URL` có tồn tại đúng environment không?
- Connection string có dùng pooled/serverless endpoint theo provider?
- Preview có vô tình trỏ production không?
- Xác nhận host/database name trong provider dashboard.

`pnpm db:check` là script `tsx` độc lập và không tự load `.env.local`. Trên
Windows, truyền `DATABASE_URL` vào environment của chính process theo đoạn
PowerShell trong [vercel-deployment.md](vercel-deployment.md), rồi xóa biến trong
`finally`. Không paste connection string vào command history hoặc issue.

## Relation/table does not exist

OAuth callback hiện chạy migration idempotent sau khi xác minh OAuth state và
trước khi lưu connection. Nếu callback chưa từng hoàn tất, thử lại flow owner sau
khi kiểm tra `DATABASE_URL`. Nếu vẫn lỗi, dùng CLI verification/fallback trên đúng
database theo [hướng dẫn Windows](vercel-deployment.md#cli-verificationfallback-an-toàn-trên-windows).

Không chạy `vercel env pull .env.local` rồi giả định `pnpm db:migrate` đã đọc file;
script không tự load file đó. Trước khi migrate, xác nhận project/team,
host/database và backup.

## Cron trả 401

- `CRON_SECRET` tồn tại ở Production;
- header đúng `Authorization: Bearer <value>`;
- không có newline/space thừa;
- deployment đã được tạo lại sau khi thêm secret.

Route phải trả 401 khi thiếu/sai secret.

## Cron không chạy

- Cron chỉ áp dụng production deployment.
- Kiểm tra `vercel.json` và Project → Cron Jobs.
- Schedule dùng UTC.
- Hobby daily cron có thể chạy trong giờ, không đúng phút tuyệt đối.
- Vercel không retry invocation thất bại.
- Route redirect 3xx không được cron follow.

Trong Demo, response `skipped` là đúng và route không gọi Meta. Muốn sync thật,
phải hoàn tất Live configuration và redeploy.

## Sync timeout hoặc chỉ hoàn tất một phần

- Manual sync và cron đều chạy đồng bộ trong Vercel Function.
- `maxDuration = 300` trong source không bảo đảm plan/runtime thực tế cho đủ 300
  giây.
- Giảm lookback tại **Cài đặt** xuống 7 ngày, tránh sync chồng và xem warning/log.
- Meta pagination/rate limit, nhiều BM/account và breakdown lớn đều tăng thời
  gian.
- Nếu vẫn vượt giới hạn, cần plan phù hợp hoặc phát triển chia job/background
  queue; repo hiện chưa có queue.

## Build fail trên Vercel

Chạy local:

```bash
corepack enable
pnpm install
pnpm check
```

Kiểm tra Node `24.x`, pnpm version, lockfile và Root Directory. Không sửa
dependency chỉ trên Vercel mà quên commit lockfile.

## Cần gửi issue

Đính kèm:

- commit SHA;
- environment `demo/live`, `local/preview/production`;
- route/status code;
- Meta error code/request ID đã che identifier;
- bước tái hiện;
- kết quả mong đợi/thực tế.

Không gửi token, secret, cookie, database URL, Business/ad account/Page ID thật
hoặc raw export.
