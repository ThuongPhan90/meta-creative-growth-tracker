export type ReportingScopeTriState = "all" | "partial" | "none";
export type ReportingScopeSelectionSource = "persisted" | "url";

export type ReportingScopeBusiness = {
  id: string;
  name: string;
  isActive: boolean;
  adAccountIds: string[];
};

export type ReportingScopeAdAccount = {
  id: string;
  name: string;
  isActive: boolean;
  accountStatus: number | null;
  currency: string;
  timezone: string;
  businessIds: string[];
};

export type ReportingScopeInventory = {
  businesses: ReportingScopeBusiness[];
  adAccounts: ReportingScopeAdAccount[];
};

export type PersistedReportingScope = {
  businessIds: string[];
  adAccountIds: string[];
  confirmedAt: string | null;
  updatedAt: string | null;
};

export type ReportingScopeOverride = {
  businessIds?: readonly string[];
  adAccountIds?: readonly string[];
};

export type CanonicalReportingScope = {
  available: {
    businesses: Array<
      ReportingScopeBusiness & {
        selected: boolean;
        selectionState: ReportingScopeTriState;
      }
    >;
    adAccounts: Array<
      ReportingScopeAdAccount & {
        selected: boolean;
        isOrphan: boolean;
      }
    >;
  };
  selected: {
    businessIds: string[];
    adAccountIds: string[];
    businessState: ReportingScopeTriState;
    adAccountState: ReportingScopeTriState;
    source: {
      businesses: ReportingScopeSelectionSource;
      adAccounts: ReportingScopeSelectionSource;
    };
  };
  unavailableSelected: {
    businessIds: string[];
    adAccountIds: string[];
  };
  confirmedAt: string | null;
  updatedAt: string | null;
};

const MAX_SCOPE_MEMBERS = 250;
const SAFE_SCOPE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,159}$/;

function normalizeIds(values: readonly string[] | undefined) {
  const normalized: string[] = [];
  for (const value of values ?? []) {
    for (const part of value.split(",")) {
      const id = part.trim();
      if (
        !id ||
        !SAFE_SCOPE_ID.test(id) ||
        normalized.includes(id) ||
        normalized.length >= MAX_SCOPE_MEMBERS
      ) {
        continue;
      }
      normalized.push(id);
    }
  }
  return normalized;
}

function triState(selectedCount: number, availableCount: number) {
  if (selectedCount <= 0 || availableCount <= 0) return "none" as const;
  return selectedCount >= availableCount ? ("all" as const) : ("partial" as const);
}

export function buildCanonicalReportingScope({
  inventory,
  persisted,
  override,
}: {
  inventory: ReportingScopeInventory;
  persisted?: PersistedReportingScope | null;
  override?: ReportingScopeOverride;
}): CanonicalReportingScope {
  const availableBusinessIds = new Set(
    inventory.businesses.map((business) => business.id),
  );
  const availableAdAccountIds = new Set(
    inventory.adAccounts.map((account) => account.id),
  );
  const requestedBusinessIds = normalizeIds(
    override?.businessIds !== undefined
      ? override.businessIds
      : persisted?.businessIds,
  );
  const requestedAdAccountIds = normalizeIds(
    override?.adAccountIds !== undefined
      ? override.adAccountIds
      : persisted?.adAccountIds,
  );
  const businessIds = requestedBusinessIds.filter((id) =>
    availableBusinessIds.has(id),
  );
  const adAccountIds = requestedAdAccountIds.filter((id) =>
    availableAdAccountIds.has(id),
  );
  const selectedBusinesses = new Set(businessIds);
  const selectedAdAccounts = new Set(adAccountIds);

  return {
    available: {
      businesses: inventory.businesses.map((business) => {
        const childIds = business.adAccountIds.filter((id) =>
          availableAdAccountIds.has(id),
        );
        const selectedChildCount = childIds.filter((id) =>
          selectedAdAccounts.has(id),
        ).length;
        return {
          ...business,
          adAccountIds: [...childIds],
          selected: selectedBusinesses.has(business.id),
          selectionState:
            childIds.length > 0
              ? triState(selectedChildCount, childIds.length)
              : selectedBusinesses.has(business.id)
                ? "all"
                : "none",
        };
      }),
      adAccounts: inventory.adAccounts.map((account) => ({
        ...account,
        businessIds: account.businessIds.filter((id) =>
          availableBusinessIds.has(id),
        ),
        selected: selectedAdAccounts.has(account.id),
        isOrphan:
          account.businessIds.filter((id) =>
            availableBusinessIds.has(id),
          ).length === 0,
      })),
    },
    selected: {
      businessIds,
      adAccountIds,
      businessState: triState(
        businessIds.length,
        availableBusinessIds.size,
      ),
      adAccountState: triState(
        adAccountIds.length,
        availableAdAccountIds.size,
      ),
      source: {
        businesses:
          override?.businessIds !== undefined ? "url" : "persisted",
        adAccounts:
          override?.adAccountIds !== undefined ? "url" : "persisted",
      },
    },
    unavailableSelected: {
      businessIds: requestedBusinessIds.filter(
        (id) => !availableBusinessIds.has(id),
      ),
      adAccountIds: requestedAdAccountIds.filter(
        (id) => !availableAdAccountIds.has(id),
      ),
    },
    confirmedAt: persisted?.confirmedAt ?? null,
    updatedAt: persisted?.updatedAt ?? null,
  };
}

