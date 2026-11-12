// Walk-in service (T5). Desk registers people who are not on the list; managers approve or reject.
// Approved walk-ins count as attended via counter() (walkinsApproved). Rejected ones stay on record.
import type { GuestType, Session } from "@/lib/domain/types";
import type { RegRow, Store, WalkinRow } from "@/lib/server/store/types";

export class WalkinError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const WALKIN_TYPES: GuestType[] = ["Press", "Customer", "Partner", "Speaker", "Unknown"];
const ALL_TYPES: GuestType[] = ["Customer", "Partner", "VIP", "Internal", "Press", "Speaker", "Unknown"];

export interface WalkinInput {
  firstName?: unknown;
  lastName?: unknown;
  company?: unknown;
  guestType?: unknown;
  reason?: unknown;
  idChecked?: unknown;
  email?: unknown;
  replacesRegistration?: unknown;
}

export interface ReplacedGuest { registrationId: string; regId: string; name: string }

/** Desk-safe view: never includes email. */
export interface DeskWalkin {
  id: string;
  firstName: string;
  lastName: string;
  company: string | null;
  guestType: GuestType;
  reason: string;
  status: WalkinRow["status"];
  registeredBy: string;
  createdAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  replaces: ReplacedGuest | null;
}

export interface ManagerWalkin extends DeskWalkin { email: string | null; idChecked: boolean }

const str = (v: unknown, max = 200): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const opt = (v: unknown, max = 200): string | null => str(v, max) || null;

export async function registerWalkin(store: Store, session: Session, input: WalkinInput): Promise<WalkinRow> {
  const firstName = str(input.firstName, 80);
  const lastName = str(input.lastName, 80);
  const reason = str(input.reason, 500);
  if (!firstName || !lastName) throw new WalkinError(400, "First and last name are needed");
  if (!reason) throw new WalkinError(400, "Tell us who invited them or why they are here");
  if (input.idChecked !== true) throw new WalkinError(400, "Check their ID or press card first");

  const rawType = str(input.guestType, 20);
  const guestType: GuestType = rawType === "Other" ? "Unknown"
    : (ALL_TYPES as string[]).includes(rawType) ? (rawType as GuestType) : "Unknown";

  const email = opt(input.email, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new WalkinError(400, "That email does not look right");

  const replacesRegistration = opt(input.replacesRegistration, 100);
  if (replacesRegistration && !(await store.getRegistration(replacesRegistration))) {
    throw new WalkinError(400, "The guest they replace was not found");
  }

  const row = await store.insertWalkin({
    firstName, lastName, company: opt(input.company, 120), guestType, reason, idChecked: true,
    email, replacesRegistration, registeredBy: session.staff,
  });
  await store.audit({
    staff: session.staff, role: session.role, action: "walkin.register", target: row.id,
    details: { replacesRegistration, guestType },
  });
  return row;
}

export async function decideWalkin(
  store: Store, session: Session, id: string, decision: "approved" | "rejected", note?: string | null,
): Promise<WalkinRow> {
  if (session.role !== "manager") throw new WalkinError(403, "Managers only");
  if (decision !== "approved" && decision !== "rejected") throw new WalkinError(400, "Decision must be approved or rejected");
  const w = await store.getWalkin(id);
  if (!w) throw new WalkinError(404, "Walk-in not found");
  if (w.status !== "pending") throw new WalkinError(409, `Already ${w.status} by ${w.decidedBy ?? "someone"}`);
  const updated = await store.updateWalkin(id, {
    status: decision, decidedBy: session.staff, decidedAt: new Date().toISOString(), decisionNote: opt(note, 500),
  });
  if (!updated) throw new WalkinError(404, "Walk-in not found");
  await store.audit({
    staff: session.staff, role: session.role, action: decision === "approved" ? "walkin.approve" : "walkin.reject",
    target: id, details: updated.decisionNote ? { note: updated.decisionNote } : null,
  });
  return updated;
}

function replaced(r: RegRow | null | undefined): ReplacedGuest | null {
  return r ? { registrationId: r.id, regId: r.regId, name: `${r.firstName} ${r.lastName}` } : null;
}

const newestFirst = (a: WalkinRow, b: WalkinRow) => b.createdAt.localeCompare(a.createdAt);

async function regsById(store: Store, rows: WalkinRow[]) {
  const ids = [...new Set(rows.map((w) => w.replacesRegistration).filter((x): x is string => !!x))];
  const regs = await Promise.all(ids.map((id) => store.getRegistration(id)));
  return new Map(ids.map((id, i) => [id, regs[i]]));
}

function toDesk(w: WalkinRow, regs: Map<string, RegRow | null>): DeskWalkin {
  return {
    id: w.id, firstName: w.firstName, lastName: w.lastName, company: w.company, guestType: w.guestType, reason: w.reason,
    status: w.status, registeredBy: w.registeredBy, createdAt: w.createdAt, decidedBy: w.decidedBy, decidedAt: w.decidedAt,
    decisionNote: w.decisionNote,
    replaces: w.replacesRegistration ? replaced(regs.get(w.replacesRegistration)) : null,
  };
}

export async function listWalkinsForDesk(store: Store): Promise<DeskWalkin[]> {
  const rows = (await store.listWalkins()).sort(newestFirst);
  const regs = await regsById(store, rows);
  return rows.map((w) => toDesk(w, regs));
}

export async function listWalkinsForManager(store: Store): Promise<ManagerWalkin[]> {
  const rows = (await store.listWalkins()).sort(newestFirst);
  const regs = await regsById(store, rows);
  return rows.map((w) => ({ ...toDesk(w, regs), email: w.email, idChecked: w.idChecked }));
}
