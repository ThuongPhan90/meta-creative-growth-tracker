import { describe, expect, it } from "vitest";

import {
  DEFAULT_OBJECTIVE_REGISTRY,
  objectiveDatabaseKeys,
  objectiveLabel,
  resolveObjective,
} from "./objective-registry";

describe("objective registry", () => {
  it.each([
    ["OUTCOME_AWARENESS", "awareness", "Nhận diện"],
    ["OUTCOME_TRAFFIC", "traffic", "Lưu lượng truy cập"],
    ["OUTCOME_ENGAGEMENT", "engagement", "Tương tác"],
    ["OUTCOME_LEADS", "leads", "Khách hàng tiềm năng"],
    ["OUTCOME_APP_PROMOTION", "app_promotion", "Quảng bá ứng dụng"],
    ["OUTCOME_SALES", "sales", "Doanh số"],
  ])("maps %s to friendly buyer wording", (raw, key, label) => {
    expect(resolveObjective(raw)).toEqual({
      key,
      label,
      rawObjectiveKey: raw,
      known: true,
    });
  });

  it("supports canonical and legacy keys without exposing raw codes", () => {
    expect(objectiveLabel("sales")).toBe("Doanh số");
    expect(resolveObjective("lead_generation")).toMatchObject({
      key: "leads",
      label: "Khách hàng tiềm năng",
      known: true,
    });
  });

  it("keeps an unknown raw code only as technical metadata", () => {
    expect(resolveObjective("OUTCOME_FUTURE")).toEqual({
      key: "outcome_future",
      label: "Mục tiêu khác",
      rawObjectiveKey: "OUTCOME_FUTURE",
      known: false,
    });
  });

  it("contains the six objective groups from the universal buyer brief", () => {
    expect(DEFAULT_OBJECTIVE_REGISTRY.map((item) => item.key)).toEqual([
      "awareness",
      "traffic",
      "engagement",
      "leads",
      "app_promotion",
      "sales",
    ]);
  });

  it("expands one canonical Objective into safe database filter keys", () => {
    expect(objectiveDatabaseKeys("leads")).toEqual([
      "LEADS",
      "OUTCOME_LEADS",
      "LEAD_GENERATION",
    ]);
    expect(objectiveDatabaseKeys("OUTCOME_SALES")).toEqual([
      "SALES",
      "OUTCOME_SALES",
      "CONVERSIONS",
      "PRODUCT_CATALOG_SALES",
    ]);
    expect(objectiveDatabaseKeys("all")).toEqual([]);
  });
});
