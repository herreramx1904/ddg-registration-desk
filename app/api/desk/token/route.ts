import { getStore } from "@/lib/server/store/supabase";
import { handle, HttpError, requireRole } from "@/lib/server/session";
import { deskGuestByToken } from "@/lib/service/checkin";

const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

// GET ?t=<ticket token> -> { guest: DeskGuest } | 404 { error }. Desk-safe fields only.
export const GET = handle(async (req: Request) => {
  await requireRole("desk");
  const t = new URL(req.url).searchParams.get("t") ?? "";
  if (!TOKEN.test(t)) throw new HttpError(400, "Ticket not recognised");
  const guest = await deskGuestByToken(getStore(), t);
  if (!guest) throw new HttpError(404, "Ticket not recognised");
  return Response.json({ guest }, { headers: { "Cache-Control": "no-store" } });
});
