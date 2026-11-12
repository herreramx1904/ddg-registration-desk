"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cx } from "./cx";
import { IconAlert, IconCheck, IconStar } from "./icons";

export type ToastTone = "ok" | "warn" | "danger" | "vip" | "info";

export interface ToastOptions {
  title: string;
  detail?: string;
  tone?: ToastTone;
  /** Auto-dismiss after ms. Default 4000. 0 = sticky. */
  duration?: number;
  /** Optional action, e.g. { label: "Undo", onClick: undo } */
  action?: { label: string; onClick: () => void };
}

interface ToastItem extends ToastOptions {
  id: number;
}

interface ToastApi {
  /** Show a toast; returns its id. */
  toast: (opts: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Use inside <ToastProvider> (already mounted in app/layout.tsx). */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const tones: Record<ToastTone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  vip: "bg-vip",
  info: "bg-ddg-ink",
};

function ToastIcon({ tone }: { tone: ToastTone }) {
  if (tone === "ok") return <IconCheck size={22} strokeWidth={3} />;
  if (tone === "vip") return <IconStar size={22} />;
  if (tone === "info") return <span className="size-2.5 rounded-full bg-ddg-orange" />;
  return <IconAlert size={22} />;
}

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const { id, duration = 4000 } = item;
  useEffect(() => {
    if (!duration) return;
    const t = setTimeout(() => onDismiss(id), duration);
    return () => clearTimeout(t);
  }, [id, duration, onDismiss]);
  const tone = item.tone ?? "ok";
  return (
    <div
      role="status"
      className={cx(
        "animate-toast-in pointer-events-auto flex w-full items-center gap-3 rounded-2xl p-3 pl-4 text-white shadow-ddg-lg",
        tones[tone],
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/20">
        <ToastIcon tone={tone} />
      </span>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onDismiss(id)} aria-label="Dismiss">
        <p className="ddg-heading truncate text-lg leading-tight">{item.title}</p>
        {item.detail && <p className="truncate text-sm text-white/90">{item.detail}</p>}
      </button>
      {item.action && (
        <button
          type="button"
          onClick={() => {
            item.action?.onClick();
            onDismiss(id);
          }}
          className="h-11 shrink-0 rounded-xl bg-white px-4 text-sm uppercase tracking-wider text-ddg-ink active:scale-95"
        >
          {item.action.label}
        </button>
      )}
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const toast = useCallback((opts: ToastOptions) => {
    const id = nextId.current++;
    // Keep max 3 on screen; newest at the bottom.
    setItems((xs) => [...xs.slice(-2), { ...opts, id }]);
    return id;
  }, []);
  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex w-full max-w-md flex-col gap-2">
          {items.map((item) => (
            <ToastView key={item.id} item={item} onDismiss={dismiss} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}
