# Universal Buyer V2

Universal Buyer V2 keeps the tracker Meta-only and read-only while removing
the previous assumption that every campaign optimizes for App Install. The
reporting axis is now:

```text
Meta Objective
  -> selected canonical Result
  -> dynamic metrics
  -> matching peer-group benchmark
  -> explainable Creative evaluation
```

No workflow in this release creates, edits, pauses, or changes budget on Meta.
Result mappings and reporting scope are local tracker configuration only.

## Reporting contract

Every reporting read is resolved against one effective context:

- Business and Ad Account IDs.
- Date range and comparison mode.
- Objective and canonical primary Result.
- Currency mode (`single` or `split`).
- Attribution setting and action report time.
- Account-local reporting timezone mode.
- A pinned successful sync version.

Reporting APIs return `{ data, meta }`. `meta` echoes the effective context and
contains `dataThrough`, `lastSuccessfulSyncAt`, sync status, coverage, and
fail-visible warnings. A missing or inaccessible saved scope is narrowed
instead of silently widening the report.

## Data correctness rules

- Results from different Objectives are never added into one total.
- Spend is added only inside one currency; mixed currencies are split.
- Period Reach is read from the exact period snapshot and is never calculated
  by summing daily Reach.
- Dynamic/Advantage+ multi-asset Ads remain at mixed-Ad scope unless Meta
  provides safe asset attribution. Spend is not copied or divided across
  assets.
- Canonical Result facts are pinned to attribution, action report time, sync
  version, and Result mapping version.
- Creative evaluation requires an eligible peer group and returns its metric,
  benchmark, delta, sample size, data confidence, fatigue state, reasons, and
  read-only recommendation.

## Schema changes and rollback notes

| Migration | Purpose | Safe rollback posture |
| --- | --- | --- |
| `0005_reporting_snapshot.sql` | Atomic reporting snapshot/version state | Keep the table during code rollback; older code ignores it. |
| `0006_reporting_scope.sql` | Persisted Business/Ad Account selection | Keep selections; older code ignores them. |
| `0007_result_definitions.sql` | Result registry, mappings, and overrides | Keep registry rows so mappings are recoverable after redeploy. |
| `0008_normalized_result_facts.sql` | Snapshot-pinned canonical Result facts | Stop publishing new facts before any manual removal. |
| `0009_period_reach_snapshots.sql` | Exact period-level Reach | Keep snapshots; falling back to daily Reach summation is not allowed. |

These migrations are additive. The preferred rollback is to redeploy the prior
application version while retaining the new tables. Dropping tables is a
separate, manual, destructive operation and requires a database backup plus
explicit owner approval.

## Release verification

Use the repository-pinned runtime and package manager:

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm db:migrate
```

Before production rollout, verify:

1. URL scope survives reload and cross-page navigation.
2. Overview, Creative, and Campaign reads echo the same context and sync
   version.
3. Multi-objective and split-currency views do not expose aggregate
   Cost/Result.
4. Business, Account, Campaign, Creative, and Data Health links have a
   downstream destination.
5. Direct detail URLs, browser back/forward, and modified-click new-tab
   navigation retain the reporting context.
6. Desktop and mobile layouts pass visual comparison and console-error checks.

## Stacked pull-request plan

The implementation is split into reviewable layers:

1. Data contract, migrations, sync normalization, and repository queries.
2. Reporting/meta/health APIs and server-side application adapters.
3. Universal Buyer UI, navigation, responsive behavior, and visual QA.

Merge in that order. Do not deploy an upper layer without all lower layers.
