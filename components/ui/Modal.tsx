"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cx } from "./cx";
import { Heading } from "./Heading";
import { IconClose } from "./icons";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Short line under the title. */
  description?: ReactNode;
  children?: ReactNode;
  /** Sticky footer, e.g. Cancel / Confirm buttons. */
  footer?: ReactNode;
  /** "sheet" = bottom sheet on mobile, centred dialog on >=sm (default). "dialog" = always centred. */
  variant?: "sheet" | "dialog";
  size?: "sm" | "md" | "lg";
  /** Prevent closing via backdrop / Escape (e.g. while saving). */
  dismissible?: boolean;
}

const widths = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-2xl" };

/** Bottom sheet on phones, centred modal on larger screens. Locks body scroll, closes on Esc/backdrop. */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = "sheet",
  size = "md",
  dismissible = true,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible) onClose();
    };
    window.addEventListener("keydown", onKey);
    // Focus first focusable field, else the panel.
    const el = panelRef.current?.querySelector<HTMLElement>("input, select, textarea, [data-autofocus]");
    (el ?? panelRef.current)?.focus();
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, dismissible, onClose]);

  if (!open) return null;

  const sheet = variant === "sheet";
  return (
    <div
      className={cx("fixed inset-0 z-50 flex justify-center", sheet ? "items-end sm:items-center" : "items-center p-4")}
    >
      <div
        className="animate-fade-in absolute inset-0 bg-ddg-ink/40"
        onClick={() => dismissible && onClose()}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cx(
          "relative flex max-h-[92dvh] w-full flex-col border border-ddg-line bg-white outline-none",
          widths[size],
          sheet
            ? "animate-sheet-in rounded-t-xl sm:animate-pop sm:rounded-xl"
            : "animate-pop rounded-xl",
        )}
      >
        {sheet && <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-ddg-line sm:hidden" aria-hidden />}
        <div className="flex items-start gap-3 border-b border-ddg-line px-4 pb-3 pt-4 sm:px-5">
          <div className="min-w-0 flex-1">
            <Heading as="h2" size="md">
              {title}
            </Heading>
            {description && <p className="mt-1 text-sm text-ddg-muted">{description}</p>}
          </div>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 grid size-9 shrink-0 place-items-center rounded-md text-ddg-muted hover:bg-ddg-soft hover:text-ddg-ink"
            >
              <IconClose size={20} />
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">{children}</div>
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-ddg-line px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:flex-row sm:justify-end sm:px-5 sm:pb-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** Alias: same component, bottom-sheet behaviour by default. */
export const Sheet = Modal;
