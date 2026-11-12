import { getStore } from "@/lib/server/store/supabase";
import { handle, requireRole } from "@/lib/server/session";
import { listWalkinsForManager } from "@/lib/service/walkins";

// GET: full walk-in list for managers (includes email + replaced guest), newest first.
export const GET = handle(async () => {
  await requireRole("manager");
  return Response.json({ walkins: await listWalkinsForManager(getStore()) });
});
