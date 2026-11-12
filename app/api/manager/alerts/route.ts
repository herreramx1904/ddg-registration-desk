import { getStore } from "@/lib/server/store/supabase";
import { handle, HttpError, requireRole } from "@/lib/server/session";
import { acknowledge, listOpenForManager, markHandled } from "@/lib/service/alerts";

// GET -> { alerts: ManagerAlert[] }   open + acknowledged, newest first
export const GET = handle(async () => {
  await requireRole("manager");
  return Response.json({ alerts: await listOpenForManager(getStore()) });
});

// POST { id, action: "acknowledge" | "handle" } -> { status, acknowledgedBy, handledBy }
export const POST = handle(async (req: Request) => {
  const session = await requireRole("manager");
  const b = await req.json().catch(() => ({}));
  if (typeof b.id !== "string") throw new HttpError(400, "id required");
  if (b.action !== "acknowledge" && b.action !== "handle") throw new HttpError(400, "action must be acknowledge or handle");
  const fn = b.action === "acknowledge" ? acknowledge : markHandled;
  const r = await fn(getStore(), session, b.id);
  if (!r.ok) throw new HttpError(r.reason === "forbidden" ? 403 : 404, r.reason === "forbidden" ? "Managers only" : "Alert not found");
  return Response.json({ status: r.alert.status, acknowledgedBy: r.alert.acknowledgedBy, handledBy: r.alert.handledBy });
});
