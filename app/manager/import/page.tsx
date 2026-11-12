"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Banner, Button, Heading, Section, buttonClasses } from "@/components/ui";
import type { ImportReport } from "@/lib/domain/types";

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ title: string; detail?: string } | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

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

  const row = (label: string, value: ReactNode, note?: string) => (
    <div key={label} className="flex items-baseline justify-between gap-3 border-b border-ddg-line py-1.5 last:border-b-0">
      <dt className="min-w-0 text-sm text-ddg-ink">
        {label}
        {note && <span className="block text-xs text-ddg-muted">{note}</span>}
      </dt>
      <dd className="tabular shrink-0 text-sm">{value}</dd>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Heading as="h1" size="md">Import guest list</Heading>
        <p className="mt-1 text-sm text-ddg-muted">Upload the client&apos;s Excel export. Importing replaces the current list and is only possible before the first check-in.</p>
      </div>

      {error && <Banner variant={error.title.startsWith("Guests have") ? "warn" : "danger"} title={error.title} detail={error.detail} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Upload" description="Original rows are kept as they are; nothing is merged or deleted.">
          <form onSubmit={submit} className="flex flex-col gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>Choose .xlsx file</Button>
              <span className="min-w-0 truncate text-sm text-ddg-muted">
                {file ? `${file.name} · ${Math.round(file.size / 1024)} KB` : "No file chosen · max 5 MB"}
              </span>
            </div>
            <div>
              <Button type="submit" size="sm" disabled={!file} loading={busy}>Import and clean</Button>
            </div>
          </form>
        </Section>

        <Section
          title="Last import"
          description={report ? `${report.registrations} registrations are ready at the desk.` : undefined}
          actions={report ? (
            <Link href="/manager/duplicates" className={buttonClasses("secondary", "sm")}>Review duplicates</Link>
          ) : undefined}
        >
          {!report || !sug ? (
            <p className="text-sm text-ddg-muted">No import in this session yet. The report appears here after an upload.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <dl>
                {row("Rows read", report.rowsRead)}
                {row("Registrations", report.registrations, "One per row")}
                {row("IDs generated", report.generatedIds, "Rows without a Reg ID")}
                {row("Cancelled", report.cancelled)}
                {row("Possible duplicates", sug.strong + sug.medium + sug.weak, `${sug.strong} strong · ${sug.medium} medium · ${sug.weak} weak; nothing is linked until a manager confirms`)}
                {row("Flagged for review", (
                  <Link href="/manager/guests" className="underline hover:text-ddg-orange-dark">{report.flaggedForReview}</Link>
                ), "Registrations with a data note (invalid email, ambiguous date, …)")}
              </dl>
              <div>
                <p className="text-sm font-semibold text-ddg-ink">Changes by cleaning rule</p>
                {rules.length === 0 ? (
                  <p className="mt-1 text-sm text-ddg-muted">No changes were needed.</p>
                ) : (
                  <dl className="mt-1">
                    {rules.map(([rule, n]) => (
                      <div key={rule} className="flex items-baseline justify-between gap-3 border-b border-ddg-line py-1 last:border-b-0">
                        <dt className="truncate font-mono text-xs text-ddg-ink">{rule}</dt>
                        <dd className="tabular shrink-0 text-sm">{n}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
