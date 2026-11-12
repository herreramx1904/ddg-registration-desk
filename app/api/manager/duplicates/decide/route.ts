import { getStore } from "@/lib/server/store/supabase";
import { handle, HttpError, requireRole } from "@/lib/server/session";
import { decideSuggestion } from "@/lib/service/duplicates";

// Body: { id, decision: "confirmed"|"rejected" } -> { suggestion, message } | 4xx { error }
const statusFor = { forbidden: 403, not_found: 404, already_decided: 409, both_checked_in: 409 } as const;

export const POST = handle(async (req: Request) => {
  const session = await requireRole("manager");
  const b = await req.json().catch(() => ({}));
  if (typeof b.id !== "string" || (b.decision !== "confirmed" && b.decision !== "rejected")) {
    throw new HttpError(400, "id and decision (confirmed|rejected) are required");
  }
  const r = await decideSuggestion(getStore(), session, b.id, b.decision);
  if (!r.ok) throw new HttpError(statusFor[r.code], r.message);
  return Response.json({ suggestion: r.suggestion, message: r.message });
});
