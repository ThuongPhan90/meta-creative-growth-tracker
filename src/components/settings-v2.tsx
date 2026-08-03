"use client";

import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarClock,
  Check,
  CircleGauge,
  History,
  ListChecks,
  Plus,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { SyncButton } from "@/components/sync-button";
import { MetricDisplayPresetManager } from "@/components/metric-display-preset-manager";
import type { TrackerSettings } from "@/lib/db";
import { validateActionTypeMapping } from "@/lib/reporting/action-type-mapping";
import {
  validateResultMappings,
  type CampaignResultOverride,
  type PersistedResultMapping,
  type RawActionMetricSource,
  type ResultDefinition,
  type ResultMappingWrite,
} from "@/lib/reporting/result-definition";
import type { SettingsAuditEntryView } from "@/lib/settings-audit";

type SettingsTab = "reporting" | "results" | "benchmark" | "sync";

type SettingsReportingContract = {
  reportingTimezoneMode: "account_local";
  currencyMode: "single" | "split";
  businessIds: string[];
  adAccountIds: string[];
  defaultObjectiveKey: string;
  defaultPrimaryResultKey: string | null;
  attributionSettingKey: string;
  actionReportTime: "impression" | "conversion" | "mixed";
  syncVersion: string;
};

type SettingsResultRegistry = {
  definitions: ResultDefinition[];
  mappings: PersistedResultMapping[];
  campaignOverrides: CampaignResultOverride[];
  source: "database" | "built_in_defaults";
  warning: string | null;
};

const TABS: { value: SettingsTab; label: string }[] = [
  { value: "reporting", label: "Báo cáo" },
  { value: "results", label: "Chỉ số hiển thị" },
  { value: "benchmark", label: "Benchmark & Đánh giá" },
  { value: "sync", label: "Đồng bộ & Bảo mật" },
];

function mappingKey(
  canonicalResultKey: string,
  metricSource: RawActionMetricSource,
  rawActionType: string,
) {
  return [canonicalResultKey, metricSource, rawActionType].join(":");
}

function metricSourceFor(definition: ResultDefinition) {
  return definition.unit === "currency"
    ? ("action_value" as const)
    : ("action" as const);
}

function mappingSourceLabel(
  mapping: PersistedResultMapping | undefined,
  registrySource: SettingsResultRegistry["source"],
) {
  if (mapping?.mappingSource === "owner") return "Owner override";
  if (mapping?.mappingSource === "system") return "Seed hệ thống";
  return registrySource === "database"
    ? "Owner draft"
    : "Built-in fallback";
}

