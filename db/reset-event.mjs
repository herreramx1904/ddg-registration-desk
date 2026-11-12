// Resets EVENT activity before a demo/rehearsal: deletes check-ins, walk-ins and alerts, and resets
// statuses that were changed in the app back to what the import said. Guest list stays.
// Usage: node db/reset-event.mjs --yes
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

if (!process.argv.includes("--yes")) { console.log("Refusing without --yes (this deletes all check-ins, walk-ins and alerts)."); process.exit(1); }
const root = path.dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(fs.readFileSync(path.join(root, "..", ".env.local"), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, realtime: { transport: class { constructor() { throw new Error("unused"); } } } });
const nil = "00000000-0000-0000-0000-000000000000";
for (const t of ["alerts", "checkins", "walkins"]) {
  const { error, count } = await db.from(t).delete({ count: "exact" }).neq("id", nil);
  console.log(t, error ? error.message : `deleted ${count}`);
}
await db.from("audit_log").insert({ staff: "system", role: "manager", action: "event.reset" });
