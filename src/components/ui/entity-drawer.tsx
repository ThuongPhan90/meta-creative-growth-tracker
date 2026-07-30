"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function EntityDrawer({
  title,
  closeHref,
  restoreFocusId,
  children,
  width = "wide",
}: {
  title: string;
  closeHref: string;
  restoreFocusId?: string;
  children: ReactNode;
  width?: "wide" | "standard";
}) {
  const router = useRouter();
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (restoreFocusId) {
        const selector = `[data-entity-trigger="${CSS.escape(
          restoreFocusId,
        )}"]`;
        document.querySelector<HTMLElement>(selector)?.focus();
      }
    };
  }, [restoreFocusId]);

  function close() {
    router.replace(closeHref, { scroll: false });
  }

  function trapFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
    ).filter((element) => !element.hidden);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="v2-drawer-layer">
      <button
        type="button"
        className="v2-drawer-backdrop"
        aria-label={`Đóng ${title}`}
        onClick={close}
      />
      <aside
        ref={panelRef}
        className={`v2-drawer v2-drawer--${width}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={trapFocus}
      >
        <div className="v2-drawer__chrome">
          <h2 id={titleId}>{title}</h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="v2-icon-button"
            aria-label={`Đóng ${title}`}
            onClick={close}
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}
