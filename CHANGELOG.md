# Changelog

Định dạng dựa trên [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) và
dự án theo Semantic Versioning khi phát hành public.

## [Unreleased]

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
