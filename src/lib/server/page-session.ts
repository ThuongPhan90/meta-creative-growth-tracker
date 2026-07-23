import "server-only";

import { cookies } from "next/headers";

import {
  OWNER_SESSION_COOKIE,
  verifyOwnerSession,
  type OwnerSessionClaims,
} from "@/lib/security";

export async function readPageOwnerSession(): Promise<OwnerSessionClaims | null> {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) return null;

  const token = (await cookies()).get(OWNER_SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    return verifyOwnerSession(token, { secret: sessionSecret });
  } catch {
    return null;
  }
}
