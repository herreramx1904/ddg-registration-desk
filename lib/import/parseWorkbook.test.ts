// Seam 1: synthetic workbook → parseWorkbook. All names/emails/phones below are invented.
import { describe, expect, it, beforeAll } from "vitest";
import ExcelJS from "exceljs";
import { parseWorkbook } from "./parseWorkbook";
import type { ImportResult, ImportedRegistration } from "@/lib/domain/types";

const HEADERS = [
  "Reg ID", "First name", "Last name", "Email", "Company", "Job title", "Guest type", "Breakout",
  "Dietary requirements", "Plus-one", "Mobile", "Registered on", "Account manager (StellarX)", "Hotel needed", "Notes",
];

type Row = Partial<Record<(typeof HEADERS)[number], ExcelJS.CellValue>>;

const ROWS: Row[] = [
  /* r2 */ { "Reg ID": "SX-1001", "First name": "Testa", "Last name": "Alpha", Email: "testa.alpha@acme.example", Company: "Acme", "Guest type": "customer", Breakout: "b", Mobile: "0047 41234567", "Registered on": new Date(Date.UTC(2026, 9, 2)), "Hotel needed": "Y" },
  /* r3 */ { "Reg ID": "SX-1002", "First name": "Bravo, Benny", "Last name": null, Email: "benny at bravo.example", Company: "Bravo AS", "Guest type": "Partner", Breakout: "Breakout B", Mobile: "+47 412 34 567", "Registered on": "05/10/2026", "Hotel needed": "no" },
  /* r4 */ { "Reg ID": null, "First name": "Jurgo  Testlie", "Last name": null, Email: "jurgo@charlie.example,", Company: "  Charlie   Ltd ", "Guest type": "VIP", Breakout: "C + B", Mobile: "+4741234567", "Registered on": "2026-10-07", Notes: "VIP!! greet personally, ask Kari" },
  /* r5 */ { "Reg ID": "SX-1004", "First name": "ANNA", "Last name": "VAN DEN TESTBERG", Email: "not-an-email", Company: "Delta", "Guest type": "speaker", Breakout: "B + B", Mobile: "41234567", "Registered on": "30 Oct", Notes: "Renewal talks - do NOT seat near Echo people" },
  /* r6 */ { "Reg ID": null, "First name": "sean", "Last name": "o'testy", Email: null, Company: "Echo", "Guest type": "Internal", Breakout: "A - OrbitBot for developers", Mobile: null, "Registered on": "13/10/2026", Notes: "CANCELLED", "Dietary requirements": "allergic to nuts!!", "Plus-one": "Petra Plusone" },
  /* r7 */ {},
  /* r8 */ { "Reg ID": "SX-1007", "First name": "Bjørn", "Last name": "Østtest", Email: "bjorn1@foxtrot.example", Company: "Foxtrot", "Guest type": "Press", Mobile: "41111111", "Dietary requirements": "veg", Notes: "Wheelchair user - needs step-free route" },
  /* r9 */ { "Reg ID": "SX-1008", "First name": "Bjorn", "Last name": "Osttest", Email: "bjorn2@foxtrot.example", Company: "Foxtrot", "Guest type": "Press", Mobile: "41111112", "Plus-one": "+1 (name tbc)" },
  /* r10 */ { "Reg ID": "SX-1009", "First name": "Ole", "Last name": "Testsen", Email: "ole@golf.example", Company: "Golf", "Guest type": "Customer", Mobile: "41111113", Notes: "May send a colleague instead" },
  /* r11 */ { "Reg ID": "SX-1010", "First name": "Ole", "Last name": "Testsen", Email: "ole@hotel.example", Company: "Hotel", "Guest type": "Customer", Mobile: "41111114" },
  /* r12 */ { "Reg ID": "SX-1011", "First name": "Mia", "Last name": "Shared", Email: "office@india.example", Company: "India", "Guest type": "weird", Mobile: "41111115" },
  /* r13 */ { "Reg ID": "SX-1012", "First name": "Max", "Last name": "Shared", Email: "Office@India.example ", Company: "India", "Guest type": "Customer", Mobile: "41111116", "Hotel needed": null },
];

