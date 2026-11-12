import { getStore } from "@/lib/server/store/supabase";
import { handle } from "@/lib/server/session";
import { wallData, wallKeyOk } from "@/lib/service/wall";

// Public big-screen feed, guarded by the secret wall key (no session). Companies and counts only.
export const GET = handle(async (req: Request) => {
  const key = new URL(req.url).searchParams.get("key");
  if (!wallKeyOk(key)) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return Response.json(await wallData(getStore()), { headers: { "Cache-Control": "no-store" } });
});
