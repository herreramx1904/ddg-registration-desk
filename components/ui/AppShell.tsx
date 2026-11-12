"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { cx } from "./cx";
import { Logo } from "./Logo";
import { IconLogout } from "./icons";

export interface NavLink {
  href: string;
  label: string;
  /** Small count bubble, e.g. pending walk-ins. Hidden when 0/undefined. */
  badge?: number;
}

export interface AppShellProps {
  /** Area label in the top bar, e.g. "Desk" or "Manager". */
  area: string;
  /** Logged-in staff name. */
  staff?: string | null;
  /** Manager tabs. Active tab = longest href matching the current path. */
  nav?: NavLink[];
  /** Extra top-bar content (right side, before Logout). */
  actions?: ReactNode;
  /** Content above the main container, full-bleed (e.g. manager alert strip). */
  top?: ReactNode;
  /** Max content width. Desk = "narrow" (phone-first), manager = "wide". */
  width?: "narrow" | "wide";
  children: ReactNode;
}

export function AppShell({ area, staff, nav, actions, top, width = "narrow", children }: AppShellProps) {
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);
  const container = width === "narrow" ? "max-w-xl" : "max-w-6xl";

  const active = nav
    ?.filter((n) => pathname === n.href || pathname.startsWith(n.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore: we leave anyway
    }
    // Full reload on purpose: drops all client state from the shift.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/";
  }

  return (
    <div className="flex min-h-dvh flex-col bg-ddg-soft">
      <header className="sticky top-0 z-40 border-b border-ddg-line bg-white/90 backdrop-blur-md">
        <div className="h-1 w-full bg-ddg-gradient" aria-hidden />
        <div className={cx("mx-auto flex h-14 w-full items-center gap-3 px-4", container)}>
          <Link href="/" aria-label="Home" className="shrink-0">
            <Logo size="sm" label={null} />
          </Link>
          <span className="rounded-full bg-ddg-orange px-2.5 py-0.5 text-[11px] uppercase tracking-[0.16em] text-white">
            {area}
          </span>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            {actions}
            {staff && (
              <span className="hidden max-w-[10rem] truncate text-sm text-ddg-muted min-[400px]:inline" title={staff}>
                {staff}
              </span>
            )}
            <button
              type="button"
              onClick={logout}
              disabled={loggingOut}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-xs uppercase tracking-wider text-ddg-ink hover:bg-ddg-soft disabled:opacity-50"
            >
              <IconLogout size={18} />
              <span className="hidden sm:inline">{loggingOut ? "Leaving" : "Log out"}</span>
            </button>
          </div>
        </div>
        {nav && nav.length > 0 && (
          <nav className={cx("mx-auto w-full px-2", container)} aria-label="Sections">
            <ul className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {nav.map((n) => {
                const isActive = n.href === active;
                return (
                  <li key={n.href} className="shrink-0">
                    <Link
                      href={n.href}
                      aria-current={isActive ? "page" : undefined}
                      className={cx(
                        "inline-flex h-11 items-center gap-1.5 border-b-[3px] px-3 text-xs uppercase tracking-[0.14em] transition-colors",
                        isActive
                          ? "border-ddg-orange text-ddg-ink"
                          : "border-transparent text-ddg-muted hover:text-ddg-ink",
                      )}
                    >
                      {n.label}
                      {!!n.badge && (
                        <span className="tabular grid min-w-5 place-items-center rounded-full bg-ddg-orange px-1.5 text-[10px] leading-5 text-white">
                          {n.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </header>
      {top}
      <main className={cx("mx-auto w-full flex-1 px-4 py-4 sm:py-6", container)}>{children}</main>
      <footer className="border-t border-ddg-line bg-white">
        <p className={cx("mx-auto w-full px-4 py-4 text-center text-[11px] uppercase tracking-[0.14em] text-ddg-muted", container)}>
          Run by DDG Europe<span className="text-ddg-orange"> · </span>OrbitBot Galaxy
          <span className="text-ddg-orange"> · </span>Kraftverket Oslo<span className="text-ddg-orange"> · </span>3 Dec 2026
        </p>
      </footer>
    </div>
  );
}
