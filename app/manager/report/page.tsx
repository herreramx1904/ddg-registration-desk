"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, cx, Heading, Spinner, StatTile, useToast } from "@/components/ui";
import type { ReportSummary } from "@/lib/service/report";
import type { AuditRow } from "@/lib/server/store/types";

interface SummaryResponse {
  generatedAt: string;
  summary: ReportSummary;
  lines: { label: string; value: number; note?: string }[];
}

const fmt = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export default function ReportPage() {
  const { toast } = useToast();
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, a] = await Promise.all([
        fetch("/api/manager/report?format=json", { cache: "no-store" }),
        fetch("/api/manager/audit", { cache: "no-store" }),
      ]);
      if (r.status === 401) { window.location.assign("/"); return; }
      if (r.ok) setData(await r.json());
      if (a.ok) setAudit((await a.json()).entries);
    } catch {
      // keep last numbers; next poll retries
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch + 3 s polling
    void load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  async function download() {
    setDownloading(true);
    try {
      const res = await fetch("/api/manager/report", { cache: "no-store" });
      if (res.status === 401) { window.location.assign("/"); return; }
      if (!res.ok) { toast({ title: "Could not build the report", tone: "danger" }); return; }
      const blob = await res.blob();
      const name = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "report.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: "Report downloaded", detail: name, tone: "ok" });
      void load();
    } finally {
      setDownloading(false);
    }
  }

  if (!data) return <div className="grid place-items-center py-20"><Spinner size="lg" /></div>;
  const s = data.summary;

  return (
    <div className="space-y-5">
      <div>
        <Heading as="h1" size="xl">Client report</Heading>
        <p className="mt-1 text-sm text-ddg-muted">Live numbers, updated {fmt(data.generatedAt)}. We count people, not registrations.</p>
      </div>

      <Button size="xl" onClick={download} loading={downloading}>Download report (.xlsx)</Button>
      <p className="-mt-3 text-center text-xs text-ddg-muted">
        Summary · Attended · No-shows · Walk-ins · Exceptions · Duplicates · Original rows
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile value={s.attended} total={s.expected} label="Attended" tone="ok" />
        <StatTile value={s.noShows} label="No-shows" tone="warn" />
        <StatTile value={s.walkinsApproved} label="Walk-ins approved" tone="purple" hint={`${s.walkinsRejected} rejected`} />
        <StatTile value={s.totalInRoom} label="Total guests in" hint="Attended + walk-ins" />
        <StatTile value={s.internalAttended} total={s.internalExpected} label="Internal staff" tone="purple" hint="Counted separately" />
        <StatTile value={s.cancelledButAttended} label="Cancelled but attended" tone="warn" />
        <StatTile value={s.managerOverrides} label="Manager overrides" tone="danger" />
        <StatTile value={s.confirmedDuplicateLinks} label="Duplicates merged" hint={`${s.likelyDuplicates} likely, unconfirmed`} />
      </div>

      <Card padding="none">
        <h2 className="px-4 pt-4 text-[11px] uppercase tracking-[0.16em] text-ddg-muted">Summary sheet</h2>
        <dl className="mt-2 divide-y divide-ddg-line">
          {data.lines.map((l) => (
            <div key={l.label} className="flex items-baseline gap-3 px-4 py-2.5">
              <dt className="min-w-0 flex-1">
                <span className="text-sm">{l.label}</span>
                {l.note && <span className="block text-xs text-ddg-muted">{l.note}</span>}
              </dt>
              <dd className="tabular text-xl">{l.value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card padding="none">
        <h2 className="px-4 pt-4 text-[11px] uppercase tracking-[0.16em] text-ddg-muted">Audit log (latest 100)</h2>
        <div className="mt-2 max-h-96 overflow-y-auto">
          <ul className="divide-y divide-ddg-line text-sm">
            {audit.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 px-4 py-2">
                <span className="tabular w-12 shrink-0 text-ddg-muted">{fmt(e.at)}</span>
                <span className={cx("font-mono text-[12px]", e.action.includes("override") || e.action.includes("status") ? "text-danger-strong" : "text-ddg-ink")}>
                  {e.action}
                </span>
                <span className="min-w-0 flex-1 truncate text-ddg-muted">
                  {e.staff} ({e.role}){e.target ? ` · ${e.target}` : ""}
                </span>
              </li>
            ))}
            {audit.length === 0 && <li className="px-4 py-3 text-ddg-muted">Nothing logged yet.</li>}
          </ul>
        </div>
      </Card>
    </div>
  );
}
