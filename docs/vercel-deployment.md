# Triển khai lên Vercel

Hướng dẫn này dùng GitHub Integration, Vercel và Postgres từ Vercel Marketplace.
Kết quả đầu tiên nên là một bản Demo có URL production ổn định; sau đó mới dùng
URL đó để cấu hình Meta và chuyển sang Live.

> Deploy repo chỉ tạo web app. Meta App, Postgres và secrets luôn thuộc riêng
> owner của từng deployment, không thể đóng gói sẵn trong repo public.

## Điều kiện trước

- GitHub account chứa repo của bạn;
- Vercel account có quyền import repo;
- quyền tạo/quản lý Meta App và quyền trên asset quảng cáo cần đọc;
- một Postgres resource riêng cho deployment;
- Node.js `24.x` và pnpm `10.34.5` nếu chạy kiểm tra/migration local.

Không dùng chung Meta App, token, encryption key hoặc database giữa các học viên,
khách hàng hay deployment độc lập.

Repo dùng lockfile v9 tương thích pnpm 10. Vercel sẽ tự nhận diện pnpm 10 khi
import project mới; không bật Install Command override và không cần
`ENABLE_EXPERIMENTAL_COREPACK`.

## 1. Tạo repository thuộc tài khoản của bạn

Cách khuyến nghị là mở repository gốc trên GitHub rồi chọn **Use this template**
hoặc **Fork**. Xác nhận repository mới nằm trong đúng tài khoản/organization mà
Vercel của bạn được phép truy cập.

Nếu tải source về máy hoặc nhận một thư mục không còn Git history, hãy tạo một
repository trống trong tài khoản GitHub của bạn rồi chạy:

```bash
git init
git add .
git commit -m "chore: initialize meta creative tracker"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

Thay `YOUR_GITHUB_USERNAME` và `YOUR_REPOSITORY` bằng repository bạn sở hữu.
Không đặt `origin` về repository gốc trừ khi bạn là maintainer và thực sự muốn
đóng góp vào repository đó. Nếu đã clone repository gốc để tạo một bản độc lập,
đổi remote trước khi push:

```bash
git remote set-url origin https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPOSITORY.git
git remote -v
```

Trước khi push:

```bash
git status
git grep -n -E "META_APP_SECRET|DATABASE_URL|access_token"
```

Kết quả grep chỉ nên là tên biến, code và tài liệu; không được có credential thật.
Không commit `.env`, `.env.local`, `.vercel`, export Meta hoặc database dump.

## 2. Deploy Demo và chốt URL

1. Vercel Dashboard → Add New → Project.
2. Import GitHub repo.
3. Framework Preset: Next.js; Root Directory: repository root.
4. Không override build/install command.
5. Thêm cho Production:

   ```dotenv
   APP_URL=https://YOUR-PROJECT.vercel.app
   DEMO_MODE=true
   ```

6. Deploy và kiểm tra nhãn Demo data.

Vercel chỉ cấp URL chính xác sau khi project được tạo. Nếu URL thực tế khác giá
trị dự kiến, sửa `APP_URL` thành đúng origin rồi redeploy. Bạn có thể dùng
production URL `*.vercel.app` lâu dài; custom domain là tùy chọn. Sau khi đã đưa
URL vào Meta App, tránh đổi project/domain nếu không đồng thời cập nhật env và
Meta callback.

Không dùng URL Preview theo commit/branch làm production callback.

## 3. Hoàn tất danh tính và URL pháp lý

Thêm vào Production:

```dotenv
LEGAL_ENTITY_NAME=Tên cá nhân hoặc đơn vị vận hành
PRIVACY_CONTACT_EMAIL=privacy@example.com
```

Redeploy rồi mở và đọc toàn bộ:

```text
https://YOUR-PRODUCTION-DOMAIN/privacy
https://YOUR-PRODUCTION-DOMAIN/data-deletion
```

Tên và email phải là thông tin thật của owner deployment. Hai biến này là gate
trước Meta OAuth, nhưng owner vẫn chịu trách nhiệm bảo đảm nội dung, retention,
nhà cung cấp hạ tầng và quy trình backup phù hợp pháp luật/use case của mình.

Các URL dùng trong Meta App:

```text
OAuth callback:
https://YOUR-PRODUCTION-DOMAIN/api/auth/meta/callback

Privacy Policy URL:
https://YOUR-PRODUCTION-DOMAIN/privacy

Data Deletion Callback URL:
https://YOUR-PRODUCTION-DOMAIN/api/meta/data-deletion

