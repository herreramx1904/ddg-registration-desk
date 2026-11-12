// Client report (T4 + T9). buildReport() is pure over a Store and returns plain data;
// the route turns it into an .xlsx. Counts PEOPLE, not registrations: confirmed duplicates count once.
import type { GuestType } from "@/lib/domain/types";
import type { CheckinRow, RegRow, Store } from "@/lib/server/store/types";
import { groupPeople, type PersonGroup } from "./arrivals";
import { listWalkinsForManager } from "./walkins";

export interface ReportSummary {
  registrations: number; // rows on the client's list
  people: number; // after confirmed duplicate links
  expected: number; // registered, not internal
  attended: number; // not internal, active check-in (any status)
  noShows: number; // registered, not internal, not checked in
  walkinsApproved: number;
  walkinsRejected: number;
  walkinsPending: number;
  totalInRoom: number; // attended + approved walk-ins (guests, not internal)
  internalExpected: number;
  internalAttended: number;
  cancelled: number; // people with status cancelled
  doNotAdmit: number;
  cancelledButAttended: number;
  managerOverrides: number;
  confirmedDuplicateLinks: number; // registrations folded into another person
  likelyDuplicates: number; // unconfirmed suggestions where exactly one side attended
}

export interface AttendedRow {
  at: string; name: string; company: string | null; guestType: GuestType; regIds: string;
  staff: string; via: string; override: string; internal: boolean;
}
export interface NoShowRow { name: string; company: string | null; guestType: GuestType; regIds: string; internal: boolean }
export interface WalkinReportRow {
  status: string; name: string; company: string | null; guestType: GuestType; reason: string; replaces: string;
  registeredBy: string; registeredAt: string; decidedBy: string; decidedAt: string; decisionNote: string; idChecked: boolean;
}
export interface ExceptionRow { kind: string; name: string; regIds: string; status: string; at: string; staff: string; detail: string }
export interface DuplicateRow {
  assessment: string; regIdA: string; nameA: string; regIdB: string; nameB: string; strength: string; reason: string;
  attendedA: boolean; attendedB: boolean; countedAs: number; decidedBy: string; decidedAt: string;
}

export interface ClientReport {
  generatedAt: string;
  summary: ReportSummary;
  attended: AttendedRow[];
  noShows: NoShowRow[];
  walkins: WalkinReportRow[];
  exceptions: ExceptionRow[];
  duplicates: DuplicateRow[];
  originalRows: { headers: string[]; rows: { rowNumber: number; values: Record<string, string | null> }[] };
}

const fullName = (r: { firstName: string; lastName: string }) => `${r.firstName} ${r.lastName}`.trim();
const regIds = (p: PersonGroup) => p.regs.map((r) => r.regId).join(", ");
const viaLabel = (v: CheckinRow["via"]) => (v === "qr" ? "QR scan" : v === "manager" ? "Manager" : "Search");
const overrideLabel = (o: CheckinRow["override"]) =>
  o === "cancelled_confirmed" ? "Cancelled, admitted" : o === "manager_override" ? "Do not admit, manager override" : "";
const statusLabel = (s: string) => (s === "do_not_admit" ? "Do not admit" : s === "cancelled" ? "Cancelled" : "Registered");

