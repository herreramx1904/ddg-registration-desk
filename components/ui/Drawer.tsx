"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cx } from "./cx";
import { IconClose } from "./icons";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  width?: "md" | "lg";
  footer?: ReactNode;
  children: ReactNode;
}

const widths = { md: "md:max-w-md", lg: "md:max-w-2xl" };

/** Right-side panel on >= md, bottom sheet below. Esc and overlay close; focuses the first field. */
export function Drawer({ open, onClose, title, description, width = "md", footer, children }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const el = panelRef.current?.querySelector<HTMLElement>(
      "input, select, textarea, button:not([aria-label='Close']), [data-autofocus]",
    );
    (el ?? panelRef.current)?.focus();
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-stretch md:justify-end">
      <div className="animate-fade-in absolute inset-0 bg-ddg-ink/40" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cx(
          "relative flex w-full flex-col bg-white outline-none",
          "max-h-[92dvh] animate-sheet-in rounded-t-lg border-t border-ddg-line",
          "md:h-full md:max-h-none md:animate-[drawer-in_180ms_ease-out] md:rounded-none md:border-l md:border-t-0",
          widths[width],
        )}
      >
        <div className="flex items-start gap-3 border-b border-ddg-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-ddg-ink">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-ddg-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 grid size-8 shrink-0 place-items-center rounded-md text-ddg-muted hover:bg-ddg-soft hover:text-ddg-ink"
          >
            <IconClose size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-ddg-line px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </div>
      <style>{`@keyframes drawer-in{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
    </div>
  );
}
