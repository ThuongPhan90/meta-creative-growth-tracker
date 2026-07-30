import { createHash } from "node:crypto";

import type {
  DataHealthAffectedEntity,
  DataHealthIssue,
  DataHealthSeverity,
  SyncRunView,
} from "@/types/view-models";

export type DataHealthIssueOccurrence = {
  technicalCode: string;
  severity: DataHealthSeverity;
  userMessage: string;
  impact: string;
  affectedEntities: readonly DataHealthAffectedEntity[];
  occurredAt?: string | null;
};

export type DataHealthIssueOccurrenceDetail = {
  syncRunId: string;
  occurredAt: string | null;
  resource: string | null;
  technicalMessage: string;
};

export type DataHealthIssueDetail = {
  issue: DataHealthIssue;
  occurrences: DataHealthIssueOccurrenceDetail[];
};

export type DataHealthRunEvidence = {
  /** Count of structured warning entries that can be assigned to issue IDs. */
  warningEntryCount: number;
  /**
   * Aggregate row count reported by the sync run. It cannot be distributed
   * across warning codes unless the source supplies that relationship.
   */
  reportedRowCount: number | null;
};

const SEVERITY_RANK: Record<DataHealthSeverity, number> = {
  info: 0,
  warning: 1,
  error: 2,
  critical: 3,
};

const WARNING_PRESENTATION: Record<
  string,
  { userMessage: string; impact: string }
> = {
  META_RESOURCE_FILTER_FALLBACK: {
    userMessage: "Một số tài sản cần dùng phương thức truy xuất dự phòng",
    impact:
      "Phạm vi tài sản vẫn được giữ, nhưng lần đồng bộ có thể chậm hoặc thiếu metadata phụ.",
  },
  META_CREATIVE_INACCESSIBLE: {
    userMessage: "Một số Creative không còn truy cập được từ Meta",
    impact:
      "Danh tính hoặc quan hệ sử dụng của Creative liên quan có thể chưa đầy đủ.",
  },
  META_CREATIVE_PHYSICAL_ASSET_UNRESOLVED: {
    userMessage: "Một số Creative chưa xác định được tài sản vật lý",
    impact:
      "Delivery vẫn được giữ ở phạm vi Ads và không bị gán nhầm sang Creative Family.",
  },
  META_INSIGHT_BREAKDOWN_FALLBACK: {
    userMessage: "Một số chỉ số dùng mức phân tách dữ liệu thấp hơn",
    impact:
      "Tổng phân phối vẫn được giữ, nhưng một số chiều phân tích có thể chưa đầy đủ.",
  },
  META_INSIGHT_ROW_UNMAPPED: {
    userMessage: "Một số dòng Insights chưa liên kết được với Ads",
    impact:
      "Chỉ số của Ads hoặc Creative liên quan có thể thấp hơn thực tế trong khoảng ngày này.",
  },
  META_DUPLICATE_INSIGHT_ROW: {
    userMessage: "Meta trả về dòng Insights trùng lặp",
    impact:
      "Hệ thống đã loại trùng theo khóa tự nhiên; nên theo dõi nếu cảnh báo lặp lại.",
  },
  META_ASSET_MAPPING_PARTIAL: {
    userMessage: "Một phần Creative chưa xác định được tài sản vật lý",
    impact:
      "Delivery vẫn giữ ở phạm vi Ads và không được gán nhầm sang Creative Family.",
  },
  META_ASSET_BREAKDOWN_UNAVAILABLE: {
    userMessage: "Một số dữ liệu chưa có phân tách theo Creative",
    impact:
      "Delivery nhiều tài sản được giữ an toàn ở phạm vi Ads thay vì phân bổ ước đoán.",
  },
  META_ASSET_BREAKDOWN_NOT_RECONCILED: {
    userMessage: "Một số chỉ số Creative chưa khớp tổng phân phối",
    impact:
      "Các nhóm không khớp vẫn được giữ ở phạm vi Ads để tránh báo cáo sai Creative.",
  },
  META_ACCOUNT_METRICS_PRESERVED: {
    userMessage: "Dữ liệu cũ được giữ lại cho một tài khoản quảng cáo",
    impact:
      "Lần đồng bộ mới chưa đủ để thay thế dữ liệu trước đó một cách an toàn.",
  },
};

