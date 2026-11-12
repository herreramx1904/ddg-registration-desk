// T6: duplicate decisions on the in-memory store (fake data only).
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/server/store/memory";
import type { NewRegistration } from "@/lib/server/store/types";
import type { PersonStatus, Session } from "@/lib/domain/types";
import { checkIn, fold } from "./checkin";
import { decideSuggestion, listSuggestions } from "./duplicates";

const desk: Session = { role: "desk", staff: "Dana" };
const manager: Session = { role: "manager", staff: "Mia" };

function reg(row: number, first: string, status: PersonStatus = "registered"): NewRegistration {
  return {
    rowNumber: row, regId: `T-${row}`, regIdGenerated: false, firstName: first, lastName: "Tester", company: "Acme",
    guestType: "Customer", breakout: "A", searchText: fold(`${first} Tester Acme`), raw: { Name: `${first} Tester` },
    clean: {
      firstName: first, lastName: "Tester", email: `${first}@acme.example`, company: "Acme", jobTitle: null, guestType: "Customer",
      breakout: "A", dietary: null, plusOne: "unknown", plusOneName: null, mobile: "+4790000000", registeredOn: null, accountManager: null, hotel: "unknown",
    },
    flags: [], changes: [], deskNote: null, managerNotes: null, ticketToken: `tok-${row}`, status,
  };
}

let store: MemoryStore;
let ids: Record<number, string>;
const sugId = (row: number) => store.suggestions.find((s) => s.registrationA === ids[row])!.id;
const personOf = async (row: number) => (await store.getRegistration(ids[row]))!.personId;

beforeEach(async () => {
  store = new MemoryStore();
  await store.replaceGuestList({
    staff: "Mia", fileName: null, report: {},
    registrations: [reg(2, "Ann"), reg(3, "Ann"), reg(4, "Ben"), reg(5, "Ben", "do_not_admit"), reg(6, "Cy"), reg(7, "Cy")],
    suggestions: [
      { rowA: 6, rowB: 7, strength: "weak", reason: "Same name" },
      { rowA: 2, rowB: 3, strength: "strong", reason: "Same phone +4790000000" },
      { rowA: 4, rowB: 5, strength: "medium", reason: "Same name and company" },
    ],
  });
  ids = Object.fromEntries((await store.listRegistrations()).map((r) => [r.rowNumber, r.id]));
});

describe("duplicate suggestions", () => {
  it("lists strongest first with both sides", async () => {
    const list = await listSuggestions(store);
    expect(list.map((s) => s.strength)).toEqual(["strong", "medium", "weak"]);
    expect(list[0].a.regId).toBe("T-2");
    expect(list[0].b.mobile).toBe("+4790000000");
  });

  it("confirm links both: second ticket then shows already checked in", async () => {
    const r = await decideSuggestion(store, manager, sugId(2), "confirmed");
    expect(r.ok).toBe(true);
    expect(await personOf(2)).toBe(await personOf(3));
    expect((await checkIn(store, desk, { registrationId: ids[2], via: "qr" })).ok).toBe(true);
    expect(await checkIn(store, desk, { registrationId: ids[3], via: "qr" })).toMatchObject({ ok: false, reason: "already_checked_in" });
    expect(store.auditRows.find((a) => a.action === "duplicate.confirm")).toMatchObject({
      staff: "Mia", details: expect.objectContaining({ regIds: ["T-2", "T-3"] }),
    });
    expect((await store.getSuggestion(sugId(2)))!.decision).toBe("confirmed");
  });

  it("target person is the one already checked in", async () => {
    const res = await checkIn(store, desk, { registrationId: ids[3], via: "search" });
    expect(res.ok).toBe(true);
    const p3 = await personOf(3);
    expect((await decideSuggestion(store, manager, sugId(2), "confirmed")).ok).toBe(true);
    expect(await personOf(2)).toBe(p3);
    expect(await checkIn(store, desk, { registrationId: ids[2], via: "qr" })).toMatchObject({ ok: false, reason: "already_checked_in", staff: "Dana" });
  });

  it("refuses confirm when both are checked in", async () => {
    await checkIn(store, desk, { registrationId: ids[2], via: "search" });
    await checkIn(store, desk, { registrationId: ids[3], via: "search" });
    const r = await decideSuggestion(store, manager, sugId(2), "confirmed");
    expect(r).toMatchObject({ ok: false, code: "both_checked_in" });
    if (!r.ok) expect(r.message).toMatch(/two different people/);
    expect(await personOf(2)).not.toBe(await personOf(3));
    expect((await store.getSuggestion(sugId(2)))!.decision).toBe("pending");
  });

  it("keeps the stricter status", async () => {
    const r = await decideSuggestion(store, manager, sugId(4), "confirmed");
    expect(r.ok).toBe(true);
    expect((await store.getRegistration(ids[4]))!.personStatus).toBe("do_not_admit");
    expect(store.auditRows.at(-1)!.details).toMatchObject({ status: { kept: "do_not_admit" } });
  });

  it("reject keeps two people and is audited", async () => {
    const r = await decideSuggestion(store, manager, sugId(6), "rejected");
    expect(r.ok).toBe(true);
    expect(await personOf(6)).not.toBe(await personOf(7));
    expect((await store.getSuggestion(sugId(6)))!).toMatchObject({ decision: "rejected", decidedBy: "Mia" });
    expect(store.auditRows.at(-1)).toMatchObject({ action: "duplicate.reject", details: expect.objectContaining({ regIds: ["T-6", "T-7"] }) });
    expect((await checkIn(store, desk, { registrationId: ids[6], via: "search" })).ok).toBe(true);
    expect((await checkIn(store, desk, { registrationId: ids[7], via: "search" })).ok).toBe(true);
  });

  it("refuses desk sessions and already-decided suggestions; never changes original rows", async () => {
    const before = JSON.stringify([...store.regs.values()].map((r) => [r.raw, r.clean]));
    expect(await decideSuggestion(store, desk, sugId(2), "confirmed")).toMatchObject({ ok: false, code: "forbidden" });
    expect(store.auditRows).toHaveLength(0);
    await decideSuggestion(store, manager, sugId(2), "confirmed");
    expect(await decideSuggestion(store, manager, sugId(2), "rejected")).toMatchObject({ ok: false, code: "already_decided" });
    expect(JSON.stringify([...store.regs.values()].map((r) => [r.raw, r.clean]))).toBe(before);
  });
});
