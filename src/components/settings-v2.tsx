"use client";

import {
  ArrowRight,
  Bell,
  CalendarClock,
  Check,
  CircleGauge,
  History,
  Plus,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { SyncButton } from "@/components/sync-button";
import type { TrackerSettings } from "@/lib/db";
import {
  validateActionTypeMapping,
} from "@/lib/reporting/action-type-mapping";
import type { SettingsAuditEntryView } from "@/lib/settings-audit";

type SettingsTab = "reporting" | "events" | "benchmark" | "sync";

const TABS: { value: SettingsTab; label: string }[] = [
  { value: "reporting", label: "Báo cáo" },
  { value: "events", label: "Sự kiện" },
  { value: "benchmark", label: "Benchmark & đánh giá" },
  { value: "sync", label: "Đồng bộ & bảo mật" },
];

function ActionTypeEditor({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const value = draft.trim().toLowerCase();
    if (!value || values.includes(value)) return;
    onChange([...values, value]);
    setDraft("");
  }

  return (
    <fieldset className="v2-action-editor">
      <legend>{label}</legend>
      <div className="v2-action-editor__chips">
        {values.map((value) => (
          <span className="v2-action-chip" key={value}>
            {value}
            <button
              type="button"
              aria-label={`Xóa ${value}`}
              onClick={() =>
                onChange(values.filter((candidate) => candidate !== value))
              }
            >
              <Trash2 aria-hidden="true" size={13} />
            </button>
          </span>
        ))}
      </div>
      <div className="v2-action-editor__input">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder="Thêm action type"
          spellCheck={false}
        />
        <button
          className="button button--secondary"
          type="button"
          onClick={add}
        >
          <Plus aria-hidden="true" size={15} />
          Thêm
        </button>
      </div>
    </fieldset>
  );
}

export function SettingsV2({
  initial,
  activeTab,
  auditLog,
  canSave,
  tokenExpiresAt,
  dataAccessExpiresAt,
  grantedScopes,
}: {
  initial: TrackerSettings;
  activeTab: SettingsTab;
  auditLog: SettingsAuditEntryView[];
  canSave: boolean;
  tokenExpiresAt: string | null;
  dataAccessExpiresAt: string | null;
  grantedScopes: string[];
}) {
  const [timezone, setTimezone] = useState(initial.reportingTimezone);
  const [currency, setCurrency] = useState(
    initial.reportingCurrency ?? "",
  );
  const [numberFormat, setNumberFormat] = useState(initial.numberFormat);
  const [compareDefault, setCompareDefault] = useState(
    initial.compareDefault,
  );
  const [lookback, setLookback] = useState(initial.syncLookbackDays);
  const [minimumInstalls, setMinimumInstalls] = useState(
    initial.minimumInstallThreshold,
  );
  const [minimumRegistrations, setMinimumRegistrations] = useState(
    initial.minimumRegistrationThreshold,
  );
  const [installActions, setInstallActions] = useState(
    initial.installActionTypes,
  );
  const [registrationActions, setRegistrationActions] = useState(
    initial.registrationActionTypes,
  );
  const [benchmarkWindow, setBenchmarkWindow] = useState(
    initial.benchmarkWindowDays,
  );
  const [benchmarkByOs, setBenchmarkByOs] = useState(initial.benchmarkByOs);
  const [benchmarkByFormat, setBenchmarkByFormat] = useState(
    initial.benchmarkByFormat,
  );
  const [weights, setWeights] = useState(initial.scoringWeights);
  const [syncCadence, setSyncCadence] = useState(initial.syncCadence);
  const [alertChannel, setAlertChannel] = useState(initial.alertChannel);
  const [currentTab, setCurrentTab] = useState(activeTab);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const actionMapping = useMemo(
    () =>
      validateActionTypeMapping({
        installActionTypes: installActions,
        registrationActionTypes: registrationActions,
      }),
    [installActions, registrationActions],
  );
  const weightTotal =
    weights.cpi + weights.cpa + weights.hook + weights.hold;

  useEffect(() => {
    function syncTabFromUrl() {
      const requested = new URL(window.location.href).searchParams.get("tab");
      const valid = TABS.some((tab) => tab.value === requested);
      setCurrentTab(valid ? (requested as SettingsTab) : "reporting");
    }
    window.addEventListener("popstate", syncTabFromUrl);
    return () => window.removeEventListener("popstate", syncTabFromUrl);
  }, []);

  function selectTab(tab: SettingsTab) {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.pushState(null, "", url);
    setCurrentTab(tab);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    if (!canSave) {
      setError("Cần phiên owner đã kết nối Meta để lưu cài đặt.");
      return;
    }
    if (!actionMapping.ok) {
      setError(actionMapping.error);
      return;
    }
    if (weightTotal !== 100) {
      setError("Tổng trọng số đánh giá phải bằng 100%.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timezone,
          reportingCurrency: currency || null,
          numberFormat,
          compareDefault,
          lookbackDays: lookback,
          minimumInstallThreshold: minimumInstalls,
          minimumRegistrationThreshold: minimumRegistrations,
          benchmarkMode: "custom",
          benchmarkWindowDays: benchmarkWindow,
          benchmarkByOs,
          benchmarkByFormat,
          scoringWeights: weights,
          syncCadence,
          alertChannel,
          installActionTypes: actionMapping.installActionTypes,
          registrationActionTypes:
            actionMapping.registrationActionTypes,
        }),
      });
      const result = (await response.json()) as {
        message?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "Không thể lưu.");
      setMessage(result.message ?? "Đã lưu cài đặt.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Không thể lưu cài đặt.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div>
          <h1>Cài đặt</h1>
          <p>
            Các tùy chọn chỉ ảnh hưởng cách ứng dụng đọc, benchmark và hiển thị
            dữ liệu; không ghi sang Meta.
          </p>
        </div>
        <span className="v2-chip v2-chip--success">
          <ShieldCheck aria-hidden="true" size={14} />
          Chỉ đọc
        </span>
      </header>
      <nav className="v2-tabs" aria-label="Nhóm cài đặt">
        {TABS.map((tab) => (
          <button
            type="button"
            className="v2-tab"
            aria-current={currentTab === tab.value ? "page" : undefined}
            onClick={() => selectTab(tab.value)}
            key={tab.value}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <form className="v2-settings-form" onSubmit={save}>
        {currentTab === "reporting" ? (
          <section className="v2-panel v2-settings-section">
            <div className="v2-settings-section__intro">
              <span aria-hidden="true">
                <SlidersHorizontal size={19} />
              </span>
              <div>
                <h2>Báo cáo</h2>
                <p>
                  Múi giờ, tiền tệ và ngữ cảnh so sánh mặc định cho mọi màn.
                </p>
              </div>
            </div>
            <div className="v2-settings-grid">
              <label>
                <span>Múi giờ báo cáo</span>
                <select
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                >
                  <option value="Asia/Ho_Chi_Minh">
                    Asia/Ho_Chi_Minh
                  </option>
                  <option value="Asia/Singapore">Asia/Singapore</option>
                  <option value="UTC">UTC</option>
                </select>
                <small>
                  Metric date vẫn giữ ngày cục bộ của từng tài khoản nguồn.
                </small>
              </label>
              <label>
                <span>Tiền tệ báo cáo</span>
                <select
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                >
                  <option value="">Theo từng tài khoản</option>
                  <option value="VND">VND</option>
                  <option value="USD">USD</option>
                  <option value="SGD">SGD</option>
                </select>
                <small>Ứng dụng không quy đổi tỷ giá.</small>
              </label>
              <label>
                <span>Định dạng số</span>
                <select
                  value={numberFormat}
                  onChange={(event) =>
                    setNumberFormat(event.target.value as "vi-VN" | "en-US")
                  }
                >
                  <option value="vi-VN">Việt Nam (1.234,56)</option>
                  <option value="en-US">Quốc tế (1,234.56)</option>
                </select>
              </label>
              <label>
                <span>Khoảng dữ liệu mặc định</span>
                <select
                  value={lookback}
                  onChange={(event) => setLookback(Number(event.target.value))}
                >
                  <option value={7}>7 ngày</option>
                  <option value={14}>14 ngày</option>
                  <option value={30}>30 ngày</option>
                  <option value={90}>90 ngày</option>
                </select>
              </label>
              <label>
                <span>So sánh mặc định</span>
                <select
                  value={compareDefault}
                  onChange={(event) =>
                    setCompareDefault(
                      event.target.value as "previous_period" | "none",
                    )
                  }
                >
                  <option value="previous_period">Kỳ trước cùng độ dài</option>
                  <option value="none">Không so sánh</option>
                </select>
              </label>
            </div>
          </section>
        ) : null}
        {currentTab === "events" ? (
          <section className="v2-panel v2-settings-section">
            <div className="v2-settings-section__intro">
              <span aria-hidden="true">
                <Check size={19} />
              </span>
              <div>
                <h2>Mapping sự kiện</h2>
                <p>
                  Chỉ quyết định action type nào được đọc từ Insights; không sửa
                  Events Manager.
                </p>
              </div>
            </div>
            <div className="v2-settings-stack">
              <ActionTypeEditor
                label="Install action types"
                values={installActions}
                onChange={setInstallActions}
              />
              <ActionTypeEditor
                label="Registration action types"
                values={registrationActions}
                onChange={setRegistrationActions}
              />
              <div className="v2-source-note">
                <ShieldCheck aria-hidden="true" size={18} />
                <div>
                  <strong>Cần đồng bộ lại sau khi đổi mapping</strong>
                  <p>
                    Các metric đã lưu không tự đổi cho đến khi Insights của
                    khoảng ngày liên quan được đồng bộ lại.
                  </p>
                </div>
                <Link className="v2-link" href="/data-health">
                  Xem chất lượng dữ liệu
                </Link>
              </div>
            </div>
          </section>
        ) : null}
        {currentTab === "benchmark" ? (
          <section className="v2-panel v2-settings-section">
            <div className="v2-settings-section__intro">
              <span aria-hidden="true">
                <CircleGauge size={19} />
              </span>
              <div>
                <h2>Benchmark & đánh giá</h2>
                <p>
                  Cohort tiền tệ luôn tách biệt; OS và định dạng có thể bật tắt
                  có chủ đích.
                </p>
              </div>
            </div>
            <div className="v2-settings-grid">
              <label>
                <span>Ngưỡng Install tối thiểu</span>
                <input
                  type="number"
                  min={1}
                  max={10_000}
                  value={minimumInstalls}
                  onChange={(event) =>
                    setMinimumInstalls(Number(event.target.value))
                  }
                />
              </label>
              <label>
                <span>Ngưỡng Registration tối thiểu</span>
                <input
                  type="number"
                  min={1}
                  max={100_000}
                  value={minimumRegistrations}
                  onChange={(event) =>
                    setMinimumRegistrations(Number(event.target.value))
                  }
                />
              </label>
              <label>
                <span>Cửa sổ benchmark</span>
                <select
                  value={benchmarkWindow}
                  onChange={(event) =>
                    setBenchmarkWindow(Number(event.target.value))
                  }
                >
                  <option value={7}>7 ngày</option>
                  <option value={14}>14 ngày</option>
                  <option value={30}>30 ngày</option>
                  <option value={60}>60 ngày</option>
                  <option value={90}>90 ngày</option>
                </select>
              </label>
              <label className="v2-settings-toggle">
                <input
                  type="checkbox"
                  checked={benchmarkByOs}
                  onChange={(event) => setBenchmarkByOs(event.target.checked)}
                />
                <span>
                  Tách theo hệ điều hành
                  <small>Android, iOS và chưa xác định.</small>
                </span>
              </label>
              <label className="v2-settings-toggle">
                <input
                  type="checkbox"
                  checked={benchmarkByFormat}
                  onChange={(event) =>
                    setBenchmarkByFormat(event.target.checked)
                  }
                />
                <span>
                  Tách theo định dạng
                  <small>Video, image và dynamic.</small>
                </span>
              </label>
            </div>
            <div className="v2-weight-grid">
              {(
                [
                  ["cpi", "CPI"],
                  ["cpa", "CPA Registration"],
                  ["hook", "Hook rate"],
                  ["hold", "Hold rate"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  <span>{label}</span>
                  <div>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={weights[key]}
                      onChange={(event) =>
                        setWeights((current) => ({
                          ...current,
                          [key]: Number(event.target.value),
                        }))
                      }
                    />
                    <span>%</span>
                  </div>
                </label>
              ))}
              <div
                className={`v2-weight-total${
                  weightTotal === 100 ? "" : " v2-weight-total--error"
                }`}
              >
                Tổng trọng số: <strong>{weightTotal}%</strong>
              </div>
            </div>
          </section>
        ) : null}
        {currentTab === "sync" ? (
          <section className="v2-panel v2-settings-section">
            <div className="v2-settings-section__intro">
              <span aria-hidden="true">
                <CalendarClock size={19} />
              </span>
              <div>
                <h2>Đồng bộ & bảo mật</h2>
                <p>
                  Trạng thái thực của token và lịch deployment; không mô phỏng
                  lịch chạy nếu hạ tầng chưa cấu hình.
                </p>
              </div>
            </div>
            <div className="v2-settings-grid">
              <label>
                <span>Nhịp đồng bộ</span>
                <select
                  value={syncCadence}
                  onChange={(event) =>
                    setSyncCadence(
                      event.target.value as "deployment" | "manual",
                    )
                  }
                >
                  <option value="deployment">Theo lịch deployment</option>
                  <option value="manual">Chỉ thủ công</option>
                </select>
                <small>
                  Lịch cụ thể được xác định bởi cấu hình deployment hiện tại.
                </small>
              </label>
              <label>
                <span>Kênh cảnh báo</span>
                <select
                  value={alertChannel}
                  onChange={(event) =>
                    setAlertChannel(
                      event.target.value as "none" | "email",
                    )
                  }
                >
                  <option value="none">Không gửi cảnh báo</option>
                  <option value="email">Email đã cấu hình ngoài ứng dụng</option>
                </select>
                <small>
                  Chọn Email chỉ khi deployment đã có dịch vụ gửi mail.
                </small>
              </label>
            </div>
            <div className="v2-security-grid">
              <article>
                <ShieldCheck aria-hidden="true" size={18} />
                <span>Quyền đã cấp</span>
                <strong>
                  {grantedScopes.length
                    ? grantedScopes.join(", ")
                    : "Chưa có kết nối"}
                </strong>
              </article>
              <article>
                <CalendarClock aria-hidden="true" size={18} />
                <span>Token hết hạn</span>
                <strong>{tokenExpiresAt ?? "Meta chưa trả thời hạn"}</strong>
              </article>
              <article>
                <CalendarClock aria-hidden="true" size={18} />
                <span>Quyền dữ liệu hết hạn</span>
                <strong>
                  {dataAccessExpiresAt ?? "Meta chưa trả thời hạn"}
                </strong>
              </article>
              <article>
                <Bell aria-hidden="true" size={18} />
                <span>Audit cài đặt</span>
                <strong>
                  {auditLog.length
                    ? `${auditLog.length} lần thay đổi`
                    : "Chưa có thay đổi"}
                </strong>
              </article>
            </div>
            <section
              className="v2-settings-audit"
              aria-labelledby="settings-audit-title"
            >
              <header>
                <div>
                  <History aria-hidden="true" size={18} />
                  <div>
                    <h3 id="settings-audit-title">Nhật ký cài đặt</h3>
                    <p>
                      Toàn bộ lịch sử cài đặt lưu trong ứng dụng. Token và bí
                      mật kết nối không thuộc nhật ký này.
                    </p>
                  </div>
                </div>
                <span className="v2-chip">
                  Chỉ đọc · {auditLog.length} bản ghi
                </span>
              </header>
              {auditLog.length ? (
                <ol className="v2-settings-audit__list">
                  {auditLog.map((entry) => (
                    <li key={entry.id}>
                      <article>
                        <header>
                          <div>
                            <strong>{entry.actorLabel}</strong>
                            <time dateTime={entry.changedAt}>
                              {entry.changedAtLabel}
                            </time>
                          </div>
                          <span>
                            {entry.changes.length
                              ? `${entry.changes.length} thay đổi`
                              : "Không có giá trị hiển thị thay đổi"}
                          </span>
                        </header>
                        {entry.changes.length ? (
                          <ul className="v2-settings-audit__changes">
                            {entry.changes.map((change) => (
                              <li key={change.key}>
                                <span>{change.label}</span>
                                <div>
                                  <span>{change.before}</span>
                                  <ArrowRight
                                    aria-label="thành"
                                    size={14}
                                  />
                                  <strong>{change.after}</strong>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {entry.hasHiddenChanges ? (
                          <p className="v2-settings-audit__hidden">
                            Một thay đổi nội bộ không thuộc các trường cài đặt
                            được phép hiển thị.
                          </p>
                        ) : null}
                      </article>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="v2-settings-audit__empty">
                  Chưa có lần lưu cài đặt nào để hiển thị.
                </p>
              )}
            </section>
            <div className="v2-manual-sync">
              <div>
                <strong>Đồng bộ thủ công</strong>
                <p>
                  Chạy incremental sync và theo dõi kết quả tại Chất lượng dữ
                  liệu.
                </p>
              </div>
              {canSave ? <SyncButton kind="incremental" /> : null}
            </div>
          </section>
        ) : null}
        <footer className="v2-settings-footer">
          <span>
            <ShieldCheck aria-hidden="true" size={16} />
            Không có thao tác nào ghi sang Meta.
          </span>
          <button
            className="button button--primary"
            disabled={
              saving ||
              !canSave ||
              !actionMapping.ok ||
              weightTotal !== 100
            }
          >
            <Save aria-hidden="true" size={16} />
            {saving ? "Đang lưu…" : "Lưu cài đặt"}
          </button>
        </footer>
      </form>
      {error ? (
        <p className="inline-notice" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="inline-notice" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}

export type { SettingsTab };
