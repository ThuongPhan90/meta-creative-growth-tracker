# Fidelity ledger

Ledger này ghi lại vòng đối chiếu cuối giữa concept đã chốt và giao diện chạy thật. Ảnh QA tạm thời được lưu ngoài repo để không đưa file rác vào source.

## Phạm vi kiểm tra

- Concept dashboard: [`design/concepts/overview-cold-start.png`](../design/concepts/overview-cold-start.png)
- Concept Creative Library: [`design/concepts/creative-library.png`](../design/concepts/creative-library.png)
- Render: `/dashboard` và `/creatives` trong Demo mode
- Desktop: `1600 × 1024`, đúng kích thước gốc của hai concept
- Mobile: `390 × 844`
- Công cụ: Browser/IAB, DOM snapshot, console log và screenshot viewport

## Đối chiếu

| Điểm kiểm tra | Bằng chứng concept | Bằng chứng render | Kết quả |
|---|---|---|---|
| Màu và app shell | Sidebar navy, nền xám rất nhạt, accent tím | Giữ đúng ba lớp màu, độ tương phản và chiều rộng sidebar | Đạt |
| Hệ chữ và copy chính | H1 “Tổng quan tăng trưởng”, subtitle và trạng thái chỉ đọc | H1/subtitle giữ nguyên; chữ điều hướng, bảng và control có scale riêng | Đạt |
| Onboarding cold-start | CTA kết nối, bốn bước theo thứ tự tài khoản → tài sản → event → delivery | Đúng thứ tự, CTA hoạt động và liên kết tới Connect/Setup | Đạt |
| Phạm vi tài sản và event health | Bốn KPI zero-state, bảng Android/iOS, checklist bên phải | Đúng cấu trúc, trạng thái zero không giả lập performance | Đạt |
| Creative workspace | Toolbar lọc, bảng creative, row được chọn và detail pane | Đủ bốn filter/search, sáu cột, selected state và detail tương tác | Đạt |
| Asset treatment | Thumbnail video/banner minh họa, trạng thái event/readiness | Dùng asset demo cục bộ có thật; không dùng placeholder rỗng | Đạt |
| Responsive | Concept desktop giữ density kiểu dashboard | Mobile chuyển sidebar thành menu, filter xếp dọc, bảng cuộn trong container | Đạt |
| Interaction | Row selected mở detail; control có trạng thái | Search lọc từ `4/4` xuống `1/4`, click row đổi detail, menu mobile điều hướng được | Đạt |

## Above-the-fold copy diff

Không có copy marketing, metric hoặc lời hứa hiệu quả nào được thêm ngoài phạm vi sản phẩm. H1, subtitle, CTA và bốn bước onboarding giữ nguyên ý nghĩa concept.

Các bổ sung có chủ đích:

- `Campaigns & Ads` và `Creative Tracker` trong sidebar vì đây là hai bề mặt chức năng bắt buộc của bản hoàn chỉnh.
- Thanh `Personal command center`, nhãn `Demo data` và trạng thái owner giúp phân biệt rõ Demo/Live và mô hình cá nhân chỉ đọc.
- Demo thumbnail khác hình minh họa concept nhưng cùng tỷ lệ, vai trò và treatment; đây là asset chạy thật trong repo.

## Kết luận

Hai màn hình chính đạt fidelity ở native viewport, không có framework overlay hoặc console warning/error. Không còn mismatch thị giác mang tính chặn phát hành; các khác biệt còn lại đều phục vụ chức năng hoặc làm rõ trạng thái dữ liệu.
