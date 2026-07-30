import { redirect } from "next/navigation";
import { buildCompatibilityHref } from "@/lib/navigation";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<
    Record<string, string | string[] | undefined>
  >;
}) {
  redirect(
    buildCompatibilityHref("/overview", await searchParams),
  );
}
