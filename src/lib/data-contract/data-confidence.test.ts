import { describe, expect, it } from "vitest";

import { deriveDataConfidence } from "./data-confidence";

const readyInput = {
  coverageRatio: 0.98,
  sampleSize: 30,
  minimumSampleSize: 20,
};

describe("deriveDataConfidence", () => {
  it.each([
    [{ ...readyInput }, ["ready", "high"]],
    [
      { ...readyInput, hasRequiredMapping: false },
      ["missing_mapping", "low"],
    ],
    [{ ...readyInput, isStale: true }, ["stale", "low"]],
    [
      { ...readyInput, sampleSize: 10 },
      ["insufficient", "low"],
    ],
    [
      { ...readyInput, coverageRatio: 0.9 },
      ["partial", "medium"],
    ],
    [
      { ...readyInput, coverageRatio: 0.5 },
      ["partial", "low"],
    ],
  ] as const)("returns deterministic status and confidence", (input, expected) => {
    const result = deriveDataConfidence(input);
    expect([result.dataStatus, result.confidence]).toEqual(expected);
  });
});