function required(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${field} cannot be empty`);
  return trimmed;
}

function connectionEntity(): DataHealthAffectedEntity {
  return {
    entityType: "connection",
    entityId: "connection",
    label: "Kết nối Meta",
  };
}

/**
 * Converts technical resource paths into canonical route identities before
 * issue hashing. A child edge such as `act_123/ads` belongs to account
 * `act_123`; the edge name must never leak into `entityId`.
 */
export function normalizeDataHealthResource(
  resource: string | null | undefined,
): DataHealthAffectedEntity[] {
  const normalized = resource?.trim() ?? "";
  if (!normalized || normalized.toLowerCase() === "insights") {
    return [connectionEntity()];
  }

  const [rootWithPrefix, ...edgeParts] = normalized.split("/");
  const root = rootWithPrefix.trim();
  const edge = edgeParts.join("/").toLowerCase();
  if (!root) return [connectionEntity()];

  const separator = root.indexOf(":");
  const prefix =
    separator > 0 ? root.slice(0, separator).toLowerCase() : "";
  const prefixedId =
    separator > 0 ? root.slice(separator + 1).trim() : root;
  const prefixTypes: Partial<
    Record<string, DataHealthAffectedEntity["entityType"]>
  > = {
    business: "business",
    account: "ad_account",
    ad_account: "ad_account",
    campaign: "campaign",
    adset: "ad_set",
    ad_set: "ad_set",
    ad: "ad",
    creative: "meta_creative",
    meta_creative: "meta_creative",
    asset: "asset",
    page: "page",
  };
  const prefixedType = prefixTypes[prefix];
  if (prefixedType && prefixedId) {
    return [
      {
        entityType: prefixedType,
        entityId: prefixedId,
        label: prefixedId,
      },
    ];
  }

  if (root.toLowerCase().startsWith("act_")) {
    return [
      {
        entityType: "ad_account",
        entityId: root,
        label: root,
      },
    ];
  }

  if (
    edge.startsWith("client_") ||
    edge.startsWith("owned_") ||
    /^business[-_]/i.test(root)
  ) {
    return [
      {
        entityType: "business",
        entityId: root,
        label: root,
      },
    ];
  }

  return [connectionEntity()];
}

function canonicalEntities(
  entities: readonly DataHealthAffectedEntity[],
): DataHealthAffectedEntity[] {
  const byKey = new Map<string, DataHealthAffectedEntity>();
  for (const entity of entities) {
    const entityType = required(entity.entityType, "entityType");
    const entityId = required(entity.entityId, "entityId");
    const key = `${entityType}:${entityId}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        entityType: entity.entityType,
        entityId,
        label: entity.label?.trim() || null,
      });
    }
  }
  return [...byKey].sort(([left], [right]) => left.localeCompare(right)).map(
    ([, entity]) => entity,
  );
}

function issueIdentity(
  technicalCode: string,
  affectedEntities: readonly DataHealthAffectedEntity[],
): string {
  const entityKey = canonicalEntities(affectedEntities)
    .map((entity) => `${entity.entityType}:${entity.entityId}`)
    .join("|");
  return `${required(technicalCode, "technicalCode").toUpperCase()}|${entityKey}`;
}

export function buildDataHealthIssueId(
  technicalCode: string,
  affectedEntities: readonly DataHealthAffectedEntity[],
): string {
  const digest = createHash("sha256")
    .update(issueIdentity(technicalCode, affectedEntities), "utf8")
    .digest("hex")
    .slice(0, 24);
  return `issue_${digest}`;
}

function laterIso(
  current: string | null,
  candidate: string | null | undefined,
): string | null {
  if (!candidate) return current;
  if (!current) return candidate;
  return new Date(candidate).getTime() > new Date(current).getTime()
    ? candidate
    : current;
}

function earlierIso(
  current: string | null,
  candidate: string | null | undefined,
): string | null {
  if (!candidate) return current;
  if (!current) return candidate;
  return new Date(candidate).getTime() < new Date(current).getTime()
    ? candidate
    : current;
}

/**
 * Groups only occurrences with the same technical code and exact canonical
 * entity set. Message wording may evolve without changing the deep-link ID.
 */
