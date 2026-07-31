"use client";

import { Building2, Check, ChevronDown, Layers3 } from "lucide-react";
import { useMemo, useState } from "react";

export type ReportingScopeBusinessOption = {
  id: string;
  name: string;
  adAccountIds: string[];
  isActive?: boolean;
};

export type ReportingScopeAccountOption = {
  id: string;
  name: string;
  businessIds: string[];
  currency: string;
  timezone: string;
  isActive?: boolean;
  isOrphan?: boolean;
};

function unique(values: readonly string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function checkboxState(
  childIds: readonly string[],
  selectedIds: ReadonlySet<string>,
  parentSelected: boolean,
) {
  if (!childIds.length) return parentSelected ? "all" : "none";
  const count = childIds.filter((id) => selectedIds.has(id)).length;
  if (count === 0) return "none";
  return count === childIds.length ? "all" : "partial";
}

export function ReportingScopeSelector({
  businesses,
  accounts,
  selectedBusinessIds,
  selectedAccountIds,
  persistEnabled = false,
}: {
  businesses: readonly ReportingScopeBusinessOption[];
  accounts: readonly ReportingScopeAccountOption[];
  selectedBusinessIds: readonly string[];
  selectedAccountIds: readonly string[];
  persistEnabled?: boolean;
}) {
  const [businessIds, setBusinessIds] = useState(() =>
    unique(selectedBusinessIds),
  );
  const [accountIds, setAccountIds] = useState(() =>
    unique(selectedAccountIds),
  );
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const selectedBusinesses = useMemo(
    () => new Set(businessIds),
    [businessIds],
  );
  const selectedAccounts = useMemo(
    () => new Set(accountIds),
    [accountIds],
  );
  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );
  const businessAccountIds = useMemo(
    () =>
      new Map(
        businesses.map((business) => [
          business.id,
          unique(business.adAccountIds).filter((id) =>
            accountById.has(id),
          ),
        ]),
      ),
    [accountById, businesses],
  );

  function selectAll() {
    setBusinessIds(businesses.map((business) => business.id));
    setAccountIds(accounts.map((account) => account.id));
  }

  function clearAll() {
    setBusinessIds([]);
    setAccountIds([]);
  }

  async function persistScope() {
    if (!persistEnabled || saveState === "saving") return;
    setSaveState("saving");
    try {
      const response = await fetch("/api/reporting/scope", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          businessIds,
          adAccountIds: accountIds,
        }),
      });
      setSaveState(response.ok ? "saved" : "error");
    } catch {
      setSaveState("error");
    }
  }

  function toggleBusiness(businessId: string, selected: boolean) {
    const childIds = businessAccountIds.get(businessId) ?? [];
    setBusinessIds((current) =>
      selected
        ? unique([...current, businessId])
        : current.filter((id) => id !== businessId),
    );
    setAccountIds((current) =>
      selected
        ? unique([...current, ...childIds])
        : current.filter((id) => !childIds.includes(id)),
    );
  }

  function toggleAccount(accountId: string, selected: boolean) {
    const account = accountById.get(accountId);
    setAccountIds((current) =>
      selected
        ? unique([...current, accountId])
        : current.filter((id) => id !== accountId),
    );
    if (!account) return;
    setBusinessIds((current) => {
      const next = new Set(current);
      for (const businessId of account.businessIds) {
        const siblingIds = businessAccountIds.get(businessId) ?? [];
        const selectedSiblingCount = siblingIds.filter((id) =>
          id === accountId ? selected : selectedAccounts.has(id),
        ).length;
        if (selectedSiblingCount > 0) next.add(businessId);
        else next.delete(businessId);
      }
      return [...next];
    });
  }

  const primaryBusinessByAccount = new Map(
    accounts.map((account) => [account.id, account.businessIds[0]]),
  );

  return (
    <details className="v2-context-scope">
      {businessIds.map((id) => (
        <input key={`business:${id}`} type="hidden" name="business_ids" value={id} />
      ))}
      {accountIds.map((id) => (
        <input key={`account:${id}`} type="hidden" name="account_ids" value={id} />
      ))}
      <summary>
        <Layers3 aria-hidden="true" size={16} />
        <span>
          <strong>{accountIds.length} tài khoản</strong>
          <small>{businessIds.length} Business đã chọn</small>
        </span>
        <ChevronDown aria-hidden="true" size={15} />
      </summary>
      <div className="v2-context-scope__panel">
        <header>
          <div>
            <strong>Phạm vi báo cáo</strong>
            <small>
              Chỉ dữ liệu từ Business và Ad Account được tích chọn mới vào báo cáo.
            </small>
          </div>
          <span>
            <button type="button" onClick={selectAll}>
              Chọn tất cả
            </button>
            <button type="button" onClick={clearAll}>
              Bỏ chọn
            </button>
            {persistEnabled ? (
              <button
                type="button"
                onClick={persistScope}
                disabled={saveState === "saving"}
              >
                {saveState === "saving"
                  ? "Đang lưu…"
                  : saveState === "saved"
                    ? "Đã lưu"
                    : "Lưu mặc định"}
              </button>
            ) : null}
          </span>
        </header>
        {saveState === "error" ? (
          <p className="v2-context-scope__error" role="alert">
            Chưa lưu được phạm vi. Hãy áp dụng bằng URL và thử lại khi kết nối sẵn sàng.
          </p>
        ) : null}
        <div className="v2-context-scope__list">
          {businesses.map((business) => {
            const childIds = businessAccountIds.get(business.id) ?? [];
            const state = checkboxState(
              childIds,
              selectedAccounts,
              selectedBusinesses.has(business.id),
            );
            const childAccounts = childIds.flatMap((accountId) => {
              const account = accountById.get(accountId);
              return account &&
                primaryBusinessByAccount.get(accountId) === business.id
                ? [account]
                : [];
            });
            return (
              <section key={business.id}>
                <label className="v2-scope-parent">
                  <input
                    type="checkbox"
                    checked={state === "all"}
                    aria-checked={state === "partial" ? "mixed" : state === "all"}
                    ref={(node) => {
                      if (node) node.indeterminate = state === "partial";
                    }}
                    onChange={(event) =>
                      toggleBusiness(business.id, event.currentTarget.checked)
                    }
                  />
                  <Building2 aria-hidden="true" size={16} />
                  <span>
                    <strong>{business.name}</strong>
                    <small>
                      {childIds.filter((id) => selectedAccounts.has(id)).length}/
                      {childIds.length} tài khoản
                      {business.isActive === false ? " · Không hoạt động" : ""}
                    </small>
                  </span>
                  {state === "all" ? <Check aria-hidden="true" size={15} /> : null}
                </label>
                {childAccounts.map((account) => (
                  <label className="v2-scope-child" key={account.id}>
                    <input
                      type="checkbox"
                      checked={selectedAccounts.has(account.id)}
                      onChange={(event) =>
                        toggleAccount(account.id, event.currentTarget.checked)
                      }
                    />
                    <span>
                      <strong>{account.name}</strong>
                      <small>
                        {account.currency} · {account.timezone}
                        {account.isActive === false
                          ? " · Không còn hoạt động"
                          : ""}
                      </small>
                    </span>
                  </label>
                ))}
              </section>
            );
          })}
          {accounts
            .filter(
              (account) =>
                account.isOrphan || account.businessIds.length === 0,
            )
            .map((account) => (
              <section key={`orphan:${account.id}`}>
                <label className="v2-scope-child v2-scope-child--orphan">
                  <input
                    type="checkbox"
                    checked={selectedAccounts.has(account.id)}
                    onChange={(event) =>
                      toggleAccount(account.id, event.currentTarget.checked)
                    }
                  />
                  <span>
                    <strong>{account.name}</strong>
                    <small>
                      Chưa xác định Business · {account.currency} · {account.timezone}
                    </small>
                  </span>
                </label>
              </section>
            ))}
        </div>
      </div>
    </details>
  );
}
