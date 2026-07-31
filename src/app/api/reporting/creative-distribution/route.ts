import { NextRequest } from "next/server";

import { detailErrorResponse } from "@/lib/detail-api";
import {
  buildCreativeDistribution,
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
          ...buildCreativeDistribution(report.creatives),
          result_truncated: report.report.truncated,
          metric_semantics: {
            entity_count: "canonical_creative_family",
            results: creativeResultValuesSource(
              report.creatives,
            ),
            performance_status:
              "stable_evaluation_performance_status_key",
            data_confidence:
              "stable_evaluation_or_data_quality_confidence_key",
            fatigue_status:
              "stable_evaluation_fatigue_status_key",
          },
        },
        report.meta,
      ),
    );
  } catch (error) {
    return detailErrorResponse(error);
  }
}
