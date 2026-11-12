// Manager import: multipart form field "file" (.xlsx). Original rows kept; nothing merged.
// Refused (409) once any check-in exists. The uploaded file itself is never stored.
import { getStore } from "@/lib/server/store/supabase";
import { handle, HttpError, requireRole } from "@/lib/server/session";
import { parseWorkbook } from "@/lib/import/parseWorkbook";
import { fold } from "@/lib/service/checkin";
import { newTicketToken } from "@/lib/server/tokens";

export const POST = handle(async (req: Request) => {
  const session = await requireRole("manager");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Choose an Excel file first.");
  if (file.size > 5_000_000) throw new HttpError(413, "That file is too large (max 5 MB).");
  let result;
  try { result = await parseWorkbook(new Uint8Array(await file.arrayBuffer())); }
  catch { throw new HttpError(422, "We couldn't read that file. Is it the .xlsx export?"); }

  const store = getStore();
  try {
    await store.replaceGuestList({
      staff: session.staff, fileName: file.name.slice(0, 120), report: result.report,
      registrations: result.registrations.map((r) => ({
        rowNumber: r.rowNumber, regId: r.regId, regIdGenerated: r.regIdGenerated,
        firstName: r.clean.firstName, lastName: r.clean.lastName, company: r.clean.company,
        guestType: r.clean.guestType, breakout: r.clean.breakout,
        searchText: fold(`${r.clean.firstName} ${r.clean.lastName} ${r.clean.company ?? ""} ${r.regId}`),
        raw: r.raw, clean: r.clean, flags: r.flags, changes: r.changes, deskNote: r.deskNote,
        managerNotes: r.managerNotes, ticketToken: newTicketToken(), status: r.initialStatus,
      })),
      suggestions: result.suggestions,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "IMPORT_BLOCKED_CHECKINS_EXIST") {
      throw new HttpError(409, "Guests have already checked in, so the list can't be replaced now.");
    }
    throw e;
  }
  await store.audit({ staff: session.staff, role: session.role, action: "import", target: file.name.slice(0, 120), details: { ...result.report } });
  return Response.json({ report: result.report });
});
