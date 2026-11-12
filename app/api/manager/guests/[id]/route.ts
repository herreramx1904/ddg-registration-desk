import { getStore } from "@/lib/server/store/supabase";
import { handle, HttpError, requireRole } from "@/lib/server/session";
import { managerGuest } from "@/lib/service/arrivals";

// Manager only: one full guest record by registration id.
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireRole("manager");
  const { id } = await ctx.params;
  const guest = await managerGuest(getStore(), id);
  if (!guest) throw new HttpError(404, "Guest not found");
  return Response.json({ guest }, { headers: { "Cache-Control": "no-store" } });
});
