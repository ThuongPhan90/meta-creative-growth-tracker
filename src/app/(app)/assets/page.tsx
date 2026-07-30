import { redirect } from "next/navigation";
import { buildCompatibilityHref } from "@/lib/navigation";

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<
    Record<string, string | string[] | undefined>
  >;
}) {
  redirect(
    buildCompatibilityHref(
      "/sources?tab=businesses",
      await searchParams,
    ),
  );
}
