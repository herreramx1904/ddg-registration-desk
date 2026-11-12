// Proves the DB guard: fires N simultaneous check-ins for ONE person against the real Supabase DB.
// Uses a temporary person (no registration, no guest data) and cleans up afterwards.
// Usage: node db/concurrency-check.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = path.dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(fs.readFileSync(path.join(root, "..", ".env.local"), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, realtime: { transport: class { constructor() { throw new Error("unused"); } } } });

const N = 10;
const { data: person, error } = await db.from("people").insert({ status: "registered" }).select().single();
if (error) throw error;
try {
  const results = await Promise.all(Array.from({ length: N }, (_, i) =>
    db.from("checkins").insert({ person_id: person.id, staff: `concurrency-test-${i}`, via: "search" }).select().single()));
  const ok = results.filter((r) => !r.error).length;
  const dup = results.filter((r) => r.error?.code === "23505").length;
  const other = results.filter((r) => r.error && r.error.code !== "23505").map((r) => r.error.message);
  const { count } = await db.from("checkins").select("id", { count: "exact", head: true }).eq("person_id", person.id).is("undone_at", null);
  console.log(`${N} simultaneous check-ins -> ${ok} succeeded, ${dup} rejected by unique index, active rows in DB: ${count}`, other.length ? other : "");
  console.log(ok === 1 && count === 1 ? "PASS: exactly one admission" : "FAIL");
} finally {
  await db.from("checkins").delete().eq("person_id", person.id);
  await db.from("people").delete().eq("id", person.id);
}
