"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AppShell, buttonClasses, Spinner } from "@/components/ui";
import { managerNav } from "@/components/manager/nav";
import { ManagerAlerts } from "@/components/alerts/ManagerAlerts";

interface Pending {
  walkins: number;
  duplicates: number;
  alerts: number;
}

const COUNT_EVERY_MS = 5000;

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 401) {
    window.location.assign("/");
    return null;
  }
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

/** Pending counts for the tab badges. Each endpoint fails independently; a failure keeps the last count. */
async function fetchPending(prev: Pending): Promise<Pending> {
  const [w, d, a] = await Promise.all([
    getJson("/api/manager/walkins"),
    getJson("/api/manager/duplicates"),
    getJson("/api/manager/alerts"),
  ]);
  const next = { ...prev };
  const walkins = (w as { walkins?: { status?: string }[] } | null)?.walkins;
  if (Array.isArray(walkins)) next.walkins = walkins.filter((x) => x?.status === "pending").length;
  const dup = (d as { counts?: { pending?: number } } | null)?.counts?.pending;
  if (typeof dup === "number") next.duplicates = dup;
  const alerts = (a as { alerts?: { status?: string }[] } | null)?.alerts;
  if (Array.isArray(alerts)) next.alerts = alerts.filter((x) => x?.status === "open").length;
  return next;
}

export default function ManagerLayout({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>({ walkins: 0, duplicates: 0, alerts: 0 });

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me")
      .then(async (res) => {
        if (res.status === 401) { window.location.assign("/"); return; }
        const me = await res.json();
        if (me.role !== "manager") { window.location.assign("/desk"); return; }
        if (alive) setStaff(me.staff);
      })
      .catch(() => { window.location.assign("/"); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!staff) return;
    let alive = true;
    let last: Pending = { walkins: 0, duplicates: 0, alerts: 0 };
    const tick = async () => {
      try {
        const next = await fetchPending(last);
        if (!alive) return;
        last = next;
        setPending(next);
      } catch {
        // keep the previous counts
      }
    };
    void tick();
    const id = setInterval(tick, COUNT_EVERY_MS);
    return () => { alive = false; clearInterval(id); };
  }, [staff]);

  const nav = useMemo(
    () =>
      managerNav.map((n) => {
        const count =
          n.href === "/manager/walkins" ? pending.walkins
          : n.href === "/manager/duplicates" ? pending.duplicates
          : n.href === "/manager" ? pending.alerts
          : 0;
        return count > 0 ? { ...n, badge: count } : { href: n.href, label: n.label };
      }),
    [pending],
  );

  if (!staff) {
    return (
      <div className="grid min-h-dvh place-items-center bg-ddg-soft">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <AppShell
      area="Manager"
      width="wide"
      staff={staff}
      nav={nav}
      top={<ManagerAlerts />}
      actions={
        <Link href="/desk" className={buttonClasses("secondary", "sm")}>
          Desk view
        </Link>
      }
    >
      {children}
    </AppShell>
  );
}
