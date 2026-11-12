// Manager only. GET -> client report workbook (.xlsx), audited "report.export".
// GET ?format=json -> live summary numbers for the Report page (not audited, no personal rows).
import ExcelJS from "exceljs";
import { getStore } from "@/lib/server/store/supabase";
import { handle, requireRole } from "@/lib/server/session";
import { buildReport, summaryLines, type ClientReport } from "@/lib/service/report";

const ORANGE = "FFFB7730";
const INK = "FF2A2140";

const fmtTime = (iso: string) =>
  iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/Oslo", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
const yesNo = (b: boolean) => (b ? "Yes" : "No");

function sheet(wb: ExcelJS.Workbook, name: string, columns: { header: string; key: string; width: number }[], rows: Record<string, unknown>[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns;
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
  head.height = 20;
  for (const r of rows) ws.addRow(r);
  if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}

async function workbook(r: ClientReport): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "DDG Registration Desk";
  wb.created = new Date(r.generatedAt);

  // Summary
  const ws = wb.addWorksheet("Summary");
  ws.columns = [{ width: 38 }, { width: 12 }, { width: 70 }];
  ws.addRow(["OrbitBot Galaxy · Kraftverket Oslo · 3 Dec 2026"]).font = { bold: true, size: 14, color: { argb: ORANGE } };
  ws.addRow([`Client report, generated ${fmtTime(r.generatedAt)}. Counts are people, not registrations.`]).font = { italic: true };
  ws.addRow([]);
  const h = ws.addRow(["Measure", "Count", "Note"]);
  h.font = { bold: true, color: { argb: "FFFFFFFF" } };
  h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
  for (const l of summaryLines(r.summary)) ws.addRow([l.label, l.value, l.note ?? ""]);

  sheet(wb, "Attended", [
    { header: "Time", key: "at", width: 16 }, { header: "Name", key: "name", width: 28 }, { header: "Company", key: "company", width: 26 },
    { header: "Guest type", key: "guestType", width: 12 }, { header: "Reg ID(s)", key: "regIds", width: 18 },
    { header: "Checked in by", key: "staff", width: 18 }, { header: "Via", key: "via", width: 10 },
    { header: "Exception", key: "override", width: 30 }, { header: "Internal staff", key: "internal", width: 14 },
  ], r.attended.map((a) => ({ ...a, at: fmtTime(a.at), internal: yesNo(a.internal) })));

  sheet(wb, "No-shows", [
    { header: "Name", key: "name", width: 28 }, { header: "Company", key: "company", width: 26 },
    { header: "Guest type", key: "guestType", width: 12 }, { header: "Reg ID(s)", key: "regIds", width: 18 },
    { header: "Internal staff", key: "internal", width: 14 },
  ], r.noShows.map((n) => ({ ...n, internal: yesNo(n.internal) })));

  sheet(wb, "Walk-ins", [
    { header: "Decision", key: "status", width: 11 }, { header: "Name", key: "name", width: 26 }, { header: "Company", key: "company", width: 22 },
    { header: "Guest type", key: "guestType", width: 12 }, { header: "Reason / invited by", key: "reason", width: 34 },
    { header: "Replaces", key: "replaces", width: 28 }, { header: "ID checked", key: "idChecked", width: 11 },
    { header: "Registered by", key: "registeredBy", width: 18 }, { header: "Registered at", key: "registeredAt", width: 16 },
    { header: "Decided by", key: "decidedBy", width: 18 }, { header: "Decided at", key: "decidedAt", width: 16 },
    { header: "Decision note", key: "decisionNote", width: 30 },
  ], r.walkins.map((w) => ({ ...w, idChecked: yesNo(w.idChecked), registeredAt: fmtTime(w.registeredAt), decidedAt: fmtTime(w.decidedAt) })));

  sheet(wb, "Exceptions", [
    { header: "Exception", key: "kind", width: 26 }, { header: "Name", key: "name", width: 26 }, { header: "Reg ID(s)", key: "regIds", width: 18 },
    { header: "Status", key: "status", width: 14 }, { header: "Time", key: "at", width: 16 }, { header: "By", key: "staff", width: 18 },
    { header: "Detail", key: "detail", width: 44 },
  ], r.exceptions.map((e) => ({ ...e, at: fmtTime(e.at) })));

  sheet(wb, "Duplicates", [
    { header: "Assessment", key: "assessment", width: 44 }, { header: "Reg ID A", key: "regIdA", width: 12 }, { header: "Name A", key: "nameA", width: 24 },
    { header: "Attended A", key: "attendedA", width: 11 }, { header: "Reg ID B", key: "regIdB", width: 12 }, { header: "Name B", key: "nameB", width: 24 },
    { header: "Attended B", key: "attendedB", width: 11 }, { header: "Counted as (people)", key: "countedAs", width: 18 },
    { header: "Strength", key: "strength", width: 10 }, { header: "Reason", key: "reason", width: 34 },
    { header: "Decided by", key: "decidedBy", width: 16 }, { header: "Decided at", key: "decidedAt", width: 16 },
  ], r.duplicates.map((d) => ({ ...d, attendedA: yesNo(d.attendedA), attendedB: yesNo(d.attendedB), decidedAt: fmtTime(d.decidedAt) })));

  // Original rows: the client's values, untouched (as text).
  const o = wb.addWorksheet("Original rows", { views: [{ state: "frozen", ySplit: 1 }] });
  o.columns = [{ header: "Excel row", key: "__row", width: 10 }, ...r.originalRows.headers.map((hd) => ({ header: hd, key: hd, width: 20 }))];
  o.getRow(1).font = { bold: true };
  for (const row of r.originalRows.rows) o.addRow({ __row: row.rowNumber, ...row.values });

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export const GET = handle(async (req: Request) => {
  const session = await requireRole("manager");
  const store = getStore();
  const report = await buildReport(store);
  if (new URL(req.url).searchParams.get("format") === "json") {
    return Response.json(
      { generatedAt: report.generatedAt, summary: report.summary, lines: summaryLines(report.summary),
        counts: { attended: report.attended.length, noShows: report.noShows.length, walkins: report.walkins.length,
          exceptions: report.exceptions.length, duplicates: report.duplicates.length, originalRows: report.originalRows.rows.length } },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const buf = await workbook(report);
  await store.audit({ staff: session.staff, role: session.role, action: "report.export", target: "client-report.xlsx", details: { ...report.summary } });
  const stamp = report.generatedAt.slice(0, 16).replace(/[:T]/g, "-");
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="orbitbot-galaxy-report-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
});
