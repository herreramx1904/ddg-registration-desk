"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Badge, Button, Heading, Section, Spinner, Table, cx, useToast, type BadgeVariant, type Column,
} from "@/components/ui";
import type { DuplicateSide, DuplicateView } from "@/lib/service/duplicates";

interface Counts { strong: number; medium: number; weak: number; pending: number; decided: number }

const strengthBadge: Record<DuplicateView["strength"], BadgeVariant> = { strong: "danger", medium: "warn", weak: "neutral" };
const strengthWord: Record<DuplicateView["strength"], string> = { strong: "Strong match", medium: "Medium match", weak: "Weak match" };
const statusLabel = { registered: "Registered", cancelled: "Cancelled", do_not_admit: "Do not admit" } as const;

const time = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
const name = (x: DuplicateSide) => `${x.firstName} ${x.lastName}`;
const checkinText = (s: DuplicateSide) => (s.checkedIn ? `Checked in ${time(s.checkedIn.at)} (${s.checkedIn.staff})` : "Not checked in");

interface Field { label: string; a: ReactNode; b: ReactNode; same: boolean }

/** Only the fields worth a decision: matching ones (evidence) and differing ones (doubt). Empty-on-both are skipped. */
function fields(s: DuplicateView): Field[] {
  const { a, b } = s;
  const all: (Field & { empty: boolean })[] = [
    { label: "Name", a: name(a), b: name(b), same: norm(name(a)) === norm(name(b)), empty: false },
    { label: "Company", a: a.company, b: b.company, same: !!a.company && norm(a.company) === norm(b.company), empty: !a.company && !b.company },
    { label: "Type", a: a.guestType, b: b.guestType, same: a.guestType === b.guestType, empty: false },
    { label: "Email", a: a.email, b: b.email, same: !!a.email && norm(a.email) === norm(b.email), empty: !a.email && !b.email },
    { label: "Mobile", a: a.mobile, b: b.mobile, same: !!a.mobile && a.mobile === b.mobile, empty: !a.mobile && !b.mobile },
    { label: "Status", a: statusLabel[a.personStatus], b: statusLabel[b.personStatus], same: a.personStatus === b.personStatus, empty: false },
    { label: "Check-in", a: checkinText(a), b: checkinText(b), same: false, empty: false },
  ];
  return all.filter((f) => !f.empty);
}

