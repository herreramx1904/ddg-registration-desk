"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Heading, Kpi, KpiRow, Section, Spinner, Table, useToast, type Column } from "@/components/ui";
import type { ReportSummary } from "@/lib/service/report";
import type { AuditRow } from "@/lib/server/store/types";

interface SummaryResponse {
  generatedAt: string;
  summary: ReportSummary;
  lines: { label: string; value: number; note?: string }[];
}

interface SheetRow { sheet: string; contains: string; count?: number }

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

  const sheets: SheetRow[] = [
    { sheet: "Summary", contains: "The numbers below, one line each, with notes on how they are counted", count: data.lines.length },
    { sheet: "Attended", contains: "Every guest with an active check-in: name, company, type, time, staff", count: s.attended + s.internalAttended },
    { sheet: "No-shows", contains: "Registered guests who did not check in", count: s.noShows },
    { sheet: "Walk-ins", contains: "Approved and rejected walk-ins with who decided and when", count: s.walkinsApproved + s.walkinsRejected },
    { sheet: "Exceptions", contains: "Cancelled or do-not-admit guests who were admitted, and manager overrides", count: s.cancelledButAttended + s.managerOverrides },
    { sheet: "Duplicates", contains: "Confirmed links (one person) and likely duplicates still unconfirmed", count: s.confirmedDuplicateLinks + s.likelyDuplicates },
    { sheet: "Original rows", contains: "The client's list exactly as imported, unchanged" , count: s.registrations },
  ];

  const sheetColumns: Column<SheetRow>[] = [
    {
      key: "sheet", header: "Sheet", width: "10rem",
      render: (r) => (
        <span className="block min-w-0">
          <span className="font-semibold text-ddg-ink">{r.sheet}</span>
          <span className="block text-xs text-ddg-muted sm:hidden">{r.contains}</span>
        </span>
      ),
    },
    { key: "contains", header: "Contains", hideBelow: "sm", render: (r) => <span className="text-ddg-muted">{r.contains}</span> },
    { key: "count", header: "Rows", align: "right", width: "5rem", render: (r) => <span className="tabular">{r.count ?? ""}</span> },
  ];

  const summaryColumns: Column<SummaryResponse["lines"][number]>[] = [
    { key: "label", header: "Line", render: (l) => <span>{l.label}{l.note && <span className="block text-xs text-ddg-muted">{l.note}</span>}</span> },
    { key: "value", header: "Value", align: "right", width: "6rem", render: (l) => <span className="tabular">{l.value}</span> },
  ];

  const auditColumns: Column<AuditRow>[] = [
    { key: "at", header: "Time", width: "4.5rem", render: (e) => <span className="tabular text-ddg-muted">{fmt(e.at)}</span> },
    { key: "staff", header: "Staff", render: (e) => <span>{e.staff} <span className="hidden text-ddg-muted sm:inline">({e.role})</span></span> },
    {
      key: "action", header: "Action",
      render: (e) => (
        <span className={e.action.includes("override") || e.action.includes("status") ? "font-mono text-xs text-danger-strong" : "font-mono text-xs text-ddg-ink"}>
          {e.action}
        </span>
      ),
    },
    { key: "target", header: "Target", hideBelow: "sm", render: (e) => <span className="truncate text-ddg-muted">{e.target ?? ""}</span> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Heading as="h1" size="md">Client report</Heading>
          <p className="mt-1 text-sm text-ddg-muted">Live numbers, updated {fmt(data.generatedAt)}. People are counted once, not registrations.</p>
        </div>
        <Button onClick={download} loading={downloading}>Download report (.xlsx)</Button>
      </div>

      <KpiRow>
        <Kpi label="Attended" value={s.attended} total={s.expected} tone="ok" hint="Excluding internal" />
        <Kpi label="No-shows" value={s.noShows} tone="warn" />
        <Kpi label="Walk-ins approved" value={s.walkinsApproved} tone="vip" hint={`${s.walkinsRejected} rejected`} />
        <Kpi label="Total guests in" value={s.totalInRoom} hint="Incl. walk-ins" />
        <Kpi label="Internal staff" value={s.internalAttended} total={s.internalExpected} hint="Counted apart" />
        <Kpi label="Cancelled but in" value={s.cancelledButAttended} tone={s.cancelledButAttended > 0 ? "warn" : "neutral"} />
        <Kpi label="Manager overrides" value={s.managerOverrides} tone={s.managerOverrides > 0 ? "danger" : "neutral"} />
        <Kpi label="Duplicates linked" value={s.confirmedDuplicateLinks} hint={`${s.likelyDuplicates} likely`} />
      </KpiRow>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="What the workbook contains" description="Seven sheets; the original rows are never changed.">
          <Table columns={sheetColumns} rows={sheets} rowKey={(r) => r.sheet} dense />
        </Section>
        <Section title="Summary sheet">
          <Table columns={summaryColumns} rows={data.lines} rowKey={(l) => l.label} dense />
        </Section>
      </div>

      <Section title="Audit log" description="Latest 100 actions, newest first.">
        <div className="max-h-[28rem] overflow-y-auto">
          <Table
            columns={auditColumns}
            rows={audit}
            rowKey={(e) => String(e.id)}
            dense
            stickyHeader
            empty={<p className="text-sm text-ddg-muted">Nothing logged yet.</p>}
          />
        </div>
      </Section>
    </div>
  );
}
