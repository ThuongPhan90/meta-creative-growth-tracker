import { NextRequest } from "next/server";

import { metaCollectionResponse } from "../_shared";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return metaCollectionResponse(request, "pages");
}
