export type ReportContextQuery = {
  from?: string;
  to?: string;
  account?: string;
  currency?: string;
  compare?: string;
};

export type ReportComparison = "previous_period" | "none";

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

function validDate(value: string | undefined, fallback: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
    ? value
    : fallback;
}

function validCurrency(value: string | null | undefined) {
  const currency = value?.trim().toUpperCase();
  return currency && /^[A-Z]{3}$/.test(currency) ? currency : "";
}

function validComparison(
  value: string | undefined,
  fallback: ReportComparison,
): ReportComparison {
  return value === "previous_period" || value === "none" ? value : fallback;
}

export function resolveReportContext({
  query,
  timeZone,
  lookbackDays,
  reportingCurrency = null,
  compareDefault = "previous_period",
  now,
}: {
  query: ReportContextQuery;
  timeZone: string;
  lookbackDays: number;
  reportingCurrency?: string | null;
  compareDefault?: ReportComparison;
  now?: Date;
}) {
  const defaultTo = localDate(timeZone, now);
  const defaultFrom = addReportDays(
    defaultTo,
    -(Math.max(1, lookbackDays) - 1),
  );
  let dateFrom = validDate(query.from, defaultFrom);
  let dateTo = validDate(query.to, defaultTo);
  if (dateFrom > dateTo) [dateFrom, dateTo] = [dateTo, dateFrom];
  const earliest = addReportDays(dateTo, -364);
  if (dateFrom < earliest) dateFrom = earliest;

  return {
    dateFrom,
    dateTo,
    defaultFrom,
    defaultTo,
    account: query.account?.trim().slice(0, 160) ?? "",
    currency:
      validCurrency(query.currency) || validCurrency(reportingCurrency),
    compare: validComparison(query.compare, compareDefault),
  };
}
