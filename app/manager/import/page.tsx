"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Banner, Button, buttonClasses, Card, Heading, StatTile } from "@/components/ui";
import type { ImportReport } from "@/lib/domain/types";

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ title: string; detail?: string } | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true); setError(null); setReport(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/manager/import", { method: "POST", body: fd });
      if (res.status === 401) { window.location.assign("/"); return; }
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setError({ title: "Guests have already checked in", detail: "The list is locked once arrivals start, so real check-ins are never lost. Edit guests one by one in Guests instead." });
      } else if (!res.ok) {
        setError({ title: data.error ?? "That file could not be imported" });
      } else {
        setReport(data.report);
      }
    } catch {
      setError({ title: "Can't reach the server", detail: "Check the connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  const sug = report?.suggestions;
  const rules = report ? Object.entries(report.changesByRule).sort((a, b) => b[1] - a[1]) : [];
  const maxRule = rules[0]?.[1] ?? 1;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Heading as="h1" size="xl">Import guest list</Heading>
        <p className="mt-1 text-sm text-ddg-muted">
          Upload the client&apos;s Excel export. Original rows are kept; nothing is merged or deleted.
          Importing replaces the current list, and is only possible before the first check-in.
        </p>
      </div>

      <Card padding="lg">
        <form onSubmit={submit} className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ddg-line px-4 py-8 text-center hover:border-ddg-orange">
            <span className="ddg-heading text-lg">{file ? file.name : "Choose the .xlsx file"}</span>
            <span className="text-sm text-ddg-muted">{file ? `${Math.round(file.size / 1024)} KB` : "Max 5 MB"}</span>
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }}
            />
          </label>
          <Button type="submit" size="lg" fullWidth disabled={!file} loading={busy}>Import and clean</Button>
        </form>
      </Card>

      {error && <Banner variant={error.title.startsWith("Guests have") ? "warn" : "danger"} title={error.title} detail={error.detail} />}

      {report && sug && (
        <div className="space-y-4">
          <Banner variant="ok" title="Guest list imported" detail={`${report.registrations} registrations are ready at the desk.`} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile value={report.rowsRead} label="Rows read" />
            <StatTile value={report.registrations} label="Registrations" tone="ok" hint="One per row" />
            <StatTile value={report.generatedIds} label="IDs generated" tone="purple" hint="Rows without a Reg ID" />
            <StatTile value={report.cancelled} label="Cancelled" tone="warn" />
          </div>

          <Card accent="purple">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[11px] uppercase tracking-[0.16em] text-ddg-muted">Possible duplicates</h2>
                <p className="mt-1 text-sm">
                  <span className="tabular text-2xl">{sug.strong + sug.medium + sug.weak}</span> suggestions ·{" "}
                  {sug.strong} strong · {sug.medium} medium · {sug.weak} weak
                </p>
                <p className="text-xs text-ddg-muted">Suggestions only. Nothing is linked until a manager confirms.</p>
              </div>
              <Link href="/manager/duplicates" className={buttonClasses("secondary", "md")}>Review duplicates</Link>
            </div>
          </Card>

          <Card accent="warn">
            <h2 className="text-[11px] uppercase tracking-[0.16em] text-ddg-muted">Flagged for review</h2>
            <p className="mt-1 text-sm">
              <span className="tabular text-2xl">{report.flaggedForReview}</span> registrations have a data note (invalid email, ambiguous date, …).
            </p>
            <Link href="/manager/guests" className="mt-1 inline-block text-sm text-ddg-orange-dark underline">Open Guests and filter by “Flagged for review”</Link>
          </Card>

          <Card>
            <h2 className="text-[11px] uppercase tracking-[0.16em] text-ddg-muted">Changes by cleaning rule</h2>
            {rules.length === 0 ? (
              <p className="mt-2 text-sm text-ddg-muted">No changes were needed.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {rules.map(([rule, n]) => (
                  <li key={rule} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm">
                    <span className="truncate font-mono text-[12px]">{rule}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-ddg-line">
                      <span className="block h-full rounded-full bg-ddg-orange" style={{ width: `${Math.max(4, (n / maxRule) * 100)}%` }} />
                    </span>
                    <span className="tabular w-8 text-right">{n}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
