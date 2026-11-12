import { getStore } from "@/lib/server/store/supabase";
import { handle, HttpError, requireRole } from "@/lib/server/session";
import { undoCheckIn } from "@/lib/service/checkin";

// Body: { checkInId } -> { ok: true, guest } | { ok: false, reason }
export const POST = handle(async (req: Request) => {
  const session = await requireRole("desk");
  const b = await req.json().catch(() => ({}));
  if (typeof b.checkInId !== "string") throw new HttpError(400, "checkInId required");
  return Response.json(await undoCheckIn(getStore(), session, b.checkInId));
});
