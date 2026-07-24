export type GroupableSyncWarning = {
  code: string;
  resource: string | null;
  message: string;
};

export type SyncWarningGroup = {
  code: string;
  message: string;
  count: number;
  resources: string[];
};

export function groupSyncWarnings(
  warnings: readonly GroupableSyncWarning[],
): SyncWarningGroup[] {
  const groups = new Map<string, SyncWarningGroup>();

  for (const warning of warnings) {
    const key = `${warning.code}\u001f${warning.message}`;
    const current = groups.get(key) ?? {
      code: warning.code,
      message: warning.message,
      count: 0,
      resources: [],
    };
    current.count += 1;
    if (
      warning.resource &&
      !current.resources.includes(warning.resource)
    ) {
      current.resources.push(warning.resource);
    }
    groups.set(key, current);
  }

  return [...groups.values()].sort(
    (left, right) =>
      right.count - left.count || left.code.localeCompare(right.code),
  );
}
