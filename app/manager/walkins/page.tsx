"use client";
// Manager walk-ins (T5): approve / reject pending walk-ins, see history. Layout (AppShell + nav) comes from app/manager/layout.tsx.
import { useCallback, useEffect, useState } from "react";
import type { ManagerWalkin } from "@/lib/service/walkins";
import { Badge, Button, Card, EmptyState, Heading, Spinner, cx, useToast, IconCheck, IconBlock } from "@/components/ui";

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

export default function ManagerWalkinsPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<ManagerWalkin[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/manager/walkins");
      if (r.status === 401) { window.location.href = "/"; return; }
      if (!r.ok) return;
      const d = await r.json();
      setItems(d.walkins ?? []);
    } catch { /* keep last state */ }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch + 3 s polling
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  async function decide(w: ManagerWalkin, decision: "approved" | "rejected") {
    setBusy(w.id);
    try {
      const r = await fetch("/api/manager/walkins/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: w.id, decision, note: notes[w.id] ?? "" }),
      });
      if (r.status === 401) { window.location.href = "/"; return; }
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast({ title: d.error ?? "Could not save", tone: "danger" });
      } else {
        toast({
          title: decision === "approved" ? `${w.firstName} ${w.lastName} approved` : `${w.firstName} ${w.lastName} not approved`,
          detail: "The desk sees it now.",
          tone: decision === "approved" ? "ok" : "warn",
        });
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (!items) return <div className="grid place-items-center py-16"><Spinner label="Loading walk-ins" /></div>;

  const pending = items.filter((w) => w.status === "pending");
  const decided = items.filter((w) => w.status !== "pending");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Heading as="h1" size="xl">Walk-ins</Heading>
        {pending.length > 0 && <Badge variant="warn" solid size="md">{pending.length} waiting</Badge>}
      </div>

      <section className="flex flex-col gap-3">
        <Heading as="h2" size="sm">Waiting for you</Heading>
        {pending.length === 0 ? (
          <EmptyState title="No one waiting" detail="New walk-ins from the desk show up here within a few seconds." />
        ) : (
          pending.map((w) => (
            <Card key={w.id} accent="warn">
              <Details w={w} />
              <div className="mt-4 flex flex-col gap-3">
                <input
                  aria-label={`Note for ${w.firstName} ${w.lastName}`}
                  placeholder="Note (optional)"
                  value={notes[w.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [w.id]: e.target.value }))}
                  className="h-12 w-full min-w-0 rounded-2xl border-2 border-ddg-line px-4 outline-none focus:border-ddg-orange"
                />
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="success" size="lg" fullWidth icon={<IconCheck size={20} />}
                    loading={busy === w.id} disabled={!!busy} onClick={() => decide(w, "approved")}>
                    Approve
                  </Button>
                  <Button variant="danger" size="lg" fullWidth icon={<IconBlock size={20} />}
                    disabled={!!busy} onClick={() => decide(w, "rejected")}>
                    Reject
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </section>

      {decided.length > 0 && (
        <section className="flex flex-col gap-3">
          <Heading as="h2" size="sm">History</Heading>
          {decided.map((w) => (
            <Card key={w.id} accent={w.status === "approved" ? "ok" : "danger"} padding="sm">
              <Details w={w} />
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}

function Details({ w }: { w: ManagerWalkin }) {
  const status = {
    pending: <Badge variant="warn">Pending</Badge>,
    approved: <Badge variant="ok" solid>Approved</Badge>,
    rejected: <Badge variant="danger" solid>Rejected</Badge>,
  }[w.status];
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <p className="min-w-0 truncate text-lg font-semibold">{w.firstName} {w.lastName}</p>
        {status}
        <Badge variant="neutral">{w.guestType === "Unknown" ? "Other" : w.guestType}</Badge>
      </div>
      {w.company && <p className="text-sm text-ddg-muted">{w.company}</p>}
      <p className="text-sm"><span className="text-ddg-muted">Why: </span>{w.reason}</p>
      {w.replaces && (
        <p className="text-sm">
          <span className="text-ddg-muted">Replaces: </span>
          <span className="font-semibold">{w.replaces.name}</span>
          <span className="text-ddg-muted"> ({w.replaces.regId})</span>
        </p>
      )}
      {w.email && <p className={cx("break-all text-sm")}><span className="text-ddg-muted">Email: </span>{w.email}</p>}
      <p className="text-xs text-ddg-muted">
        Registered by {w.registeredBy} at {time(w.createdAt)}{w.idChecked ? " · ID checked" : ""}
        {w.decidedBy && ` · ${w.status === "approved" ? "Approved" : "Rejected"} by ${w.decidedBy} at ${time(w.decidedAt)}`}
      </p>
      {w.decisionNote && <p className="text-sm italic">&ldquo;{w.decisionNote}&rdquo;</p>}
    </div>
  );
}
