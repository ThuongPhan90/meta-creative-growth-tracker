import { ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";

import styles from "./surface-page.module.css";

const SURFACE_COPY = {
  creatives: {
    eyebrow: "Creative analysis",
    title: "Creative Tracker",
    description:
      "Phân tích, xếp hạng và so sánh Creative từ dữ liệu Meta trong cùng Reporting Context.",
  },
  library: {
    eyebrow: "Creative assets",
    title: "Thư viện Creative",
    description:
      "Duyệt tài sản Creative, nhận diện format và xem nơi đang được sử dụng.",
  },
  campaigns: {
    eyebrow: "Delivery",
    title: "Phân phối",
    description:
      "Theo dõi Campaign, Ad Set và Ads theo trạng thái delivery Meta trong kỳ đã chọn.",
  },
  sources: {
    eyebrow: "Meta access",
    title: "Nguồn dữ liệu",
    description:
      "Phân biệt tài sản Meta được cấp quyền với phạm vi đang được đưa vào báo cáo.",
  },
  "data-health": {
    eyebrow: "Data integrity",
    title: "Chất lượng dữ liệu",
    description:
      "Theo dõi coverage, freshness, mapping và các vấn đề cần kiểm tra trong lần đồng bộ Meta.",
  },
  settings: {
    eyebrow: "Workspace",
    title: "Cài đặt",
    description:
      "Thiết lập Reporting Context, Result Mapping, benchmark và đồng bộ nội bộ; không ghi thay đổi sang Meta.",
  },
} as const;

export type V3Surface = keyof typeof SURFACE_COPY;

export type V3SurfacePageProps = {
  surface: V3Surface;
  children: React.ReactNode;
  title?: string;
  description?: string;
  eyebrow?: string;
  /**
   * Detail pages keep their existing, context-preserving back target while
   * sharing the V3 shell and page anatomy with their parent surface.
   */
  backHref?: string;
  backLabel?: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
};

/**
 * A presentation boundary for the route-scoped V3 release. Its children keep
 * the existing server data and URL contracts; CSS only restyles the retained
 * V2 components when the V3 shell is active.
 */
export function V3SurfacePage({
  surface,
  children,
  title,
  description,
  eyebrow,
  backHref,
  backLabel = "Quay lại",
  meta,
  actions,
}: V3SurfacePageProps) {
  const copy = SURFACE_COPY[surface];

  return (
    <section
      className={styles.page}
      data-v3-surface={surface}
      aria-labelledby={`v3-surface-title-${surface}`}
    >
      {backHref ? (
        <Link className={styles.backLink} href={backHref}>
          <ArrowLeft aria-hidden="true" size={16} />
          {backLabel}
        </Link>
      ) : null}

      <header className={styles.header}>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>{eyebrow ?? copy.eyebrow}</p>
          <h1 id={`v3-surface-title-${surface}`}>{title ?? copy.title}</h1>
          <p className={styles.description}>{description ?? copy.description}</p>
          {meta ? <div className={styles.meta}>{meta}</div> : null}
        </div>
        <div className={styles.actions}>
          {actions}
          <span className={styles.readOnly}>
            <ShieldCheck aria-hidden="true" size={14} />
            Chỉ đọc
          </span>
        </div>
      </header>

      <div className={`${styles.content} ${styles.legacy}`}>{children}</div>
    </section>
  );
}

export { SURFACE_COPY as V3_SURFACE_COPY };
