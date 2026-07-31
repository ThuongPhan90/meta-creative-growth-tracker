import {
  buildContextHref,
  type NavigationQueryInput,
} from "@/lib/navigation";

type SourceQuery = Record<
  string,
  string | string[] | undefined
>;

const SOURCE_ENTITY_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

function canonicalSourceEntityId(value: string) {
  const id = value.trim();
  if (!SOURCE_ENTITY_ID.test(id)) {
    throw new Error("Source entity ID is invalid.");
  }
  return id;
}

export function sourceBusinessFilterId(query: SourceQuery) {
  const value = query.source_business;
  const candidate = (
    Array.isArray(value) ? value[0] : value
  )?.trim();
  return candidate && SOURCE_ENTITY_ID.test(candidate)
    ? candidate
    : null;
}

export function sourceBusinessAccountsHref(
  businessId: string,
  query: NavigationQueryInput,
) {
  const id = canonicalSourceEntityId(businessId);
  return buildContextHref(
    `/sources?source_business=${encodeURIComponent(id)}`,
    query,
    {
      tab: "ad-accounts",
      selected: null,
    },
  );
}

export function sourceAccountCampaignsHref(
  adAccountId: string,
  query: NavigationQueryInput,
) {
  const id = canonicalSourceEntityId(adAccountId);
  return buildContextHref("/campaigns", query, {
    account_ids: id,
    account: id,
    campaign: null,
    selected: null,
    tab: null,
  });
}
