import { redirect } from "next/navigation";
import { buildCompatibilityHref } from "@/lib/navigation";

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<
    Record<string, string | string[] | undefined>
  >;
}) {
  redirect(
    buildCompatibilityHref(
      "/sources?tab=connection",
      await searchParams,
    ),
  );
}
