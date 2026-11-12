import { getStore } from "@/lib/server/store/supabase";
import { handle, HttpError, requireRole } from "@/lib/server/session";
import { setStatus } from "@/lib/service/checkin";

// Body: { registrationId, status: "registered"|"cancelled"|"do_not_admit" } -> { guest }
export const POST = handle(async (req: Request) => {
  const session = await requireRole("manager");
  const b = await req.json().catch(() => ({}));
  if (typeof b.registrationId !== "string" || !["registered", "cancelled", "do_not_admit"].includes(b.status)) {
    throw new HttpError(400, "registrationId and a valid status are required");
  }
  const guest = await setStatus(getStore(), session, b.registrationId, b.status);
  if (!guest) throw new HttpError(404, "Guest not found");
  return Response.json({ guest });
});
