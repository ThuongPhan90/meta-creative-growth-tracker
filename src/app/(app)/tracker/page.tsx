import { redirect } from "next/navigation";
import { buildCompatibilityHref } from "@/lib/navigation";

export default async function TrackerPage({
  searchParams,
}: {
  searchParams: Promise<
    Record<string, string | string[] | undefined>
  >;
}) {
  redirect(
    buildCompatibilityHref("/creatives", await searchParams),
  );
}
