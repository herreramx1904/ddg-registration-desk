import { getStore } from "@/lib/server/store/supabase";
import { handle, HttpError, requireRole } from "@/lib/server/session";
import { decideWalkin, WalkinError } from "@/lib/service/walkins";

// POST { id, decision: "approved" | "rejected", note? }
export const POST = handle(async (req: Request) => {
  const session = await requireRole("manager");
  const b = await req.json().catch(() => ({}));
  if (typeof b.id !== "string") throw new HttpError(400, "id required");
  if (b.decision !== "approved" && b.decision !== "rejected") throw new HttpError(400, "decision must be approved or rejected");
  try {
    const w = await decideWalkin(getStore(), session, b.id, b.decision, typeof b.note === "string" ? b.note : null);
    return Response.json({ ok: true, id: w.id, status: w.status });
  } catch (e) {
    if (e instanceof WalkinError) throw new HttpError(e.status, e.message);
    throw e;
  }
});
