# Dùng repo cho khóa học hoặc public template

## Mục tiêu học

Sau khi hoàn thành, học viên có thể:

- giải thích OAuth và quyền Meta theo least privilege;
- discovery BM/ad account/Page với pagination;
- lưu token server-side ở dạng mã hóa;
- đồng bộ daily insights idempotent;
- tính KPI từ tử số/mẫu số;
- triển khai Next.js + Postgres Marketplace trên Vercel;
- viết privacy/data deletion phù hợp deployment.

## Quy tắc phòng lab

1. Mỗi học viên/fork có Meta App riêng.
2. Mỗi deployment có Postgres Marketplace riêng.
3. Không chia sẻ App Secret, token, database URL hoặc encryption key.
4. Bài UI dùng Demo mode.
5. Live mode chỉ dùng tài sản mà học viên được cấp quyền hợp pháp.
6. Screenshot nộp bài phải che identifier và dùng số demo khi có thể.

## Checkpoint

### 1. Local Demo

- cài dependency;
- chạy `pnpm dev`;
- thấy nhãn Demo data;
- `pnpm check` pass.

### 2. Kiến trúc dữ liệu

- mô tả raw grain;
- giải thích vì sao Reach không additive;
- viết test CPI/CPA/Hook/Hold với mẫu số zero;
- phân biệt creative wrapper `creative_id`, physical identity
  `video_id`/`image_hash` và alias nghiệp vụ `creative_code`.

### 3. Meta sandbox

- tạo Meta App riêng;
- cấu hình localhost callback;
- login bằng app role;
- token không xuất hiện ở browser/log;
- discovery có pagination.

### 4. Vercel Preview

- import GitHub repo;
- `DEMO_MODE=true`;
- CI pass;
- preview không nhận production secret.

### 5. Production Demo có URL ổn định

- chốt production URL `*.vercel.app` hoặc custom domain;
- đặt `APP_URL` đúng origin;
- public `/privacy` và `/data-deletion`;
- dùng URL ổn định này cho Meta App, không dùng URL Preview.

### 6. Production Live

- Meta App/credential riêng;
- Postgres Marketplace riêng;
- legal identity, domain, callback/privacy/deletion hoàn tất;
- redeploy `DEMO_MODE=false`, owner OAuth và migration/check thành công;
- lưu timezone/lookback/ngưỡng/action types tại **Cài đặt**;
- đối chiếu một ad/ngày với Ads Manager;
- cron và manual sync hoạt động.

## Bài tập mở rộng an toàn

- filter buyer dựa trên naming rule có version;
- creative collision detector;
- sync health dashboard;
- export CSV đã lọc PII/identifier;
- version hóa CPI rating threshold;
- test pagination/rate limit/reconnect.

Không dùng bài tập này để thêm mutation tắt/sửa ads vào personal v1 read-only.

## Tiêu chí review pull request

| Nhóm | Đạt khi |
|---|---|
| Security | Không lộ secret; auth/cron kiểm tra đúng |
| Data | Grain và KPI có test; không cộng Reach sai |
| Reliability | Pagination, retry/backoff và idempotency rõ |
| UX | Demo/Live phân biệt; empty/error state dễ hiểu |
| Docs | Env, migration, privacy và rollback được cập nhật |

## Fork public

Trước khi công khai fork:

- thay contact/license attribution nếu cần;
- xóa `.vercel`, `.env.local`, export và log;
- quét Git history bằng secret scanner;
- dùng ảnh Demo mode;
- ghi rõ không liên kết/chứng nhận bởi Meta;
- giữ hướng dẫn tự tạo Meta App và database.
