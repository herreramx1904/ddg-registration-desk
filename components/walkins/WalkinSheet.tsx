"use client";
// Walk-ins (T5): desk registration sheet + desk status strip.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { DeskGuest } from "@/lib/domain/types";
import type { DeskWalkin } from "@/lib/service/walkins";
import { fold } from "@/lib/service/checkin";
import { Badge, Button, Input, Modal, SearchInput, cx, useToast, IconClose, IconUserPlus } from "@/components/ui";

export interface WalkinSheetProps { open: boolean; onClose: () => void }

const TYPES = ["Press", "Customer", "Partner", "Speaker", "Other"] as const;
type TypeChoice = (typeof TYPES)[number];

const labelCls = "text-xs uppercase tracking-[0.16em] text-ddg-ink";
const textareaCls =
  "block w-full min-w-0 rounded-2xl border-2 border-ddg-line bg-white px-4 py-3 text-lg text-ddg-ink outline-none " +
  "placeholder:text-ddg-muted/70 focus:border-ddg-orange focus:shadow-[0_0_0_4px_rgb(251_119_48/0.18)]";

const emptyForm = {
  firstName: "", lastName: "", company: "", type: "Other" as TypeChoice, reason: "", email: "", idChecked: false,
};

export function WalkinSheet({ open, onClose }: WalkinSheetProps) {
  const { toast } = useToast();
  const [f, setF] = useState(emptyForm);
  const [replaces, setReplaces] = useState<DeskGuest | null>(null);
  const [q, setQ] = useState("");
  const [guests, setGuests] = useState<DeskGuest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || guests) return;
    let alive = true;
    fetch("/api/desk/guests")
      .then((r) => {
        if (r.status === 401) { window.location.href = "/"; return null; }
        return r.ok ? r.json() : null;
      })
      .then((d) => { if (alive && d?.guests) setGuests(d.guests); })
      .catch(() => {});
    return () => { alive = false; };
  }, [open, guests]);

  const matches = useMemo(() => {
    const needle = fold(q);
    if (!needle || !guests) return [];
    const words = needle.split(" ");
    return guests
      .filter((g) => {
        const hay = fold(`${g.firstName} ${g.lastName} ${g.company ?? ""} ${g.regId}`);
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 6);
  }, [q, guests]);

  const set = <K extends keyof typeof emptyForm>(k: K, v: (typeof emptyForm)[K]) => setF((s) => ({ ...s, [k]: v }));

  function close() {
    setF(emptyForm); setReplaces(null); setQ(""); setError(null); setGuests(null);
    onClose();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.firstName.trim() || !f.lastName.trim()) return setError("First and last name, please.");
    if (!f.reason.trim()) return setError("Who invited them, or why are they here?");
    if (!f.idChecked) return setError("Check their ID or press card first.");
    setError(null); setSaving(true);
    try {
      const r = await fetch("/api/walkins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: f.firstName, lastName: f.lastName, company: f.company,
          guestType: f.type === "Other" ? "Unknown" : f.type, reason: f.reason, email: f.email,
          idChecked: f.idChecked, replacesRegistration: replaces?.registrationId ?? null,
        }),
      });
      if (r.status === 401) { window.location.href = "/"; return; }
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error ?? "Could not send. Try again."); return; }
      toast({ title: "Sent to a manager. Ask them to wait a moment.", tone: "info" });
      close();
    } catch {
      setError("No connection. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      variant="sheet"
      dismissible={!saving}
      title="Walk-in"
      description="Not on the list? A manager will approve them."
      footer={
        <>
          <Button type="button" variant="ghost" onClick={close} disabled={saving}>Cancel</Button>
          <Button type="submit" form="walkin-form" loading={saving} icon={<IconUserPlus size={20} />}>Send to manager</Button>
        </>
      }
    >
      <form id="walkin-form" onSubmit={submit} className="flex flex-col gap-4 pb-2">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="First name" value={f.firstName} onChange={(e) => set("firstName", e.target.value)} autoComplete="off" required />
          <Input label="Last name" value={f.lastName} onChange={(e) => set("lastName", e.target.value)} autoComplete="off" required />
        </div>
        <Input label="Company" value={f.company} onChange={(e) => set("company", e.target.value)} autoComplete="off" />

        <fieldset className="flex flex-col gap-1.5">
          <legend className={cx(labelCls, "mb-1.5")}>Type</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {TYPES.map((t) => (
              <button
                key={t} type="button" role="radio" aria-checked={f.type === t} onClick={() => set("type", t)}
                className={cx(
                  "h-11 rounded-full border-2 px-4 text-sm font-semibold transition-colors",
                  f.type === t ? "border-ddg-orange bg-ddg-orange text-white" : "border-ddg-line bg-white text-ddg-ink hover:border-ddg-orange",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="walkin-reason" className={labelCls}>Who invited them / why?</label>
          <textarea
            id="walkin-reason" rows={2} value={f.reason} onChange={(e) => set("reason", e.target.value)}
            placeholder="e.g. Invited by Hege, press for the keynote" className={textareaCls} required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={labelCls}>Replacing a guest on the list?</span>
          {replaces ? (
            <div className="flex items-center gap-2 rounded-2xl border-2 border-ddg-line bg-ddg-soft px-4 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{replaces.firstName} {replaces.lastName}</p>
                <p className="truncate text-sm text-ddg-muted">{replaces.company ?? "No company"} · {replaces.regId}</p>
              </div>
              <button
                type="button" aria-label="Remove replacement" onClick={() => setReplaces(null)}
                className="grid size-11 place-items-center rounded-full text-ddg-muted hover:bg-white hover:text-ddg-ink"
              >
                <IconClose size={20} />
              </button>
            </div>
          ) : (
            <>
              <SearchInput value={q} onValueChange={setQ} label="Search guest being replaced" placeholder="Optional: search the original guest" />
              {matches.length > 0 && (
                <ul className="divide-y divide-ddg-line overflow-hidden rounded-2xl border-2 border-ddg-line">
                  {matches.map((g) => (
                    <li key={g.registrationId}>
                      <button
                        type="button" onClick={() => { setReplaces(g); setQ(""); }}
                        className="flex w-full min-w-0 items-center gap-2 px-4 py-3 text-left hover:bg-ddg-soft"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-semibold">{g.firstName} {g.lastName}</span>
                          <span className="text-ddg-muted"> · {g.company ?? "No company"}</span>
                        </span>
                        <span className="shrink-0 text-xs text-ddg-muted">{g.regId}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {q && guests && matches.length === 0 && <p className="text-sm text-ddg-muted">No guest matches.</p>}
            </>
          )}
        </div>

        <Input
          label="Email (optional)" type="email" inputMode="email" value={f.email} onChange={(e) => set("email", e.target.value)}
          hint="Only if they agree to be contacted. Managers only." autoComplete="off"
        />

        <label className={cx(
          "flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-3",
          f.idChecked ? "border-ok bg-ok-soft" : "border-ddg-line",
        )}>
          <input
            type="checkbox" checked={f.idChecked} onChange={(e) => set("idChecked", e.target.checked)}
            className="size-6 shrink-0 accent-ok"
          />
          <span className="font-semibold">ID or press card checked</span>
        </label>

        {error && <p role="alert" className="text-sm font-semibold text-danger-strong">{error}</p>}
      </form>
    </Modal>
  );
}

const MAX_AGE_MS = 30 * 60 * 1000;

const statusView = {
  pending: { variant: "warn", text: "Waiting for a manager", cls: "border-warn/40 bg-warn-soft" },
  approved: { variant: "ok", text: "Approved – welcome them", cls: "border-ok/40 bg-ok-soft" },
  rejected: { variant: "danger", text: "Not approved", cls: "border-danger/40 bg-danger-soft" },
} as const;

/** Small strip for the desk screen showing recent pending/approved/rejected walk-ins (polls itself). */
export function DeskWalkinStatus() {
  const [items, setItems] = useState<DeskWalkin[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/walkins");
        if (r.status === 401) { window.location.href = "/"; return; }
        if (!r.ok) return;
        const d = await r.json();
        if (alive) { setItems(d.walkins ?? []); setNow(Date.now()); }
      } catch { /* keep last state */ }
    };
    load();
    const t = setInterval(load, 3000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const recent = items
    .filter((w) => w.status === "pending" || now - Date.parse(w.decidedAt ?? w.createdAt) < MAX_AGE_MS)
    .slice(0, 5);
  if (recent.length === 0) return null;

  return (
    <section aria-label="Walk-ins" className="flex flex-col gap-2">
      {recent.map((w) => {
        const v = statusView[w.status];
        return (
          <div key={w.id} className={cx("flex min-w-0 items-center gap-3 rounded-2xl border-2 px-4 py-2.5", v.cls)}>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{w.firstName} {w.lastName}</p>
              <p className="truncate text-xs text-ddg-muted">
                Walk-in{w.company ? ` · ${w.company}` : ""}{w.replaces ? ` · replaces ${w.replaces.name}` : ""}
                {w.status === "rejected" && w.decisionNote ? ` · ${w.decisionNote}` : ""}
              </p>
            </div>
            <Badge variant={v.variant} solid={w.status !== "pending"} className="shrink-0">{v.text}</Badge>
          </div>
        );
      })}
    </section>
  );
}
