# Changelog

Định dạng dựa trên [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) và
dự án theo Semantic Versioning khi phát hành public.

## [Unreleased]

## [1.1.0] - 2026-08-03

### Added

- Bổ sung root global error boundary để lỗi render ngoài app shell vẫn có màn
  phục hồi hợp lệ.

### Changed

- Đặt giao diện V3 làm mặc định cho local, bản clone và production; chỉ dùng
  `UI_VERSION=v2` khi cần rollback tạm thời.
- Đồng bộ tài liệu biến môi trường và connection profile với Vercel project
  hiện hữu.
- Tách snapshot ngữ cảnh khỏi dữ liệu Creative nặng, đồng thời tái sử dụng cùng
  snapshot nền giữa app shell và page để tránh truy vấn trùng hoặc lệch dữ liệu.
- Gộp truy vấn Creative Performance từ tối đa 26 lượt xuống một lượt có giới
  hạn 5.001 dòng; dữ liệu hiển thị vẫn giữ ngưỡng an toàn 5.000 dòng.
- Xếp hạng Watchlist trên server và chỉ gửi tối đa 20 Creative cần hiển thị sang
  client; bảng Creative chi tiết phân trang 100 dòng sau khi lọc và sắp xếp.
- Nâng Next.js và Lucide trong cùng dòng tương thích; khóa các dependency build
  đã kiểm chứng để lockfile đáp ứng chính sách an toàn chuỗi cung ứng.

### Removed

- Xóa các view thế hệ cũ, test và CSS rating không còn được route/build hiện tại
  tham chiếu.
- Xóa sáu ảnh concept/QA V2 không còn tài liệu hoặc build tham chiếu; lịch sử Git
  vẫn giữ khả năng khôi phục.

## [1.0.2] - 2026-07-24

### Changed

- Thu gọn trạng thái tài khoản quảng cáo không hoạt động: tiếp tục ẩn mặc định,
  chỉ hiện lại khi người dùng chủ động chọn.
- Tách hệ màu vận hành quảng cáo khỏi hệ màu đánh giá hiệu quả; campaign đang
  chạy dùng xanh dương, tạm dừng dùng xám, còn rating dùng xanh lá/vàng/đỏ theo
  chất lượng.
- Creative Library ưu tiên creative có ít nhất một Ads đang hoạt động, đồng thời
  hiển thị riêng trạng thái đang chạy, không chạy, liên kết cũ hoặc chưa gắn Ads.
- Creative Library chỉ render 100 kết quả mỗi đợt và trì hoãn truy vấn tìm kiếm
  nặng, giúp thư viện lớn vẫn phản hồi nhanh mà không làm mất khả năng xem thêm.
- Tài khoản quảng cáo không hoạt động vẫn được thu gọn mặc định, nhưng các trạng
  thái cần xử lý được đếm riêng và trạng thái Meta gần nhất không còn bị ghi đè.

### Fixed

- Sửa Checklist mobile bị ép chữ và tràn badge do chi tiết dài được lặp lại trong
  trạng thái.
- Dùng `effective_status` thay vì cờ discovery `is_active` để trình bày và lọc
  trạng thái campaign.
- Giới hạn performance/rating Creative Library vào tài khoản quảng cáo vận hành,
  đồng nhất với phạm vi baseline Dashboard.
- Áp đúng màu cho `KÉM`, `KHÔNG INSTALL` và `ÍT DỮ LIỆU` trong Creative Tracker.
- Đồng bộ panel chi tiết với kết quả lọc hiện tại, không còn hiển thị một
  creative đã bị bộ lọc loại khỏi bảng.
- Khi URL đang chọn một tài khoản quảng cáo cũ, Campaigns và Tracker tự mở đúng
  phạm vi lịch sử thay vì trả về bảng rỗng giả.

## [1.0.1] - 2026-07-24

### Changed

- Hoàn tất Setup Wizard khi lần đồng bộ mới nhất ở trạng thái `partial` nhưng đã
  lưu được dữ liệu sử dụng được.
- Mặc định Dashboard, Campaigns và Creative Tracker chỉ tổng hợp tài khoản quảng
  cáo còn được discovery và có `account_status=1`; người dùng có thể chủ động
  hiện lại tài khoản không hoạt động ở các màn hình tra cứu.
- Đổi checklist “Meta SDK” thành “App events trong Insights” để không suy diễn
  nguồn SDK/MMP từ dữ liệu conversion đã được Meta attribution.
- Gom cảnh báo sync trùng nhau theo loại/tài nguyên và Việt hóa trạng thái run.
- Tối ưu Assets, bộ lọc và lịch sử sync cho desktop, tablet, mobile và trình đọc
  màn hình.
- Làm rõ luồng tạo bản sao public bằng GitHub Template/Fork hoặc repository riêng;
  không hướng dẫn người dùng push vào repository gốc.

### Fixed

- Cho phép Meta OAuth chuyển hướng qua Content Security Policy đã giới hạn đúng
  đích.
- Serialize tham số JSONB đúng một lần trước khi ghi dữ liệu đồng bộ.
- Giữ Meta sync trong giới hạn thời gian serverless và xử lý run cũ bị treo.
- Lấy advisory lock trước khi tạo sync run, không còn hủy nhầm run đang chạy khi
  hai request đến đồng thời; retry cùng idempotency key cũng phục hồi row
  `running` bị bỏ lại.
- Thay thế liên kết creative theo transaction để các lần sync lặp lại không tạo
  trạng thái thiếu hoặc trùng liên kết.
- Giữ liên kết ad–creative đã biết khi Meta tạm thời không trả được creative.
- Chặn một Meta `action_type` bị gán đồng thời cho Install và Registration; trim,
  bỏ trùng và kiểm tra định dạng trước khi lưu.
- Ghi lineage có hash cho từng action mapping và lưu `attribution_setting` từ
  Insights để lần sync có thể đối soát.
- Dùng `actions.video_view` làm nguồn Hook 3 giây, chỉ fallback field legacy và
  không dùng `video_play_actions` thay thế.
- Trả đúng HTTP 202 cho sync đang xử lý và non-2xx cho run thất bại/đã hủy.

### Security

- Tăng kiểm tra cấu hình Live, vòng đời kết nối Meta và khả năng giữ dữ liệu cũ
  an toàn khi một tài nguyên Meta tạm thời không truy cập được.
- Loại nhận diện owner khỏi fixture Demo và liên kết báo cáo bảo mật cố định khỏi
  template copy.

## [1.0.0] - 2026-07-24

### Added

- Khung Next.js cho owner-only Meta creative tracker.
- Demo assets cho Creative Library.
- Kết nối Meta OAuth chỉ đọc, discovery toàn bộ asset user được cấp quyền và
  đồng bộ Insights.
- Campaigns & Ads, Creative Tracker, Creative Library, data health và Settings.
- Cấu hình Vercel Cron đồng bộ hàng ngày.
- Tài liệu kiến trúc, KPI, Meta App, Vercel, privacy và troubleshooting.
- GitHub CI, issue forms, pull request template và Dependabot.

### Security

- Tách credential và database cho từng deployment.
- Mã hóa token, ký session/OAuth state, `appsecret_proof` và header bảo mật.
- Meta Data Deletion Callback có xác minh chữ ký, chống replay và confirmation
  không chứa định danh.
- Quy trình thu hồi quyền, xóa dữ liệu, rotate secret và audit dependency.
