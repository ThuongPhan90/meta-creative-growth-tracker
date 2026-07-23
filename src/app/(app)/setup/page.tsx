import { SetupWizard } from "@/components/setup-wizard";
import { getApplicationSnapshot } from "@/lib/app-data";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const snapshot = await getApplicationSnapshot();
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  return (
    <SetupWizard
      checks={snapshot.setupChecks}
      callbackUrl={`${appUrl}/api/auth/meta/callback`}
    />
  );
}
