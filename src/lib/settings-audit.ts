import type {
  JsonObject,
  JsonValue,
  SettingsAuditRecord,
} from "@/lib/db";

export interface SettingsAuditChangeView {
  key: string;
  label: string;
  before: string;
  after: string;
}

export interface SettingsAuditEntryView {
  id: string;
  changedAt: string;
  changedAtLabel: string;
  actorLabel: string;
  changes: SettingsAuditChangeView[];
  hasHiddenChanges: boolean;
}

interface AuditedField {
  path: readonly string[];
  label: string;
}

const AUDITED_FIELDS: readonly AuditedField[] = [
  { path: ["reportingTimezone"], label: "Múi giờ báo cáo" },
  { path: ["reportingCurrency"], label: "Tiền tệ báo cáo" },
  { path: ["syncLookbackDays"], label: "Khoảng dữ liệu mặc định" },
  {
    path: ["minimumInstallThreshold"],
    label: "Ngưỡng Install tối thiểu",
  },
  {
    path: ["minimumRegistrationThreshold"],
    label: "Ngưỡng Registration tối thiểu",
  },
  { path: ["benchmarkMode"], label: "Chế độ benchmark" },
  { path: ["benchmarkWindowDays"], label: "Cửa sổ benchmark" },
  { path: ["benchmarkByOs"], label: "Benchmark theo hệ điều hành" },
  { path: ["benchmarkByFormat"], label: "Benchmark theo định dạng" },
  { path: ["numberFormat"], label: "Định dạng số" },
  { path: ["compareDefault"], label: "So sánh mặc định" },
  { path: ["scoringWeights", "cpi"], label: "Trọng số CPI" },
  {
    path: ["scoringWeights", "cpa"],
    label: "Trọng số CPA Registration",
  },
  { path: ["scoringWeights", "hook"], label: "Trọng số Hook rate" },
  { path: ["scoringWeights", "hold"], label: "Trọng số Hold rate" },
  { path: ["syncCadence"], label: "Nhịp đồng bộ" },
  { path: ["alertChannel"], label: "Kênh cảnh báo" },
  { path: ["installActionTypes"], label: "Install action types" },
  {
    path: ["registrationActionTypes"],
    label: "Registration action types",
  },
  { path: ["lastInitialSyncAt"], label: "Đồng bộ ban đầu gần nhất" },
];

const KNOWN_ROOT_KEYS = new Set([
  ...AUDITED_FIELDS.map((field) => field.path[0]),
  "ownerId",
  "updatedAt",
]);

function getValue(
  object: JsonObject,
  path: readonly string[],
): JsonValue | undefined {
  let value: JsonValue | undefined = object;
  for (const segment of path) {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      return undefined;
    }
    value = value[segment];
  }
  return value;
}

function valuesMatch(left: JsonValue | undefined, right: JsonValue | undefined) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function formatDate(value: string, timeZone: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Không xác định";

  try {
    return new Intl.DateTimeFormat("vi-VN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("vi-VN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date);
  }
}

function formatValue(
  key: string,
  value: JsonValue | undefined,
  timeZone: string,
) {
  if (value === undefined) return "Chưa có";
  if (value === null) {
    return key === "reportingCurrency" ? "Theo từng tài khoản" : "Chưa đặt";
  }
  if (Array.isArray(value)) {
    return value.length ? value.map(String).join(" · ") : "Không có";
  }
  if (typeof value === "boolean") return value ? "Bật" : "Tắt";

  if (key === "reportingTimezone" && value === "Asia/Ho_Chi_Minh") {
    return "Hồ Chí Minh · GMT+7";
  }
  if (key === "compareDefault") {
    return value === "previous_period"
      ? "Kỳ trước cùng độ dài"
      : "Không so sánh";
  }
  if (key === "numberFormat") {
    return value === "vi-VN"
      ? "Việt Nam (1.234,56)"
      : "Quốc tế (1,234.56)";
  }
  if (key === "syncCadence") {
    return value === "deployment"
      ? "Theo lịch deployment"
      : "Chỉ thủ công";
  }
  if (key === "alertChannel") {
    return value === "email" ? "Email" : "Không gửi cảnh báo";
  }
  if (key === "benchmarkMode") {
    if (value === "account_os_event") return "Tài khoản · OS · sự kiện";
    if (value === "os") return "Theo hệ điều hành";
    return "Tùy chỉnh";
  }
  if (key === "lastInitialSyncAt" && typeof value === "string") {
    return formatDate(value, timeZone);
  }
  if (key.startsWith("scoringWeights.")) return `${String(value)}%`;
  if (
    key === "syncLookbackDays" ||
    key === "benchmarkWindowDays"
  ) {
    return `${String(value)} ngày`;
  }

  return String(value);
}

function actorLabel(changedBy: string) {
  if (changedBy === "owner") return "Owner";
  if (changedBy === "sync") return "Đồng bộ hệ thống";
  if (changedBy === "system") return "Hệ thống";
  return "Tác nhân nội bộ";
}

export function toSettingsAuditView(
  records: readonly SettingsAuditRecord[],
  timeZone: string,
): SettingsAuditEntryView[] {
  return records.map((record) => {
    const changes = AUDITED_FIELDS.flatMap((field) => {
      const before = getValue(record.beforeState, field.path);
      const after = getValue(record.afterState, field.path);
      if (valuesMatch(before, after)) return [];

      const key = field.path.join(".");
      return [
        {
          key,
          label: field.label,
          before: formatValue(key, before, timeZone),
          after: formatValue(key, after, timeZone),
        },
      ];
    });
    const candidateRootKeys = new Set([
      ...Object.keys(record.beforeState),
      ...Object.keys(record.afterState),
    ]);
    const hasHiddenChanges = [...candidateRootKeys].some(
      (key) =>
        !KNOWN_ROOT_KEYS.has(key) &&
        !valuesMatch(record.beforeState[key], record.afterState[key]),
    );

    return {
      id: record.settingsAuditId,
      changedAt: record.changedAt,
      changedAtLabel: formatDate(record.changedAt, timeZone),
      actorLabel: actorLabel(record.changedBy),
      changes,
      hasHiddenChanges,
    };
  });
}

export const demoSettingsAuditRecords: readonly SettingsAuditRecord[] = [
  {
    settingsAuditId: "demo-settings-audit-3",
    changedAt: "2026-07-29T09:42:00.000Z",
    changedBy: "owner",
    beforeState: {
      reportingCurrency: null,
      compareDefault: "none",
    },
    afterState: {
      reportingCurrency: "VND",
      compareDefault: "previous_period",
    },
  },
  {
    settingsAuditId: "demo-settings-audit-2",
    changedAt: "2026-07-28T03:15:00.000Z",
    changedBy: "owner",
    beforeState: {
      installActionTypes: ["mobile_app_install", "app_install"],
      registrationActionTypes: ["complete_registration"],
    },
    afterState: {
      installActionTypes: [
        "mobile_app_install",
        "omni_app_install",
        "app_install",
      ],
      registrationActionTypes: [
        "complete_registration",
        "omni_complete_registration",
      ],
    },
  },
  {
    settingsAuditId: "demo-settings-audit-1",
    changedAt: "2026-07-26T12:08:00.000Z",
    changedBy: "owner",
    beforeState: {
      benchmarkWindowDays: 14,
      scoringWeights: { cpi: 50, cpa: 30, hook: 10, hold: 10 },
      syncCadence: "manual",
    },
    afterState: {
      benchmarkWindowDays: 30,
      scoringWeights: { cpi: 40, cpa: 40, hook: 10, hold: 10 },
      syncCadence: "deployment",
    },
  },
];
