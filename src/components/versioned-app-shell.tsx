"use client";

import { usePathname } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import {
  AppShellV3,
  type AppShellV3Props,
} from "@/components/ui-v3/app-shell";
import { shouldUseUiV3Shell } from "@/lib/presentation/ui-version";

export type VersionedAppShellProps = AppShellV3Props & {
  /** Resolved on the server so the client never reads a deployment env var. */
  v3Enabled: boolean;
};

/**
 * Keeps the V3 release route-scoped while a single app layout still owns the
 * shared server snapshot. Query handling remains inside each existing shell.
 */
export function VersionedAppShell({
  v3Enabled,
  freshnessLabel,
  scopeLabel,
  pageTitle,
  ...shellProps
}: VersionedAppShellProps) {
  const pathname = usePathname();

  if (shouldUseUiV3Shell(pathname, v3Enabled)) {
    return (
      <AppShellV3
        {...shellProps}
        freshnessLabel={freshnessLabel}
        scopeLabel={scopeLabel}
        pageTitle={pageTitle}
      />
    );
  }

  return <AppShell {...shellProps} />;
}
