// Galaxy Wall: companies only, internal staff and unapproved walk-ins excluded.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/server/store/memory";
import type { NewRegistration, NewWalkin } from "@/lib/server/store/types";
import { wallData, wallKeyOk } from "./wall";

function reg(row: number, first: string, last: string, company: string | null, extra: Partial<NewRegistration> = {}): NewRegistration {
  return {
    rowNumber: row, regId: `T-${row}`, regIdGenerated: false, firstName: first, lastName: last, company,
    guestType: "Customer", breakout: null, searchText: `${first} ${last}`.toLowerCase(), raw: {},
    clean: {
      firstName: first, lastName: last, email: `${first}@test.example`, company, jobTitle: null, guestType: "Customer",
      breakout: null, dietary: null, plusOne: "unknown", plusOneName: null, mobile: null, registeredOn: null, accountManager: null, hotel: "unknown",
    },
    flags: [], changes: [], deskNote: null, managerNotes: null, ticketToken: `tok-${row}`, status: "registered", ...extra,
  };
}
const walkin = (first: string, last: string, company: string | null, extra: Partial<NewWalkin> = {}): NewWalkin => ({
  firstName: first, lastName: last, company, guestType: "Customer", reason: "TEST walk-in", idChecked: true,
  email: null, replacesRegistration: null, registeredBy: "Dana", ...extra,
});

let store: MemoryStore;
let ids: Record<number, string>;

async function checkIn(row: number) {
  const r = (await store.getRegistration(ids[row]))!;
  const res = await store.insertCheckin({ personId: r.personId, registrationId: r.id, staff: "Dana", via: "search", override: null });
  if (!res.ok) throw new Error("dup");
  return res.checkin;
}

beforeEach(async () => {
  store = new MemoryStore();
  await store.replaceGuestList({
    staff: "Mia", fileName: null, report: {}, suggestions: [],
    registrations: [
      reg(2, "Zorblat", "Quixley", "Testco Alpha"),
      reg(3, "Yvaine", "Brindlemoor", "testco alpha "),
      reg(4, "Xander", "Pollywick", "Testco Beta"),
      reg(5, "Wilhelmina", "Starquist", "Testco Inside", { guestType: "Internal" }),
      reg(6, "Vespera", "Nightjar", null),
      reg(7, "Ulric", "Thornbeam", "Testco Gamma"),
    ],
  });
  ids = Object.fromEntries((await store.listRegistrations()).map((r) => [r.rowNumber, r.id]));
});

describe("wallData", () => {
  it("is empty with no arrivals", async () => {
    expect(await wallData(store)).toEqual({ total: 0, companies: [], recent: [] });
  });

  it("groups by company, excludes internal, undone check-ins and unapproved walk-ins", async () => {
    await checkIn(2); await checkIn(3); await checkIn(4); await checkIn(5); await checkIn(6);
    const undone = await checkIn(7);
    await store.undoCheckin(undone.id, "Dana");

    const ok = await store.insertWalkin(walkin("Tamsin", "Glowberry", "Testco Delta"));
    await store.updateWalkin(ok.id, { status: "approved", decidedBy: "Mia", decidedAt: new Date(Date.UTC(2026, 11, 3, 12)).toISOString() });
    const noCo = await store.insertWalkin(walkin("Sorrel", "Moonvale", null));
    await store.updateWalkin(noCo.id, { status: "approved" });
    await store.insertWalkin(walkin("Rowan", "Pending", "Testco Pending"));
    const rej = await store.insertWalkin(walkin("Quill", "Rejected", "Testco Rejected"));
    await store.updateWalkin(rej.id, { status: "rejected" });
    const internal = await store.insertWalkin(walkin("Pip", "Staffer", "Testco Inside", { guestType: "Internal" }));
    await store.updateWalkin(internal.id, { status: "approved" });

    const d = await wallData(store);
    // 2,3,4,6 + approved Delta walk-in + approved walk-in with no company
    expect(d.total).toBe(6);
    expect(d.companies).toEqual([
      { company: "Testco Alpha", count: 2, lastArrivalAt: expect.any(String) },
      { company: "Testco Beta", count: 1, lastArrivalAt: expect.any(String) },
      { company: "Testco Delta", count: 1, lastArrivalAt: expect.any(String) },
    ]);
    expect(d.recent[0]).toEqual({ company: "Testco Delta", at: "2026-12-03T12:00:00.000Z" });
    expect(d.recent.map((r) => r.company)).not.toContain("Testco Inside");

    const json = JSON.stringify(d);
    for (const s of ["Zorblat", "Quixley", "Yvaine", "Brindlemoor", "Xander", "Pollywick", "Wilhelmina", "Vespera", "Tamsin", "Glowberry", "Sorrel", "Inside", "Pending", "Rejected", "Gamma", "Customer", "test.example", ids[2]]) {
      expect(json).not.toContain(s);
    }
    for (const c of d.companies) expect(Object.keys(c).sort()).toEqual(["company", "count", "lastArrivalAt"]);
    for (const r of d.recent) expect(Object.keys(r).sort()).toEqual(["at", "company"]);
  });

  it("keeps the last 12 arrivals, newest first", async () => {
    for (let i = 0; i < 15; i++) {
      const w = await store.insertWalkin(walkin("T", "T", `Testco ${i}`));
      await store.updateWalkin(w.id, { status: "approved", decidedAt: new Date(Date.UTC(2026, 11, 3, 9, i)).toISOString() });
    }
    const d = await wallData(store);
    expect(d.total).toBe(15);
    expect(d.recent).toHaveLength(12);
    expect(d.recent[0].company).toBe("Testco 14");
    expect(d.recent[11].company).toBe("Testco 3");
  });
});

describe("wallKeyOk", () => {
  const prev = process.env.WALL_KEY;
  afterEach(() => { process.env.WALL_KEY = prev; });
  it("accepts only the exact key", () => {
    process.env.WALL_KEY = "test-wall-key-123";
    expect(wallKeyOk("test-wall-key-123")).toBe(true);
    expect(wallKeyOk("test-wall-key-124")).toBe(false);
    expect(wallKeyOk("short")).toBe(false);
    expect(wallKeyOk("")).toBe(false);
    expect(wallKeyOk(null)).toBe(false);
  });
  it("rejects everything when WALL_KEY is unset", () => {
    delete process.env.WALL_KEY;
    expect(wallKeyOk("anything")).toBe(false);
  });
});
