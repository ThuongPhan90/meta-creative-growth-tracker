import {
  ArrowLeftRight,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";

import { ObjectiveResultSelector } from "@/components/ui/objective-result-selector";
import {
  ReportingScopeSelector,
  type ReportingScopeAccountOption,
  type ReportingScopeBusinessOption,
} from "@/components/ui/reporting-scope-selector";
import type { ReportComparison } from "@/lib/reporting";
import type { FreshnessPresentation } from "@/lib/presentation/freshness-presentation";

type AccountOption = {
  id: string;
  name: string;
};

type ObjectiveOption = {
  key: string;
  label: string;
};

type ResultOption = {
  key: string;
  label: string;
  objectiveKeys?: readonly string[];
};

export type ReportingFreshness = string | FreshnessPresentation;

export function ReportingContext({
  action,
  dateFrom,
  dateTo,
  account,
  accounts,
  businesses,
  scopeAccounts,
  selectedBusinessIds = [],
  selectedAccountIds = [],
  scopeWarning,
  persistScope = false,
  objective = "all",
  objectives = [],
  result,
  results = [],
  currency,
  currencies = [],
  compare,
  freshness,
  preserved = {},
  compact = false,
}: {
  action: string;
  dateFrom: string;
  dateTo: string;
  account?: string;
  accounts?: AccountOption[];
  businesses?: readonly ReportingScopeBusinessOption[];
  scopeAccounts?: readonly ReportingScopeAccountOption[];
  selectedBusinessIds?: readonly string[];
  selectedAccountIds?: readonly string[];
  scopeWarning?: string;
  persistScope?: boolean;
  objective?: string;
  objectives?: readonly ObjectiveOption[];
  result?: string;
  results?: readonly ResultOption[];
  currency: string;
  currencies?: string[];
  compare: ReportComparison;
  freshness: ReportingFreshness;
  preserved?: Record<string, string>;
  compact?: boolean;
}) {
  const currencyOptions = [
    ...new Set(
      [currency, ...currencies]
        .map((value) => value.trim().toUpperCase())
        .filter((value) => /^[A-Z]{3}$/.test(value)),
    ),
  ].sort();
  const hasScopeControl = Boolean(businesses && scopeAccounts);
  const representedFields = new Set([
    ...(hasScopeControl ? ["business_ids", "account_ids"] : []),
    ...(objectives.length ? ["objective"] : []),
    ...(objective !== "all" && results.length ? ["result"] : []),
  ]);
  const mobileSummary = scopeWarning
    ? "Cần chú ý"
    : typeof freshness === "string"
      ? freshness
      : `${freshness.dataThrough} · ${freshness.status}`;

  return (
    <details
      className={`v2-report-context-shell${
        compact ? " v2-report-context-shell--compact" : ""
      }`}
    >
      <summary className="v2-report-context-summary">
        <SlidersHorizontal aria-hidden="true" size={17} />
        <span>Bộ lọc báo cáo</span>
        <small>{mobileSummary}</small>
      </summary>
      {scopeWarning ? (
        <p className="v2-report-context-warning" role="status">
          {scopeWarning}
        </p>
      ) : null}
      <form
      className={`v2-report-context${
        compact ? " v2-report-context--compact" : ""
      }`}
      action={action}
      method="get"
      aria-label="Ngữ cảnh báo cáo"
    >
      {Object.entries(preserved)
        .filter(([name]) => !representedFields.has(name))
        .map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      <label className="v2-context-control v2-context-control--dates">
        <CalendarDays aria-hidden="true" size={16} />
        <span className="sr-only">Từ ngày</span>
        <input type="date" name="from" defaultValue={dateFrom} />
        <span aria-hidden="true">–</span>
        <span className="sr-only">Đến ngày</span>
        <input type="date" name="to" defaultValue={dateTo} />
      </label>
      {businesses && scopeAccounts ? (
        <ReportingScopeSelector
          key={`${selectedBusinessIds.join(",")}|${selectedAccountIds.join(",")}`}
          businesses={businesses}
          accounts={scopeAccounts}
          selectedBusinessIds={selectedBusinessIds}
          selectedAccountIds={selectedAccountIds}
          persistEnabled={persistScope}
        />
      ) : accounts ? (
        <label className="v2-context-control">
          <span className="sr-only">Tài khoản quảng cáo</span>
          <select name="account" defaultValue={account ?? ""}>
            <option value="">Tất cả tài khoản</option>
            {accounts.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {objectives.length ? (
        <ObjectiveResultSelector
          key={`${objective}:${result ?? ""}`}
          objective={objective}
          objectives={objectives}
          result={result}
          results={results}
        />
      ) : null}
      <label className="v2-context-control">
        <ArrowLeftRight aria-hidden="true" size={16} />
        <span className="sr-only">So sánh kỳ</span>
        <select name="compare" defaultValue={compare}>
          <option value="previous_period">So với kỳ trước</option>
          <option value="none">Không so sánh</option>
        </select>
      </label>
      <label className="v2-context-control">
        <CircleDollarSign aria-hidden="true" size={16} />
        <span className="sr-only">Tiền tệ báo cáo</span>
        <select name="currency" defaultValue={currency}>
          {!currency ? <option value="">Tất cả tiền tệ</option> : null}
          {currencyOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      {typeof freshness === "string" ? (
        <span className="v2-freshness">
          <Clock3 aria-hidden="true" size={15} />
          {freshness}
        </span>
      ) : (
        <span
          className={`v2-freshness v2-freshness--structured v2-freshness--${freshness.tone}`}
          aria-label={`Dữ liệu đến ${freshness.dataThrough}; đồng bộ thành công ${freshness.lastSuccessfulSync}; trạng thái ${freshness.status}`}
        >
          <Clock3 aria-hidden="true" size={15} />
          <span>
            <small>Dữ liệu đến</small>
            <strong>{freshness.dataThrough}</strong>
          </span>
          <span>
            <small>Đồng bộ thành công</small>
            <strong>{freshness.lastSuccessfulSync}</strong>
          </span>
          <span>
            <small>Trạng thái</small>
            <strong>{freshness.status}</strong>
          </span>
        </span>
      )}
      <button className="v2-context-submit" type="submit">
        <SlidersHorizontal aria-hidden="true" size={15} />
        Áp dụng
      </button>
      <Link className="v2-context-reset" href={action}>
        Đặt lại
      </Link>
      </form>
    </details>
  );
}
