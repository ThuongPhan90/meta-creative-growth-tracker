"use client";

import {
  AlertTriangle,
  LockKeyhole,
  RotateCcw,
  Save,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import {
  MAX_DISPLAY_METRICS,
  type DisplayMetric,
  type DisplayMetricKey,
  type MetricDisplayPresets,
} from "@/lib/reporting/metric-preset";

import styles from "./overview-v3.module.css";

type PresetModel = {
  key: string | null;
  value: MetricDisplayPresets;
};

function selectedDefault(metrics: readonly DisplayMetric[]) {
  return metrics
    .filter((metric) => metric.locked || (metric.recommended && metric.eligible))
    .map((metric) => metric.key);
}

function orderedSelection(
  values: readonly DisplayMetricKey[],
  catalog: readonly DisplayMetric[],
) {
  const selected = new Set(values);
  return catalog
    .map((metric) => metric.key)
    .filter((key) => selected.has(key));
}

function focusableElements(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => element.offsetParent !== null);
}

/**
 * A controlled, keyboard-safe customization drawer. It stores a preset only
 * after the server's optimistic-concurrency check accepts the exact settings
 * revision that the user opened.
 */
export function MetricCustomizerDrawer({
  open,
  onClose,
  onSaved,
  metrics,
  availableMetrics,
  preset,
  expectedUpdatedAt,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  metrics: readonly DisplayMetric[];
  availableMetrics: readonly DisplayMetric[];
  preset: PresetModel;
  expectedUpdatedAt: string | null;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const [selectionOverride, setSelectionOverride] = useState<{
    scope: string;
    values: DisplayMetricKey[];
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectable = useMemo(
    () =>
      availableMetrics.filter(
        (metric) => !metric.locked,
      ),
    [availableMetrics],
  );
  const core = useMemo(
    () => availableMetrics.filter((metric) => metric.locked),
    [availableMetrics],
  );
  const selectionScope = `${preset.key ?? "none"}\u001f${metrics
    .map((metric) => metric.key)
    .join(",")}\u001f${availableMetrics.map((metric) => metric.key).join(",")}`;
  const defaultSelection = useMemo(
    () => orderedSelection(metrics.map((metric) => metric.key), availableMetrics),
    [availableMetrics, metrics],
  );
  const selected =
    selectionOverride?.scope === selectionScope
      ? selectionOverride.values
      : defaultSelection;

  const close = (force = false) => {
    if (saving && !force) return;
    setSelectionOverride(null);
    setMessage(null);
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const timer = window.setTimeout(() => dialogRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(timer);
      previouslyFocused.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  const toggleMetric = (metric: DisplayMetric) => {
    if (metric.locked || !metric.eligible) return;
    setMessage(null);
    setSelectionOverride((currentOverride) => {
      const current =
        currentOverride?.scope === selectionScope
          ? currentOverride.values
          : defaultSelection;
      if (current.includes(metric.key)) {
        return {
          scope: selectionScope,
          values: current.filter((key) => key !== metric.key),
        };
      }
      if (current.length >= MAX_DISPLAY_METRICS) {
        return { scope: selectionScope, values: current };
      }
      return {
        scope: selectionScope,
        values: orderedSelection([...current, metric.key], availableMetrics),
      };
    });
  };

  const restoreDefault = () => {
    setMessage(null);
    setSelectionOverride({
      scope: selectionScope,
      values: selectedDefault(availableMetrics),
    });
  };

  const trapFocus = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = focusableElements(dialogRef.current);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const save = async () => {
    if (!preset.key) {
      setMessage("Chọn Objective và Primary Result trước khi lưu preset.");
      return;
    }
    if (!expectedUpdatedAt) {
      setMessage("Chưa có phiên bản cài đặt an toàn để lưu. Hãy tải lại trang.");
      return;
    }
    setSaving(true);
    setMessage(null);
    const metricDisplayPresets: MetricDisplayPresets = {
      version: preset.value.version,
      presets: {
        ...preset.value.presets,
        [preset.key]: selected,
      },
    };
    try {
      const response = await fetch("/api/settings/metric-presets", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          metricDisplayPresets,
          expectedUpdatedAt,
        }),
      });
      if (response.status === 409) {
        setMessage("Preset đã được thay đổi ở một tab khác. Trang sẽ tải lại để tránh ghi đè.");
        onSaved();
        return;
      }
      if (!response.ok) {
        setMessage("Không thể lưu preset lúc này. Dữ liệu hiển thị chưa bị thay đổi.");
        return;
      }
      onSaved();
      close(true);
    } catch {
      setMessage("Không thể kết nối để lưu preset. Hãy kiểm tra mạng rồi thử lại.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={styles.customizerOverlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <aside
        ref={dialogRef}
        className={styles.customizerDrawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="metric-customizer-title"
        tabIndex={-1}
        onKeyDown={trapFocus}
      >
        <header className={styles.customizerHeader}>
          <div>
            <p>Priority Metrics</p>
            <h2 id="metric-customizer-title">Tùy chỉnh chỉ số</h2>
            <span>
              {preset.key ? `Preset: ${preset.key.replace(":", " → ")}` : "Chưa xác định Objective + Result"}
            </span>
          </div>
          <button
            className={styles.customizerClose}
            type="button"
            onClick={() => close()}
            disabled={saving}
            aria-label="Đóng tùy chỉnh chỉ số"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <div className={styles.customizerBody}>
          <section aria-labelledby="metric-core-title">
            <h3 id="metric-core-title">Chỉ số lõi</h3>
            <p className={styles.customizerIntro}>Hệ thống luôn giữ các chỉ số này để bảng đọc đúng theo Objective và Primary Result.</p>
            <div className={styles.metricOptionList}>
              {core.map((metric) => (
                <div className={styles.metricOption} key={metric.identity}>
                  <span className={styles.metricCheckbox} aria-hidden="true">
                    <LockKeyhole size={15} />
                  </span>
                  <div>
                    <strong>{metric.label}</strong>
                    <small>{metric.formula}</small>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="metric-options-title">
            <div className={styles.customizerSectionHeader}>
              <div>
                <h3 id="metric-options-title">Chỉ số đang hiển thị</h3>
                <p>Chọn tối đa {MAX_DISPLAY_METRICS - core.length} chỉ số phụ. Thứ tự được hệ thống sắp theo vai trò.</p>
              </div>
              <strong>{selected.length}/{MAX_DISPLAY_METRICS}</strong>
            </div>
            <div className={styles.metricOptionList}>
              {selectable.map((metric) => {
                const checked = selected.includes(metric.key);
                const atLimit = !checked && selected.length >= MAX_DISPLAY_METRICS;
                const disabled = !metric.eligible || atLimit;
                const helpText = !metric.eligible
                  ? metric.disabledReason ?? metric.formula
                  : atLimit
                    ? `Đã chọn tối đa ${MAX_DISPLAY_METRICS} chỉ số.`
                    : metric.formula;
                const inputId = `metric-${metric.identity.replace(/[^a-z0-9]+/gi, "-")}`;
                return (
                  <label
                    className={`${styles.metricOption}${disabled ? ` ${styles.metricOptionDisabled}` : ""}`}
                    key={metric.identity}
                    htmlFor={inputId}
                  >
                    <input
                      id={inputId}
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleMetric(metric)}
                    />
                    <div>
                      <strong>
                        {metric.label}
                        {metric.recommended ? <span className={styles.metricRecommended}>Đề xuất</span> : null}
                      </strong>
                      <small>{helpText}</small>
                    </div>
                  </label>
                );
              })}
            </div>
          </section>

          {message ? (
            <p className={styles.customizerMessage} role="status">
              <AlertTriangle aria-hidden="true" size={16} />
              {message}
            </p>
          ) : null}
        </div>

        <footer className={styles.customizerFooter}>
          <button className={styles.customizerReset} type="button" onClick={restoreDefault} disabled={saving}>
            <RotateCcw aria-hidden="true" size={15} />
            Khôi phục mặc định
          </button>
          <button className={styles.customizerSave} type="button" onClick={save} disabled={saving}>
            <Save aria-hidden="true" size={15} />
            {saving ? "Đang lưu" : "Lưu preset"}
          </button>
        </footer>
      </aside>
    </div>
  );
}
