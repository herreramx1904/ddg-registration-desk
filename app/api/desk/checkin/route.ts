import { getStore } from "@/lib/server/store/supabase";
import { handle, HttpError, requireRole } from "@/lib/server/session";
import { checkIn } from "@/lib/service/checkin";

// Body: { registrationId, via?: "search"|"qr"|"manager", confirmCancelled?: boolean, managerOverride?: boolean }
// Returns CheckInResult (200 for every business outcome; check `ok` and `reason`).
export const POST = handle(async (req: Request) => {
  const session = await requireRole("desk");
  const b = await req.json().catch(() => ({}));
  if (typeof b.registrationId !== "string") throw new HttpError(400, "registrationId required");
  const via = b.via === "qr" ? "qr" : b.via === "manager" && session.role === "manager" ? "manager" : "search";
  const result = await checkIn(getStore(), session, {
    registrationId: b.registrationId, via, confirmCancelled: !!b.confirmCancelled, managerOverride: !!b.managerOverride,
  });
  return Response.json(result);
});
