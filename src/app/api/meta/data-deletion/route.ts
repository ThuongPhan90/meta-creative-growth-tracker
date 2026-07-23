import { NextRequest, NextResponse } from "next/server";

import { createTrackerRepository } from "@/lib/db";
import {
  getMetaServerEnv,
  createMetaDataDeletionConfirmation,
  MetaSignedRequestError,
  verifyMetaSignedRequest,
} from "@/lib/security";
import { readDatabaseHealth } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const meta = getMetaServerEnv();
    const formData = await request.formData();
    const signedRequest = formData.get("signed_request");
    if (typeof signedRequest !== "string") {
      throw new MetaSignedRequestError();
    }
    const payload = verifyMetaSignedRequest(
      signedRequest,
      meta.metaAppSecret,
    );

    const health = await readDatabaseHealth();
    if (!health?.ok) {
      throw new Error("Database is unavailable for data deletion.");
    }

    const repository = await createTrackerRepository();
    const connection = await repository.getConnection();
    if (connection?.metaUserId === payload.user_id) {
      const connectionCreatedAt = Math.floor(
        new Date(connection.createdAt).getTime() / 1_000,
      );
      if (
        !Number.isFinite(connectionCreatedAt) ||
        payload.issued_at < connectionCreatedAt
      ) {
        throw new MetaSignedRequestError();
      }
      await repository.deleteAllOwnerData();
    }

    const confirmationCode = createMetaDataDeletionConfirmation(
      payload,
      meta.metaAppSecret,
    );
    const statusUrl = new URL("/data-deletion", meta.appUrl);
    statusUrl.searchParams.set("confirmation", confirmationCode);

    return NextResponse.json({
      url: statusUrl.toString(),
      confirmation_code: confirmationCode,
    });
  } catch (error) {
    if (error instanceof MetaSignedRequestError) {
      return NextResponse.json(
        { error: "Invalid signed_request." },
        { status: 400 },
      );
    }
    console.error("[meta-data-deletion]", error);
    return NextResponse.json(
      { error: "Data deletion could not be completed." },
      { status: 500 },
    );
  }
}
