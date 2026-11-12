import { getStore } from "@/lib/server/store/supabase";
import { handle, requireRole } from "@/lib/server/session";
import { buildArrivals } from "@/lib/service/arrivals";

// Manager only: live arrivals feed, counts by type, VIPs still expected, not yet arrived.
export const GET = handle(async () => {
  await requireRole("manager");
  return Response.json(await buildArrivals(getStore()), { headers: { "Cache-Control": "no-store" } });
});
