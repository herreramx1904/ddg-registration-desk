// Alerts lifecycle on the in-memory store.
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/server/store/memory";
import type { NewRegistration } from "@/lib/server/store/types";
import type { Flag, Session } from "@/lib/domain/types";
import { checkIn, fold } from "./checkin";
import { acknowledge, deskAlertStatus, listOpenForManager, markHandled, raiseHelp } from "./alerts";

const desk: Session = { role: "desk", staff: "Dana" };
const manager: Session = { role: "manager", staff: "Mia" };

const vip: Flag = { kind: "vip", severity: "warning", label: "VIP", detail: "Greet personally" };
const dataFlag: Flag = { kind: "email_invalid", severity: "data", label: "Invalid email" };

function reg(row: number, first: string, extra: Partial<NewRegistration> = {}): NewRegistration {
  return {
    rowNumber: row, regId: `T-${row}`, regIdGenerated: false, firstName: first, lastName: "Tester", company: "Acme",
    guestType: "Customer", breakout: null, searchText: fold(`${first} Tester Acme`), raw: {},
    clean: {
      firstName: first, lastName: "Tester", email: null, company: "Acme", jobTitle: null, guestType: "Customer",
      breakout: null, dietary: null, plusOne: "unknown", plusOneName: null, mobile: null, registeredOn: null, accountManager: null, hotel: "unknown",
    },
    flags: [], changes: [], deskNote: null, managerNotes: null, ticketToken: `tok-${row}`, status: "registered", ...extra,
  };
}

let store: MemoryStore;
let ids: Record<number, string>;

beforeEach(async () => {
  store = new MemoryStore();
  await store.replaceGuestList({
    staff: "Mia", fileName: null, report: {}, suggestions: [],
    registrations: [reg(2, "Ann"), reg(3, "Ben", { guestType: "VIP", flags: [vip, dataFlag], deskNote: "Greet personally" })],
  });
  ids = Object.fromEntries((await store.listRegistrations()).map((r) => [r.rowNumber, r.id]));
  store.auditRows.length = 0;
});

describe("help alerts", () => {
  it("raise -> acknowledge -> handled, all audited", async () => {
    const r = await raiseHelp(store, desk, { registrationId: ids[2], reason: "TEST help with Ann" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await deskAlertStatus(store, r.id)).toEqual({ status: "open", acknowledgedBy: null });

    const [open] = await listOpenForManager(store);
    expect(open).toMatchObject({ id: r.id, kind: "help", tone: "help", raisedBy: "Dana", reason: "TEST help with Ann" });
    expect(open.guest).toMatchObject({ name: "Ann Tester", company: "Acme", regId: "T-2" });

    expect((await acknowledge(store, manager, r.id)).ok).toBe(true);
    expect(await deskAlertStatus(store, r.id)).toEqual({ status: "acknowledged", acknowledgedBy: "Mia" });

    expect((await markHandled(store, manager, r.id)).ok).toBe(true);
    expect(await deskAlertStatus(store, r.id)).toEqual({ status: "handled", acknowledgedBy: "Mia" });
    expect(await listOpenForManager(store)).toHaveLength(0);

    expect(store.auditRows.map((a) => a.action)).toEqual(["alert.help", "alert.ack", "alert.handled"]);
  });

  it("defaults the reason and allows no guest", async () => {
    const r = await raiseHelp(store, desk, { registrationId: null });
    expect(r.ok).toBe(true);
    const [a] = await listOpenForManager(store);
    expect(a).toMatchObject({ reason: "Desk needs a manager", guest: null });
  });

  it("re-pressing for the same guest reuses the open call", async () => {
    const a = await raiseHelp(store, desk, { registrationId: ids[2] });
    const b = await raiseHelp(store, desk, { registrationId: ids[2] });
    expect(a.ok && b.ok && a.id === b.id).toBe(true);
    expect(await listOpenForManager(store)).toHaveLength(1);
  });

  it("unknown guest is refused", async () => {
    expect(await raiseHelp(store, desk, { registrationId: "nope" })).toEqual({ ok: false, reason: "not_found" });
  });

  it("desk staff cannot acknowledge or handle", async () => {
    const r = await raiseHelp(store, desk, { registrationId: ids[2] });
    if (!r.ok) throw new Error("raise failed");
    expect(await acknowledge(store, desk, r.id)).toEqual({ ok: false, reason: "forbidden" });
    expect(await markHandled(store, desk, r.id)).toEqual({ ok: false, reason: "forbidden" });
    expect(await deskAlertStatus(store, r.id)).toEqual({ status: "open", acknowledgedBy: null });
  });

  it("acknowledge is idempotent and keeps the first manager", async () => {
    const r = await raiseHelp(store, desk, { registrationId: ids[2] });
    if (!r.ok) throw new Error("raise failed");
    await acknowledge(store, manager, r.id);
    await acknowledge(store, { role: "manager", staff: "Max" }, r.id);
    expect(await deskAlertStatus(store, r.id)).toEqual({ status: "acknowledged", acknowledgedBy: "Mia" });
    expect(store.auditRows.filter((a) => a.action === "alert.ack")).toHaveLength(1);
  });
});

describe("arrival alerts", () => {
  it("checking in a VIP shows an arrival alert with the guest's name, without data flags", async () => {
    const c = await checkIn(store, desk, { registrationId: ids[3], via: "search" });
    expect(c.ok).toBe(true);
    const list = await listOpenForManager(store);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ kind: "arrival", tone: "vip", raisedBy: "Dana" });
    expect(list[0].reason).toContain("VIP");
    expect(list[0].guest?.name).toBe("Ben Tester");
    expect(list[0].guest?.flags.map((f) => f.kind)).toEqual(["vip"]);
  });

  it("listing is newest first", async () => {
    await checkIn(store, desk, { registrationId: ids[3], via: "search" });
    const h = await raiseHelp(store, desk, { registrationId: ids[2] });
    const list = await listOpenForManager(store);
    expect(h.ok && list[0].id === h.id).toBe(true);
    expect(list[1].kind).toBe("arrival");
  });
});

describe("desk status", () => {
  it("has only status and acknowledgedBy", async () => {
    const r = await raiseHelp(store, desk, { registrationId: ids[2], reason: "TEST" });
    if (!r.ok) throw new Error("raise failed");
    expect(Object.keys((await deskAlertStatus(store, r.id))!).sort()).toEqual(["acknowledgedBy", "status"]);
    expect(await deskAlertStatus(store, "missing")).toBeNull();
  });
});
