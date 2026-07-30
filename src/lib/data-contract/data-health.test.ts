import { describe, expect, it } from "vitest";

import {
  aggregateDataHealthIssues,
  buildDataHealthIssueId,
  buildDataHealthIssueDetailsFromRuns,
  buildDataHealthIssuesFromRuns,
  normalizeDataHealthResource,
} from "./data-health";

const asset = (entityId: string) => ({
  entityType: "asset" as const,
  entityId,
  label: null,
});

describe("Data Health issue identity and grouping", () => {
  it("keeps a stable ID across entity ordering and message changes", () => {
    const entities = [asset("asset_b"), asset("asset_a")];
    expect(
      buildDataHealthIssueId("meta_resource_filter_fallback", entities),
    ).toBe(
      buildDataHealthIssueId("META_RESOURCE_FILTER_FALLBACK", [
        asset("asset_a"),
        asset("asset_b"),
      ]),
    );
  });

  it("aggregates exact groups but keeps the same code on another asset separate", () => {
    const issues = aggregateDataHealthIssues([
      {
        technicalCode: "META_RESOURCE_FILTER_FALLBACK",
        severity: "warning",
        userMessage: "Một số tài sản dùng cơ chế dự phòng",
        impact: "creative_identity_partial",
        affectedEntities: [asset("asset_a")],
        occurredAt: "2026-07-30T01:00:00.000Z",
      },
      {
        technicalCode: "META_RESOURCE_FILTER_FALLBACK",
        severity: "error",
        userMessage: "Danh tính tài sản chưa đầy đủ",
        impact: "creative_identity_partial",
        affectedEntities: [asset("asset_a")],
        occurredAt: "2026-07-30T02:00:00.000Z",
      },
      {
        technicalCode: "META_RESOURCE_FILTER_FALLBACK",
        severity: "warning",
        userMessage: "Một số tài sản dùng cơ chế dự phòng",
        impact: "creative_identity_partial",
        affectedEntities: [asset("asset_b")],
      },
    ]);

    expect(issues).toHaveLength(2);
    expect(issues.find((issue) => issue.affectedEntities[0]?.entityId === "asset_a"))
      .toMatchObject({
        occurrenceCount: 2,
        affectedGroupCount: 1,
        severity: "error",
        firstOccurredAt: "2026-07-30T01:00:00.000Z",
        lastOccurredAt: "2026-07-30T02:00:00.000Z",
      });
  });

  it("normalizes a resource edge to its canonical entity before hashing", () => {
    expect(normalizeDataHealthResource("act_123/ads")).toEqual([
      {
        entityType: "ad_account",
        entityId: "act_123",
        label: "act_123",
      },
    ]);
    expect(normalizeDataHealthResource("creative:456")).toEqual([
      {
        entityType: "meta_creative",
        entityId: "456",
        label: "456",
      },
    ]);
    expect(
      normalizeDataHealthResource("business-1/client_apps"),
    ).toEqual([
      {
        entityType: "business",
        entityId: "business-1",
        label: "business-1",
      },
    ]);
  });

  it("uses one stable issue identity for the UI and detail projection", () => {
    const runs = [
      {
        id: "run-1",
        kind: "Đồng bộ",
        status: "partial" as const,
        startedAt: "30/07/2026",
        finishedAt: "30/07/2026",
        startedAtIso: "2026-07-30T01:00:00.000Z",
        finishedAtIso: "2026-07-30T01:02:00.000Z",
        summary: "Một cảnh báo",
        warnings: [
          {
            code: "META_RESOURCE_FILTER_FALLBACK",
            resource: "act_123/ads",
            message: "Meta fallback",
          },
        ],
      },
    ];

    const uiIssue = buildDataHealthIssuesFromRuns(runs)[0];
    const apiDetail = buildDataHealthIssueDetailsFromRuns(runs)[0];

    expect(uiIssue.issueId).toBe(apiDetail.issue.issueId);
    expect(uiIssue.affectedEntities).toEqual([
      expect.objectContaining({
        entityType: "ad_account",
        entityId: "act_123",
      }),
    ]);
    expect(apiDetail.occurrences).toEqual([
      expect.objectContaining({
        resource: "act_123/ads",
      }),
    ]);
  });
});
