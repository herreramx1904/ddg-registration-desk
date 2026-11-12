// Pure import: Excel bytes in → cleaned registrations, flags, duplicate suggestions and a report out.
// No I/O, no DB. Every non-empty row becomes exactly one registration (never merged, never dropped).
import ExcelJS from "exceljs";
import type {
  CleanFields,
  FieldChange,
  Flag,
  ImportedRegistration,
  ImportedSuggestion,
  ImportReport,
  ImportResult,
  PersonStatus,
  SuggestionStrength,
} from "@/lib/domain/types";
import {
  cleanBreakout,
  cleanDate,
  cleanDietary,
  cleanEmail,
  cleanGuestType,
  cleanPhone,
  cleanPlusOne,
  cleanYesNo,
  collapse,
  ddmmyyyy,
  foldName,
  isoFromDate,
  needsCasing,
  orNull,
  properCase,
  splitFullName,
} from "./normalise";
import { classifyNote } from "./notes";
import { suggestDuplicates } from "./duplicates";

type FieldKey =
  | "regId" | "firstName" | "lastName" | "email" | "company" | "jobTitle" | "guestType" | "breakout"
  | "dietary" | "plusOne" | "mobile" | "registeredOn" | "accountManager" | "hotel" | "notes";

const HEADER_ALIASES: Record<FieldKey, string[]> = {
  regId: ["reg id", "regid", "registration id", "id"],
  firstName: ["first name", "firstname", "first"],
  lastName: ["last name", "lastname", "surname", "last"],
  email: ["email", "e-mail", "email address"],
  company: ["company", "organisation", "organization"],
  jobTitle: ["job title", "title", "role"],
  guestType: ["guest type", "type"],
  breakout: ["breakout", "breakout session"],
  dietary: ["dietary requirements", "dietary", "diet"],
  plusOne: ["plus-one", "plus one", "plusone", "+1"],
  mobile: ["mobile", "phone", "mobile phone"],
  registeredOn: ["registered on", "registered", "registration date"],
  accountManager: ["account manager (stellarx)", "account manager"],
  hotel: ["hotel needed", "hotel"],
  notes: ["notes", "note", "comments"],
};

function normHeader(h: string): string {
  return collapse(h).toLowerCase();
}

/** Convert any exceljs cell value to text (dates as DD/MM/YYYY). */
function cellText(v: ExcelJS.CellValue): { text: string | null; date: Date | null } {
  if (v === null || v === undefined) return { text: null, date: null };
  if (v instanceof Date) return { text: ddmmyyyy(v), date: v };
  if (typeof v === "string") return { text: v === "" ? null : v, date: null };
  if (typeof v === "number" || typeof v === "boolean") return { text: String(v), date: null };
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      const t = (o.richText as { text: string }[]).map((r) => r.text).join("");
      return { text: t === "" ? null : t, date: null };
    }
    if ("result" in o) return cellText(o.result as ExcelJS.CellValue);
    if (typeof o.text === "string") return { text: o.text === "" ? null : o.text, date: null };
    if (o.text && typeof o.text === "object") return cellText(o.text as ExcelJS.CellValue);
    if ("error" in o) return { text: String(o.error), date: null };
  }
  return { text: String(v), date: null };
}

function toBuffer(data: ArrayBuffer | Buffer | Uint8Array): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return Buffer.from(new Uint8Array(data));
}

