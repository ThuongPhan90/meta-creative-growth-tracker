export const ATTRIBUTION_AUDIT_TABLES = [
  "daily_metrics",
  "action_metric_daily",
  "action_value_daily",
  "period_reach_snapshots",
] as const;

export type AttributionAuditTable =
  (typeof ATTRIBUTION_AUDIT_TABLES)[number];

export type AttributionAuditQuery = (
  statement: string,
  parameters?: readonly (number | string)[],
) => Promise<readonly Record<string, unknown>[]>;

export interface AttributionTableAuditSummary {
  table: AttributionAuditTable;
  activeRows: number;
  activeAccounts: number;
  variantAccounts: number;
  overlappingGrains: number;
  invalidWindowRows: number;
}

export interface AttributionConflictSample {
  scope: AttributionAuditTable | "cross_table";
  snapshotSlot: number;
  accountSlot: number;
  rowCount: number;
  attributionWindowCount: number;
  attributionWindows: string[];
  invalidWindowRows: number;
  overlappingGrains: number;
  sourceTables: AttributionAuditTable[];
}

export interface AttributionAuditReport {
  scope: "current_published_snapshot";
  status: "pass" | "conflict" | "inconclusive";
  releaseSafe: boolean;
  snapshotCount: number;
  activeRowCount: number;
  tableSummaries: AttributionTableAuditSummary[];
  crossTableConflictAccounts: number;
  crossTableInvalidWindowRows: number;
  conflictSamples: AttributionConflictSample[];
  unpinnedDailyDiagnostic: UnpinnedDailyDiagnostic | null;
  sampleLimit: number;
}

export interface UnpinnedDailyDiagnostic {
  basis: "latest_fetched_sync_per_account";
  releaseEvidence: false;
  candidateRows: number;
  candidateAccounts: number;
  variantAccounts: number;
  overlappingGrains: number;
  invalidWindowRows: number;
  conflictSamples: AttributionConflictSample[];
}

export const READ_ONLY_ASSERTION_SQL = `
  select current_setting('transaction_read_only') as transaction_read_only
`;

export const SNAPSHOT_COUNT_SQL = `
  select count(*)::text as snapshot_count
  from tracker.reporting_snapshots
`;

const PINNED_ATTRIBUTION_ROWS_CTE = `
  with pinned_snapshots as (
    select connection_id, sync_version
    from tracker.reporting_snapshots
  ),
  pinned_rows as (
    select
      'daily_metrics'::text as table_name,
      snapshot.connection_id,
      snapshot.sync_version,
      metric.ad_account_id,
      nullif(btrim(metric.attribution_window), '') as attribution_window,
      jsonb_build_array(
        metric.metric_date,
        metric.ad_id,
        metric.scope_key,
        metric.country,
        metric.publisher_platform,
        metric.platform_position,
        metric.impression_device,
        metric.action_report_time
      ) as grain_key
    from pinned_snapshots snapshot
    join tracker.meta_ad_accounts account
      on account.connection_id = snapshot.connection_id
    join tracker.daily_metrics metric
      on metric.ad_account_id = account.ad_account_id
      and metric.sync_version = snapshot.sync_version

    union all

    select
      'action_metric_daily'::text as table_name,
      snapshot.connection_id,
      snapshot.sync_version,
      metric.ad_account_id,
      nullif(btrim(metric.attribution_window), '') as attribution_window,
      jsonb_build_array(
        metric.metric_date,
        metric.ad_id,
        metric.canonical_result_key,
        metric.action_report_time
      ) as grain_key
    from pinned_snapshots snapshot
    join tracker.meta_ad_accounts account
      on account.connection_id = snapshot.connection_id
    join tracker.action_metric_daily metric
      on metric.ad_account_id = account.ad_account_id
      and metric.sync_version = snapshot.sync_version

    union all

    select
      'action_value_daily'::text as table_name,
      snapshot.connection_id,
      snapshot.sync_version,
      metric.ad_account_id,
      nullif(btrim(metric.attribution_window), '') as attribution_window,
      jsonb_build_array(
        metric.metric_date,
        metric.ad_id,
        metric.canonical_result_key,
        metric.action_report_time
      ) as grain_key
    from pinned_snapshots snapshot
    join tracker.meta_ad_accounts account
      on account.connection_id = snapshot.connection_id
    join tracker.action_value_daily metric
      on metric.ad_account_id = account.ad_account_id
      and metric.sync_version = snapshot.sync_version

    union all

    select
      'period_reach_snapshots'::text as table_name,
      snapshot.connection_id,
      snapshot.sync_version,
      period.ad_account_id,
      nullif(btrim(period.attribution_window), '') as attribution_window,
      jsonb_build_array(
        period.scope_level,
        period.campaign_id,
        period.date_from,
        period.date_to,
        period.action_report_time
      ) as grain_key
    from pinned_snapshots snapshot
    join tracker.period_reach_snapshots period
      on period.connection_id = snapshot.connection_id
      and period.sync_version = snapshot.sync_version
    join tracker.meta_ad_accounts account
      on account.ad_account_id = period.ad_account_id
      and account.connection_id = snapshot.connection_id
  )
`;

