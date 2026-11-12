"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Badge, Button, Card, EmptyState, Heading, Spinner, StatTile, cx, useToast, type BadgeVariant } from "@/components/ui";
import type { DuplicateSide, DuplicateView } from "@/lib/service/duplicates";

interface Counts { strong: number; medium: number; weak: number; pending: number; decided: number }

const strengthBadge: Record<DuplicateView["strength"], BadgeVariant> = { strong: "danger", medium: "warn", weak: "neutral" };
const strengthAccent = { strong: "danger", medium: "warn", weak: "none" } as const;
const statusLabel = { registered: "Registered", cancelled: "Cancelled", do_not_admit: "Do not admit" } as const;

const time = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

function Row({ label, a, b, same }: { label: string; a: ReactNode; b: ReactNode; same: boolean }) {
  const cell = cx("min-w-0 break-words rounded-lg px-2 py-1.5 text-sm", same ? "bg-ok-soft text-ok-strong" : "bg-ddg-soft");
  return (
    <>
      <p className="col-span-2 mt-2 text-[11px] uppercase tracking-[0.14em] text-ddg-muted">
        {label} {same && <span className="normal-case tracking-normal text-ok-strong">· match</span>}
      </p>
      <div className={cell}>{a ?? <span className="text-ddg-muted">–</span>}</div>
      <div className={cell}>{b ?? <span className="text-ddg-muted">–</span>}</div>
    </>
  );
}

function checkinText(s: DuplicateSide) {
  return s.checkedIn ? `In at ${time(s.checkedIn.at)} (${s.checkedIn.staff})` : "Not checked in";
}

function Compare({ s }: { s: DuplicateView }) {
  const { a, b } = s;
  const rawKeys = [...new Set([...Object.keys(a.raw), ...Object.keys(b.raw)])];
  const name = (x: DuplicateSide) => `${x.firstName} ${x.lastName}`;
  return (
    <>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1">
        <p className="ddg-heading text-sm">{a.regId} <span className="text-ddg-muted">· row {a.rowNumber}</span></p>
        <p className="ddg-heading text-sm">{b.regId} <span className="text-ddg-muted">· row {b.rowNumber}</span></p>
        <Row label="Name" a={name(a)} b={name(b)} same={norm(name(a)) === norm(name(b))} />
        <Row label="Company" a={a.company} b={b.company} same={!!a.company && norm(a.company) === norm(b.company)} />
        <Row label="Type" a={a.guestType} b={b.guestType} same={a.guestType === b.guestType} />
        <Row label="Email" a={a.email} b={b.email} same={!!a.email && norm(a.email) === norm(b.email)} />
        <Row label="Mobile" a={a.mobile} b={b.mobile} same={!!a.mobile && a.mobile === b.mobile} />
        <Row label="Status" a={statusLabel[a.personStatus]} b={statusLabel[b.personStatus]} same={a.personStatus === b.personStatus} />
        <Row label="Check-in" a={checkinText(a)} b={checkinText(b)} same={false} />
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-ddg-muted">Original rows (unchanged)</summary>
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          {rawKeys.map((k) => (
            <Row key={k} label={k} a={a.raw[k]} b={b.raw[k]} same={!!a.raw[k] && norm(a.raw[k]) === norm(b.raw[k])} />
          ))}
        </div>
      </details>
    </>
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

  return (
    <div className="space-y-5">
      <div>
        <Heading as="h1" size="lg">Possible duplicates</Heading>
        <p className="mt-2 max-w-2xl text-sm text-ddg-muted">
          Nothing is merged automatically. Linking means one admission for both tickets; the original rows stay as they are.
        </p>
      </div>

      {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger-strong">{error}</p>}

      {!data ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile value={data.counts.strong} label="Strong" tone="danger" hint="Same phone" size="sm" />
            <StatTile value={data.counts.medium} label="Medium" tone="warn" hint="Name + email/company" size="sm" />
            <StatTile value={data.counts.weak} label="Weak" tone="purple" hint="Shared email or name" size="sm" />
            <StatTile value={data.counts.decided} label="Decided" tone="ok" size="sm" />
          </div>

          <section className="space-y-3">
            <Heading size="sm">To review ({pending.length})</Heading>
            {pending.length === 0 ? (
              <EmptyState title="All reviewed" detail="No open duplicate suggestions." />
            ) : pending.map((s) => (
              <Card key={s.id} accent={strengthAccent[s.strength]} as="article">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge variant={strengthBadge[s.strength]}>{s.strength}</Badge>
                  <span className="text-sm">{s.reason}</span>
                  {s.samePerson && <Badge variant="ok">Already linked</Badge>}
                </div>
                <Compare s={s} />
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button variant="primary" fullWidth loading={busy === s.id + "confirmed"} disabled={!!busy}
                    onClick={() => decide(s, "confirmed")}>Same person – link</Button>
                  <Button variant="secondary" fullWidth loading={busy === s.id + "rejected"} disabled={!!busy}
                    onClick={() => decide(s, "rejected")}>Different people</Button>
                </div>
              </Card>
            ))}
          </section>

          {decided.length > 0 && (
            <section className="space-y-3">
              <Heading size="sm">Decided ({decided.length})</Heading>
              {decided.map((s) => (
                <Card key={s.id} padding="sm" accent={s.decision === "confirmed" ? "ok" : "none"}>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant={s.decision === "confirmed" ? "ok" : "neutral"}>
                      {s.decision === "confirmed" ? "Linked" : "Different people"}
                    </Badge>
                    <span className="min-w-0 break-words">
                      {s.a.firstName} {s.a.lastName} ({s.a.regId}) + {s.b.firstName} {s.b.lastName} ({s.b.regId})
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ddg-muted">
                    {s.strength} · {s.reason} · by {s.decidedBy ?? "unknown"}{s.decidedAt ? `, ${time(s.decidedAt)}` : ""}
                  </p>
                </Card>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