function ResultMappingEditor({
  definition,
  mappings,
  sourceByKey,
  registrySource,
  editable,
  onAdd,
  onRemove,
}: {
  definition: ResultDefinition;
  mappings: ResultMappingWrite[];
  sourceByKey: Map<string, PersistedResultMapping>;
  registrySource: SettingsResultRegistry["source"];
  editable: boolean;
  onAdd: (
    definition: ResultDefinition,
    rawActionType: string,
  ) => string | null;
  onRemove: (mapping: ResultMappingWrite) => void;
}) {
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const metricSource = metricSourceFor(definition);
  const resultMappings = mappings
    .filter(
      (mapping) =>
        mapping.canonicalResultKey === definition.canonicalKey &&
        mapping.metricSource === metricSource,
    )
    .sort((left, right) => left.priority - right.priority);

  function add() {
    const error = onAdd(definition, draft);
    setDraftError(error);
    if (!error) setDraft("");
  }

  return (
    <fieldset className="v2-action-editor">
      <legend>{definition.label}</legend>
      <small>
        {definition.canonicalKey} · Objective:{" "}
        {definition.objectiveKeys.join(", ") || "không giới hạn"} ·{" "}
        {metricSource}
      </small>
      <div className="v2-action-editor__chips">
        {resultMappings.map((mapping) => (
          <span
            className="v2-action-chip"
            title={mappingSourceLabel(
              sourceByKey.get(
                mappingKey(
                  mapping.canonicalResultKey,
                  mapping.metricSource,
                  mapping.rawActionType,
                ),
              ),
              registrySource,
            )}
            key={mappingKey(
              mapping.canonicalResultKey,
              mapping.metricSource,
              mapping.rawActionType,
            )}
          >
            {mapping.rawActionType}
            <button
              type="button"
              aria-label={`Xóa ${mapping.rawActionType} khỏi ${definition.label}`}
              disabled={!editable}
              onClick={() => onRemove(mapping)}
            >
              <Trash2 aria-hidden="true" size={13} />
            </button>
          </span>
        ))}
        {resultMappings.length === 0 ? (
          <span className="v2-chip v2-chip--warning">Chưa có raw alias</span>
        ) : null}
      </div>
      <div className="v2-action-editor__input">
        <input
          value={draft}
          disabled={!editable}
          aria-label={`Raw action type cho ${definition.label}`}
          onChange={(event) => {
            setDraft(event.target.value);
            setDraftError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder={
            editable ? "Thêm raw action type" : "Mapping chỉ đọc"
          }
          spellCheck={false}
        />
        <button
          className="button button--secondary"
          type="button"
          disabled={!editable}
          onClick={add}
        >
          <Plus aria-hidden="true" size={15} />
          Thêm
        </button>
      </div>
      {draftError ? (
        <small role="alert">{draftError}</small>
      ) : (
        <small>
          Tối thiểu {definition.minimumImpressions.toLocaleString("vi-VN")}{" "}
          impressions và {definition.minimumResults} results để đánh giá.
        </small>
      )}
    </fieldset>
  );
}

export function SettingsV2({
  initial,
  activeTab,
  reportingContract,
  resultRegistry,
  auditLog,
  canSave,
  tokenExpiresAt,
  dataAccessExpiresAt,
  grantedScopes,
}: {
  initial: TrackerSettings;
  activeTab: SettingsTab;
  reportingContract: SettingsReportingContract;
  resultRegistry: SettingsResultRegistry;
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
  const [benchmarkWindow, setBenchmarkWindow] = useState(
    [7, 14, 30].includes(initial.benchmarkWindowDays)
      ? initial.benchmarkWindowDays
      : 30,
  );
  const [benchmarkByOs, setBenchmarkByOs] = useState(initial.benchmarkByOs);
  const [benchmarkByFormat, setBenchmarkByFormat] = useState(
    initial.benchmarkByFormat,
  );
  const [syncCadence, setSyncCadence] = useState(initial.syncCadence);
  const [alertChannel, setAlertChannel] = useState(initial.alertChannel);
  const [currentTab, setCurrentTab] = useState(activeTab);
  const [resultMappings, setResultMappings] = useState<ResultMappingWrite[]>(
    resultRegistry.mappings
      .filter((mapping) => mapping.enabled)
      .map((mapping) => ({
        canonicalResultKey: mapping.canonicalResultKey,
        rawActionType: mapping.rawActionType,
        metricSource: mapping.metricSource,
        priority: mapping.priority,
        enabled: true,
      })),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const legacyActionMapping = useMemo(
    () =>
      validateActionTypeMapping({
        installActionTypes: initial.installActionTypes,
        registrationActionTypes: initial.registrationActionTypes,
      }),
    [initial.installActionTypes, initial.registrationActionTypes],
  );
  const legacyWeightTotal =
    initial.scoringWeights.cpi +
    initial.scoringWeights.cpa +
    initial.scoringWeights.hook +
    initial.scoringWeights.hold;
  const resultMappingValidation = useMemo(
    () =>
      validateResultMappings({
        mappings: resultMappings,
        definitions: resultRegistry.definitions,
      }),
    [resultMappings, resultRegistry.definitions],
  );
  const sourceByKey = useMemo(
    () =>
      new Map(
        resultRegistry.mappings.map((mapping) => [
          mappingKey(
            mapping.canonicalResultKey,
            mapping.metricSource,
            mapping.rawActionType,
          ),
          mapping,
        ]),
      ),
    [resultRegistry.mappings],
  );
  const totalAliases = resultMappings.length;
  const mappedResults = new Set(
    resultMappings.map((mapping) => mapping.canonicalResultKey),
  ).size;
  const resultMappingEditable =
    canSave && resultRegistry.source === "database";

  useEffect(() => {
    function syncTabFromUrl() {
      const requested = new URL(window.location.href).searchParams.get("tab");
      const normalized = requested === "events" ? "results" : requested;
      const valid = TABS.some((tab) => tab.value === normalized);
      setCurrentTab(valid ? (normalized as SettingsTab) : "reporting");
    }
    window.addEventListener("popstate", syncTabFromUrl);
    return () => window.removeEventListener("popstate", syncTabFromUrl);
  }, []);

  function selectTab(tab: SettingsTab) {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.pushState(null, "", url);
    setCurrentTab(tab);
    setMessage(null);
    setError(null);
  }

  function addResultMapping(
    definition: ResultDefinition,
    rawActionType: string,
  ) {
    const normalized = rawActionType.trim();
    if (!normalized) return "Hãy nhập raw action type.";
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(normalized)) {
      return "Raw action type chỉ dùng chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.";
    }
    const metricSource = metricSourceFor(definition);
    if (
      resultMappings.some(
        (mapping) =>
          mapping.metricSource === metricSource &&
          mapping.rawActionType === normalized,
      )
    ) {
      return "Raw action type này đã thuộc một canonical Result.";
    }
    const priority =
      Math.max(
        -1,
        ...resultMappings
          .filter(
            (mapping) =>
              mapping.canonicalResultKey === definition.canonicalKey &&
              mapping.metricSource === metricSource,
          )
          .map((mapping) => mapping.priority),
      ) + 1;
    setResultMappings((current) => [
      ...current,
      {
        canonicalResultKey: definition.canonicalKey,
        rawActionType: normalized,
        metricSource,
        priority,
        enabled: true,
      },
    ]);
    return null;
  }

  function removeResultMapping(mapping: ResultMappingWrite) {
    setResultMappings((current) =>
      current.filter(
        (candidate) =>
          mappingKey(
            candidate.canonicalResultKey,
            candidate.metricSource,
            candidate.rawActionType,
          ) !==
          mappingKey(
            mapping.canonicalResultKey,
            mapping.metricSource,
            mapping.rawActionType,
          ),
      ),
    );
  }

  async function saveResultRegistry() {
    if (!resultMappingEditable) {
      setError(
        resultRegistry.source === "database"
          ? "Cần phiên owner đã kết nối Meta để lưu Result Mapping."
          : "Built-in fallback chỉ đọc; không thể lưu đè lên registry owner.",
      );
      return;
    }
    if (resultMappings.length === 0) {
      setError("Result Registry phải còn ít nhất một raw action mapping.");
      return;
    }
    if (!resultMappingValidation.ok) {
      setError(resultMappingValidation.error);
      return;
    }

    const response = await fetch("/api/result-mappings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mappings: resultMappingValidation.mappings,
      }),
    });
    const result = (await response.json()) as {
      message?: string;
      error?: string;
      data?: {
        message?: string;
      };
    };
    if (!response.ok) {
      throw new Error(result.error ?? "Không thể lưu Result Mapping.");
    }
    setMessage(
      result.data?.message ??
        result.message ??
        "Đã lưu Result Mapping.",
    );
  }

  async function saveSettings() {
    if (!canSave) {
      setError("Cần phiên owner đã kết nối Meta để lưu cài đặt.");
      return;
    }
    if (!legacyActionMapping.ok) {
      setError(legacyActionMapping.error);
      return;
    }
    if (legacyWeightTotal !== 100) {
      setError(
        "Cấu hình chấm điểm legacy không hợp lệ; tổng trọng số phải bằng 100%.",
      );
      return;
    }

    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timezone,
        reportingCurrency: currency || null,
        numberFormat,
        compareDefault,
        lookbackDays: lookback,
        minimumInstallThreshold: initial.minimumInstallThreshold,
        minimumRegistrationThreshold:
          initial.minimumRegistrationThreshold,
        benchmarkMode: "custom",
        benchmarkWindowDays: benchmarkWindow,
        benchmarkByOs,
        benchmarkByFormat,
        scoringWeights: initial.scoringWeights,
        syncCadence,
        alertChannel,
        installActionTypes: legacyActionMapping.installActionTypes,
        registrationActionTypes:
          legacyActionMapping.registrationActionTypes,
      }),
    });
    const result = (await response.json()) as {
      message?: string;
      error?: string;
    };
    if (!response.ok) throw new Error(result.error ?? "Không thể lưu.");
    setMessage(result.message ?? "Đã lưu cài đặt.");
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setSaving(true);
    try {
      if (currentTab === "results") {
        await saveResultRegistry();
      } else {
        await saveSettings();
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Không thể lưu cài đặt.",
      );
    } finally {
      setSaving(false);
    }
  }

  const scopeLabel =
    reportingContract.businessIds.length ||
    reportingContract.adAccountIds.length
      ? `${reportingContract.businessIds.length} Business · ${reportingContract.adAccountIds.length} Ad Account`
      : "Chưa xác nhận scope mặc định";
  const resultSaveDisabled =
    !resultMappingEditable ||
    resultMappings.length === 0 ||
    !resultMappingValidation.ok;
  const settingsSaveDisabled =
    !canSave || !legacyActionMapping.ok || legacyWeightTotal !== 100;

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div>
          <h1>Cài đặt</h1>
          <p>
            Thiết lập reporting contract, Result Mapping, benchmark và đồng
            bộ nội bộ; ứng dụng không ghi thay đổi sang Meta.
          </p>
        </div>
        <span className="v2-chip v2-chip--success">
          <ShieldCheck aria-hidden="true" size={14} />
          Meta read-only
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
                  Các trường có thể lưu dùng API Settings; trường contract
                  chưa có API được khóa và ghi rõ nguồn.
                </p>
              </div>
            </div>

            <div className="v2-settings-grid">
              <label>
                <span>Múi giờ hiển thị ứng dụng</span>
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
                  Có API lưu. Metric vẫn giữ ngày account-local của nguồn.
                </small>
              </label>
              <label>
                <span>Chế độ tiền tệ</span>
                <select
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                >
                  <option value="">Tách theo từng tài khoản</option>
                  <option value="VND">Một tiền tệ: VND</option>
                  <option value="USD">Một tiền tệ: USD</option>
                  <option value="SGD">Một tiền tệ: SGD</option>
                </select>
                <small>
                  Có API lưu. Không quy đổi tỷ giá hoặc cộng chéo tiền tệ.
                </small>
              </label>
              <label>
                <span>Định dạng số</span>
                <select
                  value={numberFormat}
                  onChange={(event) =>
                    setNumberFormat(
                      event.target.value as "vi-VN" | "en-US",
                    )
                  }
                >
                  <option value="vi-VN">Việt Nam (1.234,56)</option>
                  <option value="en-US">Quốc tế (1,234.56)</option>
                </select>
                <small>Có API lưu.</small>
              </label>
              <label>
                <span>Khoảng ngày mặc định</span>
                <select
                  value={lookback}
                  onChange={(event) => setLookback(Number(event.target.value))}
                >
                  <option value={7}>7 ngày</option>
                  <option value={14}>14 ngày</option>
                  <option value={30}>30 ngày</option>
                  <option value={90}>90 ngày</option>
                </select>
                <small>Có API lưu.</small>
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
                  <option value="previous_period">
                    Kỳ trước cùng độ dài
                  </option>
                  <option value="none">Không so sánh</option>
                </select>
                <small>Có API lưu.</small>
              </label>
              <label>
                <span>Business / Ad Account mặc định</span>
                <input disabled value={scopeLabel} readOnly />
                <small>
                  Scope chỉ đọc tại đây.{" "}
                  <Link className="v2-link" href="/sources?tab=scope">
                    Quản lý tại Nguồn dữ liệu
                  </Link>
                  .
                </small>
              </label>
              <label>
                <span>Default Objective</span>
                <input
                  disabled
                  value={reportingContract.defaultObjectiveKey}
                  readOnly
                />
                <small>Chưa có API lưu workspace default.</small>
              </label>
              <label>
                <span>Default Primary Result</span>
                <input
                  disabled
                  value={
                    reportingContract.defaultPrimaryResultKey ??
                    "Theo Objective + Result Registry"
                  }
                  readOnly
                />
                <small>Chưa có API lưu workspace default.</small>
              </label>
            </div>

            <div className="v2-security-grid">
              <article>
                <CalendarClock aria-hidden="true" size={18} />
                <span title="Ngày metric giữ theo múi giờ của từng Ad Account">
                  Reporting timezone mode
                </span>
                <strong>account_local</strong>
              </article>
              <article>
                <CircleGauge aria-hidden="true" size={18} />
                <span title="Single chỉ lọc một currency; split không cộng chéo currency">
                  Currency mode
                </span>
                <strong>{reportingContract.currencyMode}</strong>
              </article>
              <article>
                <Check aria-hidden="true" size={18} />
                <span title="Attribution setting dùng nhất quán cho mọi màn báo cáo">
                  Attribution setting
                </span>
                <strong>{reportingContract.attributionSettingKey}</strong>
              </article>
              <article>
                <History aria-hidden="true" size={18} />
                <span title="Thời điểm Meta gán action cho ngày báo cáo">
                  Action report time
                </span>
                <strong>{reportingContract.actionReportTime}</strong>
              </article>
              <article>
                <ShieldCheck aria-hidden="true" size={18} />
                <span>Sync version</span>
                <strong>{reportingContract.syncVersion}</strong>
              </article>
            </div>

            <div className="v2-source-note">
              <ShieldCheck aria-hidden="true" size={18} />
              <div>
                <strong>Contract được hiển thị, không bị âm thầm đổi</strong>
                <p>
                  Attribution và action report time là tham số đọc dữ liệu,
                  không phải thao tác chỉnh quảng cáo. Trường chỉ đọc sẽ chỉ
                  mở khi có API lưu tương ứng.
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {currentTab === "results" ? (
          <section className="v2-panel v2-settings-section">
            <div className="v2-settings-section__intro">
              <span aria-hidden="true">
                <ListChecks size={19} />
              </span>
              <div>
                <h2>Chỉ số hiển thị</h2>
                <p>
                  Metric preset được lưu theo Objective + Primary Result; Result
                  Mapping bên dưới quyết định dữ liệu Meta đủ điều kiện cho từng chỉ số.
                  Install chỉ là một Result, không phải mặc định bắt buộc cho mọi buyer.
                </p>
              </div>
            </div>

            {resultRegistry.warning ? (
              <div className="v2-source-note" role="status">
                <AlertTriangle aria-hidden="true" size={18} />
                <div>
                  <strong>Đang dùng fallback chỉ đọc</strong>
                  <p>{resultRegistry.warning}</p>
                </div>
              </div>
            ) : null}

            <div className="v2-source-note">
              <SlidersHorizontal aria-hidden="true" size={18} />
              <div>
                <strong>Metric preset theo Objective + Primary Result</strong>
                <p>
                  Spend, Primary Result và Efficiency luôn được khóa. Bạn có thể
                  thêm tối đa hai chỉ số phụ, khôi phục mặc định hoặc lưu preset
                  từ nút “Tùy chỉnh chỉ số” trên Tổng quan.
                </p>
              </div>
              <Link className="v2-link" href="/overview">
                Mở Tổng quan
              </Link>
            </div>

            <MetricDisplayPresetManager
              key={initial.updatedAt}
              initialPresets={initial.metricDisplayPresets}
              initialUpdatedAt={initial.updatedAt}
              resultDefinitions={resultRegistry.definitions}
              currencyMode={reportingContract.currencyMode}
              canSave={canSave}
            />

            <div className="v2-security-grid">
              <article>
                <ListChecks aria-hidden="true" size={18} />
                <span>Result definitions</span>
                <strong>{resultRegistry.definitions.length} canonical results</strong>
              </article>
              <a
                className="v2-security-card-link"
                href="#result-mapping-coverage"
                aria-label="Mở chi tiết Mapping coverage"
              >
                <Check aria-hidden="true" size={18} />
                <span>Mapping coverage preview</span>
                <strong>
                  {mappedResults}/{resultRegistry.definitions.length} results ·{" "}
                  {totalAliases} raw aliases
                </strong>
                <ArrowRight aria-hidden="true" size={16} />
              </a>
              <article>
                <ShieldCheck aria-hidden="true" size={18} />
                <span>Nguồn registry</span>
                <strong>
                  {resultRegistry.source === "database"
                    ? "Database owner"
                    : "Built-in defaults"}
                </strong>
              </article>
              <article>
                <History aria-hidden="true" size={18} />
                <span>Campaign override hiện có</span>
                <strong>
                  {resultRegistry.campaignOverrides.length} override · chỉ đọc
                </strong>
              </article>
            </div>

            <section
              className="v2-settings-stack"
              id="result-mapping-coverage"
              aria-label="Chi tiết Mapping coverage"
              tabIndex={-1}
            >
              {resultRegistry.definitions.map((definition) => (
                <ResultMappingEditor
                  definition={definition}
                  mappings={resultMappings}
                  sourceByKey={sourceByKey}
                  registrySource={resultRegistry.source}
                  editable={resultMappingEditable}
                  onAdd={addResultMapping}
                  onRemove={removeResultMapping}
                  key={definition.id}
                />
              ))}
            </section>

            <div className="v2-settings-grid">
              <label>
                <span>Campaign override</span>
                <input
                  disabled
                  value={`${resultRegistry.campaignOverrides.length} cấu hình`}
                  readOnly
                />
                <small>
                  Backend hiện chỉ đọc override; Settings chưa có API lưu.
                </small>
              </label>
              <label>
                <span>Secondary Result</span>
                <input disabled value="Chưa cấu hình" readOnly />
                <small>Chưa có API lưu.</small>
              </label>
              <label>
                <span>Funnel stage</span>
                <input disabled value="Theo Result definition" readOnly />
                <small>Chưa có API lưu.</small>
              </label>
            </div>

            {!resultMappingValidation.ok ? (
              <div className="v2-source-note" role="alert">
                <AlertTriangle aria-hidden="true" size={18} />
                <div>
                  <strong>Mapping chưa hợp lệ</strong>
                  <p>{resultMappingValidation.error}</p>
                </div>
              </div>
            ) : null}

            <div className="v2-source-note">
              <ShieldCheck aria-hidden="true" size={18} />
              <div>
                <strong>Meta-attributed · không khóa vào Install</strong>
                <p>
                  Mapping chỉ đổi cách ứng dụng đọc Insights và benchmark nội
                  bộ. Không tạo event, không chỉnh Campaign, không ghi sang
                  Meta.
                </p>
              </div>
              <Link className="v2-link" href="/sources?tab=results">
                Xem registry tại Nguồn
              </Link>
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
                <h2>Benchmark &amp; Đánh giá</h2>
                <p>
                  Cohort minh bạch theo Account, Objective, Result, Format,
                  Currency và cửa sổ thời gian.
                </p>
              </div>
            </div>

            <div className="v2-settings-grid">
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
                </select>
                <small>Có API lưu. Chỉ hỗ trợ 7, 14 hoặc 30 ngày.</small>
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
                  <small>Video, image và dynamic. Có API lưu.</small>
                </span>
              </label>
              <label className="v2-settings-toggle">
                <input
                  type="checkbox"
                  checked={benchmarkByOs}
                  onChange={(event) => setBenchmarkByOs(event.target.checked)}
                />
                <span>
                  Tách thêm theo hệ điều hành
                  <small>Android, iOS và chưa xác định. Có API lưu.</small>
                </span>
              </label>
            </div>

            <div className="v2-security-grid">
              <article>
                <CircleGauge aria-hidden="true" size={18} />
                <span>Minimum impressions</span>
                <strong>1.000 mặc định · theo từng Result</strong>
              </article>
              <article>
                <Check aria-hidden="true" size={18} />
                <span>Minimum results</span>
                <strong>5 mặc định · theo từng Result</strong>
              </article>
              <article>
                <ArrowRight aria-hidden="true" size={18} />
                <span>Ngưỡng tốt hơn / kém hơn</span>
                <strong>±15% · chưa có API lưu</strong>
              </article>
              <article>
                <CalendarClock aria-hidden="true" size={18} />
                <span>Cửa sổ fatigue</span>
                <strong>Chưa cấu hình · chưa có API lưu</strong>
              </article>
            </div>

            <div className="v2-source-note">
              <CircleGauge aria-hidden="true" size={18} />
              <div>
                <strong>Không dựng benchmark giả</strong>
                <p>
                  Creative chỉ đủ điều kiện khi đạt ngưỡng impressions và đủ
                  results, hoặc spend đủ để đánh giá theo cost median. Khi
                  cohort hẹp không đủ dữ liệu, fallback lần lượt: Ad Account +
                  Objective + Result + Format; Ad Account + Objective + Result;
                  Selected Business + Objective + Result + Format; Selected
                  scope + Objective + Result. Sau đó phải báo “Chưa đủ mẫu so
                  sánh”; không trộn currency.
                </p>
              </div>
            </div>
            <div className="v2-source-note">
              <ShieldCheck aria-hidden="true" size={18} />
              <div>
                <strong>Chỉ hỗ trợ quyết định</strong>
                <p>
                  Điểm performance và tín hiệu fatigue là hai lớp riêng. Ứng
                  dụng không tự đổi budget, pause ad hoặc ghi quyết định sang
                  Meta.
                </p>
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
                <h2>Đồng bộ &amp; Bảo mật</h2>
                <p>
                  Nhịp sync, token, permission scope, backfill và audit được
                  phân biệt rõ giữa trạng thái thật và khả năng chưa có API.
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
                  Có API lưu. Lịch cụ thể do deployment đang chạy quyết định.
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
                  <option value="email">
                    Email đã cấu hình ngoài ứng dụng
                  </option>
                </select>
                <small>
                  Có API lưu; chọn Email không tự tạo dịch vụ gửi mail.
                </small>
              </label>
              <label>
                <span>Backfill lịch sử</span>
                <input disabled value="Chưa có API backfill tại Settings" readOnly />
                <small>
                  Không tạo nút chạy giả. Khi có endpoint an toàn, control mới
                  được mở.
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
                      Lịch sử cài đặt nội bộ. Token và bí mật kết nối không
                      xuất hiện trong nhật ký này.
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
                            Một thay đổi nội bộ không thuộc các trường được
                            phép hiển thị.
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
              {canSave ? (
                <SyncButton kind="incremental" />
              ) : (
                <span className="v2-chip v2-chip--warning">
                  Cần phiên owner
                </span>
              )}
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
              (currentTab === "results"
                ? resultSaveDisabled
                : settingsSaveDisabled)
            }
          >
            <Save aria-hidden="true" size={16} />
            {saving
              ? "Đang lưu…"
              : currentTab === "results"
                ? resultMappingEditable
                  ? "Lưu Result Mapping"
                  : "Result Mapping chỉ đọc"
                : "Lưu cài đặt"}
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

export type {
  SettingsReportingContract,
  SettingsResultRegistry,
  SettingsTab,
};