export const TABLE_SUMMARY_SQL = `${PINNED_ATTRIBUTION_ROWS_CTE},
  table_names(table_name) as (
    values
      ('daily_metrics'::text),
      ('action_metric_daily'::text),
      ('action_value_daily'::text),
      ('period_reach_snapshots'::text)
  ),
  per_account as (
    select
      table_name,
      connection_id,
      sync_version,
      ad_account_id,
      count(*) as row_count,
      count(*) filter (where attribution_window is null) as invalid_window_rows,
      count(distinct attribution_window) as attribution_window_count
    from pinned_rows
    group by table_name, connection_id, sync_version, ad_account_id
  ),
  per_grain as (
    select
      table_name,
      connection_id,
      sync_version,
      ad_account_id,
      grain_key,
      count(*) filter (where attribution_window is null) as invalid_window_rows,
      count(distinct attribution_window) as attribution_window_count
    from pinned_rows
    group by
      table_name,
      connection_id,
      sync_version,
      ad_account_id,
      grain_key
  ),
  row_totals as (
    select table_name, count(*) as active_rows
    from pinned_rows
    group by table_name
  ),
  account_totals as (
    select
      table_name,
      count(*) as active_accounts,
      count(*) filter (
        where invalid_window_rows > 0
          or attribution_window_count > 1
      ) as variant_accounts,
      coalesce(sum(invalid_window_rows), 0) as invalid_window_rows
    from per_account
    group by table_name
  ),
  grain_totals as (
    select
      table_name,
      count(*) filter (
        where invalid_window_rows > 0
          or attribution_window_count > 1
      ) as overlapping_grains
    from per_grain
    group by table_name
  )
  select
    table_names.table_name,
    coalesce(row_totals.active_rows, 0)::text as active_rows,
    coalesce(account_totals.active_accounts, 0)::text as active_accounts,
    coalesce(account_totals.variant_accounts, 0)::text as variant_accounts,
    coalesce(grain_totals.overlapping_grains, 0)::text as overlapping_grains,
    coalesce(account_totals.invalid_window_rows, 0)::text as invalid_window_rows
  from table_names
  left join row_totals using (table_name)
  left join account_totals using (table_name)
  left join grain_totals using (table_name)
  order by table_names.table_name
`;

export const CROSS_TABLE_SUMMARY_SQL = `${PINNED_ATTRIBUTION_ROWS_CTE},
  per_account as (
    select
      connection_id,
      sync_version,
      ad_account_id,
      count(*) filter (where attribution_window is null) as invalid_window_rows,
      count(distinct attribution_window) as attribution_window_count
    from pinned_rows
    group by connection_id, sync_version, ad_account_id
  )
  select
    count(*) filter (
      where invalid_window_rows > 0
        or attribution_window_count > 1
    )::text as conflict_accounts,
    coalesce(sum(invalid_window_rows), 0)::text as invalid_window_rows
  from per_account
`;

