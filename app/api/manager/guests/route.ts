import { getStore } from "@/lib/server/store/supabase";
import { handle, requireRole } from "@/lib/server/session";
import { listManagerGuests } from "@/lib/service/arrivals";
import { counter } from "@/lib/service/checkin";

// Manager only: full guest records (raw + clean, all flags, manager notes, check-in state, links, suggestions).
export const GET = handle(async () => {
  await requireRole("manager");
  const store = getStore();
  const [guests, count] = await Promise.all([listManagerGuests(store), counter(store)]);
  return Response.json({ guests, counter: count }, { headers: { "Cache-Control": "no-store" } });
});
