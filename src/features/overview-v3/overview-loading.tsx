import styles from "./overview-v3.module.css";

function LoadingLabel({ children }: { children: string }) {
  return <span className="sr-only">{children}</span>;
}

function SkeletonLines({ count }: { count: number }) {
  return (
    <div className={styles.skeletonLines} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}

export function OverviewLiveDeliverySkeleton() {
  return (
    <section className={`${styles.skeletonPanel} ${styles.skeletonLive}`} aria-busy="true">
      <LoadingLabel>Đang tải tình trạng phân phối Meta</LoadingLabel>
      <SkeletonLines count={3} />
    </section>
  );
}

export function OverviewCreativeSkeleton() {
  return (
    <section className={`${styles.skeletonPanel} ${styles.skeletonCreative}`} aria-busy="true">
      <LoadingLabel>Đang tải Creative Watchlist</LoadingLabel>
      <SkeletonLines count={6} />
    </section>
  );
}

export function OverviewBreakdownSkeleton() {
  return (
    <section className={`${styles.skeletonPanel} ${styles.skeletonBreakdown}`} aria-busy="true">
      <LoadingLabel>Đang tải phân bổ Meta</LoadingLabel>
      <SkeletonLines count={4} />
    </section>
  );
}

export function OverviewDataQualitySkeleton() {
  return (
    <section className={`${styles.skeletonPanel} ${styles.skeletonQuality}`} aria-busy="true">
      <LoadingLabel>Đang tải chất lượng dữ liệu</LoadingLabel>
      <SkeletonLines count={3} />
    </section>
  );
}

export function OverviewCoreSkeleton() {
  return (
    <div className={styles.skeletonCore} aria-busy="true">
      <LoadingLabel>Đang tải chỉ số tổng quan</LoadingLabel>
      <section className={`${styles.skeletonPanel} ${styles.skeletonKpis}`} aria-hidden="true">
        <SkeletonLines count={2} />
      </section>
      <OverviewCreativeSkeleton />
      <section className={`${styles.skeletonPanel} ${styles.skeletonAnalytics}`} aria-hidden="true">
        <SkeletonLines count={5} />
      </section>
      <div className={styles.bottomGrid} aria-hidden="true">
        <OverviewBreakdownSkeleton />
        <OverviewDataQualitySkeleton />
      </div>
    </div>
  );
}
