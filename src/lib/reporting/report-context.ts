export type ReportComparison = "previous_period" | "none";
export type ReportingCurrencyMode = "single" | "split";
export type ReportingTimezoneMode = "account_local";
export type ReportingActionReportTime =
  | "impression"
  | "conversion"
  | "mixed";

type ReportContextQueryValue =
  | string
  | readonly string[]
  | null
  | undefined;

export type ReportContextQuery = {
  /** Canonical V2 query fields. */
  businessIds?: ReportContextQueryValue;
  adAccountIds?: ReportContextQueryValue;
  dateFrom?: ReportContextQueryValue;
  dateTo?: ReportContextQueryValue;
  compareMode?: ReportContextQueryValue;
  objectiveKey?: ReportContextQueryValue;
  primaryResultKey?: ReportContextQueryValue;
  currency?: ReportContextQueryValue;
  currencyMode?: ReportContextQueryValue;
  reportingTimezoneMode?: ReportContextQueryValue;
  attributionSettingKey?: ReportContextQueryValue;
  actionReportTime?: ReportContextQueryValue;
  syncVersion?: ReportContextQueryValue;

  /** Legacy query fields retained while existing screens migrate to V2. */
  business?: ReportContextQueryValue;
  businesses?: ReportContextQueryValue;
  account?: ReportContextQueryValue;
  accounts?: ReportContextQueryValue;
  from?: ReportContextQueryValue;
  to?: ReportContextQueryValue;
  compare?: ReportContextQueryValue;
  objective?: ReportContextQueryValue;
  result?: ReportContextQueryValue;
};

/**
 * The canonical, serializable reporting contract shared by every reporting
 * screen and API response.
 */
export type ReportingContext = {
  businessIds: string[];
  adAccountIds: string[];
  dateFrom: string;
  dateTo: string;
  compareMode: ReportComparison;
  objectiveKey: string | "all";
  primaryResultKey?: string;
  currency?: string;
  currencyMode: ReportingCurrencyMode;
  reportingTimezoneMode: ReportingTimezoneMode;
  attributionSettingKey: string;
  actionReportTime: ReportingActionReportTime;
  syncVersion: string;
};

export type ReportingContextDefaults = Partial<
  Omit<
    ReportingContext,
    "dateFrom" | "dateTo" | "reportingTimezoneMode"
  >
>;

export type ReportingContextWarningCode =
  | "invalid_value"
  | "invalid_currency"
  | "invalid_date"
  | "date_range_reordered"
  | "date_range_capped"
  | "currency_ignored_for_split_mode"
  | "single_currency_missing";

export type ReportingContextWarning = {
  code: ReportingContextWarningCode;
  field: keyof ReportingContext;
  message: string;
  input?: unknown;
  fallback?: unknown;
};

export type ResolvedReportContext = Omit<ReportingContext, "currency"> & {
  /**
   * A blank string represents an unfiltered/split currency selection for
   * legacy consumers. Canonical consumers should also inspect currencyMode.
   */
  currency: string;
  warnings: ReportingContextWarning[];
  debug: {
    fallbackApplied: boolean;
    fallbackFields: Array<keyof ReportingContext>;
    normalizedFields: Array<keyof ReportingContext>;
    legacyQueryKeys: Array<keyof ReportContextQuery>;
  };

  /** Legacy aliases retained until all screens consume the canonical names. */
  defaultFrom: string;
  defaultTo: string;
  account: string;
  compare: ReportComparison;
};

const MAX_ID_COUNT = 250;
const MAX_ID_LENGTH = 160;
const MAX_KEY_LENGTH = 160;
const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9_.:/-]*$/;