export async function buildReport(store: Store): Promise<ClientReport> {
  const [regs, active, walkins, suggestions] = await Promise.all([
    store.listRegistrations(), store.listCheckins({ activeOnly: true }), store.listWalkins(), store.listSuggestions(),
  ]);
  const people = groupPeople(regs);
  const personOf = new Map(people.map((p) => [p.personId, p]));
  const regById = new Map(regs.map((r) => [r.id, r]));
  // One active check-in per person is DB-enforced; keep the earliest just in case.
  const checkinOf = new Map<string, CheckinRow>();
  for (const c of [...active].sort((a, b) => a.at.localeCompare(b.at))) if (!checkinOf.has(c.personId)) checkinOf.set(c.personId, c);
  const attendedPerson = (personId: string) => checkinOf.has(personId) && personOf.has(personId);

  // --- attended / no-shows
  const attended: AttendedRow[] = [];
  const noShows: NoShowRow[] = [];
  for (const p of people) {
    const c = checkinOf.get(p.personId);
    const r = p.primary;
    if (c) {
      attended.push({
        at: c.at, name: fullName(r), company: r.company, guestType: r.guestType, regIds: regIds(p),
        staff: c.staff, via: viaLabel(c.via), override: overrideLabel(c.override), internal: p.internal,
      });
    } else if (p.status === "registered") {
      noShows.push({ name: fullName(r), company: r.company, guestType: r.guestType, regIds: regIds(p), internal: p.internal });
    }
  }
  attended.sort((a, b) => a.at.localeCompare(b.at));
  noShows.sort((a, b) => Number(a.internal) - Number(b.internal) || a.name.localeCompare(b.name));

  // --- walk-ins
  const walkinRows: WalkinReportRow[] = (await listWalkinsForManager(store))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((w) => ({
      status: w.status === "approved" ? "Approved" : w.status === "rejected" ? "Rejected" : "Pending",
      name: fullName(w), company: w.company, guestType: w.guestType, reason: w.reason,
      replaces: w.replaces ? `${w.replaces.name} (${w.replaces.regId})` : "",
      registeredBy: w.registeredBy, registeredAt: w.createdAt, decidedBy: w.decidedBy ?? "", decidedAt: w.decidedAt ?? "",
      decisionNote: w.decisionNote ?? "", idChecked: w.idChecked,
    }));

  // --- exceptions
  const exceptions: ExceptionRow[] = [];
  for (const p of people) {
    const c = checkinOf.get(p.personId);
    const base = { name: fullName(p.primary), regIds: regIds(p), status: statusLabel(p.status) };
    if (c?.override === "cancelled_confirmed" || (c && !c.override && p.status === "cancelled")) {
      exceptions.push({ ...base, kind: "Cancelled but attended", at: c.at, staff: c.staff, detail: "Admitted after confirming the cancellation" });
    } else if (c?.override === "manager_override") {
      exceptions.push({ ...base, kind: "Manager override", at: c.at, staff: c.staff, detail: "Do-not-admit overridden by a manager" });
    } else if (c && p.status === "do_not_admit") {
      exceptions.push({ ...base, kind: "Do not admit, but attended", at: c.at, staff: c.staff, detail: "Status set to Do not admit after check-in" });
    } else if (p.status === "do_not_admit") {
      exceptions.push({ ...base, kind: "Do not admit", at: "", staff: "", detail: "Not admitted" });
    }
  }
  const order = ["Cancelled but attended", "Manager override", "Do not admit, but attended", "Do not admit"];
  exceptions.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.at.localeCompare(b.at));

  // --- duplicates
  const duplicates: DuplicateRow[] = [];
  const pairSeen = new Set<string>();
  let likelyDuplicates = 0;
  for (const s of suggestions) {
    const a = regById.get(s.registrationA), b = regById.get(s.registrationB);
    if (!a || !b) continue;
    pairSeen.add([a.id, b.id].sort().join("|"));
    const same = a.personId === b.personId;
    const inA = attendedPerson(a.personId), inB = attendedPerson(b.personId);
    let assessment: string, countedAs: number;
    if (same) { assessment = "Confirmed same person (counted once)"; countedAs = 1; }
    else if (s.decision === "rejected") { assessment = "Different people (rejected)"; countedAs = 2; }
    else if (inA !== inB) { assessment = "Likely duplicate (unconfirmed, only one attended)"; countedAs = 2; likelyDuplicates++; }
    else if (inA && inB) { assessment = "Both attended: different people"; countedAs = 2; }
    else { assessment = "Unconfirmed suggestion"; countedAs = 2; }
    duplicates.push({
      assessment, regIdA: a.regId, nameA: fullName(a), regIdB: b.regId, nameB: fullName(b), strength: s.strength, reason: s.reason,
      attendedA: inA, attendedB: inB, countedAs, decidedBy: s.decidedBy ?? "", decidedAt: s.decidedAt ?? "",
    });
  }
  // Linked registrations without a suggestion row (e.g. linked by hand) still show up.
  for (const p of people) {
    for (const r of p.regs.slice(1)) {
      const key = [p.primary.id, r.id].sort().join("|");
      if (pairSeen.has(key)) continue;
      const inP = attendedPerson(p.personId);
      duplicates.push({
        assessment: "Confirmed same person (counted once)", regIdA: p.primary.regId, nameA: fullName(p.primary), regIdB: r.regId,
        nameB: fullName(r), strength: "", reason: "Linked by a manager", attendedA: inP, attendedB: inP, countedAs: 1, decidedBy: "", decidedAt: "",
      });
    }
  }
  const dupOrder = (d: DuplicateRow) => (d.countedAs === 1 ? 0 : d.assessment.startsWith("Likely") ? 1 : 2);
  duplicates.sort((x, y) => dupOrder(x) - dupOrder(y));

  // --- original rows (raw values untouched)
  const headers: string[] = [];
  const seen = new Set<string>();
  const sorted: RegRow[] = [...regs].sort((a, b) => a.rowNumber - b.rowNumber);
  for (const r of sorted) for (const h of Object.keys(r.raw)) if (!seen.has(h)) { seen.add(h); headers.push(h); }

  // --- summary
  const guests = people.filter((p) => !p.internal);
  const staffPeople = people.filter((p) => p.internal);
  const attendedGuests = guests.filter((p) => checkinOf.has(p.personId)).length;
  const walkinsApproved = walkins.filter((w) => w.status === "approved").length;
  const summary: ReportSummary = {
    registrations: regs.length,
    people: people.length,
    expected: guests.filter((p) => p.status === "registered").length,
    attended: attendedGuests,
    noShows: guests.filter((p) => p.status === "registered" && !checkinOf.has(p.personId)).length,
    walkinsApproved,
    walkinsRejected: walkins.filter((w) => w.status === "rejected").length,
    walkinsPending: walkins.filter((w) => w.status === "pending").length,
    totalInRoom: attendedGuests + walkinsApproved,
    internalExpected: staffPeople.filter((p) => p.status === "registered").length,
    internalAttended: staffPeople.filter((p) => checkinOf.has(p.personId)).length,
    cancelled: people.filter((p) => p.status === "cancelled").length,
    doNotAdmit: people.filter((p) => p.status === "do_not_admit").length,
    cancelledButAttended: exceptions.filter((e) => e.kind === "Cancelled but attended").length,
    managerOverrides: exceptions.filter((e) => e.kind === "Manager override").length,
    confirmedDuplicateLinks: regs.length - people.length,
    likelyDuplicates,
  };

  return {
    generatedAt: new Date().toISOString(),
    summary, attended, noShows, walkins: walkinRows, exceptions, duplicates,
    originalRows: { headers, rows: sorted.map((r) => ({ rowNumber: r.rowNumber, values: r.raw })) },
  };
}

