// Seam 2 (report part): client report numbers on the in-memory store. Invented data only.
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/server/store/memory";
import type { NewRegistration } from "@/lib/server/store/types";
import type { Session } from "@/lib/domain/types";
import { checkIn, fold, setStatus } from "./checkin";
import { buildReport } from "./report";

const desk: Session = { role: "desk", staff: "Dana" };
const manager: Session = { role: "manager", staff: "Mia" };

function reg(row: number, first: string, extra: Partial<NewRegistration> = {}): NewRegistration {
  return {
    rowNumber: row, regId: `T-${row}`, regIdGenerated: false, firstName: first, lastName: "Tester", company: "Acme",
    guestType: "Customer", breakout: "A", searchText: fold(`${first} Tester Acme`),
    raw: { "First name": ` ${first.toLowerCase()} `, Mobile: "0047 90000000" },
    clean: {
      firstName: first, lastName: "Tester", email: null, company: "Acme", jobTitle: null, guestType: "Customer",
      breakout: "A", dietary: null, plusOne: "unknown", plusOneName: null, mobile: null, registeredOn: null, accountManager: null, hotel: "unknown",
    },
    flags: [], changes: [], deskNote: null, managerNotes: null, ticketToken: `tok-${row}`, status: "registered", ...extra,
  };
}

let store: MemoryStore;
let ids: Record<number, string>;

beforeEach(async () => {
  store = new MemoryStore();
  await store.replaceGuestList({
    staff: "Mia", fileName: null, report: {},
    registrations: [
      reg(2, "Ann"), reg(3, "Ann"), // confirmed duplicate pair
      reg(4, "Bob"), reg(5, "Bob"), // unconfirmed pair, both attend
      reg(6, "Cid"), reg(7, "Cid"), // unconfirmed pair, only one attends -> likely duplicate
      reg(8, "Dee", { status: "cancelled" }),
      reg(9, "Eli", { status: "do_not_admit" }),
      reg(10, "Fay", { guestType: "Internal" }),
      reg(11, "Gus", { guestType: "Internal" }),
      reg(12, "Hal"), // no-show
    ],
    suggestions: [
      { rowA: 2, rowB: 3, strength: "strong", reason: "Same phone" },
      { rowA: 4, rowB: 5, strength: "weak", reason: "Same name" },
      { rowA: 6, rowB: 7, strength: "medium", reason: "Same name and company" },
    ],
  });
  const regs = await store.listRegistrations();
  ids = Object.fromEntries(regs.map((r) => [r.rowNumber, r.id]));

  // Confirm Ann (rows 2+3) as one person.
  const sAnn = store.suggestions.find((s) => s.registrationA === ids[2] || s.registrationB === ids[2])!;
  await store.decideSuggestion(sAnn.id, "confirmed", "Mia");
  await store.movePerson([ids[3]], (await store.getRegistration(ids[2]))!.personId);

  for (const row of [2, 4, 5, 6, 10]) await checkIn(store, desk, { registrationId: ids[row], via: "search" });
  await checkIn(store, desk, { registrationId: ids[8], via: "search", confirmCancelled: true });
  await checkIn(store, manager, { registrationId: ids[9], via: "manager", managerOverride: true });

  const w1 = await store.insertWalkin({ firstName: "Ivy", lastName: "Walker", company: "Beta", guestType: "Customer", reason: "Invited by Hal", idChecked: true, email: null, replacesRegistration: ids[12], registeredBy: "Dana" });
  const w2 = await store.insertWalkin({ firstName: "Jon", lastName: "Walker", company: null, guestType: "Unknown", reason: "Saw the sign", idChecked: false, email: null, replacesRegistration: null, registeredBy: "Dana" });
  await store.insertWalkin({ firstName: "Kim", lastName: "Walker", company: null, guestType: "Unknown", reason: "Pending", idChecked: false, email: null, replacesRegistration: null, registeredBy: "Dana" });
  await store.updateWalkin(w1.id, { status: "approved", decidedBy: "Mia", decidedAt: new Date().toISOString() });
  await store.updateWalkin(w2.id, { status: "rejected", decidedBy: "Mia", decidedAt: new Date().toISOString() });
});

describe("client report", () => {
  it("counts people, not registrations", async () => {
    const { summary } = await buildReport(store);
    expect(summary.registrations).toBe(11);
    expect(summary.people).toBe(10); // Ann counted once
    expect(summary.confirmedDuplicateLinks).toBe(1);
    // Guests (not internal): Ann, Bob4, Bob5, Cid6, Cid7, Dee, Eli, Hal = 8 people; registered = 6 (Dee cancelled, Eli DNA)
    expect(summary.expected).toBe(6);
    // Attended: Ann, Bob4, Bob5 (unconfirmed pair = 2 people), Cid6, Dee, Eli
    expect(summary.attended).toBe(6);
    expect(summary.noShows).toBe(2); // Cid7, Hal
  });

  it("keeps internal staff separate", async () => {
    const r = await buildReport(store);
    expect(r.summary.internalExpected).toBe(2);
    expect(r.summary.internalAttended).toBe(1);
    expect(r.attended.filter((a) => a.internal)).toHaveLength(1);
  });

  it("reports walk-ins approved and rejected with who decided and replacement", async () => {
    const r = await buildReport(store);
    expect(r.summary.walkinsApproved).toBe(1);
    expect(r.summary.walkinsRejected).toBe(1);
    expect(r.summary.walkinsPending).toBe(1);
    expect(r.summary.totalInRoom).toBe(7);
    const ivy = r.walkins.find((w) => w.name === "Ivy Walker")!;
    expect(ivy).toMatchObject({ status: "Approved", decidedBy: "Mia", registeredBy: "Dana", reason: "Invited by Hal" });
    expect(ivy.replaces).toContain("T-12");
  });

  it("lists exceptions: cancelled-but-attended and manager overrides", async () => {
    const r = await buildReport(store);
    expect(r.summary.cancelledButAttended).toBe(1);
    expect(r.summary.managerOverrides).toBe(1);
    expect(r.exceptions.find((e) => e.name === "Dee Tester")?.kind).toBe("Cancelled but attended");
    expect(r.exceptions.find((e) => e.name === "Eli Tester")).toMatchObject({ kind: "Manager override", staff: "Mia" });
  });

  it("shows do-not-admit people who were not admitted", async () => {
    await setStatus(store, manager, ids[12], "do_not_admit");
    const r = await buildReport(store);
    expect(r.exceptions.find((e) => e.regIds === "T-12")?.kind).toBe("Do not admit");
    expect(r.summary.noShows).toBe(1);
  });

  it("classifies duplicates: confirmed once, unconfirmed with one attendee as likely", async () => {
    const r = await buildReport(store);
    const byA = Object.fromEntries(r.duplicates.map((d) => [d.regIdA, d]));
    expect(byA["T-2"].countedAs).toBe(1);
    expect(byA["T-4"].countedAs).toBe(2);
    expect(byA["T-6"].assessment).toMatch(/Likely duplicate/);
    expect(r.summary.likelyDuplicates).toBe(1);
  });

  it("keeps original rows untouched", async () => {
    const r = await buildReport(store);
    expect(r.originalRows.rows).toHaveLength(11);
    expect(r.originalRows.rows[0].values["First name"]).toBe(" ann ");
    expect(r.originalRows.headers).toEqual(["First name", "Mobile"]);
  });
});
