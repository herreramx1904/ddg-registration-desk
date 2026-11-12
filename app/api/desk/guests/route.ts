// Desk list: desk-safe fields only (no phone/email/manager notes) + live counter. Polled ~3s.
import { getStore } from "@/lib/server/store/supabase";
import { handle, requireRole } from "@/lib/server/session";
import { counter, listDeskGuests } from "@/lib/service/checkin";

export const GET = handle(async () => {
  await requireRole("desk");
  const store = getStore();
  const [guests, count] = await Promise.all([listDeskGuests(store), counter(store)]);
  return Response.json({ guests, counter: count }, { headers: { "Cache-Control": "no-store" } });
});
