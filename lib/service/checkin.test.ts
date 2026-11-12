// Seam 2 (check-in part): event service on the in-memory store.
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/server/store/memory";
import type { NewRegistration } from "@/lib/server/store/types";
import type { Flag, Session } from "@/lib/domain/types";
import { checkIn, counter, fold, listDeskGuests, setStatus, undoCheckIn } from "./checkin";

const desk: Session = { role: "desk", staff: "Dana" };
const desk2: Session = { role: "desk", staff: "Eli" };
const manager: Session = { role: "manager", staff: "Mia" };

function reg(row: number, first: string, extra: Partial<NewRegistration> = {}): NewRegistration {
  return {
    rowNumber: row, regId: `T-${row}`, regIdGenerated: false, firstName: first, lastName: "Tester", company: "Acme",
    guestType: "Customer", breakout: "A", searchText: fold(`${first} Tester Acme`), raw: { Mobile: "0047 90000000", Email: "x@y.example" },
    clean: {
      firstName: first, lastName: "Tester", email: `${first}@acme.example`, company: "Acme", jobTitle: null, guestType: "Customer",
      breakout: "A", dietary: null, plusOne: "unknown", plusOneName: null, mobile: "+4790000000", registeredOn: null, accountManager: null, hotel: "unknown",
    },
    flags: [], changes: [], deskNote: null, managerNotes: "secret commercial note", ticketToken: `tok-${row}`, status: "registered", ...extra,
  };
}

const vip: Flag = { kind: "vip", severity: "warning", label: "VIP", detail: "Greet personally" };
const dataFlag: Flag = { kind: "email_invalid", severity: "data", label: "Invalid email" };

let store: MemoryStore;
let ids: Record<string, string>;

beforeEach(async () => {
  store = new MemoryStore();
  await store.replaceGuestList({
    staff: "Mia", fileName: null, report: {},
    registrations: [
      reg(2, "Ann"),
      reg(3, "Ben", { flags: [vip, dataFlag], deskNote: "Greet personally" }),
      reg(4, "Cat", { status: "cancelled" }),
      reg(5, "Dan", { status: "do_not_admit" }),
      reg(6, "Eve", { guestType: "Internal" }),
      reg(7, "Ann"), // unconfirmed possible duplicate of row 2
    ],
    suggestions: [{ rowA: 2, rowB: 7, strength: "weak", reason: "Same name" }],
  });
  const regs = await store.listRegistrations();
  ids = Object.fromEntries(regs.map((r) => [r.rowNumber, r.id]));
});

describe("check-in", () => {
  it("checks in, undoes, and checks in again", async () => {
    const r1 = await checkIn(store, desk, { registrationId: ids[2], via: "search" });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const u = await undoCheckIn(store, desk, r1.checkInId);
    expect(u.ok).toBe(true);
    const r2 = await checkIn(store, desk, { registrationId: ids[2], via: "qr" });
    expect(r2.ok).toBe(true);
    expect(store.auditRows.map((a) => a.action)).toEqual(["checkin", "checkin.undo", "checkin"]);
  });

  it("refuses a second check-in with who/when", async () => {
    await checkIn(store, desk, { registrationId: ids[2], via: "search" });
    const r = await checkIn(store, desk2, { registrationId: ids[2], via: "search" });
    expect(r).toMatchObject({ ok: false, reason: "already_checked_in", staff: "Dana" });
  });

  it("two simultaneous check-ins for one person: exactly one succeeds", async () => {
    const [a, b] = await Promise.all([
      checkIn(store, desk, { registrationId: ids[2], via: "search" }),
      checkIn(store, desk2, { registrationId: ids[2], via: "qr" }),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect((await store.listCheckins({ activeOnly: true }))).toHaveLength(1);
  });

  it("unconfirmed duplicate pair can both be admitted", async () => {
    expect((await checkIn(store, desk, { registrationId: ids[2], via: "search" })).ok).toBe(true);
    expect((await checkIn(store, desk, { registrationId: ids[7], via: "search" })).ok).toBe(true);
  });

  it("confirmed same person: second ticket is refused", async () => {
    const regs = await store.listRegistrations();
    const a = regs.find((r) => r.rowNumber === 2)!;
    await store.movePerson([ids[7]], a.personId);
    expect((await checkIn(store, desk, { registrationId: ids[2], via: "qr" })).ok).toBe(true);
    expect(await checkIn(store, desk, { registrationId: ids[7], via: "qr" })).toMatchObject({ ok: false, reason: "already_checked_in" });
  });

  it("cancelled needs a desk confirm and is logged", async () => {
    expect(await checkIn(store, desk, { registrationId: ids[4], via: "search" })).toMatchObject({ ok: false, reason: "needs_cancel_confirm" });
    expect((await checkIn(store, desk, { registrationId: ids[4], via: "search", confirmCancelled: true })).ok).toBe(true);
    expect(store.auditRows.at(-1)!.action).toBe("checkin.cancelled_confirmed");
  });

  it("do not admit: desk is refused even with flags, manager override works and is logged", async () => {
    expect(await checkIn(store, desk, { registrationId: ids[5], via: "search", confirmCancelled: true, managerOverride: true }))
      .toMatchObject({ ok: false, reason: "do_not_admit" });
    expect((await checkIn(store, manager, { registrationId: ids[5], via: "manager", managerOverride: true })).ok).toBe(true);
    expect(store.auditRows.at(-1)!.action).toBe("checkin.manager_override");
  });

  it("only managers set statuses", async () => {
    await expect(setStatus(store, desk, ids[2], "do_not_admit")).rejects.toThrow();
    const g = await setStatus(store, manager, ids[2], "do_not_admit");
    expect(g?.status).toBe("do_not_admit");
  });

  it("VIP check-in raises an arrival alert", async () => {
    await checkIn(store, desk, { registrationId: ids[3], via: "search" });
    const alerts = await store.listAlerts({ openOnly: true });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: "arrival", registrationId: ids[3] });
  });
});

describe("desk view and counter", () => {
  it("desk view never contains phone, email, raw values, manager notes or data flags", async () => {
    const guests = await listDeskGuests(store);
    const json = JSON.stringify(guests);
    expect(json).not.toContain("+4790000000");
    expect(json).not.toContain("acme.example");
    expect(json).not.toContain("secret commercial note");
    expect(json).not.toContain("Invalid email");
    expect(guests.find((g) => g.regId === "T-3")!.flags.map((f) => f.kind)).toEqual(["vip"]);
  });

  it("counter excludes cancelled/do-not-admit and counts internal separately", async () => {
    await checkIn(store, desk, { registrationId: ids[2], via: "search" });
    await checkIn(store, desk, { registrationId: ids[6], via: "search" });
    expect(await counter(store)).toMatchObject({ checkedIn: 1, expected: 3, internalIn: 1, internalExpected: 1 });
  });

  it("fold makes search accent-insensitive", () => {
    expect(fold("Øyvind Rønning")).toBe("oyvind ronning");
    expect(fold("Anaïs Bjørnstad-Æsir")).toBe("anais bjornstad-aesir");
  });
});
