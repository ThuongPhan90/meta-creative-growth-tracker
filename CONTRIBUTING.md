# Đóng góp

Cảm ơn bạn muốn cải thiện Meta Creative Growth Tracker.

## Quy trình

1. Fork repo và tạo nhánh từ `main`.
2. Cài đúng Node/pnpm được khai báo trong `package.json`.
3. Không dùng dữ liệu hoặc credential Meta thật trong fixture/screenshot.
4. Viết test cho logic mới.
5. Chạy `pnpm check`.
6. Mở pull request theo template.

Tên nhánh gợi ý:

- `feat/creative-filter`
- `fix/meta-pagination`
- `docs/vercel-guide`

## Quy ước thay đổi dữ liệu

Thay đổi KPI hoặc chuẩn hóa creative phải mô tả rõ:

- grain đầu vào và grain đầu ra;
- action type Meta được dùng;
- cách xử lý `null`, zero và dữ liệu chưa đủ;
- attribution window/timezone;
- ảnh hưởng tới dữ liệu lịch sử;
- migration và rollback.

Không coi tổng Reach giữa nhiều ngày là unique reach nếu API không trả đúng
breakdown đó. Không cộng/trung bình tỷ lệ đã làm tròn; hãy cộng tử số và mẫu số
trước rồi mới chia.

## Commit và pull request

Commit nên nhỏ, mô tả bằng động từ, ví dụ:

```text
feat: add owner sync status
fix: aggregate ctr from clicks and impressions
docs: clarify Meta App Review
```

PR phải không chứa secret, token, export CSV thật, ảnh có PII hoặc identifier
nhạy cảm. Nếu thay đổi UI, thêm ảnh Demo mode.

## Phạm vi read-only

Không thêm endpoint tạo/sửa/xóa campaign, ad set, ad hoặc Page vào repo này nếu
chưa có quyết định kiến trúc và threat model riêng. Mục tiêu hiện tại là quan
sát, đồng bộ và phân tích.
