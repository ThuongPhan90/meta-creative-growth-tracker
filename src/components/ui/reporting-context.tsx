import {
  ArrowLeftRight,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  SlidersHorizontal,
} from "lucide-react";

import type { ReportComparison } from "@/lib/reporting";

type AccountOption = {
  id: string;
  name: string;
};

export function ReportingContext({
  action,
  dateFrom,
  dateTo,
  account,
  accounts,
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
  currency: string;
  currencies?: string[];
  compare: ReportComparison;
  freshness: string;
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

  return (
    <form
      className={`v2-report-context${
        compact ? " v2-report-context--compact" : ""
      }`}
      action={action}
      method="get"
      aria-label="Ngữ cảnh báo cáo"
    >
      {Object.entries(preserved).map(([name, value]) => (
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
      {accounts ? (
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
      <span className="v2-freshness">
        <Clock3 aria-hidden="true" size={15} />
        {freshness}
      </span>
      <button className="v2-context-submit" type="submit">
        <SlidersHorizontal aria-hidden="true" size={15} />
        Áp dụng
      </button>
    </form>
  );
}