async function buildWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Registrations");
  ws.addRow(HEADERS);
  for (const r of ROWS) ws.addRow(HEADERS.map((h) => r[h] ?? null));
  wb.addWorksheet("From the client").addRow(["ignore me"]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

let res: ImportResult;
const byRow = (n: number): ImportedRegistration => res.registrations.find((r) => r.rowNumber === n)!;
const flagKinds = (n: number) => byRow(n).flags.map((f) => f.kind);

beforeAll(async () => {
  res = await parseWorkbook(await buildWorkbook());
});

describe("parseWorkbook", () => {
  it("preserves row count, skips empty rows, accepts ArrayBuffer/Uint8Array too", async () => {
    expect(res.registrations).toHaveLength(11);
    expect(res.registrations.map((r) => r.rowNumber)).not.toContain(7);
    const buf = await buildWorkbook();
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    expect((await parseWorkbook(ab)).registrations).toHaveLength(11);
    expect((await parseWorkbook(new Uint8Array(buf))).registrations).toHaveLength(11);
  });

  it("generates missing Reg IDs in row order", () => {
    expect(byRow(4)).toMatchObject({ regId: "SX-N001", regIdGenerated: true });
    expect(byRow(6)).toMatchObject({ regId: "SX-N002", regIdGenerated: true });
    expect(flagKinds(4)).toContain("generated_id");
    expect(byRow(2)).toMatchObject({ regId: "SX-1001", regIdGenerated: false });
  });

  it("fixes names: swap, split, casing with particles and apostrophes", () => {
    expect(byRow(3).clean).toMatchObject({ firstName: "Benny", lastName: "Bravo" });
    expect(byRow(3).changes.map((c) => c.rule)).toContain("name.swap_last_first");
    expect(byRow(4).clean).toMatchObject({ firstName: "Jurgo", lastName: "Testlie" });
    expect(byRow(4).changes.map((c) => c.rule)).toContain("name.split_full");
    expect(byRow(5).clean).toMatchObject({ firstName: "Anna", lastName: "van den Testberg" });
    expect(byRow(6).clean).toMatchObject({ firstName: "Sean", lastName: "O'Testy" });
    expect(flagKinds(5)).toContain("name_fixed");
    // mixed case with special letters untouched
    expect(byRow(8).clean).toMatchObject({ firstName: "Bjørn", lastName: "Østtest" });
    expect(flagKinds(8)).not.toContain("name_fixed");
  });

  it("cleans text and email; flags invalid without guessing", () => {
    expect(byRow(4).clean.company).toBe("Charlie Ltd");
    expect(byRow(3).clean.email).toBe("benny@bravo.example");
    expect(byRow(4).clean.email).toBe("jurgo@charlie.example");
    expect(byRow(5).clean.email).toBe("not-an-email");
    expect(flagKinds(5)).toContain("email_invalid");
    expect(flagKinds(6)).toContain("email_missing");
    expect(byRow(13).clean.email).toBe("office@india.example");
  });

  it("normalises 4 phone formats to the same E.164", () => {
    for (const n of [2, 3, 4, 5]) expect(byRow(n).clean.mobile).toBe("+4741234567");
    expect(flagKinds(6)).toContain("phone_missing");
  });

  it("normalises guest type and breakout spellings", () => {
    expect(byRow(2).clean.guestType).toBe("Customer");
    expect(byRow(5).clean.guestType).toBe("Speaker");
    expect(byRow(12).clean.guestType).toBe("Unknown");
    expect(byRow(2).clean.breakout).toBe("B");
    expect(byRow(3).clean.breakout).toBe("B");
    expect(byRow(4).clean.breakout).toBe("B+C");
    expect(byRow(5).clean.breakout).toBe("B");
    expect(byRow(6).clean.breakout).toBe("A");
    expect(byRow(8).clean.breakout).toBeNull();
  });

  it("hotel: blank is unknown, never no", () => {
    expect(byRow(2).clean.hotel).toBe("yes");
    expect(byRow(3).clean.hotel).toBe("no");
    expect(byRow(13).clean.hotel).toBe("unknown");
  });

  it("parses Excel Date, DD/MM/YYYY, ISO and '30 Oct'", () => {
    expect(byRow(2).clean.registeredOn).toBe("2026-10-02");
    expect(byRow(2).raw["Registered on"]).toBe("02/10/2026");
    expect(byRow(3).clean.registeredOn).toBe("2026-10-05");
    expect(flagKinds(3)).toContain("date_ambiguous");
    expect(byRow(4).clean.registeredOn).toBe("2026-10-07");
    expect(byRow(5).clean.registeredOn).toBe("2026-10-30");
    expect(byRow(6).clean.registeredOn).toBe("2026-10-13");
    expect(flagKinds(6)).not.toContain("date_ambiguous");
  });

  it("dietary + plus-one flags", () => {
    expect(byRow(6).clean.dietary).toBe("Nut allergy");
    expect(byRow(6).flags).toContainEqual(expect.objectContaining({ kind: "allergy", severity: "info", label: "Nut allergy" }));
    expect(byRow(8).clean.dietary).toBe("Vegetarian");
    expect(byRow(8).flags.some((f) => f.severity === "data" && /veg assumed/.test(f.label))).toBe(true);
    expect(byRow(6).clean).toMatchObject({ plusOne: "yes", plusOneName: "Petra Plusone" });
    expect(byRow(9).clean).toMatchObject({ plusOne: "yes", plusOneName: null });
    expect(byRow(2).clean.plusOne).toBe("unknown");
  });

  it("notes: VIP warning + deskNote; commercial note stays manager-only; cancelled", () => {
    const vip = byRow(4).flags.filter((f) => f.kind === "vip");
    expect(vip).toEqual([{ kind: "vip", severity: "warning", label: "VIP", detail: "Greet personally, ask Kari" }]);
    expect(byRow(4).deskNote).toBe("Greet personally, ask Kari");

    expect(byRow(5).managerNotes).toMatch(/do NOT seat/);
    expect(byRow(5).deskNote).toBeNull();
    expect(byRow(5).flags.filter((f) => f.severity !== "data")).toEqual([]);

    expect(byRow(6).initialStatus).toBe("cancelled");
    expect(flagKinds(6)).toContain("cancelled_note");
    expect(byRow(6).deskNote).toBeNull();

    expect(byRow(8).flags).toContainEqual({ kind: "accessibility", severity: "warning", label: "Wheelchair user", detail: "Needs step-free route" });
    expect(byRow(8).deskNote).toMatch(/step-free/);
    expect(byRow(10).flags).toContainEqual(expect.objectContaining({ kind: "possible_substitute", severity: "info" }));
  });

  it("suggests duplicates without merging", () => {
    const find = (a: number, b: number) => res.suggestions.find((s) => s.rowA === a && s.rowB === b);
    // same phone (rows 2-5 share +4741234567) → strong, one per pair
    expect(find(2, 3)).toMatchObject({ strength: "strong", reason: "Same phone +4741234567" });
    expect(find(4, 5)?.strength).toBe("strong");
    // accent-folded same name, same company, different phones → medium
    expect(find(8, 9)?.strength).toBe("medium");
    // same name different company → weak
    expect(find(10, 11)?.strength).toBe("weak");
    // shared email → weak
    expect(find(12, 13)).toMatchObject({ strength: "weak" });
    expect(find(12, 13)!.reason).toMatch(/office@india.example/);
    const pairs = res.suggestions.map((s) => `${s.rowA}-${s.rowB}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(res.suggestions.every((s) => s.rowA < s.rowB)).toBe(true);
  });

  it("fills the report", () => {
    expect(res.report).toMatchObject({
      rowsRead: 11,
      registrations: 11,
      generatedIds: 2,
      suggestions: { strong: 6, medium: 1, weak: 2 },
      cancelled: 1,
    });
    expect(res.report.flaggedForReview).toBe(res.registrations.filter((r) => r.flags.some((f) => f.severity === "data")).length);
    expect(res.report.changesByRule["phone.e164"]).toBeGreaterThan(0);
    expect(res.report.changesByRule["breakout.normalise"]).toBeGreaterThan(0);
  });
});
