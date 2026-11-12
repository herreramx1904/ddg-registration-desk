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
      <header className="sticky top-0 z-40 border-b border-ddg-line bg-white">
        <div className={cx("mx-auto flex h-12 w-full items-center gap-2.5 px-4", container)}>
          <Link href="/" aria-label="Home" className="shrink-0">
            <Logo variant="wordmark" size="sm" />
          </Link>
          <span className="rounded-md bg-ddg-orange px-2 py-0.5 text-[11px] uppercase tracking-[0.12em] text-white">
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
              aria-label={loggingOut ? "Leaving" : "Log out"}
              title="Log out"
              className="grid size-9 shrink-0 place-items-center rounded-lg text-ddg-muted hover:bg-ddg-soft hover:text-ddg-ink disabled:opacity-50"
            >
              <IconLogout size={18} />
            </button>
          </div>
        </div>
        {nav && nav.length > 0 && (
          <nav className={cx("mx-auto w-full px-2", container)} aria-label="Sections">
            <ul className="-mb-px flex gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {nav.map((n) => {
                const isActive = n.href === active;
                return (
                  <li key={n.href} className="shrink-0">
                    <Link
                      href={n.href}
                      aria-current={isActive ? "page" : undefined}
                      className={cx(
                        "inline-flex h-10 items-center gap-1.5 border-b-2 px-3 text-sm transition-colors",
                        isActive
                          ? "border-ddg-orange text-ddg-ink"
                          : "border-transparent text-ddg-muted hover:text-ddg-ink",
                      )}
                    >
                      {n.label}
                      {!!n.badge && (
                        <span className="tabular grid min-w-[18px] place-items-center rounded-full bg-ddg-orange px-1 text-[11px] leading-[18px] text-white">
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
      <main className={cx("mx-auto w-full flex-1 px-4 py-4 sm:py-5", container)}>{children}</main>
      <footer>
        <p className={cx("mx-auto w-full px-4 py-4 text-center text-xs text-ddg-muted", container)}>
          DDG Europe · OrbitBot Galaxy · Kraftverket Oslo · 3 Dec 2026
        </p>
      </footer>
    </div>
  );
}
