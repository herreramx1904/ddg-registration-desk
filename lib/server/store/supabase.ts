// Supabase Store (production). SERVER ONLY: uses the secret key, which bypasses RLS.
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PersonStatus } from "@/lib/domain/types";
import type {
  AlertRow, AuditRow, CheckinRow, RegRow, Store, SuggestionRow, WalkinRow,
} from "./types";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const reg = (r: Row): RegRow => ({
  id: r.id, personId: r.person_id, personStatus: r.people?.status ?? "registered", rowNumber: r.row_number,
  regId: r.reg_id, regIdGenerated: r.reg_id_generated, firstName: r.first_name, lastName: r.last_name,
  company: r.company, guestType: r.guest_type, breakout: r.breakout, searchText: r.search_text, raw: r.raw,
  clean: r.clean, flags: r.flags ?? [], changes: r.changes ?? [], deskNote: r.desk_note, managerNotes: r.manager_notes,
  ticketToken: r.ticket_token,
});
const chk = (r: Row): CheckinRow => ({
  id: r.id, personId: r.person_id, registrationId: r.registration_id, at: r.at, staff: r.staff, via: r.via,
  override: r.override, undoneAt: r.undone_at, undoneBy: r.undone_by,
});
const wlk = (r: Row): WalkinRow => ({
  id: r.id, firstName: r.first_name, lastName: r.last_name, company: r.company, guestType: r.guest_type,
  reason: r.reason, idChecked: r.id_checked, email: r.email, replacesRegistration: r.replaces_registration,
  status: r.status, registeredBy: r.registered_by, createdAt: r.created_at, decidedBy: r.decided_by,
  decidedAt: r.decided_at, decisionNote: r.decision_note,
});
const sug = (r: Row): SuggestionRow => ({
  id: r.id, registrationA: r.registration_a, registrationB: r.registration_b, strength: r.strength, reason: r.reason,
  decision: r.decision, decidedBy: r.decided_by, decidedAt: r.decided_at,
});
const alr = (r: Row): AlertRow => ({
  id: r.id, kind: r.kind, registrationId: r.registration_id, walkinId: r.walkin_id, reason: r.reason,
  raisedBy: r.raised_by, status: r.status, createdAt: r.created_at, acknowledgedBy: r.acknowledged_by,
  acknowledgedAt: r.acknowledged_at, handledBy: r.handled_by, handledAt: r.handled_at,
});
const snake = (o: Row) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase()), v]));

// Note: for maybeSingle() the returned value can still be null at runtime; callers check it.
function must<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? null) as T;
}

const REG_SELECT = "*, people(status)";

export class SupabaseStore implements Store {
  constructor(private db: SupabaseClient) {}

  async listRegistrations() {
    return must(await this.db.from("registrations").select(REG_SELECT).order("row_number")).map(reg);
  }
  async getRegistration(id: string) {
    const d = must(await this.db.from("registrations").select(REG_SELECT).eq("id", id).maybeSingle());
    return d ? reg(d) : null;
  }
  async getRegistrationByToken(t: string) {
    const d = must(await this.db.from("registrations").select(REG_SELECT).eq("ticket_token", t).maybeSingle());
    return d ? reg(d) : null;
  }
  async setPersonStatus(p: string, s: PersonStatus) { must(await this.db.from("people").update({ status: s }).eq("id", p)); }
  async movePerson(ids: string[], to: string) {
    const rows = must(await this.db.from("registrations").select("person_id").in("id", ids)) as Row[];
    const old = [...new Set(rows.map((r) => r.person_id as string))].filter((p) => p !== to);
    must(await this.db.from("registrations").update({ person_id: to }).in("id", ids));
    if (old.length) {
      must(await this.db.from("checkins").update({ person_id: to }).in("person_id", old));
      for (const p of old) {
        const left = must(await this.db.from("registrations").select("id").eq("person_id", p).limit(1)) as Row[];
        if (!left.length) must(await this.db.from("people").delete().eq("id", p));
      }
    }
  }
  async setTicketToken(id: string, token: string) { must(await this.db.from("registrations").update({ ticket_token: token }).eq("id", id)); }

  async insertCheckin(c: Parameters<Store["insertCheckin"]>[0]) {
    const res = await this.db.from("checkins").insert(snake(c)).select().single();
    if (res.error) {
      if (res.error.code === "23505") {
        const existing = await this.getActiveCheckin(c.personId);
        if (existing) return { ok: false as const, existing };
      }
      throw new Error(res.error.message);
    }
    return { ok: true as const, checkin: chk(res.data) };
  }
  async getActiveCheckin(p: string) {
    const d = must(await this.db.from("checkins").select("*").eq("person_id", p).is("undone_at", null).maybeSingle());
    return d ? chk(d) : null;
  }
  async getCheckin(id: string) {
    const d = must(await this.db.from("checkins").select("*").eq("id", id).maybeSingle());
    return d ? chk(d) : null;
  }
  async undoCheckin(id: string, staff: string) {
    const d = must(await this.db.from("checkins").update({ undone_at: new Date().toISOString(), undone_by: staff })
      .eq("id", id).is("undone_at", null).select().maybeSingle());
    return d ? chk(d) : null;
  }
  async listCheckins(o?: { activeOnly?: boolean }) {
    let q = this.db.from("checkins").select("*").order("at", { ascending: false });
    if (o?.activeOnly) q = q.is("undone_at", null);
    return must(await q).map(chk);
  }
  async countCheckinsEver() {
    const r = await this.db.from("checkins").select("id", { count: "exact", head: true });
    if (r.error) throw new Error(r.error.message);
    return r.count ?? 0;
  }

