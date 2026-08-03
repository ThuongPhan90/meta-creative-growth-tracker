import {
  ArrowLeftRight,
  CalendarDays,
  CircleDollarSign,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";

import { ObjectiveResultSelector } from "@/components/ui/objective-result-selector";
import {
  ReportingScopeSelector,
  type ReportingScopeAccountOption,
  type ReportingScopeBusinessOption,
} from "@/components/ui/reporting-scope-selector";
import type { ReportingBarModel } from "@/lib/presentation/reporting-bar";
import type { ReportComparison } from "@/lib/reporting";

import styles from "./reporting-toolbar.module.css";

type AccountOption = {
  id: string;
  name: string;
};

/**
 * The canonical context form stays server-rendered. Its client selectors only
 * own local selection state; the URL remains the source of truth after Apply.
 */
export function ReportingToolbar({
  action,
  dateFrom,
  dateTo,
  account,
  accounts = [],
  reportingBar,
  currency,
  currencies = [],
  compare,
  attribution,
  actionReportTime,
  syncVersion,
  preserved = {},
  resetHref,
}: {
  action: string;
  dateFrom: string;
  dateTo: string;
  account?: string;
  accounts?: readonly AccountOption[];
  reportingBar: ReportingBarModel;
  currency: string;
  currencies?: readonly string[];
  compare: ReportComparison;
  attribution: string;
  actionReportTime: "impression" | "conversion" | "mixed";
  syncVersion: string;
  preserved?: Record<string, string>;
  resetHref: string;
}) {
  const currencyOptions = [
    ...new Set(
      [currency, ...currencies]
        .map((value) => value.trim().toUpperCase())
        .filter((value) => /^[A-Z]{3}$/.test(value)),
    ),
  ].sort();
  const hasScopeControl =
    reportingBar.businesses.length > 0 || reportingBar.scopeAccounts.length > 0;
  const representedFields = new Set([
    ...(hasScopeControl ? ["business_ids", "account_ids"] : []),
    "objective",
    "result",
    "compare",
    "attribution",
    "action_report_time",
    "sync_version",
  ]);

  return (
    <section className={styles.toolbar} aria-label="Bộ lọc báo cáo">
      <form action={action} method="get" className={styles.form}>
        {Object.entries(preserved)
          .filter(([name]) => !representedFields.has(name))
          .map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}

        <label className={`${styles.control} ${styles.dateControl}`}>
          <CalendarDays aria-hidden="true" size={16} />
          <span className="sr-only">Khoảng ngày</span>
          <input type="date" name="from" defaultValue={dateFrom} />
          <span aria-hidden="true">–</span>
          <input type="date" name="to" defaultValue={dateTo} />
        </label>

        {hasScopeControl ? (
          <div className={styles.scopeControl}>
            <ReportingScopeSelector
              key={`${reportingBar.selectedBusinessIds.join(",")}|${reportingBar.selectedAccountIds.join(",")}`}
              businesses={
                reportingBar.businesses as readonly ReportingScopeBusinessOption[]
              }
              accounts={
                reportingBar.scopeAccounts as readonly ReportingScopeAccountOption[]
              }
              selectedBusinessIds={reportingBar.selectedBusinessIds}
              selectedAccountIds={reportingBar.selectedAccountIds}
              persistEnabled={reportingBar.persistScope}
            />
          </div>
        ) : accounts.length ? (
          <label className={styles.control}>
            <span className="sr-only">Tài khoản quảng cáo</span>
            <select name="account" defaultValue={account ?? ""}>
              <option value="">Tất cả tài khoản</option>
              {accounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className={styles.objectiveControl}>
          <ObjectiveResultSelector
            key={`${reportingBar.objective}:${reportingBar.result ?? ""}`}
            objective={reportingBar.objective}
            objectives={reportingBar.objectives}
            result={reportingBar.result}
            results={reportingBar.results}
          />
        </div>

        <label className={`${styles.control} ${styles.currencyControl}`}>
          <CircleDollarSign aria-hidden="true" size={16} />
          <span className="sr-only">Tiền tệ</span>
          <select name="currency" defaultValue={currency}>
            {!currency ? <option value="">Tất cả tiền tệ</option> : null}
            {currencyOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <details className={styles.moreFilters}>
          <summary>
            <SlidersHorizontal aria-hidden="true" size={15} />
            Bộ lọc thêm
          </summary>
          <div className={styles.moreFiltersPanel}>
            <label className={styles.advancedControl}>
              <span>So sánh</span>
              <span className={styles.advancedSelect}>
                <ArrowLeftRight aria-hidden="true" size={15} />
                <select name="compare" defaultValue={compare}>
                  <option value="previous_period">So với kỳ trước</option>
                  <option value="none">Không so sánh</option>
                </select>
              </span>
            </label>
            <label className={styles.advancedControl}>
              <span>Attribution</span>
              <input
                name="attribution"
                defaultValue={attribution}
                spellCheck={false}
                aria-describedby="attribution-help"
              />
              <small id="attribution-help">
                Giữ theo cấu hình Meta của tài khoản nếu không có yêu cầu đối soát riêng.
              </small>
            </label>
            <label className={styles.advancedControl}>
              <span>Action report time</span>
              <select name="action_report_time" defaultValue={actionReportTime}>
                <option value="mixed">Mixed</option>
                <option value="impression">Impression</option>
                <option value="conversion">Conversion</option>
              </select>
            </label>
            <label className={styles.advancedControl}>
              <span>Phiên bản đồng bộ</span>
              <input name="sync_version" defaultValue={syncVersion} spellCheck={false} />
            </label>
          </div>
        </details>

        <div className={styles.actions}>
          <button className={styles.apply} type="submit">
            <SlidersHorizontal aria-hidden="true" size={15} />
            Áp dụng
          </button>
          <Link className={styles.reset} href={resetHref}>
            <RotateCcw aria-hidden="true" size={14} />
            Đặt lại bộ lọc
          </Link>
        </div>
      </form>

      <footer className={styles.status}>
        {reportingBar.scopeWarning ? (
          <span className={styles.warning}>{reportingBar.scopeWarning}</span>
        ) : null}
      </footer>
    </section>
  );
}
