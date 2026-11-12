import { getStore } from "@/lib/server/store/supabase";
import { handle, HttpError, requireRole } from "@/lib/server/session";
import { newTicketToken } from "@/lib/server/tokens";
import { originFromHeaders, ticketUrl } from "@/components/qr/ticket-link";

// Body: { registrationId } -> { registrationId, url }. The old token (and its QR) stops working at once.
export const POST = handle(async (req: Request) => {
  const session = await requireRole("manager");
  const b = await req.json().catch(() => ({}));
  if (typeof b.registrationId !== "string" || !b.registrationId) throw new HttpError(400, "registrationId required");
  const store = getStore();
  const reg = await store.getRegistration(b.registrationId);
  if (!reg) throw new HttpError(404, "Guest not found");
  const token = newTicketToken();
  await store.setTicketToken(reg.id, token);
  // Never log tokens: they are the ticket.
  await store.audit({
    staff: session.staff, role: session.role, action: "ticket.reissue", target: reg.id, details: { regId: reg.regId },
  });
  return Response.json({ registrationId: reg.id, url: ticketUrl(originFromHeaders(req.headers), token) });
});
