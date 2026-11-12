// Applies db/schema.sql to Supabase. Reads DATABASE_PASWORD + API_URL from .env.local (never printed).
// Usage: node db/migrate.mjs
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, "..", ".env.local"), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const ref = new URL(env.API_URL || env.SUPABASE_URL).hostname.split(".")[0];
const password = env.DATABASE_PASWORD || env.DATABASE_PASSWORD;
const sql = fs.readFileSync(path.join(root, "schema.sql"), "utf8");

const candidates = [
  { host: `aws-0-eu-central-1.pooler.supabase.com`, user: `postgres.${ref}` },
  { host: `aws-1-eu-central-1.pooler.supabase.com`, user: `postgres.${ref}` },
  { host: `db.${ref}.supabase.co`, user: "postgres" },
];
for (const c of candidates) {
  const client = new pg.Client({ ...c, port: 5432, database: "postgres", password, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
  try {
    await client.connect();
    const { rows } = await client.query("select current_setting('server_version') v");
    console.log(`connected via ${c.host} (eu-central-1 pooler=${c.host.includes("eu-central-1")}), pg ${rows[0].v}`);
    await client.query(sql);
    const t = await client.query("select tablename, rowsecurity from pg_tables where schemaname='public' order by 1");
    console.table(t.rows);
    await client.end();
    process.exit(0);
  } catch (e) {
    console.log(`x ${c.host}: ${e.message}`);
    try { await client.end(); } catch {}
  }
}
process.exit(1);
