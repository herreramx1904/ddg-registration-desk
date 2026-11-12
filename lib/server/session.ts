// Signed, httpOnly session cookie: { role, staff, exp } + HMAC-SHA256. SERVER ONLY.
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { Role, Session } from "@/lib/domain/types";

export const COOKIE = "ddg_session";
const TTL_S = 12 * 60 * 60;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET not configured");
  return s;
}
const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function encodeSession(s: Session): string {
  const payload = Buffer.from(JSON.stringify({ ...s, exp: Math.floor(Date.now() / 1000) + TTL_S })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(token: string | undefined): Session | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const a = Buffer.from(sig), b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof d.exp !== "number" || d.exp < Date.now() / 1000) return null;
    if (d.role !== "desk" && d.role !== "manager") return null;
    return { role: d.role, staff: String(d.staff).slice(0, 60) };
  } catch { return null; }
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return decodeSession(jar.get(COOKIE)?.value);
}

export const cookieOptions = {
  httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/", maxAge: TTL_S,
};

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Throws HttpError(401/403). Managers may do everything desk staff can. */
export async function requireRole(role: Role): Promise<Session> {
  const s = await getSession();
  if (!s) throw new HttpError(401, "Please log in");
  if (role === "manager" && s.role !== "manager") throw new HttpError(403, "Managers only");
  return s;
}

/** Wrap a route handler: converts HttpError + unknown errors into JSON responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try { return await fn(...args); }
    catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      console.error(e);
      return Response.json({ error: "Something went wrong" }, { status: 500 });
    }
  };
}