export async function parseWorkbook(data: ArrayBuffer | Buffer | Uint8Array): Promise<ImportResult> {
  const wb = new ExcelJS.Workbook();
  // exceljs typings expect its own Buffer type; runtime accepts a Node Buffer.
  await wb.xlsx.load(toBuffer(data) as unknown as ArrayBuffer);
  const ws = wb.worksheets.find((w) => normHeader(w.name) === "registrations") ?? wb.worksheets[0];
  if (!ws) throw new Error("Workbook has no sheets");

  // Header row → column lookup by name
  const headers: { col: number; name: string }[] = [];
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    const t = collapse(cellText(cell.value).text);
    if (t) headers.push({ col, name: t });
  });
  const colOf: Partial<Record<FieldKey, number>> = {};
  for (const key of Object.keys(HEADER_ALIASES) as FieldKey[]) {
    const aliases = HEADER_ALIASES[key];
    const hit =
      headers.find((h) => aliases.includes(normHeader(h.name))) ??
      headers.find((h) => aliases.some((a) => a.length > 3 && normHeader(h.name).startsWith(a)));
    if (hit) colOf[key] = hit.col;
  }
  if (colOf.firstName === undefined && colOf.lastName === undefined) {
    throw new Error("Could not find 'First name' / 'Last name' columns in header row");
  }

  // Collect non-empty rows
  type RowData = { rowNumber: number; raw: Record<string, string | null>; date: Date | null };
  const rows: RowData[] = [];
  let rowsRead = 0;
  const lastRow = ws.actualRowCount > 0 ? ws.rowCount : 0;
  for (let r = 2; r <= lastRow; r++) {
    const row = ws.getRow(r);
    const raw: Record<string, string | null> = {};
    let any = false;
    let regDate: Date | null = null;
    for (const h of headers) {
      const { text, date } = cellText(row.getCell(h.col).value);
      raw[h.name] = text;
      if (text !== null && text.trim() !== "") any = true;
      if (h.col === colOf.registeredOn && date) regDate = date;
    }
    if (!any) continue;
    rowsRead++;
    rows.push({ rowNumber: r, raw, date: regDate });
  }

  const headerName = (k: FieldKey): string | undefined => headers.find((h) => h.col === colOf[k])?.name;
  const get = (rd: RowData, k: FieldKey): string | null => {
    const n = headerName(k);
    return n ? rd.raw[n] ?? null : null;
  };

  const existingIds = new Set(rows.map((rd) => collapse(get(rd, "regId"))).filter(Boolean));
  let genCounter = 0;
  const nextGeneratedId = (): string => {
    let id: string;
    do {
      genCounter++;
      id = `SX-N${String(genCounter).padStart(3, "0")}`;
    } while (existingIds.has(id));
    return id;
  };

  const registrations: ImportedRegistration[] = rows.map((rd) => {
    const flags: Flag[] = [];
    const changes: FieldChange[] = [];
    const change = (field: string, before: string | null, after: string | null, rule: string) =>
      changes.push({ field, before, after, rule });
    /** Log a change for a plain text field: whitespace-only → text.trim, else the given rule. */
    const logText = (field: string, before: string | null, after: string | null, rule: string) => {
      if ((before ?? null) === (after ?? null)) return;
      if (before !== null && after !== null && collapse(before) === after) change(field, before, after, "text.trim");
      else if (!(before !== null && collapse(before) === "" && after === null)) change(field, before, after, rule);
    };

    // Reg ID
    let regId = collapse(get(rd, "regId"));
    let regIdGenerated = false;
    if (!regId) {
      regId = nextGeneratedId();
      regIdGenerated = true;
      flags.push({ kind: "generated_id", severity: "data", label: "Generated Reg ID", detail: `No Reg ID in file; assigned ${regId}` });
    }

    // Names
    const rawFirst = get(rd, "firstName");
    const rawLast = get(rd, "lastName");
    let first = collapse(rawFirst);
    let last = collapse(rawLast);
    let nameFixed = false;
    if (!last && first.includes(",")) {
      const [l, ...rest] = first.split(",");
      const f = collapse(rest.join(" "));
      if (collapse(l) && f) {
        first = f;
        last = collapse(l);
        change("firstName", rawFirst, first, "name.swap_last_first");
        change("lastName", rawLast, last, "name.swap_last_first");
        nameFixed = true;
      }
    } else if (!last && first.includes(" ")) {
      [first, last] = splitFullName(first);
      change("firstName", rawFirst, first, "name.split_full");
      change("lastName", rawLast, last, "name.split_full");
      nameFixed = true;
    }
    const beforeCaseFirst = first;
    const beforeCaseLast = last;
    if (needsCasing(first)) first = properCase(first, false);
    if (needsCasing(last)) last = properCase(last, true);
    if (first !== beforeCaseFirst) {
      change("firstName", beforeCaseFirst, first, "name.case");
      nameFixed = true;
    }
    if (last !== beforeCaseLast) {
      change("lastName", beforeCaseLast, last, "name.case");
      nameFixed = true;
    }
    if (!nameFixed) {
      logText("firstName", rawFirst, orNull(first), "text.trim");
      logText("lastName", rawLast, orNull(last), "text.trim");
    }
    if (nameFixed) flags.push({ kind: "name_fixed", severity: "data", label: "Name corrected", detail: `${first} ${last}`.trim() });

    // Company / job title / account manager
    const rawCompany = get(rd, "company");
    const company = orNull(collapse(rawCompany));
    logText("company", rawCompany, company, "text.trim");
    const rawJob = get(rd, "jobTitle");
    const jobTitle = orNull(collapse(rawJob));
    logText("jobTitle", rawJob, jobTitle, "text.trim");
    const rawAm = get(rd, "accountManager");
    const accountManager = orNull(collapse(rawAm));
    logText("accountManager", rawAm, accountManager, "text.trim");

    // Email
    const rawEmail = get(rd, "email");
    const em = cleanEmail(rawEmail);
    if (em.email === null) flags.push({ kind: "email_missing", severity: "data", label: "Email missing" });
    else if (!em.valid) flags.push({ kind: "email_invalid", severity: "data", label: "Email invalid", detail: em.email });
    else {
      if (em.fixed) flags.push({ kind: "email_fixed", severity: "data", label: "Email corrected", detail: `${collapse(rawEmail)} → ${em.email}` });
      logText("email", rawEmail, em.email, "email.normalise");
    }

    // Mobile
    const rawMobile = get(rd, "mobile");
    const ph = cleanPhone(rawMobile);
    if (!collapse(rawMobile)) flags.push({ kind: "phone_missing", severity: "data", label: "Phone missing" });
    else if (!ph.ok) flags.push({ kind: "other", severity: "data", label: "Phone unreadable", detail: collapse(rawMobile) });
    else if (ph.mobile !== rawMobile) change("mobile", rawMobile, ph.mobile, "phone.e164");

    // Guest type
    const rawType = get(rd, "guestType");
    const guestType = cleanGuestType(rawType);
    if (collapse(rawType) !== guestType && !(guestType === "Unknown" && !collapse(rawType))) {
      change("guestType", rawType, guestType, guestType === "Unknown" && collapse(rawType) ? "type.unknown" : "type.normalise");
    }

    // Breakout
    const rawBreakout = get(rd, "breakout");
    const breakout = cleanBreakout(rawBreakout);
    logText("breakout", rawBreakout, breakout, "breakout.normalise");

    // Dietary
    const rawDiet = get(rd, "dietary");
    const diet = cleanDietary(rawDiet);
    logText("dietary", rawDiet, diet.dietary, "dietary.normalise");
    if (diet.assumedVeg) flags.push({ kind: "other", severity: "data", label: "veg assumed vegetarian – confirm", detail: `Raw value: ${collapse(rawDiet)}` });
    if (diet.dietary && diet.allergy) flags.push({ kind: "allergy", severity: "info", label: diet.dietary });
    else if (diet.dietary && diet.dietary !== "None") flags.push({ kind: "dietary", severity: "info", label: diet.dietary });

    // Plus-one
    const rawPlus = get(rd, "plusOne");
    const plus = cleanPlusOne(rawPlus);
    if (collapse(rawPlus) && collapse(rawPlus) !== plus.plusOne) change("plusOne", rawPlus, plus.plusOne, "plusone.normalise");
    if (plus.plusOne === "yes") flags.push({ kind: "plus_one", severity: "info", label: "+1", ...(plus.name ? { detail: plus.name } : {}) });

    // Registered on
    const rawDate = get(rd, "registeredOn");
    let registeredOn: string | null = null;
    if (rd.date) registeredOn = isoFromDate(rd.date);
    else if (collapse(rawDate)) {
      const dt = cleanDate(rawDate);
      registeredOn = dt.iso;
      if (dt.iso && dt.iso !== collapse(rawDate)) change("registeredOn", rawDate, dt.iso, "date.parse");
      if (!dt.iso) flags.push({ kind: "other", severity: "data", label: "Date unreadable", detail: collapse(rawDate) });
      if (dt.ambiguous) flags.push({ kind: "date_ambiguous", severity: "data", label: "Ambiguous date", detail: `${collapse(rawDate)} read day-first as ${dt.iso}` });
    }

    // Hotel
    const rawHotel = get(rd, "hotel");
    const hotel = cleanYesNo(rawHotel);
    if (collapse(rawHotel) && collapse(rawHotel) !== hotel) change("hotel", rawHotel, hotel, "hotel.normalise");

    // Notes
    const rawNotes = get(rd, "notes");
    const note = classifyNote(rawNotes, guestType === "VIP");
    flags.push(...note.flags);
    const initialStatus: PersonStatus = note.cancelled ? "cancelled" : "registered";

    const clean: CleanFields = {
      firstName: first,
      lastName: last,
      email: em.email,
      company,
      jobTitle,
      guestType,
      breakout,
      dietary: diet.dietary,
      plusOne: plus.plusOne,
      plusOneName: plus.name,
      mobile: ph.mobile,
      registeredOn,
      accountManager,
      hotel,
    };

    return {
      rowNumber: rd.rowNumber,
      regId,
      regIdGenerated,
      raw: rd.raw,
      clean,
      flags,
      deskNote: note.deskNote,
      managerNotes: note.managerNotes,
      initialStatus,
      changes,
    };
  });

  const suggestions: ImportedSuggestion[] = suggestDuplicates(registrations, foldName);

  const byStrength: Record<SuggestionStrength, number> = { strong: 0, medium: 0, weak: 0 };
  for (const s of suggestions) byStrength[s.strength]++;
  const changesByRule: Record<string, number> = {};
  for (const r of registrations) for (const c of r.changes) changesByRule[c.rule] = (changesByRule[c.rule] ?? 0) + 1;

  const report: ImportReport = {
    rowsRead,
    registrations: registrations.length,
    generatedIds: registrations.filter((r) => r.regIdGenerated).length,
    suggestions: byStrength,
    flaggedForReview: registrations.filter((r) => r.flags.some((f) => f.severity === "data")).length,
    changesByRule,
    cancelled: registrations.filter((r) => r.initialStatus === "cancelled").length,
  };

  return { registrations, suggestions, report };
}
