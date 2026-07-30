import { redirect } from "next/navigation";
import { buildCompatibilityHref } from "@/lib/navigation";

export default async function HealthPage({
  searchParams,
}: {
  searchParams: Promise<
    Record<string, string | string[] | undefined>
  >;
}) {
  redirect(
    buildCompatibilityHref("/data-health", await searchParams),
  );
}
