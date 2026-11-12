import { cookies } from "next/headers";
import { COOKIE, getSession, handle } from "@/lib/server/session";
import { getStore } from "@/lib/server/store/supabase";

export const POST = handle(async () => {
  const s = await getSession();
  if (s) await getStore().audit({ staff: s.staff, role: s.role, action: "logout" });
  (await cookies()).delete(COOKIE);
  return Response.json({ ok: true });
});
