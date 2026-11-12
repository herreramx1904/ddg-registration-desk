// Galaxy Wall: public big-screen arrivals. COMPANIES ONLY — never names, ids or guest types.
import { timingSafeEqual } from "node:crypto";
import type { Store } from "@/lib/server/store/types";

export interface WallCompany { company: string; count: number; lastArrivalAt: string }
export interface WallArrival { company: string; at: string }
export interface WallData { total: number; companies: WallCompany[]; recent: WallArrival[] }

const RECENT = 12;

/** Constant-time check of the wall's secret link key against WALL_KEY. */
export function wallKeyOk(key: string | null | undefined): boolean {
  const expected = process.env.WALL_KEY;
  if (!expected || !key) return false;
  const a = Buffer.from(key), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const iso = (t: string) => { const d = new Date(t); return Number.isNaN(d.getTime()) ? t : d.toISOString(); };
const cleanCompany = (c: string | null | undefined) => (c ?? "").trim().replace(/\s+/g, " ").slice(0, 60);

export async function wallData(store: Store): Promise<WallData> {
  const [active, regs, walkins] = await Promise.all([
    store.listCheckins({ activeOnly: true }), store.listRegistrations(), store.listWalkins(),
  ]);
  const byId = new Map(regs.map((r) => [r.id, r]));
  const byPerson = new Map(regs.map((r) => [r.personId, r]));

  const arrivals: { company: string; at: string }[] = [];
  for (const c of active) {
    const r = (c.registrationId && byId.get(c.registrationId)) || byPerson.get(c.personId);
    if (!r || r.guestType === "Internal") continue;
    arrivals.push({ company: cleanCompany(r.company), at: iso(c.at) });
  }
  for (const w of walkins) {
    if (w.status !== "approved" || w.guestType === "Internal") continue;
    arrivals.push({ company: cleanCompany(w.company), at: iso(w.decidedAt ?? w.createdAt) });
  }

  // Group case-insensitively, keep the first spelling seen.
  const groups = new Map<string, WallCompany>();
  for (const a of arrivals) {
    if (!a.company) continue;
    const k = a.company.toLocaleLowerCase("en");
    const g = groups.get(k);
    if (!g) groups.set(k, { company: a.company, count: 1, lastArrivalAt: a.at });
    else { g.count++; if (a.at > g.lastArrivalAt) g.lastArrivalAt = a.at; }
  }
  const companies = [...groups.values()].sort((x, y) => y.count - x.count || x.company.localeCompare(y.company));
  const recent = arrivals
    .filter((a) => a.company)
    .sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0))
    .slice(0, RECENT)
    .map((a) => ({ company: groups.get(a.company.toLocaleLowerCase("en"))!.company, at: a.at }));

  return { total: arrivals.length, companies, recent };
}
