"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties, MouseEvent, ReactNode } from "react";

export function ContextualEntityLink({
  href,
  drawerHref,
  className,
  children,
  entityId,
  ariaLabel,
  style,
}: {
  href: string;
  drawerHref?: string;
  className?: string;
  children: ReactNode;
  entityId?: string;
  ariaLabel?: string;
  style?: CSSProperties;
}) {
  const router = useRouter();

  function openDrawer(event: MouseEvent<HTMLAnchorElement>) {
    if (
      !drawerHref ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    router.push(drawerHref, { scroll: false });
  }

  return (
    <Link
      href={href}
      className={className}
      onClick={openDrawer}
      aria-label={ariaLabel}
      aria-haspopup={drawerHref ? "dialog" : undefined}
      data-entity-trigger={entityId}
      style={style}
    >
      {children}
    </Link>
  );
}
