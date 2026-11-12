// Check-in logic. OWNED BY T3 (lead). Other modules call these functions; do not reimplement.
import type { CheckInResult, DeskGuest, PersonStatus, Session } from "@/lib/domain/types";
import type { CheckinRow, RegRow, Store } from "@/lib/server/store/types";

/** Accent/case-insensitive folding for search ("Øyvind" -> "oyvind"). */
export function fold(s: string): string {
  return s.toLowerCase()
    .replace(/ø/g, "o").replace(/æ/g, "ae").replace(/å/g, "a").replace(/ß/g, "ss").replace(/ł/g, "l").replace(/ı/g, "i")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9@.+ -]/g, " ").replace(/\s+/g, " ").trim();
}

/** Desk-safe projection. NEVER includes phone, email, raw values or manager notes. */
export function toDeskGuest(r: RegRow, active: CheckinRow | null, all: RegRow[]): DeskGuest {
  return {
    registrationId: r.id,
    personId: r.personId,
    regId: r.regId,
    firstName: r.firstName,
    lastName: r.lastName,
    company: r.company,
    guestType: r.guestType,
    breakout: r.breakout,
    flags: r.flags.filter((f) => f.severity === "warning" || f.severity === "info"),
    deskNote: r.deskNote,
    status: r.personStatus,
    checkedIn: active ? { at: active.at, staff: active.staff } : null,
    linkedRegIds: all.filter((x) => x.personId === r.personId && x.id !== r.id).map((x) => x.regId),
  };
}

export async function listDeskGuests(store: Store): Promise<DeskGuest[]> {
  const [regs, active] = await Promise.all([store.listRegistrations(), store.listCheckins({ activeOnly: true })]);
  const byPerson = new Map(active.map((c) => [c.personId, c]));
  return regs.map((r) => toDeskGuest(r, byPerson.get(r.personId) ?? null, regs));
}

export async function deskGuest(store: Store, registrationId: string): Promise<DeskGuest | null> {
  const r = await store.getRegistration(registrationId);
  if (!r) return null;
  const all = (await store.listRegistrations()).filter((x) => x.personId === r.personId);
  return toDeskGuest(r, await store.getActiveCheckin(r.personId), all);
}

export async function deskGuestByToken(store: Store, token: string): Promise<DeskGuest | null> {
  const r = await store.getRegistrationByToken(token);
  return r ? deskGuest(store, r.id) : null;
}

/** Counter: checked-in people / expected people (expected excludes cancelled + do_not_admit). Internal counted separately. */
export async function counter(store: Store) {
  const [regs, active, walkins] = await Promise.all([
    store.listRegistrations(), store.listCheckins({ activeOnly: true }), store.listWalkins(),
  ]);
  const personStatus = new Map<string, PersonStatus>();
  const personInternal = new Map<string, boolean>();
  for (const r of regs) {
    personStatus.set(r.personId, r.personStatus);
    personInternal.set(r.personId, (personInternal.get(r.personId) ?? true) && r.guestType === "Internal");
  }
  let expected = 0, internalExpected = 0;
  for (const [p, s] of personStatus) {
    if (s !== "registered") continue;
    if (personInternal.get(p)) internalExpected++; else expected++;
  }
  let checkedIn = 0, internalIn = 0;
  for (const c of active) { if (personInternal.get(c.personId)) internalIn++; else checkedIn++; }
  const walkinsApproved = walkins.filter((w) => w.status === "approved").length;
  const walkinsPending = walkins.filter((w) => w.status === "pending").length;
  return { checkedIn, expected, internalIn, internalExpected, walkinsApproved, walkinsPending };
}

export interface CheckInInput {
  registrationId: string;
  via: "search" | "qr" | "manager";
  /** desk confirms entry of a cancelled guest */
  confirmCancelled?: boolean;
  /** manager override for do_not_admit (requires manager session) */
  managerOverride?: boolean;
}

export async function checkIn(store: Store, session: Session, input: CheckInInput): Promise<CheckInResult> {
  const r = await store.getRegistration(input.registrationId);
  if (!r) return { ok: false, reason: "not_found" };
  const guest = async () => (await deskGuest(store, r.id))!;

  const active = await store.getActiveCheckin(r.personId);
  if (active) return { ok: false, reason: "already_checked_in", at: active.at, staff: active.staff, guest: await guest() };

  let override: CheckinRow["override"] = null;
  if (r.personStatus === "do_not_admit") {
    if (!(input.managerOverride && session.role === "manager")) return { ok: false, reason: "do_not_admit", guest: await guest() };
    override = "manager_override";
  } else if (r.personStatus === "cancelled") {
    if (!input.confirmCancelled && !(input.managerOverride && session.role === "manager")) {
      return { ok: false, reason: "needs_cancel_confirm", guest: await guest() };
    }
    override = "cancelled_confirmed";
  }

  const res = await store.insertCheckin({
    personId: r.personId, registrationId: r.id, staff: session.staff, via: input.via, override,
  });
  if (!res.ok) {
    return { ok: false, reason: "already_checked_in", at: res.existing.at, staff: res.existing.staff, guest: await guest() };
  }
  await store.audit({
    staff: session.staff, role: session.role, action: override ? `checkin.${override}` : "checkin",
    target: r.regId, details: { via: input.via, checkinId: res.checkin.id },
  });
  // Arrival alert for VIP / accessibility guests (alerts lifecycle is owned by T8).
  const warn = r.flags.filter((f) => f.severity === "warning");
  if (warn.length) {
    await store.insertAlert({
      kind: "arrival", registrationId: r.id, walkinId: null, raisedBy: session.staff,
      reason: warn.map((f) => (f.detail ? `${f.label}: ${f.detail}` : f.label)).join(" · "),
    });
  }
  return { ok: true, checkInId: res.checkin.id, guest: await guest() };
}

export async function undoCheckIn(store: Store, session: Session, checkInId: string) {
  const c = await store.undoCheckin(checkInId, session.staff);
  if (!c) return { ok: false as const, reason: "not_found_or_already_undone" };
  const r = c.registrationId ? await store.getRegistration(c.registrationId) : null;
  await store.audit({ staff: session.staff, role: session.role, action: "checkin.undo", target: r?.regId ?? c.personId, details: { checkinId: c.id } });
  return { ok: true as const, guest: r ? await deskGuest(store, r.id) : null };
}

export async function setStatus(store: Store, session: Session, registrationId: string, status: PersonStatus) {
  if (session.role !== "manager") throw new Error("Managers only");
  const r = await store.getRegistration(registrationId);
  if (!r) return null;
  await store.setPersonStatus(r.personId, status);
  await store.audit({ staff: session.staff, role: session.role, action: "status.set", target: r.regId, details: { from: r.personStatus, to: status } });
  return deskGuest(store, r.id);
}
