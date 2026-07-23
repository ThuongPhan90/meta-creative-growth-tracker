# Ngữ nghĩa dữ liệu và KPI

Tài liệu này chuyển logic của tab `TRACKER_CREATIVE_ DAY CUSTOME` thành quy ước
cho web app. Khi triển khai API, phải giữ cả số gốc và metadata truy vấn để có thể
đối chiếu Ads Manager.

## Grain

### Raw insight

Grain tối thiểu nên là:

```text
date × ad_account_id × ad_id × breakdowns được yêu cầu × attribution setting
```

Không dùng tên campaign/ad làm primary key. Tên có thể trùng, đổi hoặc chứa mã
creative không chuẩn.

### Creative report

Logic sheet gộp theo:

```text
operating_system × normalized_creative_code
```

Trong app, report phải giữ danh sách `ad_id`, `creative_id`, ad name, account và
Page đã đóng góp vào dòng gộp, đồng thời giữ `video_id`/`image_hash` để drill-down
và audit asset vật lý.

## Identity vật lý và alias nghiệp vụ

Không dùng normalized code hoặc tên làm identity cho creative vật lý:

```text
video asset identity = video_id
image asset identity = image_hash
creative wrapper      = creative_id
business grouping     = normalized_creative_code / normalized name
```

Ứng dụng dùng `asset_key` ổn định dạng `video:<video_id>` hoặc
`image:<image_hash>`. Một asset vật lý có thể xuất hiện qua nhiều creative
wrapper/ad/account/Page. Ngược lại, một mã nghiệp vụ có thể va chạm giữa video,
banner hoặc nhiều file khác nhau. Vì vậy grouping theo mã phải là lớp báo cáo,
không phải dedup key cho asset.

## Khoảng ngày

- `start_date` và `end_date` đều inclusive.
- Timezone báo cáo lấy từ **Cài đặt** (`tracker.app_settings`), nhưng phải lưu
  timezone/account timezone thực tế trả về từ Meta.
- Không trộn ngày UTC với ngày tài khoản khi so sánh Ads Manager.

## Xác định hệ điều hành

Logic kế thừa ưu tiên:

1. campaign name chứa `IOS` → `iOS`;
2. campaign name khớp `AND`/`ANDROID` → `AND`;
3. ad set name chứa `IOS` → `iOS`;
4. ad set name chứa `AND`/`ANDROID` → `AND`;
5. device chứa `iphone` hoặc `ipad` → `iOS`;
6. còn lại mặc định `AND`.

Đây là heuristic nghiệp vụ, không phải breakdown OS chính thức. App nên hiển thị
nguồn phân loại và cho phép lọc record `unknown` thay vì âm thầm mặc định Android
khi dữ liệu production không đủ.

## Chuẩn hóa mã creative

Logic sheet:

- bỏ hậu tố `- Copy`, `- Copy N`;
- đổi `_` thành `-` để regex ổn định;
- nhận các mẫu `V<n>-2606-TTDL`, `V<n>-P<n>`, `V<n>-2606`,
  `V<n>-2607`, `V<n>-VA`;
- bổ sung `-VA` cho mã tháng `2606`;
- có mapping riêng cho một số tên trận đấu;
- `NEW APP PROMOTION AD`/`QUẢNG CÁO ỨNG DỤNG MỚI` → `CHƯA RÕ MÃ – NEW APP`;
- `NEW TRAFFIC AD` → `CHƯA RÕ MÃ – TRAFFIC`;
- nếu không khớp, dùng ad name đã bỏ hậu tố Copy.

Trong production, đặt version cho rule, ví dụ `normalizer_version=1`, và lưu:

- `raw_ad_name`;
- `normalized_creative_code`;
- `normalizer_version`;
- `normalization_reason`;
- thời điểm xử lý.

Không gộp video và banner chỉ vì tên giống nhau nếu asset/format khác. Khóa report
nên thêm physical `asset_key`/`media_type` hoặc cho phép drill-down để phát hiện
collision. Mã và tên chuẩn hóa luôn là alias nghiệp vụ.

## Công thức KPI

Tính từ tổng tử số/mẫu số, không lấy trung bình đơn giản của tỷ lệ:

