"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { AppShell, buttonClasses, Spinner } from "@/components/ui";
import { managerNav } from "@/components/manager/nav";
import { ManagerAlerts } from "@/components/alerts/ManagerAlerts";

export default function ManagerLayout({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<string | null>(null);

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
      nav={managerNav}
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
