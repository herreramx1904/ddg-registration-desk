import { getStore } from "@/lib/server/store/supabase";
import { handle, requireRole } from "@/lib/server/session";

// Manager only: latest 100 audit entries.
export const GET = handle(async () => {
  await requireRole("manager");
  return Response.json({ entries: await getStore().listAudit(100) }, { headers: { "Cache-Control": "no-store" } });
});
