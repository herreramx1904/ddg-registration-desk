import { getSession, handle } from "@/lib/server/session";

export const GET = handle(async () => {
  const s = await getSession();
  if (!s) return Response.json({ error: "Not logged in" }, { status: 401 });
  return Response.json(s);
});
