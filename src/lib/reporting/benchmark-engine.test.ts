import { describe, expect, it } from "vitest";

import {
  selectBenchmark,
  type BenchmarkCandidatePools,
  type BenchmarkObservation,
  type BenchmarkPeerGroupMethod,
  type BenchmarkReason,
} from "./benchmark-engine";

const target = {
  sampleKey: "target-creative",
  adAccountId: "account-1",
  selectedBusinessIds: ["business-1"],
  selectedAdAccountIds: ["account-1", "account-2", "account-3"],
  objectiveKey: "leads",
  resultKey: "lead",
  format: "video",
  currency: "usd",
  labels: {
    adAccount: "Account One",
    selectedBusiness: "Business One",
    selectedScope: "Selected Accounts",
    objective: "Leads",
    result: "Lead",
    format: "Video",
  },
};

const costPerResultMetric = {
  metricKey: "cost_per_result",
  direction: "lower_is_better" as const,
  aggregation: "cost_per_result" as const,
};

function observation(
  sampleKey: string,
  overrides: Partial<BenchmarkObservation> = {},
): BenchmarkObservation {
  return {
    sampleKey,
    adAccountId: "account-1",
    businessId: "business-1",
    objectiveKey: "leads",
    resultKey: "lead",
    format: "video",
    currency: "USD",
    spend: 100,
    results: 10,
    ...overrides,
  };
}

describe("selectBenchmark", () => {
  it("uses the exact peer group and aggregates cost per result from additive totals", () => {
    const result = selectBenchmark({
      target,
      metric: costPerResultMetric,
      minimumSampleSize: 2,
      candidatePools: {
        exact: [
          observation("peer-a", { spend: 100, results: 10 }),
          observation("peer-a", { spend: 50, results: 5 }),
          observation("peer-b", { spend: 200, results: 10 }),
        ],
      },
    });

    expect(result).toEqual({
      label: "Account One · Leads · Lead · Video · USD",
      sampleSize: 2,
      value: 14,
      method: "exact",
      reason: "exact_peer_group_sufficient",
      metricKey: "cost_per_result",
      direction: "lower_is_better",
      aggregation: "cost_per_result",
    });
  });

  it.each<{
    method: Exclude<BenchmarkPeerGroupMethod, "exact" | "none">;
    reason: BenchmarkReason;
    label: string;
    peers: BenchmarkObservation[];
  }>([
    {
      method: "account_objective_result_format",
      reason: "exact_peer_group_insufficient",
      label: "Account One · Leads · Lead · Video · USD",
      peers: [observation("peer-a"), observation("peer-b")],
    },
    {
      method: "account_objective_result",
      reason: "account_format_peer_group_insufficient",
      label: "Account One · Leads · Lead · USD",
      peers: [
        observation("peer-a", { format: "image" }),
        observation("peer-b", { format: "carousel" }),
      ],
    },
    {
      method: "selected_business_objective_result_format",
      reason: "account_result_peer_group_insufficient",
      label: "Business One · Leads · Lead · Video · USD",
      peers: [
        observation("peer-a", { adAccountId: "account-2" }),
        observation("peer-b", { adAccountId: "account-3" }),
      ],
    },
    {
      method: "selected_scope_objective_result",
      reason: "business_format_peer_group_insufficient",
      label: "Selected Accounts · Leads · Lead · USD",
      peers: [
        observation("peer-a", {
          adAccountId: "account-2",
          businessId: "business-2",
          format: "image",
        }),
        observation("peer-b", {
          adAccountId: "account-3",
          businessId: "business-3",
          format: "carousel",
        }),
      ],
    },
  ])(
    "uses the $method fallback only after narrower pools are insufficient",
    ({ method, reason, label, peers }) => {
      const candidatePools: BenchmarkCandidatePools = {
        exact: [observation("only-exact-peer")],
        [method]: peers,
      };

      const result = selectBenchmark({
        target,
        metric: costPerResultMetric,
        minimumSampleSize: 2,
        candidatePools,
      });

      expect(result).toMatchObject({
        method,
        reason,
        label,
        sampleSize: 2,
        value: 10,
      });
    },
  );

  it("never mixes currencies while falling back", () => {
    const result = selectBenchmark({
      target,
      metric: costPerResultMetric,
      minimumSampleSize: 2,
      candidatePools: {
        exact: [
          observation("usd-a", { spend: 100, results: 10 }),
          observation("vnd-a", {
            currency: "VND",
            spend: 24_000_000,
            results: 10,
          }),
        ],
        account_objective_result_format: [
          observation("usd-a", { spend: 100, results: 10 }),
          observation("usd-b", { spend: 200, results: 10 }),
          observation("vnd-a", {
            currency: "VND",
            spend: 24_000_000,
            results: 10,
          }),
        ],
      },
    });

    expect(result).toMatchObject({
      method: "account_objective_result_format",
      sampleSize: 2,
      value: 15,
      direction: "lower_is_better",
    });
  });

  it("returns no benchmark when only cross-currency, cross-objective or cross-result rows fill the sample", () => {
    const contaminatedPool = [
      observation("valid-peer"),
      observation("other-currency", { currency: "VND" }),
      observation("other-objective", { objectiveKey: "sales" }),
      observation("other-result", { resultKey: "purchase" }),
    ];
    const candidatePools = Object.fromEntries(
      [
        "exact",
        "account_objective_result_format",
        "account_objective_result",
        "selected_business_objective_result_format",
        "selected_scope_objective_result",
      ].map((method) => [method, contaminatedPool]),
    ) as BenchmarkCandidatePools;

    const result = selectBenchmark({
      target,
      metric: costPerResultMetric,
      minimumSampleSize: 2,
      candidatePools,
    });

    expect(result).toEqual({
      label: "Chưa đủ mẫu so sánh",
      sampleSize: 1,
      value: null,
      method: "none",
      reason: "insufficient_comparable_sample",
      metricKey: "cost_per_result",
      direction: "lower_is_better",
      aggregation: "cost_per_result",
    });
  });

  it("preserves generic direction metadata for a weighted mean", () => {
    const result = selectBenchmark({
      target,
      metric: {
        metricKey: "result_rate",
        direction: "higher_is_better",
        aggregation: "weighted_mean",
      },
      minimumSampleSize: 2,
      candidatePools: {
        exact: [
          observation("peer-a", { value: 0.1, weight: 100 }),
          observation("peer-b", { value: 0.2, weight: 300 }),
        ],
      },
    });

    expect(result).toMatchObject({
      value: 0.175,
      direction: "higher_is_better",
      aggregation: "weighted_mean",
    });
  });

  it("does not fabricate cost per result when every comparable peer has zero results", () => {
    const zeroResultPeers = [
      observation("peer-a", { spend: 100, results: 0 }),
      observation("peer-b", { spend: 200, results: 0 }),
    ];

    const result = selectBenchmark({
      target,
      metric: costPerResultMetric,
      minimumSampleSize: 2,
      candidatePools: {
        exact: zeroResultPeers,
      },
    });

    expect(result).toMatchObject({
      method: "none",
      sampleSize: 2,
      value: null,
      reason: "no_aggregatable_value",
    });
  });
});