/** Summary sheet lines, in client-friendly wording. Shared by the page and the workbook. */
export function summaryLines(s: ReportSummary): { label: string; value: number; note?: string }[] {
  return [
    { label: "Expected guests", value: s.expected, note: "Registered people, excluding cancelled, do-not-admit and internal staff" },
    { label: "Attended (registered guests)", value: s.attended, note: "People, not registrations: confirmed duplicates count once" },
    { label: "No-shows", value: s.noShows },
    { label: "Walk-ins approved", value: s.walkinsApproved },
    { label: "Walk-ins rejected", value: s.walkinsRejected },
    { label: "Walk-ins still pending", value: s.walkinsPending },
    { label: "Total guests in the room", value: s.totalInRoom, note: "Attended + approved walk-ins" },
    { label: "Internal staff expected", value: s.internalExpected, note: "Counted separately" },
    { label: "Internal staff attended", value: s.internalAttended, note: "Counted separately" },
    { label: "Cancelled", value: s.cancelled },
    { label: "Cancelled but attended", value: s.cancelledButAttended },
    { label: "Do not admit", value: s.doNotAdmit },
    { label: "Manager overrides", value: s.managerOverrides },
    { label: "Registrations on the list", value: s.registrations },
    { label: "Confirmed duplicate registrations", value: s.confirmedDuplicateLinks, note: "Merged into one person each" },
    { label: "Likely duplicates (unconfirmed)", value: s.likelyDuplicates, note: "Only one of the pair attended; see Duplicates sheet" },
  ];
}
