import { getStore } from "@/lib/server/store/supabase";
import { handle, HttpError, requireRole } from "@/lib/server/session";
import { deskAlertStatus, raiseHelp } from "@/lib/service/alerts";

// POST { registrationId?: string | null, reason?: string } -> { id }   (desk "Call manager")
export const POST = handle(async (req: Request) => {
  const session = await requireRole("desk");
  const b = await req.json().catch(() => ({}));
  if (b.registrationId != null && typeof b.registrationId !== "string") throw new HttpError(400, "registrationId must be a string");
  const r = await raiseHelp(getStore(), session, {
    registrationId: b.registrationId ?? null, reason: typeof b.reason === "string" ? b.reason : null,
  });
  if (!r.ok) throw new HttpError(404, "Guest not found");
  return Response.json({ id: r.id });
});

// GET ?id= -> { status, acknowledgedBy }   (desk polls its own call)
export const GET = handle(async (req: Request) => {
  await requireRole("desk");
  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw new HttpError(400, "id required");
  const s = await deskAlertStatus(getStore(), id);
  if (!s) throw new HttpError(404, "Alert not found");
  return Response.json(s);
});