export const CONFLICT_SAMPLES_SQL = `${PINNED_ATTRIBUTION_ROWS_CTE},
  accounts as (
    select distinct connection_id, sync_version, ad_account_id
    from pinned_rows
  ),
  account_slots as (
    select
      connection_id,
      sync_version,
      ad_account_id,
      dense_rank() over (order by connection_id) as snapshot_slot,
      dense_rank() over (
        partition by connection_id
        order by ad_account_id
      ) as account_slot
    from accounts
  ),
  per_grain as (
    select
      table_name,
      connection_id,
      sync_version,
      ad_account_id,
      grain_key,
      count(*) filter (where attribution_window is null) as invalid_window_rows,
      count(distinct attribution_window) as attribution_window_count
    from pinned_rows
    group by
      table_name,
      connection_id,
      sync_version,
      ad_account_id,
      grain_key
  ),
  overlapping_grains as (
    select
      table_name,
      connection_id,
      sync_version,
      ad_account_id,
      count(*) filter (
        where invalid_window_rows > 0
          or attribution_window_count > 1
      ) as overlapping_grains
    from per_grain
    group by table_name, connection_id, sync_version, ad_account_id
  ),
  per_table_account as (
    select
      table_name,
      connection_id,
      sync_version,
      ad_account_id,
      count(*) as row_count,
      count(*) filter (where attribution_window is null) as invalid_window_rows,
      count(distinct attribution_window) as attribution_window_count,
      coalesce(
        array_agg(distinct attribution_window order by attribution_window)
          filter (where attribution_window is not null),
        '{}'::text[]
      ) as attribution_windows
    from pinned_rows
    group by table_name, connection_id, sync_version, ad_account_id
  ),
  cross_table_account as (
    select
      connection_id,
      sync_version,
      ad_account_id,
      count(*) as row_count,
      count(*) filter (where attribution_window is null) as invalid_window_rows,
      count(distinct attribution_window) as attribution_window_count,
      coalesce(
        array_agg(distinct attribution_window order by attribution_window)
          filter (where attribution_window is not null),
        '{}'::text[]
      ) as attribution_windows,
      array_agg(distinct table_name order by table_name) as source_tables
    from pinned_rows
    group by connection_id, sync_version, ad_account_id
  ),
  samples as (
    select
      per_table.table_name as scope,
      slots.snapshot_slot,
      slots.account_slot,
      per_table.row_count,
      per_table.attribution_window_count,
      per_table.attribution_windows,
      per_table.invalid_window_rows,
      coalesce(grains.overlapping_grains, 0) as overlapping_grains,
      array[per_table.table_name]::text[] as source_tables
    from per_table_account per_table
    join account_slots slots using (
      connection_id,
      sync_version,
      ad_account_id
    )
    left join overlapping_grains grains using (
      table_name,
      connection_id,
      sync_version,
      ad_account_id
    )
    where per_table.invalid_window_rows > 0
      or per_table.attribution_window_count > 1

    union all

    select
      'cross_table'::text as scope,
      slots.snapshot_slot,
      slots.account_slot,
      cross_account.row_count,
      cross_account.attribution_window_count,
      cross_account.attribution_windows,
      cross_account.invalid_window_rows,
      0::bigint as overlapping_grains,
      cross_account.source_tables
    from cross_table_account cross_account
    join account_slots slots using (
      connection_id,
      sync_version,
      ad_account_id
    )
    where cross_account.invalid_window_rows > 0
      or cross_account.attribution_window_count > 1
  )
  select
    scope,
    snapshot_slot::text,
    account_slot::text,
    row_count::text,
    attribution_window_count::text,
    attribution_windows,
    invalid_window_rows::text,
    overlapping_grains::text,
    source_tables
  from samples
  order by snapshot_slot, account_slot, scope
  limit $1
`;

const UNPINNED_DAILY_ROWS_CTE = `
  with account_sync_activity as (
    select
      account.connection_id,
      metric.ad_account_id,
      metric.sync_version,
      max(metric.fetched_at) as last_fetched_at
    from tracker.daily_metrics metric
    join tracker.meta_ad_accounts account
      on account.ad_account_id = metric.ad_account_id
    group by
      account.connection_id,
      metric.ad_account_id,
      metric.sync_version
  ),
  ranked_syncs as (
    select
      connection_id,
      ad_account_id,
      sync_version,
      row_number() over (
        partition by connection_id, ad_account_id
        order by last_fetched_at desc, sync_version desc
      ) as sync_rank
    from account_sync_activity
  ),
  latest_syncs as (
    select connection_id, ad_account_id, sync_version
    from ranked_syncs
    where sync_rank = 1
  ),
  candidate_rows as (
    select
      latest.connection_id,
      metric.sync_version,
      metric.ad_account_id,
      nullif(btrim(metric.attribution_window), '') as attribution_window,
      jsonb_build_array(
        metric.metric_date,
        metric.ad_id,
        metric.scope_key,
        metric.country,
        metric.publisher_platform,
        metric.platform_position,
        metric.impression_device,
        metric.action_report_time
      ) as grain_key
    from latest_syncs latest
    join tracker.daily_metrics metric
      on metric.ad_account_id = latest.ad_account_id
      and metric.sync_version = latest.sync_version
  )
`;