function Compare({ s }: { s: DuplicateView }) {
  const { a, b } = s;
  const rawKeys = [...new Set([...Object.keys(a.raw), ...Object.keys(b.raw)])];
  return (
    <div className="text-sm">
      <div className="grid grid-cols-[5rem_1fr_1fr] sm:grid-cols-[8rem_1fr_1fr] gap-x-2 border-b border-ddg-line pb-1.5 text-xs text-ddg-muted">
        <span>Field</span>
        <span className="tabular">{a.regId} <span className="hidden sm:inline">· row {a.rowNumber}</span></span>
        <span className="tabular">{b.regId} <span className="hidden sm:inline">· row {b.rowNumber}</span></span>
      </div>
      {fields(s).map((f) => (
        <div key={f.label} className="grid grid-cols-[5rem_1fr_1fr] sm:grid-cols-[8rem_1fr_1fr] gap-x-2 border-b border-ddg-line py-1.5 last:border-b-0">
          <span className="text-ddg-muted">
            {f.label}
            {f.same && <span className="block text-xs text-ok-strong sm:ml-1 sm:inline">· same</span>}
          </span>
          <span className={cx("min-w-0 break-words", !f.same && "text-ddg-ink")}>{f.a ?? <span className="text-ddg-muted">–</span>}</span>
          <span className={cx("min-w-0 break-words", !f.same && "text-ddg-ink")}>{f.b ?? <span className="text-ddg-muted">–</span>}</span>
        </div>
      ))}
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-ddg-muted hover:text-ddg-ink">Original rows (unchanged)</summary>
        <div className="mt-1">
          {rawKeys.map((k) => (
            <div key={k} className="grid grid-cols-[5rem_1fr_1fr] sm:grid-cols-[8rem_1fr_1fr] gap-x-2 border-b border-ddg-line py-1 text-xs last:border-b-0">
              <span className="truncate text-ddg-muted" title={k}>{k}</span>
              <span className="min-w-0 break-words">{a.raw[k] ?? <span className="text-ddg-muted">–</span>}</span>
              <span className="min-w-0 break-words">{b.raw[k] ?? <span className="text-ddg-muted">–</span>}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

export default function DuplicatesPage() {
  const { toast } = useToast();
  const [data, setData] = useState<{ suggestions: DuplicateView[]; counts: Counts } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/manager/duplicates", { cache: "no-store" }).catch(() => null);
    if (!res) return setError("Can't reach the server. Retrying…");
    if (res.status === 401) { window.location.href = "/"; return; }
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? "Could not load suggestions");
    setError(null);
    setData(await res.json());
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 3000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [load]);

  async function decide(s: DuplicateView, decision: "confirmed" | "rejected") {
    setBusy(s.id + decision);
    try {
      const res = await fetch("/api/manager/duplicates/decide", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: s.id, decision }),
      });
      if (res.status === 401) { window.location.href = "/"; return; }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) toast({ title: "Not linked", detail: body.error ?? "Something went wrong", tone: "danger", duration: 7000 });
      else toast({ title: decision === "confirmed" ? "Linked as one person" : "Kept as two people", detail: `${s.a.regId} + ${s.b.regId}. ${body.message ?? ""}`, tone: "ok" });
      await load();
    } finally {
      setBusy(null);
    }
  }

  const pending = data?.suggestions.filter((s) => s.decision === "pending") ?? [];
  const decided = data?.suggestions.filter((s) => s.decision !== "pending") ?? [];

  const decidedColumns: Column<DuplicateView>[] = [
    {
      key: "decision", header: "Decision",
      render: (s) => <Badge variant={s.decision === "confirmed" ? "ok" : "neutral"}>{s.decision === "confirmed" ? "Linked" : "Different people"}</Badge>,
    },
    {
      key: "pair", header: "Registrations",
      render: (s) => (
        <span className="min-w-0 break-words">
          {name(s.a)} <span className="tabular text-ddg-muted">({s.a.regId})</span> + {name(s.b)} <span className="tabular text-ddg-muted">({s.b.regId})</span>
        </span>
      ),
    },
    { key: "strength", header: "Evidence", hideBelow: "md", render: (s) => <span><Badge variant={strengthBadge[s.strength]}>{strengthWord[s.strength]}</Badge> <span className="text-ddg-muted">{s.reason}</span></span> },
    { key: "by", header: "Decided", hideBelow: "sm", align: "right", render: (s) => <span className="whitespace-nowrap text-ddg-muted">{s.decidedBy ?? "unknown"}{s.decidedAt ? `, ${time(s.decidedAt)}` : ""}</span> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Heading as="h1" size="md">Possible duplicates</Heading>
        <p className="mt-1 text-sm text-ddg-muted">Nothing is merged automatically: linking gives both tickets one admission, and the original rows stay as they are.</p>
      </div>

      {error && <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger-strong">{error}</p>}

      {!data ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : (
        <>
          <Section
            title={`To review (${pending.length})`}
            description={`${data.counts.strong} strong · ${data.counts.medium} medium · ${data.counts.weak} weak`}
          >
            {pending.length === 0 ? (
              <p className="text-sm text-ddg-muted">All reviewed. No open suggestions.</p>
            ) : (
              <div className="flex flex-col divide-y divide-ddg-line">
                {pending.map((s) => (
                  <article key={s.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 lg:flex-row lg:items-start lg:gap-4">
                    <div className="flex shrink-0 flex-wrap items-center gap-2 lg:w-44 lg:flex-col lg:items-start">
                      <Badge variant={strengthBadge[s.strength]}>{strengthWord[s.strength]}</Badge>
                      <span className="text-sm text-ddg-muted">{s.reason}</span>
                      {s.samePerson && <Badge variant="ok">Already linked</Badge>}
                    </div>
                    <div className="min-w-0 flex-1"><Compare s={s} /></div>
                    <div className="flex shrink-0 gap-2 lg:w-44 lg:flex-col">
                      <Button variant="primary" size="sm" fullWidth loading={busy === s.id + "confirmed"} disabled={!!busy}
                        onClick={() => decide(s, "confirmed")}>Same person – link</Button>
                      <Button variant="secondary" size="sm" fullWidth loading={busy === s.id + "rejected"} disabled={!!busy}
                        onClick={() => decide(s, "rejected")}>Different people</Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Section>

          <Section title={`Decided (${decided.length})`}>
            <Table columns={decidedColumns} rows={decided} rowKey={(s) => s.id} dense empty={<p className="text-sm text-ddg-muted">No decisions yet.</p>} />
          </Section>
        </>
      )}
    </div>
  );
}
