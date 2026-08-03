import { describe, expect, it } from "vitest";

import {
  evaluateCreativeFatigue,
  type CreativeFatigueWindow,
} from "./creative-fatigue";

const baseline: CreativeFatigueWindow = {
  days: 7,
  minimumSampleMet: true,
  frequency: 2,
  linkCtr: 0.1,
  costPerResult: 100,
  resultVolume: 100,
};

function evaluate(
  recent: Partial<CreativeFatigueWindow> = {},
  previous: Partial<CreativeFatigueWindow> = {},
) {
  return evaluateCreativeFatigue({
    previous: { ...baseline, ...previous },
    recent: { ...baseline, ...recent },
  });
}

describe("evaluateCreativeFatigue", () => {
  it.each([
    ["frequency", { frequency: 2.4 }],
    ["link CTR", { linkCtr: 0.085 }],
    ["cost per result", { costPerResult: 120 }],
    ["result volume", { resultVolume: 80 }],
  ] as const)("treats the %s threshold as an adverse signal", (_, recent) => {
    const result = evaluate(recent);

    expect(result.status).toBe("monitor");
    expect(result.adverseSignalCount).toBe(1);
    expect(result.signals.filter((signal) => signal.adverse)).toHaveLength(1);
  });

  it("keeps changes inside all thresholds stable", () => {
    const result = evaluate({
      frequency: 2.399,
      linkCtr: 0.08501,
      costPerResult: 119.99,
      resultVolume: 80.01,
    });

    expect(result).toMatchObject({
      status: "stable",
      adverseSignalCount: 0,
      windowDays: 7,
      reasonCodes: [],
    });
  });

  it("returns fatigue risk when Frequency and another adverse signal are present", () => {
    const result = evaluate({
      frequency: 2.4,
      linkCtr: 0.085,
      costPerResult: 130,
      resultVolume: 70,
    });

    expect(result.status).toBe("fatigue_risk");
    expect(result.adverseSignalCount).toBe(4);
  });

  it("keeps non-Frequency signal combinations in monitor state", () => {
    const result = evaluate({
      linkCtr: 0.08,
      costPerResult: 130,
      resultVolume: 70,
    });

    expect(result).toMatchObject({
      status: "monitor",
      adverseSignalCount: 3,
    });
  });

  it("fails closed when either window has not reached its minimum sample", () => {
    const result = evaluate({}, { minimumSampleMet: false });

    expect(result).toMatchObject({
      status: "insufficient",
      reasonCodes: ["minimum_sample_not_met"],
    });
  });

  it("does not fabricate a signal for missing input or a zero baseline", () => {
    const result = evaluate(
      { linkCtr: null },
      { costPerResult: 0 },
    );

    expect(result.status).toBe("insufficient");
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        "metric_input_missing",
        "previous_value_zero",
      ]),
    );
    expect(
      result.signals.find((signal) => signal.metric === "link_ctr"),
    ).toMatchObject({ deltaPercent: null, adverse: null });
    expect(
      result.signals.find((signal) => signal.metric === "cost_per_result"),
    ).toMatchObject({ deltaPercent: null, adverse: null });
  });

  it("requires the two windows to represent the same positive day count", () => {
    const result = evaluate({ days: 7 }, { days: 6 });

    expect(result).toMatchObject({
      status: "insufficient",
      windowDays: null,
      reasonCodes: ["window_days_mismatch"],
    });
  });
});
