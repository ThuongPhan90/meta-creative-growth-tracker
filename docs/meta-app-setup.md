# Thiết lập Meta App

Tên menu và yêu cầu quyền của Meta có thể thay đổi. Dùng
[Meta for Developers](https://developers.facebook.com/docs/) và App Dashboard
của chính app làm nguồn hiện hành. Repo pin Graph version để thay đổi có kiểm
soát, không bảo đảm một version sẽ được hỗ trợ mãi.

## 1. Có production URL trước

Nên deploy Demo lên Vercel và chốt production origin trước khi cấu hình Meta:

```text
https://YOUR-PRODUCTION-DOMAIN
```

`APP_URL` phải bằng đúng origin này, không có slash cuối/path/query. Không dùng
URL Preview theo commit hoặc branch làm callback production.

## 2. Tạo app riêng cho deployment

1. Đăng nhập [Meta for Developers](https://developers.facebook.com/apps/).
2. Tạo app/use case phù hợp quản lý hoặc đọc dữ liệu quảng cáo doanh nghiệp.
3. Gắn app với Business Portfolio/BM khi Meta yêu cầu.
4. Lấy `App ID` và `App Secret` trong App Settings.
5. Lưu App Secret trong Vercel server environment/password manager.

Mỗi fork/deployment phải có App ID/App Secret riêng. Không dùng app của maintainer
cho học viên hay người dùng public.

## 3. Cấu hình callback và trang pháp lý

Callback chuẩn của repo:

```text
http://localhost:3000/api/auth/meta/callback
https://YOUR-PRODUCTION-DOMAIN/api/auth/meta/callback
```

Valid OAuth Redirect URI phải khớp tuyệt đối scheme, host, port, path và slash.
Production bắt buộc HTTPS; không dùng wildcard.

Cấu hình production:

```text
App Domains:
YOUR-PRODUCTION-DOMAIN

Privacy Policy URL:
https://YOUR-PRODUCTION-DOMAIN/privacy

Data Deletion Callback URL:
https://YOUR-PRODUCTION-DOMAIN/api/meta/data-deletion

Public deletion instructions/status:
https://YOUR-PRODUCTION-DOMAIN/data-deletion
```

Nếu Meta Dashboard cho chọn callback hoặc instructions, repo đã có callback
`POST /api/meta/data-deletion` nhận Meta `signed_request`. Trang
`/data-deletion` là hướng dẫn public và status URL trả về sau khi callback xóa
thành công. Đọc thêm tại
[privacy-data-deletion.md](privacy-data-deletion.md).

Trước khi kết nối, Vercel phải có `LEGAL_ENTITY_NAME` và
`PRIVACY_CONTACT_EMAIL`; backend sẽ từ chối mở OAuth nếu thiếu.

## 4. Quyền tối thiểu

Ứng dụng chỉ đọc nhưng quyền thực tế phụ thuộc asset, access level và endpoint.
Đánh giá tối thiểu:

- `ads_read`: campaign, ad và Insights của ad account được cấp;
- `business_management`: discovery Business Portfolio/BM và tài sản khi endpoint
  yêu cầu;
- `pages_show_list`: liệt kê Page mà user được phép thấy trong flow hiện tại;
- quyền Page khác chỉ khi endpoint cụ thể thật sự yêu cầu.

Không xin `ads_management` chỉ để đọc. Permission name, access level và yêu cầu
review có thể thay đổi theo Graph version; kiểm tra trong App Dashboard/Graph API
Explorer trước khi nộp.

“Rà soát toàn bộ BM” nghĩa là toàn bộ BM và asset token hiện được Meta cho phép
đọc. Repo không thể vượt Business permissions, asset assignment hoặc quyền của
user.

## 5. Development mode và test owner

Khi Meta App ở Development mode:

- owner phải là app admin/developer/tester hoặc role Meta cho phép;
- app role không tự cấp quyền BM/ad account/Page;
- dùng tài sản hợp pháp thuộc owner/team;
- kiểm thử pagination, permission denied, reconnect và token hết hạn.

Checklist kỹ thuật:

- OAuth `state`/nonce được kiểm tra;
- code được đổi lấy token server-side;
- token không xuất hiện ở URL, client bundle hoặc logs;
- danh sách BM/ad account/Page khớp Business settings;
- một ad/ngày khớp Ads Manager về timezone, attribution, action type và currency.

## 6. App Review, Business Verification và Data Use Checkup

Nếu chỉ một owner thuộc app role dùng nội bộ, điều kiện có thể khác app cho user
ngoài role. Trước khi cho người khác kết nối, kiểm tra trực tiếp App Dashboard:

1. Business Verification có bắt buộc hay không;
2. từng permission cần Standard hay Advanced Access;
3. App Review cần screencast, tài khoản test và reviewer instructions nào;
4. privacy/data deletion URL có đạt yêu cầu;
5. Data Use Checkup hoặc xác nhận quyền truy cập dữ liệu có đang đến hạn.

Repo không tự hoàn thành App Review, Business Verification hay Data Use Checkup.
Nếu Meta thu hồi access vì quá hạn, owner phải hoàn tất yêu cầu trong Dashboard
và reconnect nếu token/quyền cũ không còn hợp lệ.

## 7. Graph API version

`META_GRAPH_VERSION` hiện mặc định `v25.0`. Rà Meta changelog/deprecation định kỳ;
trước lần Live đầu tiên và mỗi lần nâng:

1. kiểm tra version còn hỗ trợ và migration notes trong tài liệu chính thức;
2. thử trên Meta App/database sandbox;
3. xác nhận OAuth, discovery hết cursor, Insights/action fields và breakdowns;
4. đổi env;
5. redeploy và đối chiếu lại Ads Manager.

Không đặt version không rõ ràng như `latest` và không nâng trực tiếp Production
chỉ vì số version mới hơn.

## 8. Token lifecycle

Flow đổi short-lived token sang long-lived user token và lưu token ở dạng mã hóa.
Long-lived không có nghĩa là vĩnh viễn:

- Meta có thể trả expiry; UI hiển thị thời điểm để owner theo dõi;
- app không tự refresh user token;
- token có thể hết hạn, bị user thu hồi, mất quyền asset hoặc mất hiệu lực khi
  Meta/App Secret thay đổi;
- khi gặp invalid/expired token, dừng retry vô hạn và reconnect owner;
- khi disconnect, ứng dụng thử thu hồi quyền rồi xóa connection/dữ liệu local.

Rotate App Secret tại Meta nếu bị lộ, cập nhật Vercel, redeploy và reconnect khi
cần. Không gửi token/App Secret qua issue, screenshot hoặc chat.

## 9. Nhiều Page và ad account

Một owner login có thể discovery nhiều tài sản trong phạm vi quyền. Ứng dụng:

- giữ Meta ID cùng tên;
- paginate tới hết cursor;
- lưu quan hệ business/account/Page khi Meta trả được;
- cho filter theo account/campaign/creative;
- không dùng tên làm identity kỹ thuật.

Meta có thể không trả một asset nếu owner thiếu assignment, permission/access
level không đủ hoặc endpoint không hỗ trợ quan hệ đó. “Không thấy” không đồng
nghĩa asset không tồn tại.

## 10. Trước khi public repo

- `.env.example` chỉ chứa placeholder;
- không commit token, App Secret, Business/ad account/Page ID thật;
- ảnh tài liệu chỉ dùng Demo data;
- mỗi người tự tạo Meta App và database;
- public README nói rõ dự án không được Meta bảo trợ/chứng nhận.
