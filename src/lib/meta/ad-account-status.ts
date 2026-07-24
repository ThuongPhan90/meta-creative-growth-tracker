import type { MetaAssetRow } from "@/types/view-models";

const META_AD_ACCOUNT_STATUS_LABELS: Readonly<Record<number, string>> = {
  1: "ACTIVE",
  2: "DISABLED",
  3: "UNSETTLED",
  7: "PENDING_RISK_REVIEW",
  8: "PENDING_SETTLEMENT",
  9: "IN_GRACE_PERIOD",
  100: "PENDING_CLOSURE",
  101: "CLOSED",
};

const ACTIONABLE_META_AD_ACCOUNT_STATUSES = new Set([
  "DISABLED",
  "UNSETTLED",
  "PENDING_RISK_REVIEW",
  "PENDING_SETTLEMENT",
  "IN_GRACE_PERIOD",
]);

/**
 * Meta discovery access and the account's advertising status are different.
 * An account is operational only when it was seen in the latest complete
 * discovery and Meta reports account_status=1.
 */
export function isOperationalAdAccount(input: {
  isActive: boolean;
  accountStatus: number | null;
}): boolean {
  return input.isActive && input.accountStatus === 1;
}

export function metaAdAccountStatusLabel(
  accountStatus: number | null,
): string {
  if (accountStatus === null) return "UNKNOWN";
  return (
    META_AD_ACCOUNT_STATUS_LABELS[accountStatus] ??
    `STATUS ${accountStatus}`
  );
}

export function isOperationalMetaAssetAccount(
  asset: Pick<MetaAssetRow, "kind" | "status" | "isCurrent">,
): boolean {
  return (
    asset.kind === "Ad Account" &&
    asset.isCurrent !== false &&
    asset.status.trim().toUpperCase() === "ACTIVE"
  );
}

export function isActionableMetaAdAccountStatus(status: string): boolean {
  const normalizedStatus = status.trim().toUpperCase();
  return (
    ACTIONABLE_META_AD_ACCOUNT_STATUSES.has(normalizedStatus) ||
    (normalizedStatus.startsWith("PENDING") &&
      normalizedStatus !== "PENDING_CLOSURE")
  );
}

export function shouldIncludeInactiveMetaAdAccounts(
  assets: readonly MetaAssetRow[],
  selectedAccountId: string,
  requested: boolean,
): boolean {
  if (requested) return true;
  if (!selectedAccountId) return false;

  const selectedAccount = assets.find(
    (asset) =>
      asset.kind === "Ad Account" && asset.id === selectedAccountId,
  );
  return selectedAccount
    ? !isOperationalMetaAssetAccount(selectedAccount)
    : false;
}