Public deletion instructions/status:
https://YOUR-PRODUCTION-DOMAIN/data-deletion
```

Data Deletion Callback là endpoint `POST` nhận `signed_request`; việc mở nó bằng
trình duyệt không phải bài test callback hợp lệ.

## 4. Tạo và cấu hình Meta App

Làm theo [meta-app-setup.md](meta-app-setup.md) bằng production domain vừa chốt.
Tối thiểu cần:

- App ID/App Secret của deployment;
- Valid OAuth Redirect URI khớp tuyệt đối;
- permission/access level phù hợp tài sản cần đọc;
- privacy và data deletion URL public;
- app role cho owner nếu App còn ở Development mode.

Trước Live, kiểm tra Graph version đang được Meta hỗ trợ. Repo hiện pin
`META_GRAPH_VERSION=v25.0`; không tự đổi sang một version khác nếu chưa test
OAuth, discovery, Insights, pagination và action mapping.

## 5. Tạo Postgres qua Marketplace

1. Trong Vercel Project, mở Storage/Marketplace.
2. Chọn Postgres provider hỗ trợ serverless; Neon là một lựa chọn.
3. Tạo resource mới và chỉ connect vào project này.
4. Chọn region phù hợp nếu provider cho phép.
5. Xác nhận integration đã inject connection variables vào Production.

Source cần đúng tên `DATABASE_URL`. Nếu provider tạo tên khác, tạo thêm
`DATABASE_URL` trỏ tới pooled/serverless connection string theo hướng dẫn của
provider. Không dùng URL database của deployment khác.

Preview Live phải dùng database branch/sandbox riêng. Preview Demo không cần
database.

## 6. Thêm Live environment variables

Xem mô tả và quy tắc tạo secret tại
[environment-variables.md](environment-variables.md). Production tối thiểu:

```dotenv
APP_URL=https://YOUR-PRODUCTION-DOMAIN
LEGAL_ENTITY_NAME=...
PRIVACY_CONTACT_EMAIL=...
META_APP_ID=...
META_APP_SECRET=...
META_GRAPH_VERSION=v25.0
TOKEN_ENCRYPTION_KEY=...
SESSION_SECRET=...
OWNER_SETUP_SECRET=...
DATABASE_URL=...
CRON_SECRET=...
DEMO_MODE=false
```

Đánh dấu App Secret, encryption/session/setup/cron secret và database URL là
Sensitive khi quy trình quản lý secret của bạn cho phép. Vercel có thể không cho
đọc lại giá trị Sensitive; lưu bản gốc trong password manager.

Không khai báo timezone/lookback/action types bằng env. Sau khi kết nối, cấu hình
đó được lưu từ trang **Cài đặt** vào database.

Chọn scope Production. Với Preview, giữ `DEMO_MODE=true` hoặc dùng trọn bộ Meta
App/database/secrets sandbox riêng. Sau mọi thay đổi env, redeploy; deployment cũ
không tự nhận giá trị mới.

## 7. Chuyển Live và khởi tạo database

Sau khi `DEMO_MODE=false` đã được redeploy:

1. mở `/connect`;
2. nhập `OWNER_SETUP_SECRET`;
3. hoàn tất Meta OAuth bằng đúng owner;
4. callback xác thực OAuth state, đổi token server-side, chạy migration
   idempotent/checksum trước khi lưu Meta connection;
5. mở Sức khỏe dữ liệu để xác nhận database ready.

Migration đã áp dụng không bị chạy lại; checksum thay đổi sẽ làm check thất bại
thay vì âm thầm sửa lịch sử migration.

### CLI verification/fallback an toàn trên Windows

Các script `pnpm db:migrate` và `pnpm db:check` là tiến trình `tsx` độc lập.
Chúng **không tự đọc `.env.local`** như Next.js. Vì vậy không dùng chuỗi lệnh
`vercel env pull .env.local` rồi giả định script đã nhận `DATABASE_URL`.

Nếu cần chạy fallback từ Windows, lấy production connection string từ đúng
provider/project rồi đưa nó vào environment của tiến trình hiện tại mà không ghi
ra file hay command history:

```powershell
pnpm install

$databaseUrlSecret = Read-Host "Dán DATABASE_URL của đúng production DB" -AsSecureString
$databaseCredential = [System.Net.NetworkCredential]::new("", $databaseUrlSecret)
$env:DATABASE_URL = $databaseCredential.Password

