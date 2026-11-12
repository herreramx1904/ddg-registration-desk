// Pure helpers for ticket links (safe on server and client). Owned by the QR agent (T7).

/** A ticket token: 128-bit random, base64url = exactly 22 chars. */
export const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
export const isTicketToken = (t: unknown): t is string => typeof t === "string" && TOKEN_RE.test(t);

/** Public origin of this request (Vercel/proxies set x-forwarded-*). Host is sanitised so it can't inject into links. */
export function originFromHeaders(h: Headers): string {
  const rawHost = (h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000").split(",")[0].trim();
  const host = /^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(rawHost) ? rawHost : "localhost:3000";
  const fwd = h.get("x-forwarded-proto")?.split(",")[0].trim();
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) || /^(10|192\.168)\./.test(host);
  const proto = fwd === "http" || fwd === "https" ? fwd : local ? "http" : "https";
  return `${proto}://${host}`;
}

export const ticketUrl = (origin: string, token: string) => `${origin}/t/${token}`;