export const UNPINNED_DAILY_SUMMARY_SQL = `${UNPINNED_DAILY_ROWS_CTE},
  per_account as (
    select
      connection_id,
      sync_version,
      ad_account_id,
      count(*) filter (where attribution_window is null) as invalid_window_rows,
      count(distinct attribution_window) as attribution_window_count
    from candidate_rows
    group by connection_id, sync_version, ad_account_id
  ),
  per_grain as (
    select
      connection_id,
      sync_version,
      ad_account_id,
      grain_key,
      count(*) filter (where attribution_window is null) as invalid_window_rows,
      count(distinct attribution_window) as attribution_window_count
    from candidate_rows
    group by connection_id, sync_version, ad_account_id, grain_key
  )
  select
    (select count(*) from candidate_rows)::text as candidate_rows,
    (select count(*) from per_account)::text as candidate_accounts,
    (
      select count(*)
      from per_account
      where invalid_window_rows > 0
        or attribution_window_count > 1
    )::text as variant_accounts,
    (
      select count(*)
      from per_grain
      where invalid_window_rows > 0
        or attribution_window_count > 1
    )::text as overlapping_grains,
    (
      select coalesce(sum(invalid_window_rows), 0)
      from per_account
    )::text as invalid_window_rows
`;

export const UNPINNED_DAILY_SAMPLES_SQL = `${UNPINNED_DAILY_ROWS_CTE},
  accounts as (
    select distinct connection_id, sync_version, ad_account_id
    from candidate_rows
  ),
  account_slots as (
    select
      connection_id,
      sync_version,
      ad_account_id,
      dense_rank() over (order by connection_id) as snapshot_slot,
      dense_rank() over (
        partition by connection_id
        order by ad_account_id
      ) as account_slot
    from accounts
  ),
  per_grain as (
    select
      connection_id,
      sync_version,
      ad_account_id,
      grain_key,
      count(*) filter (where attribution_window is null) as invalid_window_rows,
      count(distinct attribution_window) as attribution_window_count
    from candidate_rows
    group by connection_id, sync_version, ad_account_id, grain_key
  ),
  overlapping_grains as (
    select
      connection_id,
      sync_version,
      ad_account_id,
      count(*) filter (
        where invalid_window_rows > 0
          or attribution_window_count > 1
      ) as overlapping_grains
    from per_grain
    group by connection_id, sync_version, ad_account_id
  ),
  per_account as (
    select
      connection_id,
      sync_version,
      ad_account_id,
      count(*) as row_count,
      count(*) filter (where attribution_window is null) as invalid_window_rows,
      count(distinct attribution_window) as attribution_window_count,
      coalesce(
        array_agg(distinct attribution_window order by attribution_window)
          filter (where attribution_window is not null),
        '{}'::text[]
      ) as attribution_windows
    from candidate_rows
    group by connection_id, sync_version, ad_account_id
  )
  select
    'daily_metrics'::text as scope,
    slots.snapshot_slot::text,
    slots.account_slot::text,
    account.row_count::text,
    account.attribution_window_count::text,
    account.attribution_windows,
    account.invalid_window_rows::text,
    coalesce(grains.overlapping_grains, 0)::text as overlapping_grains,
    array['daily_metrics']::text[] as source_tables
  from per_account account
  join account_slots slots using (
    connection_id,
    sync_version,
    ad_account_id
  )
  left join overlapping_grains grains using (
    connection_id,
    sync_version,
    ad_account_id
  )
  where account.invalid_window_rows > 0
    or account.attribution_window_count > 1
  order by slots.snapshot_slot, slots.account_slot
  limit $1
`;

export const ATTRIBUTION_AUDIT_SQL_STATEMENTS = [
  READ_ONLY_ASSERTION_SQL,
  SNAPSHOT_COUNT_SQL,
  TABLE_SUMMARY_SQL,
  CROSS_TABLE_SUMMARY_SQL,
  CONFLICT_SAMPLES_SQL,
  UNPINNED_DAILY_SUMMARY_SQL,
  UNPINNED_DAILY_SAMPLES_SQL,
] as const;

