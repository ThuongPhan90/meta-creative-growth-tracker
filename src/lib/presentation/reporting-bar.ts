import {
  DEFAULT_OBJECTIVE_REGISTRY,
  DEFAULT_RESULT_DEFINITIONS,
  type CanonicalReportingScope,
  type ResolvedReportContext,
  type ResultDefinition,
} from "@/lib/reporting";

export type ReportingBarModel = {
  businesses: Array<{
    id: string;
    name: string;
    adAccountIds: string[];
    isActive: boolean;
  }>;
  scopeAccounts: Array<{
    id: string;
    name: string;
    businessIds: string[];
    currency: string;
    timezone: string;
    isActive: boolean;
    isOrphan: boolean;
  }>;
  selectedBusinessIds: string[];
  selectedAccountIds: string[];
  scopeWarning?: string;
  persistScope: boolean;
  objective: string;
  objectives: Array<{ key: string; label: string }>;
  result?: string;
  results: Array<{
    key: string;
    label: string;
    objectiveKeys: string[];
  }>;
};

export function buildReportingBarModel(
  scope: CanonicalReportingScope | null,
  context: ResolvedReportContext,
  options: { persistScope?: boolean } = {},
  definitions: readonly ResultDefinition[] = DEFAULT_RESULT_DEFINITIONS,
): ReportingBarModel {
  return {
    businesses:
      scope?.available.businesses.map((business) => ({
        id: business.id,
        name: business.name,
        adAccountIds: [...business.adAccountIds],
        isActive: business.isActive,
      })) ?? [],
    scopeAccounts:
      scope?.available.adAccounts.map((account) => ({
        id: account.id,
        name: account.name,
        businessIds: [...account.businessIds],
        currency: account.currency,
        timezone: account.timezone,
        isActive: account.isActive,
        isOrphan: account.isOrphan,
      })) ?? [],
    selectedBusinessIds: [...context.businessIds],
    selectedAccountIds: [...context.adAccountIds],
    ...(scope &&
    (scope.unavailableSelected.businessIds.length > 0 ||
      scope.unavailableSelected.adAccountIds.length > 0)
      ? {
          scopeWarning: `${scope.unavailableSelected.businessIds.length} Business và ${scope.unavailableSelected.adAccountIds.length} Ad Account đã lưu không còn quyền truy cập; các tài sản này đã bị loại khỏi báo cáo.`,
        }
      : {}),
    persistScope: options.persistScope === true,
    objective: context.objectiveKey,
    objectives: DEFAULT_OBJECTIVE_REGISTRY.map((objective) => ({
      key: objective.key,
      label: objective.label,
    })),
    ...(context.primaryResultKey
      ? { result: context.primaryResultKey }
      : {}),
    results: definitions
      .filter((definition) => definition.enabled)
      .map((definition) => ({
        key: definition.canonicalKey,
        label: definition.label,
        objectiveKeys: [...definition.objectiveKeys],
      })),
  };
}
