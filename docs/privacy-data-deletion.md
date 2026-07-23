# Privacy policy và xóa dữ liệu

Đây là tài liệu kỹ thuật, không phải tư vấn pháp lý. Mỗi owner phải kiểm tra luật,
retention/backup và điều khoản của nhà cung cấp áp dụng cho deployment của mình.

## URL có sẵn trong repo

Với `APP_URL=https://YOUR-DOMAIN`:

```text
Privacy Policy:
https://YOUR-DOMAIN/privacy

Public deletion instructions và confirmation status:
https://YOUR-DOMAIN/data-deletion

Meta Data Deletion Callback:
https://YOUR-DOMAIN/api/meta/data-deletion
```

`/privacy` và `/data-deletion` là trang GET public. Callback là endpoint POST cho
Meta `signed_request`; mở URL callback trực tiếp bằng browser không mô phỏng một
yêu cầu Meta hợp lệ.

## Danh tính pháp lý bắt buộc

Khai báo trên Vercel Production:

```dotenv
LEGAL_ENTITY_NAME=Tên cá nhân hoặc đơn vị vận hành
PRIVACY_CONTACT_EMAIL=privacy@example.com
```

Hai giá trị được render server-side trên trang pháp lý. Backend chặn Meta OAuth
nếu thiếu tên hợp lệ hoặc email hợp lệ. Sau khi thay env, redeploy và kiểm tra
HTML thực tế trước khi đưa URL vào Meta App.

Gate kỹ thuật không xác nhận nội dung phù hợp pháp luật. Owner vẫn phải xem xét:

- tên pháp lý/địa chỉ và kênh liên hệ cần công bố;
- retention trong database và backup của provider;
- khu vực lưu trữ/chuyển dữ liệu;
- điều khoản Vercel, Postgres provider và Meta;
- quy trình trả lời yêu cầu của chủ thể dữ liệu;
- yêu cầu App Review, Business Verification và Data Use Checkup.

## Dữ liệu repo xử lý

- Meta user ID và tên hiển thị của owner;
- Business Portfolio/BM, Page, app và ad account được token cho phép đọc;
- campaign, ad set, ad, creative và physical asset identifiers;
- daily/aggregated Ads Insights và Meta-attributed actions;
- access token ở dạng mã hóa;
- sync status, warning và lỗi kỹ thuật đã lọc secret.

Ứng dụng không cần mật khẩu Facebook, không tạo/sửa/pause ads và không gửi dữ
liệu về một server trung tâm của tác giả repo. Nó không lưu file video gốc theo
flow hiện tại.

## Hành vi disconnect trong ứng dụng

Owner có session hợp lệ có thể dùng nút Ngắt kết nối. Backend:

1. kiểm tra same-origin và owner session;
2. giải mã token ở server;
3. thử thu hồi quyền ứng dụng ở Meta;
4. dù thu hồi remote thất bại, vẫn xóa toàn bộ owner connection và dữ liệu liên
   quan trong schema ứng dụng;
5. xóa owner session cookie;
6. thông báo owner gỡ app trong Meta Business Integrations nếu remote revoke
   không thành công.

Xóa database resource từ provider là thao tác hạ tầng riêng và không thay cho
thu hồi quyền ở Meta. Ngược lại, gỡ Business Integration không tự xóa database
nếu backend không nhận callback/owner không disconnect.

## Hành vi Meta Data Deletion Callback

Endpoint `/api/meta/data-deletion`:

1. xác minh chữ ký `signed_request` bằng Meta App Secret;
2. yêu cầu database khỏe;
3. chỉ xóa khi `user_id` khớp owner connection hiện tại;
4. từ chối request sai chữ ký hoặc được phát hành trước connection hiện tại;
5. chỉ trả confirmation code/status URL sau khi thao tác xóa database hoàn tất.

Status URL trỏ về `/data-deletion?confirmation=<code>` và trang chỉ render mã có
định dạng hợp lệ. Không ghi access token hoặc Meta user ID vào confirmation URL.

Một request hợp lệ cho user không còn connection vẫn nhận confirmation mà không
tiết lộ trạng thái tồn tại của user; đây là hành vi tránh lộ dữ liệu.

## Backup và thời hạn xóa

Repo xóa dữ liệu trong schema ứng dụng đang hoạt động, nhưng không điều khiển
chính sách backup/snapshot của Postgres provider hay Vercel. Owner phải:

- cấu hình retention/backup phù hợp;
- biết thời điểm bản backup hết hạn;
- ngăn dữ liệu đã xóa được restore ngược lại production ngoài quy trình kiểm
  soát;
- mô tả đúng các giới hạn này trong chính sách công bố nếu luật/use case yêu cầu.

Không hứa một thời hạn xóa cố định nếu hạ tầng thực tế chưa đáp ứng.

## Checklist trước Meta Live/App Review

- [ ] `LEGAL_ENTITY_NAME` và `PRIVACY_CONTACT_EMAIL` là thông tin thật.
- [ ] `/privacy` public, không cần login và hiển thị đúng owner.
- [ ] `/data-deletion` public, hướng dẫn khớp hành vi thật.
- [ ] Meta App dùng callback `/api/meta/data-deletion`, không dùng trang
      instructions làm endpoint POST.
- [ ] Test disconnect xóa local data và cookie.
- [ ] Test signed request hợp lệ/sai chữ ký trên sandbox; không dùng token thật
      trong fixture/log.
- [ ] Retention và backup provider đã được xem xét.
- [ ] Tên app/đơn vị vận hành nhất quán với Meta Dashboard.
- [ ] Contact hoạt động và có owner chịu trách nhiệm phản hồi.
- [ ] Không còn placeholder trong nội dung pháp lý hoặc Meta App fields.