export function aggregateDataHealthIssues(
  occurrences: readonly DataHealthIssueOccurrence[],
): DataHealthIssue[] {
  const issues = new Map<string, DataHealthIssue>();

  for (const occurrence of occurrences) {
    const affectedEntities = canonicalEntities(occurrence.affectedEntities);
    const issueId = buildDataHealthIssueId(
      occurrence.technicalCode,
      affectedEntities,
    );
    const existing = issues.get(issueId);

    if (!existing) {
      issues.set(issueId, {
        issueId,
        severity: occurrence.severity,
        userMessage: required(occurrence.userMessage, "userMessage"),
        technicalCode: required(
          occurrence.technicalCode,
          "technicalCode",
        ).toUpperCase(),
        occurrenceCount: 1,
        affectedGroupCount: affectedEntities.length,
        impact: required(occurrence.impact, "impact"),
        affectedEntities,
        firstOccurredAt: occurrence.occurredAt ?? null,
        lastOccurredAt: occurrence.occurredAt ?? null,
      });
      continue;
    }

    existing.occurrenceCount += 1;
    existing.firstOccurredAt = earlierIso(
      existing.firstOccurredAt,
      occurrence.occurredAt,
    );
    existing.lastOccurredAt = laterIso(
      existing.lastOccurredAt,
      occurrence.occurredAt,
    );

    if (
      SEVERITY_RANK[occurrence.severity] > SEVERITY_RANK[existing.severity]
    ) {
      existing.severity = occurrence.severity;
      existing.userMessage = required(occurrence.userMessage, "userMessage");
      existing.impact = required(occurrence.impact, "impact");
    }
  }

  return [...issues.values()].sort((left, right) => {
    const severity =
      SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity];
    return severity || left.issueId.localeCompare(right.issueId);
  });
}

/**
 * Shared UI/API projection. It is the only supported path from raw sync
 * warnings to issue IDs, ensuring deep links resolve to the same issue.
 */
export function buildDataHealthIssueDetailsFromRuns(
  runs: readonly SyncRunView[],
): DataHealthIssueDetail[] {
  const occurrenceDetails = runs.flatMap((run) =>
    run.warnings.map((warning) => {
      const technicalCode = required(
        warning.code,
        "technicalCode",
      ).toUpperCase();
      const presentation = WARNING_PRESENTATION[technicalCode] ?? {
        userMessage: "Một phần dữ liệu chưa thể đồng bộ đầy đủ",
        impact:
          "Các thực thể liên quan có thể thiếu dữ liệu; mở chi tiết kỹ thuật để đối soát.",
      };
      const occurredAt =
        run.finishedAtIso ?? run.startedAtIso ?? null;
      const occurrence: DataHealthIssueOccurrence = {
        technicalCode,
        severity: run.status === "failed" ? "error" : "warning",
        userMessage: presentation.userMessage,
        impact: presentation.impact,
        affectedEntities: normalizeDataHealthResource(warning.resource),
        occurredAt,
      };
      return {
        issueId: buildDataHealthIssueId(
          technicalCode,
          occurrence.affectedEntities,
        ),
        occurrence,
        detail: {
          syncRunId: run.id,
          occurredAt,
          resource: warning.resource,
          technicalMessage: warning.message,
        } satisfies DataHealthIssueOccurrenceDetail,
      };
    }),
  );
  const issues = aggregateDataHealthIssues(
    occurrenceDetails.map((item) => item.occurrence),
  );
  const detailsByIssue = new Map<
    string,
    DataHealthIssueOccurrenceDetail[]
  >();
  for (const item of occurrenceDetails) {
    const current = detailsByIssue.get(item.issueId) ?? [];
    current.push(item.detail);
    detailsByIssue.set(item.issueId, current);
  }

  return issues.map((issue) => ({
    issue,
    occurrences: detailsByIssue.get(issue.issueId) ?? [],
  }));
}

export function buildDataHealthIssuesFromRuns(
  runs: readonly SyncRunView[],
): DataHealthIssue[] {
  return buildDataHealthIssueDetailsFromRuns(runs).map(
    (detail) => detail.issue,
  );
}

export function dataHealthRunEvidence(
  run: Pick<SyncRunView, "warnings" | "errorCount">,
): DataHealthRunEvidence {
  const reportedRowCount =
    typeof run.errorCount === "number" &&
    Number.isFinite(run.errorCount) &&
    run.errorCount >= 0
      ? run.errorCount
      : null;
  return {
    warningEntryCount: run.warnings.length,
    reportedRowCount,
  };
}
