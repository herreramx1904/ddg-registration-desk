import { getStore } from "@/lib/server/store/supabase";
import { handle, requireRole } from "@/lib/server/session";
import { originFromHeaders, ticketUrl } from "@/components/qr/ticket-link";

// GET -> { tickets: [{registrationId, regId, firstName, lastName, company, guestType, url}] }
// GET ?format=csv -> CSV download of ticket links (audited "tickets.export"). Manager only.
export const GET = handle(async (req: Request) => {
  const session = await requireRole("manager");
  const store = getStore();
  const origin = originFromHeaders(req.headers);
  const tickets = (await store.listRegistrations())
    .map((r) => ({
      registrationId: r.id,
      regId: r.regId,
      firstName: r.firstName,
      lastName: r.lastName,
      company: r.company,
      guestType: r.guestType,
      url: ticketUrl(origin, r.ticketToken),
    }))
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));

  if (new URL(req.url).searchParams.get("format") !== "csv") {
    return Response.json({ tickets }, { headers: { "Cache-Control": "no-store" } });
  }

  const rows = [
    ["First name", "Last name", "Company", "Reg ID", "Ticket link"],
    ...tickets.map((t) => [t.firstName, t.lastName, t.company ?? "", t.regId, t.url]),
  ];
  // UTF-8 BOM so Excel opens accents correctly; CRLF per RFC 4180.
  const csv = "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  await store.audit({
    staff: session.staff, role: session.role, action: "tickets.export", target: null, details: { count: tickets.length },
  });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="orbitbot-galaxy-ticket-links.csv"',
      "Cache-Control": "no-store",
    },
  });
});

/** RFC 4180 quoting + neutralise spreadsheet formulas (=, +, -, @, tab, CR at the start). */
function csvCell(v: string): string {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
