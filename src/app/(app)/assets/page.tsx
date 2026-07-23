import { AssetsView } from "@/components/assets-view";
import { getApplicationSnapshot } from "@/lib/app-data";

export const dynamic = "force-dynamic";

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ sync?: string }>;
}) {
  const [snapshot, query] = await Promise.all([
    getApplicationSnapshot(),
    searchParams,
  ]);
  const connected =
    snapshot.authenticated &&
    snapshot.connection?.status === "connected";
  return (
    <AssetsView
      assets={snapshot.assets}
      connected={connected}
      autoSync={connected && query.sync === "initial"}
    />
  );
}
