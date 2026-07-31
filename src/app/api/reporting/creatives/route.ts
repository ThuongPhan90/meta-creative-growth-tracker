import { NextRequest } from "next/server";

import {
  detailErrorResponse,
} from "@/lib/detail-api";
import {
  creativeResultValuesSource,
} from "@/lib/reporting/creative-collection-contract";
import { createReportingResponse } from "@/lib/reporting/reporting-response";
import {
  loadCreativeReportingCollection,
  secureReportingJson,
} from "../creative-report";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const report = await loadCreativeReportingCollection(request);
    return secureReportingJson(
      createReportingResponse(
        {
          creatives: report.creatives,
          result_truncated: report.report.truncated,
          metric_semantics: {
            entity_count: "canonical_creative_family",
            results: creativeResultValuesSource(
              report.creatives,
            ),
            reach:
              "daily_reach_sum_is_non_unique_and_not_period_reach",
            evaluation:
              "objective_result_peer_group_evaluation",
          },
        },
        report.meta,
      ),
    );
  } catch (error) {
    return detailErrorResponse(error);
  }
}
