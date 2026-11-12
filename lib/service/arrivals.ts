// Manager views (T4): live Arrivals feed + full guest records. Pure functions over a Store.
// MANAGER ONLY: these projections include raw values, manager notes and data flags.
import type { CleanFields, FieldChange, Flag, GuestType, PersonStatus } from "@/lib/domain/types";
import type { CheckinRow, RegRow, Store, SuggestionRow, WalkinRow } from "@/lib/server/store/types";
import { counter } from "./checkin";

export type ArrivalBadge = "vip" | "access" | "press" | "speaker" | "walkin" | "internal";

export interface ArrivalItem {
  key: string;
  kind: "checkin" | "walkin";
  registrationId: string | null;
  walkinId: string | null;
  checkInId: string | null;
  regId: string | null;
  name: string;
  company: string | null;
  guestType: GuestType;
  at: string;
  staff: string;
  via: "search" | "qr" | "manager" | "walkin";
  badges: ArrivalBadge[];
  /** "cancelled_admitted" = cancelled guest let in; "manager_override" = Do-not-admit overridden by a manager. */
  override: "cancelled_admitted" | "manager_override" | null;
  /** Walk-ins only. */
  reason?: string | null;
  decidedBy?: string | null;
}

export interface ExpectedPerson {
  registrationId: string;
  personId: string;
  regId: string;
  name: string;
  company: string | null;
  guestType: GuestType;
  badges: ArrivalBadge[];
  deskNote: string | null;
}

export interface TypeCount { key: string; label: string; arrived: number; expected: number }

export interface ArrivalsData {
  feed: ArrivalItem[];
  byType: TypeCount[];
  counter: Awaited<ReturnType<typeof counter>>;
  vipsExpected: ExpectedPerson[];
  notArrived: ExpectedPerson[];
  generatedAt: string;
}

const name = (r: { firstName: string; lastName: string }) => `${r.firstName} ${r.lastName}`.trim();

/** One "person" = all registrations sharing a personId (confirmed duplicates). Primary = lowest Excel row. */
export interface PersonGroup {
  personId: string;
  status: PersonStatus;
  regs: RegRow[];
  primary: RegRow;
  internal: boolean;
  flags: Flag[];
}

export function groupPeople(regs: RegRow[]): PersonGroup[] {
  const map = new Map<string, RegRow[]>();
  for (const r of [...regs].sort((a, b) => a.rowNumber - b.rowNumber)) {
    const list = map.get(r.personId) ?? [];
    list.push(r);
    map.set(r.personId, list);
  }
  return [...map.entries()].map(([personId, list]) => ({
    personId,
    status: list[0].personStatus,
    regs: list,
    primary: list[0],
    internal: list.every((r) => r.guestType === "Internal"), // same rule as counter()
    flags: list.flatMap((r) => r.flags),
  }));
}

export function personBadges(p: Pick<PersonGroup, "regs" | "flags">): ArrivalBadge[] {
  const types = new Set(p.regs.map((r) => r.guestType));
  const b: ArrivalBadge[] = [];
  if (types.has("VIP") || p.flags.some((f) => f.kind === "vip")) b.push("vip");
  if (p.flags.some((f) => f.kind === "accessibility")) b.push("access");
  if (types.has("Press")) b.push("press");
  if (types.has("Speaker")) b.push("speaker");
  if (p.regs.length && p.regs.every((r) => r.guestType === "Internal")) b.push("internal");
  return b;
}

function expectedPerson(p: PersonGroup): ExpectedPerson {
  return {
    registrationId: p.primary.id, personId: p.personId, regId: p.primary.regId, name: name(p.primary),
    company: p.primary.company, guestType: p.primary.guestType, badges: personBadges(p), deskNote: p.primary.deskNote,
  };
}

function walkinItem(w: WalkinRow): ArrivalItem {
  return {
    key: `w-${w.id}`, kind: "walkin", registrationId: null, walkinId: w.id, checkInId: null, regId: null,
    name: name(w), company: w.company, guestType: w.guestType, at: w.decidedAt ?? w.createdAt, staff: w.registeredBy,
    via: "walkin", badges: ["walkin"], override: null, reason: w.reason, decidedBy: w.decidedBy,
  };
}

