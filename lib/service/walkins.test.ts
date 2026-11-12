// Walk-in event service on the in-memory store: pending -> approved / rejected.
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/server/store/memory";
import type { Session } from "@/lib/domain/types";
import { counter } from "./checkin";
import { decideWalkin, listWalkinsForDesk, listWalkinsForManager, registerWalkin } from "./walkins";

const desk: Session = { role: "desk", staff: "Dana" };
const manager: Session = { role: "manager", staff: "Mia" };

let store: MemoryStore;
let regId: string;

const base = { firstName: "Test", lastName: "Walker", reason: "Invited by Hege", idChecked: true };

beforeEach(async () => {
  store = new MemoryStore();
  await store.replaceGuestList({
    staff: "Mia", fileName: null, report: {}, suggestions: [],
    registrations: [{
      rowNumber: 2, regId: "T-2", regIdGenerated: false, firstName: "Ann", lastName: "Tester", company: "Acme",
      guestType: "Customer", breakout: null, searchText: "ann tester acme", raw: {},
      clean: {
        firstName: "Ann", lastName: "Tester", email: "ann@acme.example", company: "Acme", jobTitle: null, guestType: "Customer",
        breakout: null, dietary: null, plusOne: "unknown", plusOneName: null, mobile: null, registeredOn: null, accountManager: null, hotel: "unknown",
      },
      flags: [], changes: [], deskNote: null, managerNotes: null, ticketToken: "tok-2", status: "registered",
    }],
  });
  regId = (await store.listRegistrations())[0].id;
});

describe("registerWalkin", () => {
  it("requires names, a reason and a checked ID", async () => {
    await expect(registerWalkin(store, desk, { ...base, firstName: " " })).rejects.toThrow(/name/);
    await expect(registerWalkin(store, desk, { ...base, reason: "" })).rejects.toThrow(/invited/);
    await expect(registerWalkin(store, desk, { ...base, idChecked: false })).rejects.toThrow("Check their ID or press card first");
    await expect(registerWalkin(store, desk, { ...base, replacesRegistration: "nope" })).rejects.toThrow(/not found/);
    await expect(registerWalkin(store, desk, { ...base, email: "bad" })).rejects.toThrow(/email/);
    expect(store.walkins).toHaveLength(0);
  });

  it("creates a pending walk-in, defaults type to Unknown and audits", async () => {
    const w = await registerWalkin(store, desk, { ...base, guestType: "Other", replacesRegistration: regId });
    expect(w.status).toBe("pending");
    expect(w.guestType).toBe("Unknown");
    expect(w.registeredBy).toBe("Dana");
    const press = await registerWalkin(store, desk, { ...base, guestType: "Press" });
    expect(press.guestType).toBe("Press");
    expect(store.auditRows.filter((a) => a.action === "walkin.register")).toHaveLength(2);
  });
});

describe("lists", () => {
  it("desk list never includes email; manager list does, both show the replaced guest", async () => {
    await registerWalkin(store, desk, { ...base, email: "walker@test.example", replacesRegistration: regId });
    const [d] = await listWalkinsForDesk(store);
    expect(d).not.toHaveProperty("email");
    expect(JSON.stringify(d)).not.toContain("walker@test.example");
    expect(d.replaces).toEqual({ registrationId: regId, regId: "T-2", name: "Ann Tester" });
    const [m] = await listWalkinsForManager(store);
    expect(m.email).toBe("walker@test.example");
    expect(m.replaces?.regId).toBe("T-2");
  });
});

describe("decideWalkin", () => {
  it("desk staff cannot decide", async () => {
    const w = await registerWalkin(store, desk, base);
    await expect(decideWalkin(store, desk, w.id, "approved")).rejects.toThrow("Managers only");
    expect((await store.getWalkin(w.id))?.status).toBe("pending");
  });

  it("pending -> approved once, counts in counter, audited", async () => {
    const w = await registerWalkin(store, desk, base);
    expect((await counter(store)).walkinsPending).toBe(1);
    const a = await decideWalkin(store, manager, w.id, "approved", "Known to Hege");
    expect(a).toMatchObject({ status: "approved", decidedBy: "Mia", decisionNote: "Known to Hege" });
    expect((await counter(store)).walkinsApproved).toBe(1);
    await expect(decideWalkin(store, manager, w.id, "rejected")).rejects.toThrow(/Already approved/);
    expect(store.auditRows.filter((x) => x.action === "walkin.approve")).toHaveLength(1);
  });

  it("pending -> rejected once, record kept, audited", async () => {
    const w = await registerWalkin(store, desk, base);
    await decideWalkin(store, manager, w.id, "rejected");
    await expect(decideWalkin(store, manager, w.id, "approved")).rejects.toThrow(/Already rejected/);
    expect((await listWalkinsForDesk(store))[0].status).toBe("rejected");
    expect((await counter(store)).walkinsApproved).toBe(0);
    expect(store.auditRows.filter((x) => x.action === "walkin.reject")).toHaveLength(1);
  });

  it("unknown id is 404", async () => {
    await expect(decideWalkin(store, manager, "missing", "approved")).rejects.toMatchObject({ status: 404 });
  });
});
