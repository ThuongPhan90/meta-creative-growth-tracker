import Link from "next/link";

import { getLegalConfiguration } from "@/lib/server";

export const metadata = {
  title: "Chính sách quyền riêng tư",
};

export default function PrivacyPage() {
  const legal = getLegalConfiguration();

  return (
    <main className="legal-page">
      <div className="legal-page__card">
        <Link className="legal-page__brand" href="/">
          Meta Creative Growth Tracker
        </Link>
        <h1>Chính sách quyền riêng tư</h1>
        <p className="legal-page__updated">
          Phiên bản chính sách: 24 tháng 7, 2026
        </p>

        <section>
          <h2>Đơn vị kiểm soát dữ liệu</h2>
          <p>
            Deployment này do <strong>{legal.entityName}</strong> vận hành độc
            lập. Repo không có máy chủ trung tâm và tác giả repo không nhận dữ
            liệu từ deployment này.
          </p>
          <p>
            Liên hệ quyền riêng tư:{" "}
            {legal.contactEmail ? (
              <a href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a>
            ) : (
              <strong>chưa được người triển khai cấu hình</strong>
            )}
            .
          </p>
        </section>

        <section>
          <h2>Dữ liệu Meta được xử lý</h2>
          <p>
            Sau khi owner cho phép, ứng dụng đọc Meta user ID và tên hiển thị;
            Business Portfolio, tài khoản quảng cáo, Trang và app được quyền
            truy cập; campaign, ad set, ads, creative; cùng Ads Insights và
            action values mà Meta trả về cho các quyền đã duyệt.
          </p>
        </section>

        <section>
          <h2>Mục đích và giới hạn</h2>
          <p>
            Dữ liệu chỉ phục vụ đồng bộ, đối soát và báo cáo hiệu quả creative
            cho owner. Ứng dụng ở chế độ read-only: không tạo, sửa, pause ads
            hoặc thay đổi ngân sách. Số liệu conversion là số liệu Meta
            attributed, không phải đo lường độc lập từ MMP.
          </p>
        </section>

        <section>
          <h2>Lưu trữ, bảo mật và thời hạn giữ dữ liệu</h2>
          <p>
            Access token được mã hóa AES-256-GCM trước khi lưu trong Postgres.
            App Secret, khóa mã hóa và session secret chỉ tồn tại trong biến
            môi trường server. Dữ liệu được giữ trong lúc owner duy trì kết nối
            hoặc cho tới khi owner yêu cầu xóa. Ngắt kết nối sẽ xóa connection,
            token và dữ liệu liên quan khỏi schema ứng dụng.
          </p>
          <p>
            Vercel và nhà cung cấp Postgres do owner lựa chọn có thể xử lý dữ
            liệu như nhà cung cấp hạ tầng. Chính sách lưu backup và xóa bản sao
            lưu phụ thuộc cấu hình của các dịch vụ đó; owner deployment chịu
            trách nhiệm kiểm tra và cấu hình thời hạn phù hợp.
          </p>
        </section>

        <section>
          <h2>Chia sẻ và chuyển dữ liệu</h2>
          <p>
            Ứng dụng không bán dữ liệu và không gửi dữ liệu cho tác giả repo.
            Dữ liệu chỉ đi giữa Meta, deployment Vercel và database được owner
            kết nối, trừ khi pháp luật yêu cầu khác.
          </p>
        </section>

        <section>
          <h2>Xóa dữ liệu và thu hồi quyền</h2>
          <p>
            Owner có thể ngắt kết nối trong ứng dụng, gỡ Business Integration
            ở Meta hoặc sử dụng cơ chế Data Deletion Callback của Meta.
          </p>
          <Link href="/data-deletion">Xem hướng dẫn xóa dữ liệu</Link>
        </section>

        <footer>
          Chính sách này áp dụng riêng cho deployment do {legal.entityName} vận
          hành. Người triển khai phải cấu hình tên đơn vị và email liên hệ thật
          trước khi chuyển Meta App sang Live.
        </footer>
      </div>
    </main>
  );
}
