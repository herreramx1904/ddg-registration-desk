import { getStore } from "@/lib/server/store/supabase";
import { handle, HttpError, requireRole } from "@/lib/server/session";
import { managerGuest } from "@/lib/service/arrivals";

// Manager only: audit history for one guest (this registration + confirmed-linked registrations), newest first.
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireRole("manager");
  const { id } = await ctx.params;
  const store = getStore();
  const guest = await managerGuest(store, id);
  if (!guest) throw new HttpError(404, "Guest not found");
  const targets = new Set<string>([guest.regId, guest.registrationId, ...guest.linked.flatMap((l) => [l.regId, l.registrationId])]);
  const entries = (await store.listAudit(300)).filter((e) => {
    if (e.target && targets.has(e.target)) return true;
    const d = e.details ?? {};
    return ["registrationId", "regId", "target"].some((k) => typeof d[k] === "string" && targets.has(d[k] as string));
  });
  return Response.json({ entries }, { headers: { "Cache-Control": "no-store" } });
});