| KPI | Công thức |
|---|---|
| Spend | `Σ spend` |
| Impressions | `Σ impressions` |
| Reach | giá trị Meta theo đúng query grain; xem lưu ý bên dưới |
| CTR | `Σ link_clicks / Σ impressions` |
| Meta-attributed Install | `Σ action_value` của action type install đã cấu hình |
| Meta-attributed Registration | `Σ action_value` của action type registration đã cấu hình |
| CPI (Meta-attributed Install) | `Σ spend / Σ installs` |
| CPA (Meta-attributed Registration) | `Σ spend / Σ registrations` |
| Hook Rate | `Σ video_3s_plays / Σ impressions` |
| Hold Rate kế thừa sheet | `Σ video_100pct_plays / Σ video_3s_plays` |

`Hold Rate` ở sheet là lượt xem 100% chia lượt xem tối thiểu 3 giây, không phải
50%/3 giây. Nếu sản phẩm muốn dùng 50%, phải đặt tên metric mới hoặc version định
nghĩa; không đổi âm thầm.

Khi mẫu số bằng 0, lưu `null` cho tỷ lệ/cost để phân biệt “không có dữ liệu” với
giá trị thật bằng 0. UI có thể hiển thị `—`.

## Reach

Reach là metric ước tính/deduplicated theo phạm vi truy vấn Meta. Cộng Reach của
nhiều dòng có thể double-count cùng một người. Để đối chiếu:

- request Reach ở đúng level/time range cần hiển thị; hoặc
- ghi rõ `summed_reach` nếu buộc phải cộng daily rows.

Không gọi `Σ daily reach` là unique reach của cả kỳ.

## Action types

Install và Registration ở đây là conversion **được Meta attribution**, phụ thuộc
app event, action type, attribution window và `action_report_time`. Đây không phải
số backend/app-store xác nhận độc lập. Owner cấu hình danh sách action type tại
**Cài đặt**; Live sync đọc giá trị đã lưu trong `tracker.app_settings`, không đọc
action mapping từ Vercel env.

Khi nhiều action type cùng xuất hiện, tránh double-count. Lưu `action_type` gốc,
chọn quy tắc ưu tiên có version và kiểm thử bằng sample thật của từng app.
Sau khi đổi mapping, sync lại khoảng liên quan trước khi so sánh vì các cột
Install/Registration đã lưu không tự được phân loại lại chỉ bằng thao tác Save.

## Xếp hạng CPI

Logic sheet dùng baseline riêng theo OS:

```text
Meta-attributed install = 0       → KHÔNG INSTALL
0 < Meta-attributed install < 20  → ÍT DỮ LIỆU
Meta-attributed CPI ≤ 0,8 × CPI OS → TỐT
Meta-attributed CPI ≤ 1,2 × CPI OS → ỔN
Meta-attributed CPI > 1,2 × CPI OS → KÉM
```

`CPI OS = tổng Spend OS / tổng Meta-attributed Install OS`.

Personal v1 cho owner cấu hình ngưỡng tối thiểu về sample size tại **Cài đặt** và
hiển thị baseline/khoảng ngày. Các hệ số 0,8×/1,2× là metric contract hiện tại;
thay đổi chúng cần sửa/version code và test, không phải biến môi trường. Không so
sánh rating giữa hai khoảng có attribution/timezone khác nhau.

## Giới hạn kế thừa cần loại bỏ hoặc làm rõ

- Sheet chỉ hiển thị tối đa 49 creative mỗi OS, sắp xếp theo Spend giảm dần.
- Record thiếu ad name bị loại hoàn toàn.
- OS còn lại mặc định Android.
- Gộp theo code alias có thể va chạm video/banner hoặc campaign khác nhau;
  physical dedup phải dùng `video_id`/`image_hash`.
- Rating phụ thuộc tổng CPI cùng OS trong chính khoảng đã chọn.

Web app nên paginate toàn bộ creative, có filter “thiếu tên/mã”, hiển thị
`unknown` và không cắt dữ liệu ngầm.

## Đối chiếu Ads Manager

Khi số không khớp, so sánh đồng thời:

- ad account timezone và currency;
- date range inclusive;
- level (`ad`, `adset`, `campaign`);
- breakdowns;
- attribution window và `action_report_time`;
- action type;
- campaign/ad status và deleted/archived objects;
- API version;
- thời điểm dữ liệu còn đang cập nhật.
