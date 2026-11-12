"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Badge, Button, cx, Sheet, Spinner, useToast, type BadgeVariant } from "@/components/ui";
import type { ArrivalBadge, ManagerGuest } from "@/lib/service/arrivals";
import type { CheckInResult, Flag, PersonStatus } from "@/lib/domain/types";

export const badgeMeta: Record<ArrivalBadge, { label: string; variant: BadgeVariant }> = {
  vip: { label: "VIP", variant: "vip" },
  access: { label: "Accessibility", variant: "access" },
  press: { label: "Press", variant: "info" },
  speaker: { label: "Speaker", variant: "brand" },
  walkin: { label: "Walk-in", variant: "neutral" },
  internal: { label: "Internal", variant: "neutral" },
};

export function Badges({ badges }: { badges: ArrivalBadge[] }) {
  return (
    <>
      {badges.map((b) => (
        <Badge key={b} variant={badgeMeta[b].variant}>{badgeMeta[b].label}</Badge>
      ))}
    </>
  );
}

export const statusMeta: Record<PersonStatus, { label: string; variant: BadgeVariant }> = {
  registered: { label: "Registered", variant: "neutral" },
  cancelled: { label: "Cancelled", variant: "warn" },
  do_not_admit: { label: "Do not admit", variant: "danger" },
};