const DEFAULT_SAMPLE_LIMIT = 10;
const SAFE_ATTRIBUTION_WINDOW =
  /^(?:account_default|\d+d_(?:click|view)(?:_\d+d_(?:click|view))*)$/;

function asNonNegativeInteger(value: unknown, field: string): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "bigint"
        ? Number(value)
        : typeof value === "string" && /^\d+$/.test(value)
          ? Number(value)
          : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new TypeError(`Attribution audit returned an invalid ${field}.`);
  }
  return parsed;
}

function asTextArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new TypeError(`Attribution audit returned an invalid ${field}.`);
  }
  return value as string[];
}

export function sanitizeAttributionWindow(value: string): string {
  return SAFE_ATTRIBUTION_WINDOW.test(value)
    ? value
    : "<nonstandard-window>";
}

function asTableName(value: unknown): AttributionAuditTable {
  if (
    typeof value !== "string" ||
    !ATTRIBUTION_AUDIT_TABLES.includes(value as AttributionAuditTable)
  ) {
    throw new TypeError("Attribution audit returned an unknown table.");
  }
  return value as AttributionAuditTable;
}

function parseTableSummaries(
  rows: readonly Record<string, unknown>[],
): AttributionTableAuditSummary[] {
  if (rows.length !== ATTRIBUTION_AUDIT_TABLES.length) {
    throw new TypeError(
      "Attribution audit did not return every required table.",
    );
  }
  const parsed = rows.map((row) => ({
    table: asTableName(row.table_name),
    activeRows: asNonNegativeInteger(row.active_rows, "active row count"),
    activeAccounts: asNonNegativeInteger(
      row.active_accounts,
      "active account count",
    ),
    variantAccounts: asNonNegativeInteger(
      row.variant_accounts,
      "variant account count",
    ),
    overlappingGrains: asNonNegativeInteger(
      row.overlapping_grains,
      "overlapping grain count",
    ),
    invalidWindowRows: asNonNegativeInteger(
      row.invalid_window_rows,
      "invalid window row count",
    ),
  }));
  const returnedTables = new Set(parsed.map((summary) => summary.table));
  if (
    returnedTables.size !== ATTRIBUTION_AUDIT_TABLES.length ||
    ATTRIBUTION_AUDIT_TABLES.some(
      (table) => !returnedTables.has(table),
    )
  ) {
    throw new TypeError(
      "Attribution audit did not return every required table exactly once.",
    );
  }
  return ATTRIBUTION_AUDIT_TABLES.map(
    (table) => parsed.find((summary) => summary.table === table)!,
  );
}

function parseConflictSamples(
  rows: readonly Record<string, unknown>[],
): AttributionConflictSample[] {
  return rows.map((row) => {
    const scope =
      row.scope === "cross_table" ? "cross_table" : asTableName(row.scope);
    const sourceTables = asTextArray(
      row.source_tables,
      "sample source tables",
    ).map(asTableName);
    return {
      scope,
      snapshotSlot: asNonNegativeInteger(
        row.snapshot_slot,
        "sample snapshot slot",
      ),
      accountSlot: asNonNegativeInteger(
        row.account_slot,
        "sample account slot",
      ),
      rowCount: asNonNegativeInteger(row.row_count, "sample row count"),
      attributionWindowCount: asNonNegativeInteger(
        row.attribution_window_count,
        "sample attribution window count",
      ),
      attributionWindows: asTextArray(
        row.attribution_windows,
        "sample attribution windows",
      ).map(sanitizeAttributionWindow),
      invalidWindowRows: asNonNegativeInteger(
        row.invalid_window_rows,
        "sample invalid window row count",
      ),
      overlappingGrains: asNonNegativeInteger(
        row.overlapping_grains,
        "sample overlapping grain count",
      ),
      sourceTables,
    };
  });
}