  async insertWalkin(w: Parameters<Store["insertWalkin"]>[0]) { return wlk(must(await this.db.from("walkins").insert(snake(w)).select().single())); }
  async updateWalkin(id: string, patch: Row) {
    const d = must(await this.db.from("walkins").update(snake(patch)).eq("id", id).select().maybeSingle());
    return d ? wlk(d) : null;
  }
  async getWalkin(id: string) { const d = must(await this.db.from("walkins").select("*").eq("id", id).maybeSingle()); return d ? wlk(d) : null; }
  async listWalkins() { return must(await this.db.from("walkins").select("*").order("created_at", { ascending: false })).map(wlk); }

  async listSuggestions() { return must(await this.db.from("duplicate_suggestions").select("*")).map(sug); }
  async getSuggestion(id: string) { const d = must(await this.db.from("duplicate_suggestions").select("*").eq("id", id).maybeSingle()); return d ? sug(d) : null; }
  async decideSuggestion(id: string, d: "confirmed" | "rejected", staff: string) {
    const r = must(await this.db.from("duplicate_suggestions").update({ decision: d, decided_by: staff, decided_at: new Date().toISOString() })
      .eq("id", id).eq("decision", "pending").select().maybeSingle()); // only the first decision wins
    return r ? sug(r) : null;
  }

  async insertAlert(a: Parameters<Store["insertAlert"]>[0]) { return alr(must(await this.db.from("alerts").insert(snake(a)).select().single())); }
  async updateAlert(id: string, patch: Row) {
    const d = must(await this.db.from("alerts").update(snake(patch)).eq("id", id).select().maybeSingle());
    return d ? alr(d) : null;
  }
  async listAlerts(o?: { openOnly?: boolean }) {
    let q = this.db.from("alerts").select("*").order("created_at", { ascending: false });
    if (o?.openOnly) q = q.neq("status", "handled");
    return must(await q).map(alr);
  }

  async audit(e: Parameters<Store["audit"]>[0]) { must(await this.db.from("audit_log").insert({ ...e, target: e.target ?? null, details: e.details ?? null })); }
  async listAudit(limit = 200): Promise<AuditRow[]> {
    return must(await this.db.from("audit_log").select("*").order("id", { ascending: false }).limit(limit)) as AuditRow[];
  }

  async replaceGuestList(a: Parameters<Store["replaceGuestList"]>[0]) {
    const regs = a.registrations.map((r) => ({
      row_number: r.rowNumber, reg_id: r.regId, reg_id_generated: r.regIdGenerated, first_name: r.firstName,
      last_name: r.lastName, company: r.company, guest_type: r.guestType, breakout: r.breakout, search_text: r.searchText,
      raw: r.raw, clean: r.clean, flags: r.flags, changes: r.changes, desk_note: r.deskNote, manager_notes: r.managerNotes,
      ticket_token: r.ticketToken, status: r.status,
    }));
    const sugs = a.suggestions.map((s) => ({ row_a: s.rowA, row_b: s.rowB, strength: s.strength, reason: s.reason }));
    const res = await this.db.rpc("replace_guest_list", {
      p_staff: a.staff, p_file_name: a.fileName, p_report: a.report, p_registrations: regs, p_suggestions: sugs,
    });
    if (res.error) throw new Error(res.error.message.includes("IMPORT_BLOCKED") ? "IMPORT_BLOCKED_CHECKINS_EXIST" : res.error.message);
  }

  async recordLogin(ip: string, ok: boolean) { must(await this.db.from("login_attempts").insert({ ip, ok })); }
  async recentFailedLogins(ip: string, since: string) {
    const r = await this.db.from("login_attempts").select("id", { count: "exact", head: true }).eq("ip", ip).eq("ok", false).gte("at", since);
    if (r.error) throw new Error(r.error.message);
    return r.count ?? 0;
  }
}

class NoopWebSocket {
  constructor() { throw new Error("Realtime is not used in this app"); }
}

let cached: Store | null = null;
export function getStore(): Store {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SECRET_KEY not configured");
  cached = new SupabaseStore(createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // We never use Realtime. Node 20 has no native WebSocket, so give realtime-js a never-used transport.
    realtime: { transport: NoopWebSocket as never },
  }));
  return cached;
}