try {
  pnpm db:migrate
  if ($LASTEXITCODE -ne 0) { throw "Migration failed" }

  pnpm db:check
  if ($LASTEXITCODE -ne 0) { throw "Database check failed" }
}
finally {
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  $databaseCredential = $null
  $databaseUrlSecret = $null
}
```

Trước khi nhấn Enter, xác nhận provider project, database name và host là
production đích. Không paste URL trực tiếp vào command, issue hoặc chat. Nếu
biến trên Vercel được đánh dấu Sensitive, `vercel env pull` có thể không trả lại
giá trị; dùng password manager/provider dashboard theo chính sách của bạn.

Không chạy production migration từ PR không tin cậy và không gắn migration vào
mọi Preview build. Khi cần tự động hóa, dùng GitHub Environment riêng có approval.

## 8. Cấu hình Settings rồi sync

Sau khi owner session hoạt động, mở **Cài đặt** và lưu:

- reporting timezone;
- lookback ban đầu (khuyến nghị 7 ngày để nghiệm thu);
- ngưỡng đủ dữ liệu;
- action type Install và Registration đúng với app/Ads Manager.

Đây là nguồn cấu hình Live cho manual sync, cron và KPI. Sau khi đổi action type,
sync lại khoảng liên quan; số đã lưu trước đó không nên được xem là tự động
reclassified cho tới khi dữ liệu được fetch/upsert lại.

Chạy initial/manual sync, rồi đối chiếu một ad trong một ngày với Ads Manager về
timezone, attribution window, action type và currency. Chỉ tăng lookback sau khi
đối chiếu đạt và thời gian chạy ổn định.

## 9. Git deployment

Vercel Git Integration tạo:

- Preview deployment cho branch/PR;
- Production deployment khi push/merge vào `main`.

Không cần GitHub Action deploy riêng trong flow chuẩn; workflow CI của repo chỉ
kiểm tra chất lượng. Có thể deploy thủ công bằng CLI khi thật sự cần:

```bash
pnpm dlx vercel@56.5.0
pnpm dlx vercel@56.5.0 --prod
```

Kiểm tra đúng team/project trước khi chạy CLI.

## 10. Cron và giới hạn đồng bộ

Repo khai báo:

```json
{
  "path": "/api/cron/sync",
  "schedule": "0 1 * * *"
}
```

Cron dùng UTC: `01:00 UTC` là `08:00` tại Việt Nam (UTC+7). Nó chỉ được kích hoạt
trên Production. Vercel gửi:

```text
Authorization: Bearer <CRON_SECRET>
```

Trong Demo, route trả thành công với trạng thái `skipped` và không gọi Meta. Trong
Live, thiếu/sai secret phải trả `401`; chưa có connection thì route bỏ qua an
toàn. Vercel Cron không tự retry invocation thất bại. Ở Hobby, daily cron có thể
chạy tại một thời điểm trong giờ đã chọn, không bảo đảm đúng phút tuyệt đối.

Manual sync và cron hiện chạy đồng bộ trong Vercel Function. Source yêu cầu
`maxDuration = 300`, nhưng đây chỉ là mức tối đa ứng dụng yêu cầu; thời lượng
thực tế còn phụ thuộc plan, runtime và giới hạn Vercel hiện hành. Nhiều BM/ad
account, pagination lớn, Meta rate limit hoặc lookback dài có thể vượt thời gian
và để run ở trạng thái partial/failed.

Để vận hành personal v1:

1. bắt đầu lookback 7 ngày;
2. xem Vercel Functions logs và Sức khỏe dữ liệu;
3. tránh bấm manual sync chồng lên cron;
4. kiểm tra “last sync” và warning sau mỗi lần chạy;
5. tăng lookback dần.

Nếu vẫn timeout ở quy mô thật, cần nâng plan/giới hạn phù hợp hoặc phát triển cơ
chế chia job/background queue. Repo hiện tại không cung cấp queue; Vercel deploy
không tự giải quyết giới hạn này.

## 11. Checklist nghiệm thu Production

- [ ] Production URL ổn định; `APP_URL` khớp đúng origin.
- [ ] `/privacy` hiển thị đúng tên/email owner.
- [ ] `/data-deletion` public và callback URL đã khai báo đúng.
- [ ] Production dùng Meta App và Postgres riêng.
- [ ] Preview không có production credentials/database.
- [ ] OAuth redirect URI khớp tuyệt đối.
- [ ] Graph version đã được kiểm tra trong Meta App Dashboard.
- [ ] Migration auto-run thành công hoặc CLI `db:check` không còn pending/drift.
- [ ] Owner kết nối Meta và thấy đúng phạm vi BM/Page/ad account.
- [ ] Settings đã lưu; một ad/ngày đã đối chiếu Ads Manager.
- [ ] Token expiry/reconnect hiển thị và được owner hiểu.
- [ ] Cron xuất hiện, trả 2xx với đúng secret và 401 khi sai/thiếu ở Live.
- [ ] `pnpm check` pass.
- [ ] Không có token/secret trong browser, logs hoặc Git history.

## 12. Rollback

Nếu code mới lỗi nhưng schema vẫn tương thích:

1. Vercel Deployments → chọn deployment tốt gần nhất;
2. Promote/Rollback deployment đó;
3. kiểm tra env scope, callback domain và cron route.

Nếu migration đã thay đổi schema không tương thích, rollback code không đủ. Dùng
migration forward-fix hoặc restore/branch theo runbook của provider. Backup trước
migration rủi ro và không chỉnh nội dung migration đã áp dụng.

## Tài liệu chính thức

- [Vercel Deployments](https://vercel.com/docs/deployments)
- [Vercel Git Integration](https://vercel.com/docs/git)
- [Vercel Environment Variables](https://vercel.com/docs/environment-variables)
- [Vercel Marketplace Storage](https://vercel.com/docs/storage)
- [Neon trên Vercel Marketplace](https://vercel.com/marketplace/neon)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
- [Bảo vệ Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
