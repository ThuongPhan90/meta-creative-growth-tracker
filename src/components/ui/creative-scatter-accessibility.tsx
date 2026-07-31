import {
  CREATIVE_PERFORMANCE_STATUSES,
  type CreativePerformanceStatusKey,
} from "@/lib/presentation/creative-performance-status";

export function CreativeScatterLegend() {
  return (
    <div
      className="v2-scatter-legend"
      role="list"
      aria-label="Chú giải trạng thái hiệu suất"
    >
      {CREATIVE_PERFORMANCE_STATUSES.map((status) => (
        <span role="listitem" key={status.key}>
          <i
            className={`v2-scatter-legend__swatch v2-scatter-legend__swatch--${status.key}`}
            aria-hidden="true"
          />
          {status.label}
        </span>
      ))}
    </div>
  );
}

export function CreativeScatterTooltip({
  name,
  status,
  statusLabel,
  spend,
  efficiencyLabel,
  efficiencyValue,
  resultLabel,
  resultValue,
  horizontal = "center",
  vertical = "above",
}: {
  name: string;
  status: CreativePerformanceStatusKey;
  statusLabel: string;
  spend: string;
  efficiencyLabel: string;
  efficiencyValue: string;
  resultLabel: string;
  resultValue: string;
  horizontal?: "left" | "center" | "right";
  vertical?: "above" | "below";
}) {
  return (
    <span
      className={`v2-scatter__tooltip v2-scatter__tooltip--${horizontal} v2-scatter__tooltip--${vertical}`}
      aria-hidden="true"
    >
      <strong>{name}</strong>
      <small
        className={`v2-scatter__tooltip-status v2-scatter__tooltip-status--${status}`}
      >
        {statusLabel}
      </small>
      <small>Spend: {spend}</small>
      <small>
        {efficiencyLabel}: {efficiencyValue}
      </small>
      <small>
        {resultLabel}: {resultValue}
      </small>
    </span>
  );
}