export type ReportingScopeValidation =
  | {
      ok: true;
      businessIds: string[];
      adAccountIds: string[];
    }
  | {
      ok: false;
      invalidBusinessIds: string[];
      invalidAdAccountIds: string[];
    };

export function validateReportingScopeSelection({
  inventory,
  businessIds,
  adAccountIds,
}: {
  inventory: ReportingScopeInventory;
  businessIds: readonly string[];
  adAccountIds: readonly string[];
}): ReportingScopeValidation {
  const normalizedBusinessIds = normalizeIds(businessIds);
  const normalizedAdAccountIds = normalizeIds(adAccountIds);
  const availableBusinessIds = new Set(
    inventory.businesses.map((business) => business.id),
  );
  const availableAdAccountIds = new Set(
    inventory.adAccounts.map((account) => account.id),
  );
  const invalidBusinessIds = normalizedBusinessIds.filter(
    (id) => !availableBusinessIds.has(id),
  );
  const invalidAdAccountIds = normalizedAdAccountIds.filter(
    (id) => !availableAdAccountIds.has(id),
  );
  const invalidRawBusinessIds = businessIds
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((id) => id && !SAFE_SCOPE_ID.test(id));
  const invalidRawAdAccountIds = adAccountIds
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((id) => id && !SAFE_SCOPE_ID.test(id));

  if (
    invalidBusinessIds.length ||
    invalidAdAccountIds.length ||
    invalidRawBusinessIds.length ||
    invalidRawAdAccountIds.length ||
    normalizedBusinessIds.length > MAX_SCOPE_MEMBERS ||
    normalizedAdAccountIds.length > MAX_SCOPE_MEMBERS
  ) {
    return {
      ok: false,
      invalidBusinessIds: [
        ...new Set([...invalidRawBusinessIds, ...invalidBusinessIds]),
      ],
      invalidAdAccountIds: [
        ...new Set([
          ...invalidRawAdAccountIds,
          ...invalidAdAccountIds,
        ]),
      ],
    };
  }

  return {
    ok: true,
    businessIds: normalizedBusinessIds,
    adAccountIds: normalizedAdAccountIds,
  };
}

type ScopeSearchParams = Pick<URLSearchParams, "getAll" | "has">;

export function readReportingScopeOverride(
  searchParams: ScopeSearchParams,
): ReportingScopeOverride | undefined {
  const hasBusinessIds = searchParams.has("business_ids");
  const hasAdAccountIds = searchParams.has("account_ids");
  if (!hasBusinessIds && !hasAdAccountIds) return undefined;
  return {
    ...(hasBusinessIds
      ? { businessIds: searchParams.getAll("business_ids") }
      : {}),
    ...(hasAdAccountIds
      ? { adAccountIds: searchParams.getAll("account_ids") }
      : {}),
  };
}
