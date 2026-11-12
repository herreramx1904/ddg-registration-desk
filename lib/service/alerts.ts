// Alerts (T8): arrival alerts (created by checkIn for VIP/accessibility guests) and desk help calls.
// Lifecycle: open -> acknowledged (manager "On my way") -> handled ("Done").
import type { Flag, GuestType, Session } from "@/lib/domain/types";
import type { AlertRow, Store } from "@/lib/server/store/types";

export type AlertStatus = AlertRow["status"];

export interface ManagerAlert {
  id: string;
  kind: AlertRow["kind"];
  /** "vip" | "access" | "help": drives the banner colour. */
  tone: "vip" | "access" | "help";
  reason: string | null;
  raisedBy: string;
  status: AlertStatus;
  createdAt: string;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  guest: null | {
    registrationId: string;
    regId: string;
    name: string;
    company: string | null;
    guestType: GuestType;
    flags: Flag[]; // desk-relevant only (warning + info)
  };
}

export interface DeskAlertStatus { status: AlertStatus; acknowledgedBy: string | null }

const DEFAULT_REASON = "Desk needs a manager";

function cleanReason(reason: unknown): string {
  const r = typeof reason === "string" ? reason.replace(/\s+/g, " ").trim().slice(0, 200) : "";
  return r || DEFAULT_REASON;
}

async function findAlert(store: Store, id: string): Promise<AlertRow | null> {
  return (await store.listAlerts()).find((a) => a.id === id) ?? null;
}

/** Desk "Call manager". Re-pressing for a guest with an open help call returns that call instead of a new one. */
export async function raiseHelp(
  store: Store, session: Session, input: { registrationId?: string | null; reason?: string | null },
): Promise<{ ok: true; id: string; existing: boolean } | { ok: false; reason: "not_found" }> {
  const registrationId = input.registrationId || null;
  const reg = registrationId ? await store.getRegistration(registrationId) : null;
  if (registrationId && !reg) return { ok: false, reason: "not_found" };
  if (registrationId) {
    const open = (await store.listAlerts({ openOnly: true }))
      .find((a) => a.kind === "help" && a.registrationId === registrationId);
    if (open) return { ok: true, id: open.id, existing: true };
  }
  const reason = cleanReason(input.reason);
  const a = await store.insertAlert({ kind: "help", registrationId, walkinId: null, reason, raisedBy: session.staff });
  await store.audit({
    staff: session.staff, role: session.role, action: "alert.help", target: reg?.regId ?? null,
    details: { alertId: a.id, reason },
  });
  return { ok: true, id: a.id, existing: false };
}

type Transition = { ok: true; alert: AlertRow } | { ok: false; reason: "forbidden" | "not_found" };

/** Manager "On my way". Idempotent: acknowledging twice keeps the first manager. */
export async function acknowledge(store: Store, session: Session, id: string): Promise<Transition> {
  if (session.role !== "manager") return { ok: false, reason: "forbidden" };
  const a = await findAlert(store, id);
  if (!a) return { ok: false, reason: "not_found" };
  if (a.status !== "open") return { ok: true, alert: a };
  const updated = await store.updateAlert(id, {
    status: "acknowledged", acknowledgedBy: session.staff, acknowledgedAt: new Date().toISOString(),
  });
  if (!updated) return { ok: false, reason: "not_found" };
  await store.audit({ staff: session.staff, role: session.role, action: "alert.ack", target: id, details: { kind: a.kind } });
  return { ok: true, alert: updated };
}

/** Manager "Done". Idempotent. Also fills acknowledgedBy when skipping straight from open. */
export async function markHandled(store: Store, session: Session, id: string): Promise<Transition> {
  if (session.role !== "manager") return { ok: false, reason: "forbidden" };
  const a = await findAlert(store, id);
  if (!a) return { ok: false, reason: "not_found" };
  if (a.status === "handled") return { ok: true, alert: a };
  const now = new Date().toISOString();
  const updated = await store.updateAlert(id, {
    status: "handled", handledBy: session.staff, handledAt: now,
    ...(a.acknowledgedBy ? {} : { acknowledgedBy: session.staff, acknowledgedAt: now }),
  });
  if (!updated) return { ok: false, reason: "not_found" };
  await store.audit({ staff: session.staff, role: session.role, action: "alert.handled", target: id, details: { kind: a.kind } });
  return { ok: true, alert: updated };
}

function toneOf(a: AlertRow, flags: Flag[]): ManagerAlert["tone"] {
  if (a.kind === "help") return "help";
  if (flags.some((f) => f.kind === "vip")) return "vip";
  if (flags.some((f) => f.kind === "accessibility")) return "access";
  return /accessib|wheelchair/i.test(a.reason ?? "") ? "access" : "vip";
}

/** Open + acknowledged alerts with guest context, newest first. Manager only (caller enforces). */
export async function listOpenForManager(store: Store): Promise<ManagerAlert[]> {
  const rows = await store.listAlerts({ openOnly: true });
  const regCache = new Map<string, Awaited<ReturnType<Store["getRegistration"]>>>();
  const out: ManagerAlert[] = [];
  for (const a of rows) {
    let reg = null;
    if (a.registrationId) {
      if (!regCache.has(a.registrationId)) regCache.set(a.registrationId, await store.getRegistration(a.registrationId));
      reg = regCache.get(a.registrationId) ?? null;
    }
    const flags = reg ? reg.flags.filter((f) => f.severity !== "data") : [];
    out.push({
      id: a.id, kind: a.kind, tone: toneOf(a, flags), reason: a.reason, raisedBy: a.raisedBy, status: a.status,
      createdAt: a.createdAt, acknowledgedBy: a.acknowledgedBy, acknowledgedAt: a.acknowledgedAt,
      guest: reg ? {
        registrationId: reg.id, regId: reg.regId, name: `${reg.firstName} ${reg.lastName}`.trim(),
        company: reg.company, guestType: reg.guestType, flags,
      } : null,
    });
  }
  return out.sort((x, y) => y.createdAt.localeCompare(x.createdAt));
}

/** What the desk may know about an alert it raised: nothing but status and who is coming. */
export async function deskAlertStatus(store: Store, id: string): Promise<DeskAlertStatus | null> {
  const a = await findAlert(store, id);
  return a ? { status: a.status, acknowledgedBy: a.acknowledgedBy } : null;
}
