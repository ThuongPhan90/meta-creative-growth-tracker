import { CreativeLibrary } from "@/components/creative-library";
import { getApplicationSnapshot } from "@/lib/app-data";

export const dynamic = "force-dynamic";

export default async function CreativesPage() {
  const snapshot = await getApplicationSnapshot();
  return (
    <CreativeLibrary
      creatives={snapshot.creatives}
      truncated={snapshot.creativesTruncated}
      isConnected={
        snapshot.authenticated &&
        snapshot.connection?.status === "connected"
      }
    />
  );
}
