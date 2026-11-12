import { cookies, headers } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { getStore } from "@/lib/server/store/supabase";
import { COOKIE, cookieOptions, encodeSession, handle } from "@/lib/server/session";
import type { Role } from "@/lib/domain/types";

const MAX_FAILS = 5, WINDOW_S = 60;
const eq = (a: string, b: string | undefined) => !!b && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export const POST = handle(async (req: Request) => {
  const body = await req.json().catch(() => ({}));
  const staff = String(body.staff ?? "").trim().slice(0, 60);
  const pin = String(body.pin ?? "").trim();
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const store = getStore();

  const since = new Date(Date.now() - WINDOW_S * 1000).toISOString();
  if ((await store.recentFailedLogins(ip, since)) >= MAX_FAILS) {
    return Response.json({ error: "Too many attempts. Wait a minute and try again.", retryAfter: WINDOW_S }, { status: 429 });
  }
  if (!staff) return Response.json({ error: "Please enter your name." }, { status: 401 });

  let role: Role | null = null;
  if (eq(pin, process.env.MANAGER_PIN)) role = "manager";
  else if (eq(pin, process.env.DESK_PIN)) role = "desk";
  await store.recordLogin(ip, !!role);
  if (!role) return Response.json({ error: "That PIN didn't work." }, { status: 401 });

  (await cookies()).set(COOKIE, encodeSession({ role, staff }), cookieOptions);
  await store.audit({ staff, role, action: "login" });
  return Response.json({ role });
});