export async function buildArrivals(store: Store): Promise<ArrivalsData> {
  const [regs, active, walkins, count] = await Promise.all([
    store.listRegistrations(), store.listCheckins({ activeOnly: true }), store.listWalkins(), counter(store),
  ]);
  const people = groupPeople(regs);
  const byPerson = new Map(people.map((p) => [p.personId, p]));
  const regById = new Map(regs.map((r) => [r.id, r]));
  const activeByPerson = new Map(active.map((c) => [c.personId, c]));

  const feed: ArrivalItem[] = [];
  for (const c of active) {
    const p = byPerson.get(c.personId);
    const r = (c.registrationId && regById.get(c.registrationId)) || p?.primary;
    if (!r || !p) continue;
    feed.push({
      key: `c-${c.id}`, kind: "checkin", registrationId: r.id, walkinId: null, checkInId: c.id, regId: r.regId,
      name: name(r), company: r.company, guestType: r.guestType, at: c.at, staff: c.staff, via: c.via,
      badges: personBadges(p),
      override: c.override === "cancelled_confirmed" ? "cancelled_admitted" : c.override === "manager_override" ? "manager_override" : null,
    });
  }
  for (const w of walkins) if (w.status === "approved") feed.push(walkinItem(w));
  feed.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  const registered = people.filter((p) => p.status === "registered");
  const notArrivedGroups = registered.filter((p) => !activeByPerson.has(p.personId));
  const notArrived = notArrivedGroups.map(expectedPerson).sort((a, b) => a.name.localeCompare(b.name));
  const vipsExpected = notArrived.filter((p) => p.badges.includes("vip"));

  const tiles: { key: string; label: string; test: (p: PersonGroup) => boolean }[] = [
    { key: "vip", label: "VIP", test: (p) => personBadges(p).includes("vip") },
    { key: "access", label: "Accessibility", test: (p) => personBadges(p).includes("access") },
    { key: "press", label: "Press", test: (p) => personBadges(p).includes("press") },
    { key: "speaker", label: "Speakers", test: (p) => personBadges(p).includes("speaker") },
    { key: "customer", label: "Customers", test: (p) => p.primary.guestType === "Customer" },
    { key: "partner", label: "Partners", test: (p) => p.primary.guestType === "Partner" },
    { key: "internal", label: "Internal", test: (p) => p.internal },
  ];
  const byType = tiles
    .map((t) => ({
      key: t.key, label: t.label,
      arrived: people.filter((p) => t.test(p) && activeByPerson.has(p.personId)).length,
      expected: registered.filter(t.test).length,
    }))
    .filter((t) => t.expected > 0 || t.arrived > 0);

  return { feed, byType, counter: count, vipsExpected, notArrived, generatedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------- full guest records (manager)

export interface ManagerGuestSuggestion {
  id: string;
  otherRegistrationId: string;
  otherRegId: string;
  otherName: string;
  strength: SuggestionRow["strength"];
  reason: string;
  decision: SuggestionRow["decision"];
}

export interface ManagerGuest {
  registrationId: string;
  personId: string;
  rowNumber: number;
  regId: string;
  regIdGenerated: boolean;
  name: string;
  company: string | null;
  guestType: GuestType;
  status: PersonStatus;
  raw: Record<string, string | null>;
  clean: CleanFields;
  changes: FieldChange[];
  flags: Flag[];
  deskNote: string | null;
  managerNotes: string | null;
  badges: ArrivalBadge[];
  flaggedForReview: boolean;
  checkedIn: null | { checkInId: string; at: string; staff: string; via: CheckinRow["via"]; override: CheckinRow["override"] };
  linked: { registrationId: string; regId: string; name: string; rowNumber: number }[];
  suggestions: ManagerGuestSuggestion[];
  /** Walk-ins registered as replacing this guest. */
  replacedBy: { walkinId: string; name: string; status: WalkinRow["status"] }[];
}

export async function listManagerGuests(store: Store): Promise<ManagerGuest[]> {
  const [regs, active, suggestions, walkins] = await Promise.all([
    store.listRegistrations(), store.listCheckins({ activeOnly: true }), store.listSuggestions(), store.listWalkins(),
  ]);
  const people = new Map(groupPeople(regs).map((p) => [p.personId, p]));
  const regById = new Map(regs.map((r) => [r.id, r]));
  const activeByPerson = new Map(active.map((c) => [c.personId, c]));

  return regs.map((r) => {
    const p = people.get(r.personId)!;
    const c = activeByPerson.get(r.personId);
    const sug: ManagerGuestSuggestion[] = [];
    for (const s of suggestions) {
      const otherId = s.registrationA === r.id ? s.registrationB : s.registrationB === r.id ? s.registrationA : null;
      if (!otherId) continue;
      const o = regById.get(otherId);
      sug.push({
        id: s.id, otherRegistrationId: otherId, otherRegId: o?.regId ?? "?", otherName: o ? name(o) : "Unknown",
        strength: s.strength, reason: s.reason, decision: s.decision,
      });
    }
    return {
      registrationId: r.id, personId: r.personId, rowNumber: r.rowNumber, regId: r.regId, regIdGenerated: r.regIdGenerated,
      name: name(r), company: r.company, guestType: r.guestType, status: r.personStatus,
      raw: r.raw, clean: r.clean, changes: r.changes, flags: r.flags, deskNote: r.deskNote, managerNotes: r.managerNotes,
      badges: personBadges({ regs: [r], flags: r.flags }),
      flaggedForReview: r.flags.some((f) => f.severity === "data"),
      checkedIn: c ? { checkInId: c.id, at: c.at, staff: c.staff, via: c.via, override: c.override } : null,
      linked: p.regs.filter((x) => x.id !== r.id).map((x) => ({ registrationId: x.id, regId: x.regId, name: name(x), rowNumber: x.rowNumber })),
      suggestions: sug,
      replacedBy: walkins
        .filter((w) => w.replacesRegistration === r.id)
        .map((w) => ({ walkinId: w.id, name: name(w), status: w.status })),
    };
  });
}

export async function managerGuest(store: Store, registrationId: string): Promise<ManagerGuest | null> {
  return (await listManagerGuests(store)).find((g) => g.registrationId === registrationId) ?? null;
}