export function time(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

const flagVariant = (f: Flag): BadgeVariant =>
  f.kind === "vip" ? "vip" : f.kind === "accessibility" ? "access" : f.severity === "data" ? "warn" : "info";

type FieldKey = keyof ManagerGuest["clean"] | "regId";

/** The clean field that each original column maps to, by header keywords. */
function fieldFor(header: string): FieldKey | null {
  const h = header.toLowerCase();
  if (/reg.*id|^id$/.test(h)) return "regId";
  if (/first/.test(h)) return "firstName";
  if (/last|surname/.test(h)) return "lastName";
  if (/mail/.test(h)) return "email";
  if (/account|owner/.test(h)) return "accountManager";
  if (/company|organi/.test(h)) return "company";
  if (/title|position/.test(h)) return "jobTitle";
  if (/type|category/.test(h)) return "guestType";
  if (/breakout|session|track/.test(h)) return "breakout";
  if (/diet|allerg|food/.test(h)) return "dietary";
  if (/plus|\+1/.test(h)) return "plusOne";
  if (/mobile|phone|tel/.test(h)) return "mobile";
  if (/date|registered/.test(h)) return "registeredOn";
  if (/hotel/.test(h)) return "hotel";
  return null;
}

function cleanValue(g: ManagerGuest, k: FieldKey | null): string | null | undefined {
  if (!k) return undefined;
  if (k === "regId") return g.regId;
  if (k === "plusOne") return g.clean.plusOneName ? `${g.clean.plusOne} (${g.clean.plusOneName})` : g.clean.plusOne;
  return g.clean[k];
}

function Section({ title, children, tone }: { title: string; children: ReactNode; tone?: "danger" }) {
  return (
    <section className="mt-5 first:mt-1">
      <h3 className={cx("mb-2 text-[11px] uppercase tracking-[0.16em]", tone === "danger" ? "text-danger-strong" : "text-ddg-muted")}>
        {title}
      </h3>
      {children}
    </section>
  );
}

export function GuestSheet({
  registrationId, onClose, onChanged,
}: { registrationId: string | null; onClose: () => void; onChanged?: () => void }) {
  const { toast } = useToast();
  const [guest, setGuest] = useState<ManagerGuest | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    const res = await fetch(`/api/manager/guests/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (res.status === 401) { window.location.assign("/"); return; }
    if (!res.ok) { toast({ title: "Could not load this guest", tone: "danger" }); return; }
    setGuest((await res.json()).guest);
  }, [toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when another guest is opened
    setGuest(null);
    if (registrationId) void load(registrationId);
  }, [registrationId, load]);

  async function post(url: string, body: unknown, key: string) {
    setBusy(key);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.status === 401) { window.location.assign("/"); return null; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast({ title: data.error ?? "That didn't work", tone: "danger" }); return null; }
      return data;
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(status: PersonStatus) {
    if (!guest) return;
    const ok = await post("/api/manager/status", { registrationId: guest.registrationId, status }, status);
    if (ok) {
      toast({ title: `Status set to ${statusMeta[status].label}`, tone: status === "registered" ? "ok" : status === "cancelled" ? "warn" : "danger" });
      await load(guest.registrationId);
      onChanged?.();
    }
  }

  async function checkInNow() {
    if (!guest) return;
    const r: CheckInResult | null = await post(
      "/api/desk/checkin", { registrationId: guest.registrationId, via: "manager", managerOverride: true }, "checkin",
    );
    if (!r) return;
    if (r.ok) {
      const checkInId = r.checkInId;
      toast({
        title: `${guest.name} is checked in`, tone: "ok",
        action: { label: "Undo", onClick: () => void undo(checkInId) },
      });
    } else if (r.reason === "already_checked_in") {
      toast({ title: "Already checked in", detail: `${time(r.at)} by ${r.staff}`, tone: "warn" });
    } else {
      toast({ title: "Could not check in", tone: "danger" });
    }
    await load(guest.registrationId);
    onChanged?.();
  }

  async function undo(checkInId: string) {
    const ok = await post("/api/desk/undo", { checkInId }, "undo");
    if (ok) {
      toast({ title: "Check-in undone", tone: "info" });
      if (registrationId) await load(registrationId);
      onChanged?.();
    }
  }

  const g = guest;
  const rawHeaders = g ? Object.keys(g.raw) : [];

  return (
    <Sheet
      open={!!registrationId}
      onClose={onClose}
      size="lg"
      title={g ? g.name : "Guest"}
      description={g ? [g.company, g.guestType, `Reg ID ${g.regId}`, `Excel row ${g.rowNumber}`].filter(Boolean).join(" · ") : undefined}
      footer={
        g && (
          <>
            {g.checkedIn ? (
              <Button variant="secondary" loading={busy === "undo"} onClick={() => undo(g.checkedIn!.checkInId)}>
                Undo check-in
              </Button>
            ) : (
              <Button variant="success" loading={busy === "checkin"} onClick={checkInNow}>
                {g.status === "registered" ? "Check in" : "Check in (manager override)"}
              </Button>
            )}
          </>
        )
      }
    >
      {!g ? (
        <div className="grid place-items-center py-10"><Spinner /></div>
      ) : (
        <div className="pb-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={statusMeta[g.status].variant} solid>{statusMeta[g.status].label}</Badge>
            {g.checkedIn ? (
              <Badge variant="ok" solid>In since {time(g.checkedIn.at)}</Badge>
            ) : (
              <Badge variant="neutral">Not arrived</Badge>
            )}
            <Badges badges={g.badges} />
            {g.regIdGenerated && <Badge variant="warn">Generated ID</Badge>}
          </div>

          {g.checkedIn && (
            <p className="mt-2 text-sm text-ddg-muted">
              Checked in at {time(g.checkedIn.at)} by {g.checkedIn.staff} via {g.checkedIn.via}
              {g.checkedIn.override === "cancelled_confirmed" && " · cancelled, admitted"}
              {g.checkedIn.override === "manager_override" && " · manager override"}
            </p>
          )}

          <Section title="Status">
            <div className="grid grid-cols-3 gap-2">
              {(["registered", "cancelled", "do_not_admit"] as PersonStatus[]).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={g.status === s ? (s === "registered" ? "success" : s === "cancelled" ? "warn" : "danger") : "secondary"}
                  loading={busy === s}
                  disabled={g.status === s}
                  onClick={() => setStatus(s)}
                >
                  {statusMeta[s].label}
                </Button>
              ))}
            </div>
          </Section>

          {g.deskNote && (
            <Section title="Desk note (visible at the desk)">
              <p className="rounded-xl bg-ddg-soft px-3 py-2 text-sm">{g.deskNote}</p>
            </Section>
          )}

          {g.managerNotes && (
            <Section title="Manager only" tone="danger">
              <p className="rounded-xl border-2 border-dashed border-danger/40 bg-danger-soft/40 px-3 py-2 text-sm">
                {g.managerNotes}
              </p>
              <p className="mt-1 text-xs text-ddg-muted">Never shown at the desk.</p>
            </Section>
          )}

          <Section title={`Flags (${g.flags.length})`}>
            {g.flags.length === 0 ? (
              <p className="text-sm text-ddg-muted">No flags.</p>
            ) : (
              <ul className="space-y-1.5">
                {g.flags.map((f, i) => (
                  <li key={i} className="flex flex-wrap items-start gap-2 text-sm">
                    <Badge variant={flagVariant(f)}>{f.kind === "other" ? f.label : f.label || f.kind}</Badge>
                    {f.severity === "data" && <span className="text-[11px] uppercase tracking-wider text-ddg-muted">Data · manager only</span>}
                    {f.detail && <span className="text-ddg-muted">{f.detail}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {(g.linked.length > 0 || g.suggestions.length > 0 || g.replacedBy.length > 0) && (
            <Section title="Linked registrations">
              <ul className="space-y-1.5 text-sm">
                {g.linked.map((l) => (
                  <li key={l.registrationId}>
                    <Badge variant="ok">Same person</Badge> {l.name} · {l.regId} · row {l.rowNumber}
                  </li>
                ))}
                {g.suggestions.filter((s) => s.decision !== "confirmed").map((s) => (
                  <li key={s.id}>
                    <Badge variant={s.decision === "rejected" ? "neutral" : "warn"}>
                      {s.decision === "rejected" ? "Not the same" : `Possible duplicate · ${s.strength}`}
                    </Badge>{" "}
                    {s.otherName} · {s.otherRegId} <span className="text-ddg-muted">({s.reason})</span>
                  </li>
                ))}
                {g.replacedBy.map((w) => (
                  <li key={w.walkinId}>
                    <Badge variant="info">Replaced by walk-in</Badge> {w.name} <span className="text-ddg-muted">({w.status})</span>
                  </li>
                ))}
              </ul>
              {g.suggestions.some((s) => s.decision === "pending") && (
                <Link href="/manager/duplicates" className="mt-2 inline-block text-sm text-ddg-orange-dark underline">
                  Review in Duplicates
                </Link>
              )}
            </Section>
          )}

          <Section title="Original vs cleaned">
            <div className="overflow-hidden rounded-xl border border-ddg-line">
              <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] bg-ddg-soft px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-ddg-muted">
                <span>Column</span><span>Original</span><span>Cleaned</span>
              </div>
              {rawHeaders.map((h) => {
                const raw = g.raw[h];
                const key = fieldFor(h);
                const clean = cleanValue(g, key);
                const ch = key ? g.changes.filter((c) => c.field === key) : [];
                const differs = clean !== undefined && (raw ?? "") !== (clean ?? "");
                return (
                  <div key={h} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-t border-ddg-line px-3 py-2 text-sm">
                    <span className="break-words text-ddg-muted">{h}</span>
                    <span className="break-words font-mono text-[13px]">{raw ?? <em className="text-ddg-muted">empty</em>}</span>
                    <span className={cx("break-words", differs && "text-ok-strong")}>
                      {clean === undefined ? <span className="text-ddg-muted">kept as is</span> : clean ?? <em className="text-ddg-muted">empty</em>}
                      {ch.map((c, i) => (
                        <span key={i} className="mt-0.5 block font-mono text-[11px] text-ddg-muted">{c.rule}</span>
                      ))}
                    </span>
                  </div>
                );
              })}
            </div>
            {g.changes.length > 0 && (
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-ddg-muted">All {g.changes.length} cleaning changes</summary>
                <ul className="mt-1 space-y-1">
                  {g.changes.map((c, i) => (
                    <li key={i} className="break-words">
                      <span className="text-ddg-muted">{c.field}:</span> <span className="font-mono text-[13px]">{c.before ?? "empty"}</span>
                      {" → "}<span>{c.after ?? "empty"}</span> <span className="font-mono text-[11px] text-ddg-muted">{c.rule}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Section>
        </div>
      )}
    </Sheet>
  );
}
