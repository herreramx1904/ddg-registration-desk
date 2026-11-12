"use client";
// Manager walk-ins (T5): approve / reject pending walk-ins, see history. Layout (AppShell + nav) comes from app/manager/layout.tsx.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ManagerWalkin } from "@/lib/service/walkins";
import {
  Badge, Button, Drawer, Heading, Section, Spinner, Table, useToast, IconCheck, IconBlock, type Column,
} from "@/components/ui";

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
const typeLabel = (t: string) => (t === "Unknown" ? "Other" : t);

function StatusBadge({ w }: { w: ManagerWalkin }) {
  if (w.status === "approved") return <Badge variant="ok">Approved{w.decidedAt ? ` ${time(w.decidedAt)}` : ""}</Badge>;
  if (w.status === "rejected") return <Badge variant="danger">Rejected{w.decidedAt ? ` ${time(w.decidedAt)}` : ""}</Badge>;
  return <Badge variant="warn">Pending</Badge>;
}

export default function ManagerWalkinsPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<ManagerWalkin[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "decidedAt", dir: "desc" });

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/manager/walkins", { cache: "no-store" });
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
    setBusy(w.id + decision);
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
        setOpen((cur) => (cur === w.id ? null : cur));
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  const pending = useMemo(() => (items ?? []).filter((w) => w.status === "pending"), [items]);
  const decided = useMemo(() => {
    const list = (items ?? []).filter((w) => w.status !== "pending");
    const dir = sort.dir === "asc" ? 1 : -1;
    const val = (w: ManagerWalkin) => {
      if (sort.key === "status") return w.status;
      if (sort.key === "createdAt") return w.createdAt;
      if (sort.key === "name") return `${w.lastName} ${w.firstName}`.toLowerCase();
      return w.decidedAt ?? "";
    };
    return [...list].sort((a, b) => (val(a) < val(b) ? -dir : val(a) > val(b) ? dir : 0));
  }, [items, sort]);

  const detail = open ? items?.find((w) => w.id === open) ?? null : null;

  const pendingColumns: Column<ManagerWalkin>[] = [
    {
      key: "name", header: "Name",
      render: (w) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-ddg-ink">{w.firstName} {w.lastName}</p>
          <p className="truncate text-xs text-ddg-muted md:hidden">{w.company ?? "No company"} · {typeLabel(w.guestType)}</p>
        </div>
      ),
    },
    { key: "company", header: "Company", hideBelow: "md", render: (w) => w.company ?? <span className="text-ddg-muted">–</span> },
    { key: "type", header: "Type", hideBelow: "md", render: (w) => typeLabel(w.guestType) },
    {
      key: "replaces", header: "Replacing", hideBelow: "lg",
      render: (w) => w.replaces ? <span>{w.replaces.name} <span className="text-ddg-muted">({w.replaces.regId})</span></span> : <span className="text-ddg-muted">–</span>,
    },
    {
      key: "registered", header: "Registered", hideBelow: "sm",
      render: (w) => <span className="whitespace-nowrap"><span className="tabular">{time(w.createdAt)}</span> <span className="text-ddg-muted">by {w.registeredBy}</span></span>,
    },
    {
      key: "actions", header: <span className="sr-only">Actions</span>, align: "right",
      render: (w) => (
        <div className="flex flex-wrap justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <span className="hidden sm:inline"><Button variant="ghost" size="sm" onClick={() => setOpen(w.id)}>Details</Button></span>
          <Button variant="success" size="sm" icon={<IconCheck size={16} />} loading={busy === w.id + "approved"} disabled={!!busy}
            onClick={() => decide(w, "approved")}>Approve</Button>
          <Button variant="danger" size="sm" icon={<IconBlock size={16} />} loading={busy === w.id + "rejected"} disabled={!!busy}
            onClick={() => decide(w, "rejected")}>Reject</Button>
        </div>
      ),
    },
  ];

  const historyColumns: Column<ManagerWalkin>[] = [
    {
      key: "name", header: "Name", sortable: true,
      render: (w) => (
        <div className="min-w-0">
          <p className="truncate text-ddg-ink">{w.firstName} {w.lastName}</p>
          <p className="truncate text-xs text-ddg-muted md:hidden">{w.company ?? "No company"} · {typeLabel(w.guestType)}</p>
        </div>
      ),
    },
    { key: "company", header: "Company", hideBelow: "md", render: (w) => w.company ?? <span className="text-ddg-muted">–</span> },
    { key: "type", header: "Type", hideBelow: "lg", render: (w) => typeLabel(w.guestType) },
    { key: "status", header: "Status", sortable: true, render: (w) => <StatusBadge w={w} /> },
    {
      key: "decidedAt", header: "Decided", sortable: true, hideBelow: "sm",
      render: (w) => <span className="whitespace-nowrap text-ddg-muted">by {w.decidedBy ?? "unknown"}</span>,
    },
    {
      key: "createdAt", header: "Registered", sortable: true, hideBelow: "md",
      render: (w) => <span className="whitespace-nowrap"><span className="tabular">{time(w.createdAt)}</span> <span className="text-ddg-muted">by {w.registeredBy}</span></span>,
    },
    { key: "note", header: "Note", hideBelow: "lg", render: (w) => w.decisionNote ? <span className="line-clamp-1">{w.decisionNote}</span> : <span className="text-ddg-muted">–</span> },
  ];

  if (!items) return <div className="grid place-items-center py-16"><Spinner label="Loading walk-ins" /></div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Heading as="h1" size="md">Walk-ins</Heading>
        {pending.length > 0 && <Badge variant="warn">{pending.length} waiting</Badge>}
      </div>

      <Section
        title="Waiting for a decision"
        description={pending.length > 0 ? "Approve or reject; the desk is updated within a few seconds." : undefined}
      >
        {pending.length === 0 ? (
          <p className="text-sm text-ddg-muted">No one waiting.</p>
        ) : (
          <Table columns={pendingColumns} rows={pending} rowKey={(w) => w.id} onRowClick={(w) => setOpen(w.id)} selectedKey={open} />
        )}
      </Section>

      <Section title={`History (${decided.length})`}>
        <Table
          columns={historyColumns}
          rows={decided}
          rowKey={(w) => w.id}
          dense
          sort={sort}
          onSortChange={setSort}
          onRowClick={(w) => setOpen(w.id)}
          selectedKey={open}
          empty={<p className="text-sm text-ddg-muted">No decisions yet.</p>}
        />
      </Section>

      <Drawer
        open={!!detail}
        onClose={() => setOpen(null)}
        title={detail ? `${detail.firstName} ${detail.lastName}` : ""}
        description={detail ? `${detail.company ?? "No company"} · ${typeLabel(detail.guestType)}` : undefined}
        footer={detail?.status === "pending" ? (
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="danger" icon={<IconBlock size={16} />} loading={busy === detail.id + "rejected"} disabled={!!busy}
              onClick={() => decide(detail, "rejected")}>Reject</Button>
            <Button variant="success" icon={<IconCheck size={16} />} loading={busy === detail.id + "approved"} disabled={!!busy}
              onClick={() => decide(detail, "approved")}>Approve</Button>
          </div>
        ) : undefined}
      >
        {detail && (
          <div className="flex flex-col gap-3 text-sm">
            <StatusBadge w={detail} />
            <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5">
              <dt className="text-ddg-muted">Reason</dt><dd className="min-w-0 break-words">{detail.reason}</dd>
              {detail.replaces && (<><dt className="text-ddg-muted">Replacing</dt><dd>{detail.replaces.name} <span className="text-ddg-muted">({detail.replaces.regId})</span></dd></>)}
              {detail.email && (<><dt className="text-ddg-muted">Email</dt><dd className="break-all">{detail.email}</dd></>)}
              <dt className="text-ddg-muted">ID checked</dt><dd>{detail.idChecked ? "Yes" : "No"}</dd>
              <dt className="text-ddg-muted">Registered</dt><dd><span className="tabular">{time(detail.createdAt)}</span> by {detail.registeredBy}</dd>
              {detail.decidedBy && (<><dt className="text-ddg-muted">Decided</dt><dd><span className="tabular">{time(detail.decidedAt)}</span> by {detail.decidedBy}</dd></>)}
              {detail.decisionNote && (<><dt className="text-ddg-muted">Note</dt><dd className="break-words">{detail.decisionNote}</dd></>)}
            </dl>
            {detail.status === "pending" && (
              <label className="flex flex-col gap-1">
                <span className="text-ddg-muted">Note (optional)</span>
                <input
                  value={notes[detail.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [detail.id]: e.target.value }))}
                  placeholder="Why approved or rejected"
                  className="h-9 w-full min-w-0 rounded-lg border border-ddg-line bg-white px-3 text-sm outline-none focus:border-ddg-orange"
                />
              </label>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
