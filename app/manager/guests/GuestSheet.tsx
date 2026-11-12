"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Badge, Button, cx, Drawer, Spinner, useToast, type BadgeVariant } from "@/components/ui";
import type { ArrivalBadge, ManagerGuest } from "@/lib/service/arrivals";
import type { CheckInResult, Flag, PersonStatus } from "@/lib/domain/types";
import type { AuditRow } from "@/lib/server/store/types";

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

/** Check-in state in words (readable without colour). */
export function checkinLabel(g: Pick<ManagerGuest, "checkedIn" | "status">): { label: string; variant: BadgeVariant } {
  if (g.checkedIn) return { label: `Checked in ${time(g.checkedIn.at)}`, variant: "ok" };
  if (g.status === "cancelled") return { label: "Cancelled", variant: "warn" };
  if (g.status === "do_not_admit") return { label: "Do not admit", variant: "danger" };
  return { label: "Not yet", variant: "neutral" };
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

/** One of the four groups in the drawer: a bordered panel with a sentence-case title. */
function Group({ title, aside, children, tone }: { title: string; aside?: ReactNode; children: ReactNode; tone?: "danger" }) {
  return (
    <section className={cx("rounded-lg border bg-white", tone === "danger" ? "border-danger/40" : "border-ddg-line")}>
      <header className="flex items-center justify-between gap-2 border-b border-ddg-line px-3 py-2">
        <h3 className={cx("text-sm font-semibold", tone === "danger" ? "text-danger-strong" : "text-ddg-ink")}>{title}</h3>
        {aside}
      </header>
      <div className="px-3 py-2.5">{children}</div>
    </section>
  );
}

const actionLabel: Record<string, string> = {
  "checkin": "Checked in",
  "checkin.undo": "Check-in undone",
  "checkin.cancelled_confirmed": "Checked in (cancelled, admitted)",
  "checkin.manager_override": "Checked in (manager override)",
  "status.set": "Status changed",
};

function describeAudit(e: AuditRow): string {
  const base = actionLabel[e.action] ?? e.action.replace(/[._]/g, " ");
  const d = e.details ?? {};
  if (e.action === "status.set" && typeof d.to === "string") {
    return `${base} to ${statusMeta[d.to as PersonStatus]?.label ?? d.to}`;
  }
  if (e.action.startsWith("checkin") && typeof d.via === "string" && e.action !== "checkin.undo") return `${base} via ${d.via}`;
  return base;
}

export function GuestSheet({
  registrationId, onClose, onChanged,
}: { registrationId: string | null; onClose: () => void; onChanged?: () => void }) {
  const { toast } = useToast();
  const [guest, setGuest] = useState<ManagerGuest | null>(null);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    const res = await fetch(`/api/manager/guests/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (res.status === 401) { window.location.assign("/"); return; }
    if (!res.ok) { toast({ title: "Could not load this guest", tone: "danger" }); return; }
    setGuest((await res.json()).guest);
    const a = await fetch(`/api/manager/guests/${encodeURIComponent(id)}/audit`, { cache: "no-store" }).catch(() => null);
    if (a?.ok) setAudit((await a.json()).entries);
  }, [toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when another guest is opened
    setGuest(null);
    setAudit(null);
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
    if (status !== "registered" && !window.confirm(`Set ${guest.name} to "${statusMeta[status].label}"?`)) return;
    const ok = await post("/api/manager/status", { registrationId: guest.registrationId, status }, status);
    if (ok) {
      toast({ title: `Status set to ${statusMeta[status].label}`, tone: status === "registered" ? "ok" : status === "cancelled" ? "warn" : "danger" });
      await load(guest.registrationId);
      onChanged?.();
    }
  }

  async function checkInNow() {
    if (!guest) return;
    if (guest.status !== "registered" && !window.confirm(`${guest.name} is marked "${statusMeta[guest.status].label}". Check in with a manager override?`)) return;
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
  const dataFlags = g ? g.flags.filter((f) => f.severity === "data") : [];
  const otherFlags = g ? g.flags.filter((f) => f.severity !== "data") : [];
  const pending = g ? g.suggestions.filter((s) => s.decision === "pending") : [];
  const rejected = g ? g.suggestions.filter((s) => s.decision === "rejected") : [];
  const ci = g ? checkinLabel(g) : null;

  return (
    <Drawer
      open={!!registrationId}
      onClose={onClose}
      width="lg"
      title={g ? g.name : "Guest"}
      description={g ? [g.company, g.guestType, `Reg ID ${g.regId}`, `Row ${g.rowNumber}`].filter(Boolean).join(" · ") : undefined}
      footer={
        g && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {ci && <Badge variant={ci.variant} solid={!!g.checkedIn}>{ci.label}</Badge>}
              <Badges badges={g.badges} />
            </div>
            {g.checkedIn ? (
              <Button variant="secondary" size="sm" loading={busy === "undo"} onClick={() => undo(g.checkedIn!.checkInId)}>
                Undo check-in
              </Button>
            ) : (
              <Button variant={g.status === "registered" ? "success" : "warn"} size="sm" loading={busy === "checkin"} onClick={checkInNow}>
                {g.status === "registered" ? "Check in now" : "Check in (override)"}
              </Button>
            )}
          </div>
        )
      }
    >
      {!g ? (
        <div className="grid place-items-center py-10"><Spinner /></div>
      ) : (
        <div className="space-y-3 pb-2">
          {g.managerNotes && (
            <Group title="Manager note" tone="danger" aside={<span className="text-xs text-ddg-muted">Never shown at the desk</span>}>
              <p className="text-sm">{g.managerNotes}</p>
            </Group>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Group title="Guest type" aside={<Badge variant="neutral">{g.guestType}</Badge>}>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-ddg-muted">Company</dt><dd className="truncate">{g.company ?? "None"}</dd>
                <dt className="text-ddg-muted">Breakout</dt><dd>{g.clean.breakout ?? "None"}</dd>
                <dt className="text-ddg-muted">Plus one</dt><dd>{cleanValue(g, "plusOne") ?? "unknown"}</dd>
                {g.deskNote && (<><dt className="text-ddg-muted">Desk note</dt><dd>{g.deskNote}</dd></>)}
              </dl>
              {otherFlags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {otherFlags.map((f, i) => (
                    <Badge key={i} variant={flagVariant(f)} title={f.detail ?? undefined}>{f.kind === "other" ? f.label : f.label || f.kind}</Badge>
                  ))}
                </div>
              )}
            </Group>

            <Group
              title="Identity review"
              aside={pending.length > 0 ? <Badge variant="warn">{pending.length} to decide</Badge> : g.linked.length > 0 ? <Badge variant="ok">Linked</Badge> : <span className="text-xs text-ddg-muted">No duplicates</span>}
            >
              <ul className="space-y-1 text-sm">
                {g.linked.map((l) => (
                  <li key={l.registrationId} className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="ok">Same person</Badge> <span>{l.name}</span> <span className="font-mono text-xs text-ddg-muted">{l.regId}</span>
                  </li>
                ))}
                {pending.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="warn">Possible · {s.strength}</Badge> <span>{s.otherName}</span>
                    <span className="font-mono text-xs text-ddg-muted">{s.otherRegId}</span>
                    <span className="text-xs text-ddg-muted">{s.reason}</span>
                  </li>
                ))}
                {rejected.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-1.5 text-ddg-muted">
                    <Badge variant="neutral">Not the same</Badge> <span>{s.otherName}</span>
                  </li>
                ))}
                {g.replacedBy.map((w) => (
                  <li key={w.walkinId} className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="info">Replaced by walk-in</Badge> <span>{w.name}</span> <span className="text-xs text-ddg-muted">({w.status})</span>
                  </li>
                ))}
                {dataFlags.map((f, i) => (
                  <li key={`d${i}`} className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="warn">{f.label || f.kind}</Badge>
                    {f.detail && <span className="text-xs text-ddg-muted">{f.detail}</span>}
                  </li>
                ))}
                {g.regIdGenerated && <li><Badge variant="warn">Generated Reg ID</Badge></li>}
                {g.linked.length + g.suggestions.length + g.replacedBy.length + dataFlags.length === 0 && !g.regIdGenerated && (
                  <li className="text-ddg-muted">Nothing to review.</li>
                )}
              </ul>
              {pending.length > 0 && (
                <Link href="/manager/duplicates" className="mt-2 inline-block text-sm text-ddg-orange-dark underline">
                  Decide in Duplicates
                </Link>
              )}
            </Group>

            <Group title="Admission restriction" aside={<Badge variant={statusMeta[g.status].variant} solid={g.status !== "registered"}>{statusMeta[g.status].label}</Badge>}>
              <div className="grid grid-cols-3 gap-1.5">
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
              <p className="mt-1.5 text-xs text-ddg-muted">Applies to all linked registrations of this person.</p>
            </Group>

            <Group title="Attendance" aside={ci && <Badge variant={ci.variant} solid={!!g.checkedIn}>{ci.label}</Badge>}>
              {g.checkedIn ? (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-ddg-muted">Time</dt><dd className="tabular">{time(g.checkedIn.at)}</dd>
                  <dt className="text-ddg-muted">By</dt><dd>{g.checkedIn.staff} via {g.checkedIn.via}</dd>
                  {g.checkedIn.override && (
                    <><dt className="text-ddg-muted">Exception</dt>
                    <dd><Badge variant={g.checkedIn.override === "manager_override" ? "danger" : "warn"}>
                      {g.checkedIn.override === "manager_override" ? "Manager override" : "Cancelled, admitted"}
                    </Badge></dd></>
                  )}
                </dl>
              ) : (
                <p className="text-sm text-ddg-muted">Not arrived yet.</p>
              )}
            </Group>
          </div>

          <Group title="Identity: original vs cleaned" aside={<span className="text-xs text-ddg-muted">{g.changes.length} changes</span>}>
            <div className="-mx-3 -my-2.5 overflow-x-auto">
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="text-left text-xs text-ddg-muted">
                    <th className="w-[28%] px-3 py-1.5 font-medium">Column</th>
                    <th className="px-3 py-1.5 font-medium">Original</th>
                    <th className="px-3 py-1.5 font-medium">Cleaned</th>
                  </tr>
                </thead>
                <tbody>
                  {rawHeaders.map((h) => {
                    const raw = g.raw[h];
                    const key = fieldFor(h);
                    const clean = cleanValue(g, key);
                    const ch = key ? g.changes.filter((c) => c.field === key) : [];
                    const differs = clean !== undefined && (raw ?? "") !== (clean ?? "");
                    return (
                      <tr key={h} className="border-t border-ddg-line align-top">
                        <td className="px-3 py-1.5 text-ddg-muted">{h}</td>
                        <td className="break-all px-3 py-1.5 font-mono text-xs">{raw ?? <em className="text-ddg-muted">empty</em>}</td>
                        <td className={cx("break-all px-3 py-1.5", differs && "text-ok-strong")}>
                          {clean === undefined ? <span className="text-ddg-muted">kept</span> : clean ?? <em className="text-ddg-muted">empty</em>}
                          {ch.map((c, i) => (
                            <span key={i} className="block font-mono text-[11px] text-ddg-muted">{c.rule}</span>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Group>

          <Group title="History" aside={audit && <span className="tabular text-xs text-ddg-muted">{audit.length} entries</span>}>
            {!audit ? (
              <Spinner size="sm" />
            ) : audit.length === 0 ? (
              <p className="text-sm text-ddg-muted">No actions recorded for this guest yet.</p>
            ) : (
              <ul className="divide-y divide-ddg-line text-sm">
                {audit.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 py-1.5 first:pt-0 last:pb-0">
                    <span className="tabular w-12 shrink-0 text-ddg-muted">{time(e.at)}</span>
                    <span className="min-w-0 flex-1">
                      {describeAudit(e)}
                      <span className="text-ddg-muted"> · {e.staff} ({e.role})</span>
                      {e.target && e.target !== g.regId && <span className="font-mono text-xs text-ddg-muted"> {e.target}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Group>
        </div>
      )}
    </Drawer>
  );
}
