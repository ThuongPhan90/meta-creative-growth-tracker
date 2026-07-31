# Production attribution audit

`pnpm db:audit:attribution` is a release gate for the attribution data referenced
by the current `tracker.reporting_snapshots` pointers. It checks:

- `daily_metrics`;
- `action_metric_daily`;
- `action_value_daily`;
- `period_reach_snapshots`.

The audit detects blank attribution labels, more than one attribution window in
one account/snapshot, overlapping windows at the same natural grain, and window
disagreement between the four tables. Different accounts may use different
windows.

## Safety contract

- `DATABASE_URL` is read only from the process environment. Never pass it as a
  command-line argument or paste it into a terminal command, log, screenshot,
  issue, or pull request.
- The script opens one TLS connection and starts a `REPEATABLE READ, READ ONLY`
  transaction. It refuses to continue unless Postgres reports
  `transaction_read_only=on`.
- Every statement issued by the audit is a `SELECT`/`WITH` query. It does not
  migrate, repair, delete, update, resync, or rotate credentials.
- Output contains aggregate counts and ordinal sample slots only. It does not
  print the connection string, database identity, account IDs/names, campaign
  IDs/names, metric values, token data, or raw nonstandard attribution labels.
- The scope is the currently published snapshot, not every archived sync. This
  is the exact scope an `account_default` Production report can read.
- If the publish pointer or its rows are missing, the result stays
  `inconclusive`. A secondary diagnostic audits the most recently fetched
  `daily_metrics.sync_version` candidate for each account, but it is explicitly
  marked `releaseEvidence: false` and can never turn the gate green.

Inject the Production `DATABASE_URL` through an approved secret manager or an
approved ephemeral environment, then run:

```text
pnpm db:audit:attribution
```

Remove the environment variable from the local process after the run. Do not
write Production secrets to `.env`, `.env.local`, the repository, or a Preview
deployment.

## Exit codes

- `0`: populated published snapshot, no attribution conflict found;
- `1`: configuration, connection, schema, or read-only verification failed;
- `2`: conflicts found, or the audit was inconclusive because no populated
  published snapshot existed.

Exit `1` and `2` both block merge/deploy. A conflict report is diagnostic only:
repair or resync is a separate, explicitly approved operation and must be
followed by another successful read-only audit.