async function loadUnpinnedDailyDiagnostic(
  query: AttributionAuditQuery,
  sampleLimit: number,
): Promise<UnpinnedDailyDiagnostic> {
  const rows = await query(UNPINNED_DAILY_SUMMARY_SQL);
  if (rows.length !== 1) {
    throw new TypeError(
      "Attribution audit returned an invalid unpinned diagnostic.",
    );
  }
  const candidateRows = asNonNegativeInteger(
    rows[0]?.candidate_rows,
    "unpinned candidate row count",
  );
  const candidateAccounts = asNonNegativeInteger(
    rows[0]?.candidate_accounts,
    "unpinned candidate account count",
  );
  const variantAccounts = asNonNegativeInteger(
    rows[0]?.variant_accounts,
    "unpinned variant account count",
  );
  const overlappingGrains = asNonNegativeInteger(
    rows[0]?.overlapping_grains,
    "unpinned overlapping grain count",
  );
  const invalidWindowRows = asNonNegativeInteger(
    rows[0]?.invalid_window_rows,
    "unpinned invalid window row count",
  );
  const hasConflict =
    variantAccounts > 0 ||
    overlappingGrains > 0 ||
    invalidWindowRows > 0;
  return {
    basis: "latest_fetched_sync_per_account",
    releaseEvidence: false,
    candidateRows,
    candidateAccounts,
    variantAccounts,
    overlappingGrains,
    invalidWindowRows,
    conflictSamples: hasConflict
      ? parseConflictSamples(
          await query(UNPINNED_DAILY_SAMPLES_SQL, [sampleLimit]),
        )
      : [],
  };
}

export async function runAttributionAudit(
  query: AttributionAuditQuery,
  sampleLimit = DEFAULT_SAMPLE_LIMIT,
): Promise<AttributionAuditReport> {
  if (!Number.isSafeInteger(sampleLimit) || sampleLimit < 1 || sampleLimit > 50) {
    throw new TypeError(
      "Attribution audit sample limit must be an integer from 1 through 50.",
    );
  }

  const readOnlyRows = await query(READ_ONLY_ASSERTION_SQL);
  if (
    readOnlyRows.length !== 1 ||
    readOnlyRows[0]?.transaction_read_only !== "on"
  ) {
    throw new Error(
      "Attribution audit requires a server-confirmed read-only transaction.",
    );
  }

  const snapshotRows = await query(SNAPSHOT_COUNT_SQL);
  if (snapshotRows.length !== 1) {
    throw new TypeError(
      "Attribution audit returned an invalid snapshot count.",
    );
  }
  const snapshotCount = asNonNegativeInteger(
    snapshotRows[0]?.snapshot_count,
    "snapshot count",
  );
  const tableSummaries = parseTableSummaries(
    await query(TABLE_SUMMARY_SQL),
  );
  const crossRows = await query(CROSS_TABLE_SUMMARY_SQL);
  if (crossRows.length !== 1) {
    throw new TypeError(
      "Attribution audit returned an invalid cross-table summary.",
    );
  }
  const crossTableConflictAccounts = asNonNegativeInteger(
    crossRows[0]?.conflict_accounts,
    "cross-table conflict account count",
  );
  const crossTableInvalidWindowRows = asNonNegativeInteger(
    crossRows[0]?.invalid_window_rows,
    "cross-table invalid window row count",
  );
  const activeRowCount = tableSummaries.reduce(
    (total, summary) => total + summary.activeRows,
    0,
  );
  const hasConflict =
    tableSummaries.some(
      (summary) =>
        summary.variantAccounts > 0 ||
        summary.overlappingGrains > 0 ||
        summary.invalidWindowRows > 0,
    ) ||
    crossTableConflictAccounts > 0 ||
    crossTableInvalidWindowRows > 0;
  const conflictSamples = hasConflict
    ? parseConflictSamples(
        await query(CONFLICT_SAMPLES_SQL, [sampleLimit]),
      )
    : [];
  const status =
    snapshotCount === 0 || activeRowCount === 0
      ? "inconclusive"
      : hasConflict
        ? "conflict"
        : "pass";
  const unpinnedDailyDiagnostic =
    snapshotCount === 0 || activeRowCount === 0
      ? await loadUnpinnedDailyDiagnostic(query, sampleLimit)
      : null;

  return {
    scope: "current_published_snapshot",
    status,
    releaseSafe: status === "pass",
    snapshotCount,
    activeRowCount,
    tableSummaries,
    crossTableConflictAccounts,
    crossTableInvalidWindowRows,
    conflictSamples,
    unpinnedDailyDiagnostic,
    sampleLimit,
  };
}
