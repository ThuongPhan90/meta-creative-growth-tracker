# Demo mode và Live mode

Mode được quyết định ở server. Nếu `DEMO_MODE` thiếu hoặc có giá trị khác chuỗi
`false`, ứng dụng giữ Demo mode an toàn.

## Demo mode

```dotenv
DEMO_MODE=true
```

Mục đích:

- xem UI mà không có tài khoản Meta hay database;
- dùng trong khóa học, PR Preview và public demo;
- kiểm thử filter, empty state và responsive layout;
- tránh lộ identifier/dữ liệu quảng cáo thật.

Dữ liệu Demo là fixture minh họa, không phải số của Donny, khách hàng hay kết quả
được Meta xác nhận. UI gắn nhãn Demo data. OAuth, Settings ghi dữ liệu và manual
sync bị khóa; Vercel Cron có thể vẫn gọi route nhưng route trả `skipped` và không
gọi Meta.

Demo mode không chứng minh Meta permission, App Review, database migration hay
Live sync đã hoạt động.

## Live mode

```dotenv
DEMO_MODE=false
```

Live yêu cầu đồng thời:

- `APP_URL` là production origin ổn định và khớp Meta redirect;
- `LEGAL_ENTITY_NAME` và `PRIVACY_CONTACT_EMAIL` hợp lệ;
- Meta App riêng cùng credential server-side;
- owner có quyền thật trên asset cần đọc;
- Postgres riêng với `DATABASE_URL`;
- đủ encryption/session/setup/cron secrets;
- deployment mới sau khi env thay đổi.

Nếu một thành phần thiếu, không bật `DEMO_MODE=false` chỉ để “thử”; hoàn tất Setup
Wizard trước.

## Luồng chuyển mode khuyến nghị

1. Deploy production lần đầu với `DEMO_MODE=true`.
2. Chốt URL `*.vercel.app` ổn định hoặc custom domain; đặt `APP_URL` bằng đúng
   origin đó và redeploy.
3. Kiểm tra ba URL public:

   ```text
   https://YOUR-DOMAIN/privacy
   https://YOUR-DOMAIN/data-deletion
   https://YOUR-DOMAIN/api/meta/data-deletion
   ```

   URL API thứ ba là POST callback, nên mở bằng trình duyệt không phải phép thử
   thành công.
4. Cấu hình Meta App bằng domain cuối cùng.
5. Kết nối Postgres và thêm toàn bộ Live env.
6. Chuyển `DEMO_MODE=false`, redeploy, rồi mở `/connect`.
7. Nhập `OWNER_SETUP_SECRET` và hoàn tất Meta OAuth. Callback hợp lệ sẽ chạy
   migration idempotent trước khi lưu connection.
8. Mở **Cài đặt**, chọn timezone/lookback/ngưỡng/action types.
9. Sync với lookback nhỏ, kiểm tra Sức khỏe dữ liệu và đối chiếu một ad/ngày với
   Ads Manager.
10. Chỉ tăng lookback sau khi số liệu và thời gian chạy ổn định.

## Ma trận khuyến nghị

| Môi trường | Mode | Meta App | Database |
|---|---|---|---|
| Local học UI | Demo | Không | Không |
| PR Preview public | Demo | Không | Không |
| Preview tích hợp | Live | Meta App test riêng | Preview DB riêng |
| Production | Live | Meta App production riêng | Production DB riêng |

Preview deployment có URL thay đổi theo branch/commit. Không dùng URL Preview làm
callback production. Nếu cần test Live ở Preview, phải tách cả Meta App, token,
database và secrets khỏi Production.

## Không trộn mode

- Không fallback âm thầm từ Live sang Demo khi API lỗi.
- Không hiển thị fixture cạnh số thật mà thiếu nhãn.
- Không copy production token/database vào deployment của học viên.
- Không dùng chung database hoặc Meta App giữa các fork độc lập.
- Không coi đổi env là đủ; Vercel cần redeploy để deployment mới nhận giá trị.
