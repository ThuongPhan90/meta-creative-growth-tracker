import Link from "next/link";

import { getLegalConfiguration } from "@/lib/server";

export const metadata = {
  title: "Xóa dữ liệu",
};

type DataDeletionPageProps = {
  searchParams: Promise<{ confirmation?: string | string[] }>;
};

export default async function DataDeletionPage({
  searchParams,
}: DataDeletionPageProps) {
  const parameters = await searchParams;
  const confirmation =
    typeof parameters.confirmation === "string" &&
    /^[a-f0-9]{24}$/.test(parameters.confirmation)
      ? parameters.confirmation
      : null;
  const legal = getLegalConfiguration();

  return (
    <main className="legal-page">
      <div className="legal-page__card">
        <Link className="legal-page__brand" href="/">
          Meta Creative Growth Tracker
        </Link>
        <h1>Yêu cầu xóa dữ liệu</h1>

        {confirmation ? (
          <section
            className="legal-page__confirmation"
            aria-labelledby="deletion-confirmation-title"
          >
            <h2 id="deletion-confirmation-title">
              Yêu cầu đã được xử lý
            </h2>
            <p>
              Dữ liệu liên kết với Meta user trong yêu cầu không còn trong
              schema ứng dụng. Mã xác nhận:
            </p>
            <code>{confirmation}</code>
          </section>
        ) : null}

        <p>
          Với deployment cá nhân, owner có thể xóa dữ liệu theo một trong các
          cách sau:
        </p>
        <ol>
          <li>
            Mở <Link href="/connect">Kết nối Meta</Link> và chọn Ngắt kết nối.
            Ứng dụng sẽ thử thu hồi quyền ở Meta trước khi xóa dữ liệu local.
          </li>
          <li>
            Gỡ Meta Creative Growth Tracker trong Business Integrations của tài
            khoản Meta để thu hồi quyền trực tiếp.
          </li>
          <li>
            Liên hệ{" "}
            {legal.contactEmail ? (
              <a href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a>
            ) : (
              <strong>email quyền riêng tư của deployment</strong>
            )}{" "}
            nếu cần hỗ trợ hoặc cần xử lý bản backup của nhà cung cấp database.
          </li>
        </ol>

        <section>
          <h2>Data Deletion Callback</h2>
          <p>
            Meta gửi signed request đến <code>/api/meta/data-deletion</code>.
            Endpoint chỉ xác nhận sau khi database sẵn sàng và thao tác xóa đã
            hoàn tất; request sai chữ ký, quá hạn hoặc cũ hơn connection hiện
            tại sẽ bị từ chối.
          </p>
        </section>

        <footer>
          Đơn vị vận hành: {legal.entityName}
          {legal.contactEmail ? ` · ${legal.contactEmail}` : ""}.
        </footer>
      </div>
    </main>
  );
}
