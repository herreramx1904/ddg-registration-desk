import { getStore } from "@/lib/server/store/supabase";
import { handle, HttpError, requireRole } from "@/lib/server/session";
import { listWalkinsForDesk, registerWalkin, WalkinError } from "@/lib/service/walkins";

// GET: desk-safe walk-in list, newest first (no email).
export const GET = handle(async () => {
  await requireRole("desk");
  return Response.json({ walkins: await listWalkinsForDesk(getStore()) });
});

// POST { firstName, lastName, company?, guestType?, reason, idChecked: true, email?, replacesRegistration? }
export const POST = handle(async (req: Request) => {
  const session = await requireRole("desk");
  const b = await req.json().catch(() => ({}));
  try {
    const w = await registerWalkin(getStore(), session, b ?? {});
    return Response.json({ ok: true, id: w.id, status: w.status }, { status: 201 });
  } catch (e) {
    if (e instanceof WalkinError) throw new HttpError(e.status, e.message);
    throw e;
  }
});
