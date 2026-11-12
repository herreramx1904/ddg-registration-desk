// Arrivals feed + manager guest records on the in-memory store. Invented data only.
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/server/store/memory";
import type { NewRegistration } from "@/lib/server/store/types";
import type { Flag, Session } from "@/lib/domain/types";
import { checkIn, fold, undoCheckIn } from "./checkin";
import { buildArrivals, listManagerGuests } from "./arrivals";

const desk: Session = { role: "desk", staff: "Dana" };
const manager: Session = { role: "manager", staff: "Mia" };
const vip: Flag = { kind: "vip", severity: "warning", label: "VIP", detail: "Greet personally" };
const access: Flag = { kind: "accessibility", severity: "warning", label: "Wheelchair user" };
const dataFlag: Flag = { kind: "email_invalid", severity: "data", label: "Invalid email" };

function reg(row: number, first: string, extra: Partial<NewRegistration> = {}): NewRegistration {
  return {
    rowNumber: row, regId: `T-${row}`, regIdGenerated: false, firstName: first, lastName: "Tester", company: "Acme",
    guestType: "Customer", breakout: "A", searchText: fold(`${first} Tester Acme`), raw: { Name: first },
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
      reg(2, "Ann", { guestType: "VIP", flags: [vip] }),
      reg(3, "Ben", { guestType: "VIP", flags: [vip] }),
      reg(4, "Cat", { guestType: "Press", flags: [access, dataFlag], managerNotes: "note" }),
      reg(5, "Dan", { status: "cancelled" }),
      reg(6, "Eve", { guestType: "Internal" }),
    ],
    suggestions: [{ rowA: 2, rowB: 3, strength: "weak", reason: "Same company" }],
  });
  ids = Object.fromEntries((await store.listRegistrations()).map((r) => [r.rowNumber, r.id]));
});

describe("arrivals", () => {
  it("shows active check-ins newest first, with badges, overrides and approved walk-ins", async () => {
    await checkIn(store, desk, { registrationId: ids[2], via: "qr" });
    await checkIn(store, desk, { registrationId: ids[4], via: "search" });
    await checkIn(store, manager, { registrationId: ids[5], via: "manager", managerOverride: true });
    const w = await store.insertWalkin({ firstName: "Wes", lastName: "Walker", company: null, guestType: "Unknown", reason: "TEST", idChecked: true, email: null, replacesRegistration: null, registeredBy: "Dana" });
    await store.insertWalkin({ firstName: "Pat", lastName: "Pending", company: null, guestType: "Unknown", reason: "TEST", idChecked: true, email: null, replacesRegistration: null, registeredBy: "Dana" });
    await store.updateWalkin(w.id, { status: "approved", decidedBy: "Mia", decidedAt: "2026-12-03T11:00:00.000Z" });

    const a = await buildArrivals(store);
    expect(a.feed.map((f) => f.name)).toEqual(["Wes Walker", "Dan Tester", "Cat Tester", "Ann Tester"]);
    expect(a.feed[0].badges).toEqual(["walkin"]);
    expect(a.feed[1].override).toBe("cancelled_admitted");
    expect(a.feed[2].badges).toEqual(expect.arrayContaining(["access", "press"]));
    expect(a.feed[3]).toMatchObject({ via: "qr", staff: "Dana", badges: ["vip"] });
  });

  it("counts by type and lists VIPs still expected; undo removes from the feed", async () => {
    const r = await checkIn(store, desk, { registrationId: ids[2], via: "search" });
    let a = await buildArrivals(store);
    expect(a.byType.find((t) => t.key === "vip")).toMatchObject({ arrived: 1, expected: 2 });
    expect(a.vipsExpected.map((p) => p.name)).toEqual(["Ben Tester"]);
    expect(a.notArrived.map((p) => p.name)).not.toContain("Dan Tester"); // cancelled is not expected
    if (r.ok) await undoCheckIn(store, desk, r.checkInId);
    a = await buildArrivals(store);
    expect(a.feed).toHaveLength(0);
    expect(a.vipsExpected).toHaveLength(2);
  });

  it("manager records include raw, data flags, notes and suggestions", async () => {
    const guests = await listManagerGuests(store);
    const cat = guests.find((g) => g.regId === "T-4")!;
    expect(cat.flaggedForReview).toBe(true);
    expect(cat.managerNotes).toBe("note");
    expect(cat.raw).toEqual({ Name: "Cat" });
    const ann = guests.find((g) => g.regId === "T-2")!;
    expect(ann.suggestions[0]).toMatchObject({ otherRegId: "T-3", decision: "pending" });
  });
});
