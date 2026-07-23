export const DEFAULT_INSTALL_ACTION_TYPES = [
  "mobile_app_install",
  "omni_app_install",
  "app_install",
] as const;

export const DEFAULT_REGISTRATION_ACTION_TYPES = [
  "complete_registration",
  "omni_complete_registration",
  "mobile_app_complete_registration",
] as const;

export type ActionAggregationStrategy = "first-match" | "sum-matches";

export interface ActionMetricRule {
  /**
   * Ordered aliases. With first-match, the first action type present wins.
   * This prevents the same conversion being counted once as a specific action
   * and again as its omni alias.
   */
  actionTypes: readonly string[];
  strategy: ActionAggregationStrategy;
}

export interface MetaActionMapping {
  installs: ActionMetricRule;
  registrations: ActionMetricRule;
}

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

function parseActionTypes(
  rawValue: string | undefined,
  fallback: readonly string[],
): string[] {
  if (!rawValue?.trim()) {
    return [...fallback];
  }

  const unique = new Set(
    rawValue
      .split(",")
      .map((item) => item.trim())
      .filter((item) => /^[a-zA-Z0-9_.-]+$/.test(item)),
  );

  return unique.size > 0 ? [...unique] : [...fallback];
}

export function getMetaActionMapping(
  environment: EnvironmentSource = process.env,
): MetaActionMapping {
  return {
    installs: {
      actionTypes: parseActionTypes(
        environment.INSTALL_ACTION_TYPES,
        DEFAULT_INSTALL_ACTION_TYPES,
      ),
      strategy: "first-match",
    },
    registrations: {
      actionTypes: parseActionTypes(
        environment.REGISTRATION_ACTION_TYPES,
        DEFAULT_REGISTRATION_ACTION_TYPES,
      ),
      strategy: "first-match",
    },
  };
}
