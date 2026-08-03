"use client";

import { AlertTriangle, ExternalLink, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { objectiveLabel } from "@/lib/reporting/objective-registry";
import {
  parseDisplayMetricIdentity,
  type DisplayMetricKey,
  type MetricDisplayPresetContext,
  type MetricDisplayPresets,
} from "@/lib/reporting/metric-preset";
import {
  getMetricDefinition,
  resolveMetricEligibility,
} from "@/lib/reporting/metric-registry";
import type { ResultDefinition } from "@/lib/reporting/result-definition";

type PresetContext = MetricDisplayPresetContext & {
  key: string;
};

type PresetMetricView = {
  key: DisplayMetricKey;
  label: string;
  formula: string;
  eligibility: string;
  eligible: boolean;
};

type ApiResponse = {
  ok?: boolean;
  error?: string;
  metricDisplayPresets?: unknown;
  updatedAt?: unknown;
};

const DELIVERY_BACKED_RESULTS = new Set([
  "reach",
  "impressions",
  "link_click",
]);

function contextForPresetKey(key: string): PresetContext | null {
  if (key === "all") {
    return { key, objectiveKey: "all", primaryResultKey: null };
  }
  const [objectiveKey, primaryResultKey, ...rest] = key.split(":");
  if (!objectiveKey || !primaryResultKey || rest.length > 0) return null;
  return { key, objectiveKey, primaryResultKey };
}

function resultDefinitionFor(
  canonicalKey: string | undefined,
  definitions: readonly ResultDefinition[],
) {
  return (
    definitions.find(
      (definition) =>
        definition.enabled && definition.canonicalKey === canonicalKey,
    ) ?? null
  );
}

function resultFormula(definition: ResultDefinition) {
  return DELIVERY_BACKED_RESULTS.has(definition.canonicalKey)
    ? `Meta-reported ${definition.shortLabel}`
    : `Meta-attributed ${definition.shortLabel}`;
}

function efficiencyFormula(definition: ResultDefinition) {
  const source = resultFormula(definition);
  switch (definition.efficiencyMetric) {
    case "cost_per_result":
      return `Spend / ${source}`;
    case "rate":
      return `${source} / Link Clicks × 100`;
    case "roas":
      return "Meta-attributed Value / Spend";
    default:
      return "Không có efficiency metric cho Result này";
  }
}

function metricView({
  key,
  context,
  definitions,
  currencyMode,
}: {
  key: DisplayMetricKey;
  context: PresetContext;
  definitions: readonly ResultDefinition[];
  currencyMode: "single" | "split";
}): PresetMetricView {
  const parsed = parseDisplayMetricIdentity(key, context);
  if (!parsed) {
    return {
      key,
      label: key,
      formula: "Identity chỉ số không còn được Metric Registry nhận diện.",
      eligibility: "Không còn hợp lệ; Overview sẽ dùng default resolver.",
      eligible: false,
    };
  }

  if (parsed.kind === "delivery") {
    const definition = getMetricDefinition(parsed.key);
    if (!definition) {
      return {
        key,
        label: parsed.key,
        formula: "Không tìm thấy công thức trong Metric Registry.",
        eligibility: "Không còn hợp lệ.",
        eligible: false,
      };
    }
    const eligibility = resolveMetricEligibility(definition, context);
    const requiresCurrency =
      definition.requiresSingleCurrency && currencyMode === "split";
    return {
      key,
      label: definition.label,
      formula: definition.formula,
      eligibility: !eligibility.eligible
        ? "Không phù hợp với Objective + Primary Result hiện tại."
        : requiresCurrency
          ? "Cần chọn một tiền tệ khi mở Tổng quan."
          : "Hợp lệ theo Objective + Primary Result.",
      eligible: eligibility.eligible && !requiresCurrency,
    };
  }

  const definition = resultDefinitionFor(
    parsed.canonicalResultKey,
    definitions,
  );
  if (!definition) {
    return {
      key,
      label: parsed.canonicalResultKey ?? key,
      formula: "Không tìm thấy Result Definition đã bật.",
      eligibility: "Không còn hợp lệ theo Result Registry.",
      eligible: false,
    };
  }

  const objectiveEligible =
    context.objectiveKey !== "all" &&
    definition.objectiveKeys.includes(context.objectiveKey);
  const efficiencyEligible =
    parsed.kind !== "efficiency" || definition.efficiencyMetric !== "none";
  const requiresCurrency =
    currencyMode === "split" &&
    (definition.unit === "currency" ||
      (parsed.kind === "efficiency" &&
        (definition.efficiencyMetric === "cost_per_result" ||
          definition.efficiencyMetric === "roas")));
  const eligible = objectiveEligible && efficiencyEligible && !requiresCurrency;
  const label =
    parsed.kind === "efficiency"
      ? definition.efficiencyMetric === "roas"
        ? "ROAS (Meta)"
        : definition.efficiencyMetric === "cost_per_result"
          ? `Cost/${definition.shortLabel}`
          : `${definition.shortLabel} Rate`
      : definition.canonicalKey === "purchase_value"
        ? "Purchase Value (Meta)"
        : definition.label;
  return {
    key,
    label,
    formula:
      parsed.kind === "efficiency"
        ? efficiencyFormula(definition)
        : resultFormula(definition),
    eligibility: !objectiveEligible
      ? "Không phù hợp với Objective đã lưu."
      : !efficiencyEligible
        ? "Result này không có efficiency metric phù hợp."
        : requiresCurrency
          ? "Cần chọn một tiền tệ khi mở Tổng quan."
          : "Hợp lệ theo Result Registry.",
    eligible,
  };
}

function labelForContext(
  context: PresetContext,
  definitions: readonly ResultDefinition[],
) {
  if (context.objectiveKey === "all") return "Tất cả mục tiêu";
  const primary = resultDefinitionFor(
    context.primaryResultKey ?? undefined,
    definitions,
  );
  return `${objectiveLabel(context.objectiveKey)} · ${
    primary?.label ?? context.primaryResultKey ?? "Result chưa xác định"
  }`;
}

function overviewHref(context: PresetContext) {
  const params = new URLSearchParams({ objective: context.objectiveKey });
  if (context.primaryResultKey) {
    params.set("result", context.primaryResultKey);
  }
  return `/overview?${params.toString()}`;
}

function isPresetResponse(value: unknown): value is MetricDisplayPresets {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as {
    version?: unknown;
    presets?: unknown;
  };
  return (
    candidate.version === 1 &&
    !!candidate.presets &&
    typeof candidate.presets === "object" &&
    !Array.isArray(candidate.presets)
  );
}

function cloneWithoutPreset(
  value: MetricDisplayPresets,
  presetKey: string,
): MetricDisplayPresets {
  const presets: Record<string, DisplayMetricKey[]> = {};
  for (const [key, metrics] of Object.entries(value.presets)) {
    if (key !== presetKey) presets[key] = [...metrics];
  }
  return { version: value.version, presets };
}

/**
 * Settings-facing preset management is deliberately limited to saved report
 * contexts. It never exposes an account, campaign, BM, or date-range setting.
 */
export function MetricDisplayPresetManager({
  initialPresets,
  initialUpdatedAt,
  resultDefinitions,
  currencyMode,
  canSave,
  onRefresh,
}: {
  initialPresets: MetricDisplayPresets;
  initialUpdatedAt: string;
  resultDefinitions: readonly ResultDefinition[];
  currencyMode: "single" | "split";
  canSave: boolean;
  /** Test seam; production falls back to a full reload on a stale revision. */
  onRefresh?: () => void;
}) {
  const [local, setLocal] = useState<{
    presets: MetricDisplayPresets;
    updatedAt: string;
  } | null>(null);
  const [savingPreset, setSavingPreset] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const current = local ?? {
    presets: initialPresets,
    updatedAt: initialUpdatedAt,
  };
  const savedPresets = useMemo(
    () =>
      Object.entries(current.presets.presets)
        .map(([key, metrics]) => ({ key, metrics, context: contextForPresetKey(key) }))
        .sort((left, right) => {
          if (left.key === "all") return -1;
          if (right.key === "all") return 1;
          return left.key.localeCompare(right.key, "en");
        }),
    [current.presets.presets],
  );

  const resetPreset = async (presetKey: string) => {
    if (!canSave || savingPreset) return;
    setMessage(null);
    setSavingPreset(presetKey);
    const next = cloneWithoutPreset(current.presets, presetKey);
    try {
      const response = await fetch("/api/settings/metric-presets", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          metricDisplayPresets: next,
          expectedUpdatedAt: current.updatedAt,
        }),
      });
      const body = (await response.json().catch(() => null)) as ApiResponse | null;
      if (response.status === 409) {
        setMessage(
          "Preset đã được thay đổi ở một phiên khác. Hệ thống đang tải lại để tránh ghi đè.",
        );
        if (onRefresh) onRefresh();
        else window.location.reload();
        return;
      }
      if (!response.ok || !body?.ok) {
        setMessage(
          body?.error ?? "Không thể đặt lại preset lúc này. Dữ liệu chưa bị thay đổi.",
        );
        return;
      }
      if (
        !isPresetResponse(body.metricDisplayPresets) ||
        typeof body.updatedAt !== "string"
      ) {
        setMessage(
          "Phản hồi lưu preset chưa đủ để xác nhận. Hệ thống sẽ tải lại trước khi hiển thị tiếp.",
        );
        if (onRefresh) onRefresh();
        else window.location.reload();
        return;
      }
      setLocal({
        presets: body.metricDisplayPresets,
        updatedAt: body.updatedAt,
      });
      setMessage("Đã đặt lại preset. Tổng quan sẽ dùng bộ chỉ số mặc định.");
    } catch {
      setMessage("Không thể kết nối để đặt lại preset. Hãy kiểm tra mạng rồi thử lại.");
    } finally {
      setSavingPreset(null);
    }
  };

  return (
    <section
      className="v2-metric-presets"
      aria-labelledby="metric-display-presets-title"
    >
      <header className="v2-metric-presets__header">
        <div>
          <h3 id="metric-display-presets-title">Preset chỉ số đã lưu</h3>
          <p>
            Mỗi preset chỉ thuộc Objective + Primary Result; không theo Ad
            Account, Campaign, Business hoặc khoảng ngày.
          </p>
        </div>
        <span className="v2-chip">
          {savedPresets.length
            ? `${savedPresets.length} preset đã lưu`
            : "Chưa có preset đã lưu"}
        </span>
      </header>

      {!canSave ? (
        <p className="v2-metric-presets__notice" role="status">
          <AlertTriangle aria-hidden="true" size={15} />
          Cần phiên owner đã kết nối Meta để đặt lại preset.
        </p>
      ) : null}

      {savedPresets.length ? (
        <ol className="v2-metric-presets__list">
          {savedPresets.map(({ key, metrics, context }) => {
            const readableMetrics = context
              ? metrics.map((metric) =>
                  metricView({
                    key: metric,
                    context,
                    definitions: resultDefinitions,
                    currencyMode,
                  }),
                )
              : metrics.map((metric) => ({
                  key: metric,
                  label: metric,
                  formula: "Không đọc được Objective + Primary Result của preset.",
                  eligibility: "Không còn hợp lệ; có thể đặt lại về mặc định.",
                  eligible: false,
                }));
            return (
              <li key={key}>
                <article>
                  <header>
                    <div>
                      <h4>
                        {context
                          ? labelForContext(context, resultDefinitions)
                          : "Context preset không còn hợp lệ"}
                      </h4>
                      <p>{key}</p>
                    </div>
                    <div className="v2-metric-presets__actions">
                      {context ? (
                        <Link className="v2-link" href={overviewHref(context)}>
                          Xem trên Tổng quan
                          <ExternalLink aria-hidden="true" size={14} />
                        </Link>
                      ) : null}
                      <button
                        className="button button--secondary"
                        type="button"
                        disabled={!canSave || savingPreset !== null}
                        onClick={() => resetPreset(key)}
                        aria-label={`Đặt lại preset ${
                          context
                            ? labelForContext(context, resultDefinitions)
                            : key
                        } về mặc định`}
                      >
                        <RotateCcw aria-hidden="true" size={15} />
                        {savingPreset === key
                          ? "Đang đặt lại…"
                          : "Đặt lại về mặc định"}
                      </button>
                    </div>
                  </header>
                  <ul aria-label={`Chỉ số của preset ${key}`}>
                    {readableMetrics.map((metric) => (
                      <li key={metric.key}>
                        <div>
                          <strong>{metric.label}</strong>
                          <small>{metric.formula}</small>
                        </div>
                        <span
                          className={
                            metric.eligible
                              ? "v2-chip v2-chip--success"
                              : "v2-chip v2-chip--warning"
                          }
                        >
                          {metric.eligibility}
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="v2-metric-presets__empty">
          <strong>Chưa có preset đã lưu</strong>
          <p>
            Tổng quan đang dùng bộ KPI mặc định theo Objective + Primary
            Result. Bạn có thể tạo preset từ nút “Tùy chỉnh chỉ số”.
          </p>
        </div>
      )}

      {message ? (
        <p className="v2-metric-presets__notice" role="status">
          <AlertTriangle aria-hidden="true" size={15} />
          {message}
        </p>
      ) : null}
    </section>
  );
}
