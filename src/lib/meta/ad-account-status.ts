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