function localDate(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

export function addReportDays(date: string, amount: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function values(value: ReportContextQueryValue) {
  const source = Array.isArray(value) ? value : [value];
  return source.flatMap((item) =>
    typeof item === "string" ? item.split(",") : [],
  );
}

function first(value: ReportContextQueryValue) {
  return values(value)[0]?.trim();
}

function hasQueryValue(value: ReportContextQueryValue) {
  return value !== undefined && value !== null;
}

function queryValue(
  canonical: ReportContextQueryValue,
  legacy: Array<
    readonly [keyof ReportContextQuery, ReportContextQueryValue]
  >,
  legacyQueryKeys: Array<keyof ReportContextQuery>,
) {
  if (hasQueryValue(canonical)) return canonical;
  const match = legacy.find(([, value]) => hasQueryValue(value));
  if (!match) return undefined;
  legacyQueryKeys.push(match[0]);
  return match[1];
}

function normalizedDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
    ? value
    : null;
}

function normalizedCurrency(value: string | null | undefined) {
  const currency = value?.trim().toUpperCase();
  return currency && /^[A-Z]{3}$/.test(currency) ? currency : "";
}

function normalizedKey(value: string | undefined) {
  const key = value?.trim();
  return key &&
    key.length <= MAX_KEY_LENGTH &&
    SAFE_KEY.test(key)
    ? key
    : "";
}

function uniqueIds(value: ReportContextQueryValue) {
  const accepted: string[] = [];
  const rejected: string[] = [];
  for (const raw of values(value)) {
    const id = raw.trim();
    if (!id) continue;
    if (
      id.length > MAX_ID_LENGTH ||
      !SAFE_KEY.test(id) ||
      accepted.length >= MAX_ID_COUNT
    ) {
      rejected.push(id);
      continue;
    }
    if (!accepted.includes(id)) accepted.push(id);
  }
  return { accepted, rejected };
}

function validComparison(
  value: string | undefined,
  fallback: ReportComparison,
): ReportComparison {
  return value === "previous_period" || value === "none" ? value : fallback;
}

function validCurrencyMode(
  value: string | undefined,
  fallback: ReportingCurrencyMode,
): ReportingCurrencyMode {
  return value === "single" || value === "split" ? value : fallback;
}

function validActionReportTime(
  value: string | undefined,
  fallback: ReportingActionReportTime,
): ReportingActionReportTime {
  return value === "impression" ||
    value === "conversion" ||
    value === "mixed"
    ? value
    : fallback;
}

function cloneIds(value: readonly string[] | undefined) {
  return uniqueIds(value).accepted;
}

export function resolveReportContext({
  query,
  timeZone,
  lookbackDays,
  reportingCurrency = null,
  compareDefault = "previous_period",
  defaults = {},
  now,
}: {
  query: ReportContextQuery;
  timeZone: string;
  lookbackDays: number;
  reportingCurrency?: string | null;
  compareDefault?: ReportComparison;
  defaults?: ReportingContextDefaults;
  now?: Date;
}): ResolvedReportContext {
  const warnings: ReportingContextWarning[] = [];
  const normalizedFields = new Set<keyof ReportingContext>();
  const legacyQueryKeys: Array<keyof ReportContextQuery> = [];
  const warn = (warning: ReportingContextWarning) => {
    warnings.push(warning);
  };

  const defaultTo = localDate(timeZone, now);
  const defaultFrom = addReportDays(
    defaultTo,
    -(Math.max(1, lookbackDays) - 1),
  );

  const rawDateFrom = first(
    queryValue(
      query.dateFrom,
      [["from", query.from]],
      legacyQueryKeys,
    ),
  );
  const rawDateTo = first(
    queryValue(query.dateTo, [["to", query.to]], legacyQueryKeys),
  );
  let dateFrom = normalizedDate(rawDateFrom) ?? defaultFrom;
  let dateTo = normalizedDate(rawDateTo) ?? defaultTo;
  if (rawDateFrom && !normalizedDate(rawDateFrom)) {
    warn({
      code: "invalid_date",
      field: "dateFrom",
      message: "dateFrom was invalid and the default start date was used.",
      input: rawDateFrom,
      fallback: defaultFrom,
    });
  }
  if (rawDateTo && !normalizedDate(rawDateTo)) {
    warn({
      code: "invalid_date",
      field: "dateTo",
      message: "dateTo was invalid and the default end date was used.",
      input: rawDateTo,
      fallback: defaultTo,
    });
  }
  if (dateFrom > dateTo) {
    [dateFrom, dateTo] = [dateTo, dateFrom];
    normalizedFields.add("dateFrom");
    normalizedFields.add("dateTo");
    warn({
      code: "date_range_reordered",
      field: "dateFrom",
      message: "The inverted reporting range was reordered.",
      input: { dateFrom: rawDateFrom, dateTo: rawDateTo },
      fallback: { dateFrom, dateTo },
    });
  }
  const earliest = addReportDays(dateTo, -364);
  if (dateFrom < earliest) {
    warn({
      code: "date_range_capped",
      field: "dateFrom",
      message: "The reporting range was capped at 365 inclusive days.",
      input: dateFrom,
      fallback: earliest,
    });
    dateFrom = earliest;
    normalizedFields.add("dateFrom");
  }

  const rawBusinessIds = queryValue(
    query.businessIds,
    [
      ["businesses", query.businesses],
      ["business", query.business],
    ],
    legacyQueryKeys,
  );
  const businessSelection = hasQueryValue(rawBusinessIds)
    ? uniqueIds(rawBusinessIds)
    : { accepted: cloneIds(defaults.businessIds), rejected: [] };
  if (businessSelection.rejected.length > 0) {
    warn({
      code: "invalid_value",
      field: "businessIds",
      message: "Invalid or excess business IDs were omitted.",
      input: businessSelection.rejected,
      fallback: businessSelection.accepted,
    });
  }

  const rawAdAccountIds = queryValue(
    query.adAccountIds,
    [
      ["accounts", query.accounts],
      ["account", query.account],
    ],
    legacyQueryKeys,
  );
  const accountSelection = hasQueryValue(rawAdAccountIds)
    ? uniqueIds(rawAdAccountIds)
    : { accepted: cloneIds(defaults.adAccountIds), rejected: [] };
  if (accountSelection.rejected.length > 0) {
    warn({
      code: "invalid_value",
      field: "adAccountIds",
      message: "Invalid or excess ad account IDs were omitted.",
      input: accountSelection.rejected,
      fallback: accountSelection.accepted,
    });
  }

  const rawCompare = first(
    queryValue(
      query.compareMode,
      [["compare", query.compare]],
      legacyQueryKeys,
    ),
  );
  const comparisonFallback = defaults.compareMode ?? compareDefault;
  const compareMode = validComparison(rawCompare, comparisonFallback);
  if (rawCompare && rawCompare !== compareMode) {
    warn({
      code: "invalid_value",
      field: "compareMode",
      message: "compareMode was invalid and the configured default was used.",
      input: rawCompare,
      fallback: compareMode,
    });
  }

  const rawObjective = first(
    queryValue(
      query.objectiveKey,
      [["objective", query.objective]],
      legacyQueryKeys,
    ),
  );
  const objectiveFallback = normalizedKey(defaults.objectiveKey) || "all";
  const objectiveKey = rawObjective
    ? normalizedKey(rawObjective) || objectiveFallback
    : objectiveFallback;
  if (rawObjective && !normalizedKey(rawObjective)) {
    warn({
      code: "invalid_value",
      field: "objectiveKey",
      message: "objectiveKey was invalid and the configured default was used.",
      input: rawObjective,
      fallback: objectiveKey,
    });
  }

  const rawPrimaryResult = first(
    queryValue(
      query.primaryResultKey,
      [["result", query.result]],
      legacyQueryKeys,
    ),
  );
  const primaryResultFallback =
    normalizedKey(defaults.primaryResultKey) || undefined;
  const primaryResultKey = rawPrimaryResult
    ? normalizedKey(rawPrimaryResult) || primaryResultFallback
    : primaryResultFallback;
  if (rawPrimaryResult && !normalizedKey(rawPrimaryResult)) {
    warn({
      code: "invalid_value",
      field: "primaryResultKey",
      message:
        "primaryResultKey was invalid and the configured default was used.",
      input: rawPrimaryResult,
      fallback: primaryResultKey,
    });
  }

  const rawCurrency = first(query.currency);
  const currencyFallback =
    normalizedCurrency(defaults.currency) ||
    normalizedCurrency(reportingCurrency);
  let currency = rawCurrency
    ? normalizedCurrency(rawCurrency) || currencyFallback
    : currencyFallback;
  if (rawCurrency && !normalizedCurrency(rawCurrency)) {
    warn({
      code: "invalid_currency",
      field: "currency",
      message: "currency was invalid and the configured default was used.",
      input: rawCurrency,
      fallback: currency || undefined,
    });
  }

  const rawCurrencyMode = first(query.currencyMode);
  const currencyModeFallback =
    defaults.currencyMode ?? (currency ? "single" : "split");
  let currencyMode = validCurrencyMode(
    rawCurrencyMode,
    currencyModeFallback,
  );
  if (rawCurrencyMode && rawCurrencyMode !== currencyMode) {
    warn({
      code: "invalid_value",
      field: "currencyMode",
      message:
        "currencyMode was invalid and the configured default was used.",
      input: rawCurrencyMode,
      fallback: currencyMode,
    });
  }
  if (currencyMode === "split" && currency) {
    warn({
      code: "currency_ignored_for_split_mode",
      field: "currency",
      message: "currency was ignored because currencyMode is split.",
      input: currency,
      fallback: undefined,
    });
    currency = "";
    normalizedFields.add("currency");
  } else if (currencyMode === "single" && !currency) {
    warn({
      code: "single_currency_missing",
      field: "currencyMode",
      message:
        "currencyMode fell back to split because no valid currency was available.",
      input: currencyMode,
      fallback: "split",
    });
    currencyMode = "split";
    normalizedFields.add("currencyMode");
  }

  const rawTimezoneMode = first(query.reportingTimezoneMode);
  const reportingTimezoneMode: ReportingTimezoneMode = "account_local";
  if (rawTimezoneMode && rawTimezoneMode !== reportingTimezoneMode) {
    warn({
      code: "invalid_value",
      field: "reportingTimezoneMode",
      message:
        "reportingTimezoneMode was invalid and account_local was used.",
      input: rawTimezoneMode,
      fallback: reportingTimezoneMode,
    });
  }

  const rawAttribution = first(query.attributionSettingKey);
  const attributionFallback =
    normalizedKey(defaults.attributionSettingKey) || "account_default";
  const attributionSettingKey = rawAttribution
    ? normalizedKey(rawAttribution) || attributionFallback
    : attributionFallback;
  if (rawAttribution && !normalizedKey(rawAttribution)) {
    warn({
      code: "invalid_value",
      field: "attributionSettingKey",
      message:
        "attributionSettingKey was invalid and the configured default was used.",
      input: rawAttribution,
      fallback: attributionSettingKey,
    });
  }

  const rawActionReportTime = first(query.actionReportTime);
  const actionReportTimeFallback = defaults.actionReportTime ?? "mixed";
  const actionReportTime = validActionReportTime(
    rawActionReportTime,
    actionReportTimeFallback,
  );
  if (rawActionReportTime && rawActionReportTime !== actionReportTime) {
    warn({
      code: "invalid_value",
      field: "actionReportTime",
      message:
        "actionReportTime was invalid and the configured default was used.",
      input: rawActionReportTime,
      fallback: actionReportTime,
    });
  }

  const rawSyncVersion = first(query.syncVersion);
  const syncVersionFallback =
    normalizedKey(defaults.syncVersion) || "latest";
  const syncVersion = rawSyncVersion
    ? normalizedKey(rawSyncVersion) || syncVersionFallback
    : syncVersionFallback;
  if (rawSyncVersion && !normalizedKey(rawSyncVersion)) {
    warn({
      code: "invalid_value",
      field: "syncVersion",
      message: "syncVersion was invalid and the configured default was used.",
      input: rawSyncVersion,
      fallback: syncVersion,
    });
  }

  const fallbackFields = [
    ...new Set(warnings.map((warning) => warning.field)),
  ];

  return {
    businessIds: businessSelection.accepted,
    adAccountIds: accountSelection.accepted,
    dateFrom,
    dateTo,
    compareMode,
    objectiveKey,
    ...(primaryResultKey ? { primaryResultKey } : {}),
    currency,
    currencyMode,
    reportingTimezoneMode,
    attributionSettingKey,
    actionReportTime,
    syncVersion,
    warnings,
    debug: {
      fallbackApplied: warnings.length > 0,
      fallbackFields,
      normalizedFields: [...normalizedFields],
      legacyQueryKeys,
    },
    defaultFrom,
    defaultTo,
    account: accountSelection.accepted[0] ?? "",
    compare: compareMode,
  };
}
