import { getStore } from "@/lib/server/store/supabase";
import { handle, requireRole } from "@/lib/server/session";
import { listSuggestions } from "@/lib/service/duplicates";

// MANAGER ONLY. -> { suggestions: DuplicateView[], counts: { strong, medium, weak, pending, decided } }
export const GET = handle(async () => {
  await requireRole("manager");
  const suggestions = await listSuggestions(getStore());
  const pending = suggestions.filter((s) => s.decision === "pending");
  const counts = {
    strong: pending.filter((s) => s.strength === "strong").length,
    medium: pending.filter((s) => s.strength === "medium").length,
    weak: pending.filter((s) => s.strength === "weak").length,
    pending: pending.length,
    decided: suggestions.length - pending.length,
  };
  return Response.json({ suggestions, counts });
});
