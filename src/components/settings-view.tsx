"use client";

import { Save, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import {
  parseActionTypesInput,
  validateActionTypeMapping,
} from "@/lib/reporting/action-type-mapping";

export function SettingsView({
  initialTimezone,
  initialLookback,
  initialMinimumInstalls,
  initialInstallActionTypes,
  initialRegistrationActionTypes,
  canSave,
}: {
  initialTimezone: string;
  initialLookback: number;
  initialMinimumInstalls: number;
  initialInstallActionTypes: string[];
  initialRegistrationActionTypes: string[];
  canSave: boolean;
}) {
  const [timezone, setTimezone] = useState(initialTimezone);
  const [lookback, setLookback] = useState(initialLookback);
  const [minimumInstalls, setMinimumInstalls] = useState(
    initialMinimumInstalls,
  );
  const [installActionTypes, setInstallActionTypes] = useState(
    initialInstallActionTypes.join(", "),
  );
  const [registrationActionTypes, setRegistrationActionTypes] =
    useState(initialRegistrationActionTypes.join(", "));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const actionTypeMapping = validateActionTypeMapping({
    installActionTypes: parseActionTypesInput(installActionTypes),
    registrationActionTypes: parseActionTypesInput(
      registrationActionTypes,
    ),
  });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) {
      setMessage("Kết nối Meta với phiên owner để lưu cài đặt Live.");
      return;
    }
    if (!actionTypeMapping.ok) {
      setMessage(actionTypeMapping.error);
      return;
    }
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timezone,
          lookbackDays: lookback,
          minimumInstallThreshold: minimumInstalls,
          installActionTypes: actionTypeMapping.installActionTypes,
          registrationActionTypes:
            actionTypeMapping.registrationActionTypes,
        }),
      });
      const result = (await response.json()) as {
        message?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "Không thể lưu.");
      setInstallActionTypes(
        actionTypeMapping.installActionTypes.join(", "),
      );
      setRegistrationActionTypes(
        actionTypeMapping.registrationActionTypes.join(", "),
      );
      setMessage(result.message ?? "Đã lưu cài đặt.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Có lỗi xảy ra.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-page">
      <PageHeader
        title="Cài đặt"
        description="Cấu hình báo cáo của deployment cá nhân."
      />

      <form className="settings-form" onSubmit={submit}>
        <section>
          <div className="settings-form__heading">
            <h2>Báo cáo</h2>
            <p>Không thay đổi thiết lập trong Ads Manager.</p>
          </div>
          <label>
            <span>Reporting timezone</span>
            <select
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
            >
              <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh</option>
              <option value="UTC">UTC</option>
              <option value="Asia/Singapore">Asia/Singapore</option>
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
            <span>Ngưỡng đủ dữ liệu (install)</span>
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
        </section>

        <section>
          <div className="settings-form__heading">
            <h2>Meta-attributed events</h2>
            <p>
              Danh sách action type, phân tách bằng dấu phẩy. Chỉ thay đổi
              cách webapp đọc Insights, không chỉnh Events Manager. Sau khi
              đổi mapping, hãy sync lại khoảng ngày cần đối soát.
            </p>
          </div>
          <label>
            <span>Install action types</span>
            <input
              value={installActionTypes}
              aria-describedby={
                actionTypeMapping.ok
                  ? undefined
                  : "action-type-mapping-error"
              }
              aria-invalid={!actionTypeMapping.ok}
              onChange={(event) => {
                setInstallActionTypes(event.target.value);
                setMessage(null);
              }}
              spellCheck={false}
            />
          </label>
          <label>
            <span>Registration action types</span>
            <input
              value={registrationActionTypes}
              aria-describedby={
                actionTypeMapping.ok
                  ? undefined
                  : "action-type-mapping-error"
              }
              aria-invalid={!actionTypeMapping.ok}
              onChange={(event) => {
                setRegistrationActionTypes(event.target.value);
                setMessage(null);
              }}
              spellCheck={false}
            />
          </label>
          {!actionTypeMapping.ok ? (
            <p
              className="inline-notice"
              id="action-type-mapping-error"
              role="alert"
            >
              {actionTypeMapping.error}
            </p>
          ) : null}
        </section>

        <section>
          <div className="settings-form__heading">
            <h2>Metric contract</h2>
            <p>Các quy tắc cố định của MVP.</p>
          </div>
          <dl className="metric-contract">
            <div>
              <dt>Link CTR</dt>
              <dd>Inline link clicks ÷ impressions</dd>
            </div>
            <div>
              <dt>CPI</dt>
              <dd>Spend ÷ Meta-attributed installs</dd>
            </div>
            <div>
              <dt>CPA Registration</dt>
              <dd>Spend ÷ Meta-attributed registrations</dd>
            </div>
            <div>
              <dt>Đủ dữ liệu</dt>
              <dd>Tối thiểu {minimumInstalls} installs</dd>
            </div>
          </dl>
        </section>

        <div className="settings-form__footer">
          <span>
            <ShieldCheck aria-hidden="true" size={16} />
            Chỉ ảnh hưởng đồng bộ và báo cáo trong webapp; không ghi sang Meta.
          </span>
          <button
            className="button button--primary"
            disabled={saving || !canSave || !actionTypeMapping.ok}
          >
            <Save aria-hidden="true" size={16} />
            {saving ? "Đang lưu" : canSave ? "Lưu cài đặt" : "Chưa thể lưu"}
          </button>
        </div>
      </form>

      {message ? (
        <p className="inline-notice" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
