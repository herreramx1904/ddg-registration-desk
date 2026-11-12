// In-memory Store for tests. Mirrors the DB guarantees (one active check-in per person).
import { randomUUID } from "node:crypto";
import type { PersonStatus } from "@/lib/domain/types";
import type {
  AlertRow, AuditRow, CheckinRow, RegRow, Store, SuggestionRow, WalkinRow,
} from "./types";

export class MemoryStore implements Store {
  people = new Map<string, PersonStatus>();
  regs = new Map<string, Omit<RegRow, "personStatus">>();
  checkins: CheckinRow[] = [];
  walkins: WalkinRow[] = [];
  suggestions: SuggestionRow[] = [];
  alerts: AlertRow[] = [];
  auditRows: AuditRow[] = [];
  logins: { ip: string; at: string; ok: boolean }[] = [];
  private clock = 0;
  private now() { return new Date(Date.UTC(2026, 11, 3, 10, 30) + this.clock++ * 1000).toISOString(); }

  private withStatus(r: Omit<RegRow, "personStatus">): RegRow {
    return { ...r, personStatus: this.people.get(r.personId) ?? "registered" };
  }
  async listRegistrations() { return [...this.regs.values()].map((r) => this.withStatus(r)).sort((a, b) => a.rowNumber - b.rowNumber); }
  async getRegistration(id: string) { const r = this.regs.get(id); return r ? this.withStatus(r) : null; }
  async getRegistrationByToken(t: string) { const r = [...this.regs.values()].find((x) => x.ticketToken === t); return r ? this.withStatus(r) : null; }
  async setPersonStatus(p: string, s: PersonStatus) { this.people.set(p, s); }
  async movePerson(ids: string[], to: string) {
    const old = new Set<string>();
    for (const id of ids) { const r = this.regs.get(id); if (r) { old.add(r.personId); r.personId = to; } }
    for (const c of this.checkins) if (old.has(c.personId)) c.personId = to;
    for (const p of old) if (p !== to && ![...this.regs.values()].some((r) => r.personId === p)) this.people.delete(p);
  }
  async setTicketToken(id: string, token: string) { const r = this.regs.get(id); if (r) r.ticketToken = token; }

  async insertCheckin(c: Parameters<Store["insertCheckin"]>[0]) {
    const existing = this.checkins.find((x) => x.personId === c.personId && !x.undoneAt);
    if (existing) return { ok: false as const, existing };
    const row: CheckinRow = { id: randomUUID(), at: this.now(), undoneAt: null, undoneBy: null, ...c };
    this.checkins.push(row);
    return { ok: true as const, checkin: row };
  }
  async getActiveCheckin(p: string) { return this.checkins.find((x) => x.personId === p && !x.undoneAt) ?? null; }
  async getCheckin(id: string) { return this.checkins.find((x) => x.id === id) ?? null; }
  async undoCheckin(id: string, staff: string) {
    const c = this.checkins.find((x) => x.id === id && !x.undoneAt);
    if (!c) return null;
    c.undoneAt = this.now(); c.undoneBy = staff; return c;
  }
  async listCheckins(o?: { activeOnly?: boolean }) { return this.checkins.filter((c) => !o?.activeOnly || !c.undoneAt); }
  async countCheckinsEver() { return this.checkins.length; }

  async insertWalkin(w: Parameters<Store["insertWalkin"]>[0]) {
    const row: WalkinRow = { id: randomUUID(), status: "pending", createdAt: this.now(), decidedBy: null, decidedAt: null, decisionNote: null, ...w };
    this.walkins.push(row); return row;
  }
  async updateWalkin(id: string, patch: Partial<WalkinRow>) { const w = this.walkins.find((x) => x.id === id); if (!w) return null; Object.assign(w, patch); return w; }
  async getWalkin(id: string) { return this.walkins.find((x) => x.id === id) ?? null; }
  async listWalkins() { return [...this.walkins]; }

  async listSuggestions() { return [...this.suggestions]; }
  async getSuggestion(id: string) { return this.suggestions.find((s) => s.id === id) ?? null; }
  async decideSuggestion(id: string, d: "confirmed" | "rejected", staff: string) {
    const s = this.suggestions.find((x) => x.id === id); if (!s) return null;
    s.decision = d; s.decidedBy = staff; s.decidedAt = this.now(); return s;
  }

  async insertAlert(a: Parameters<Store["insertAlert"]>[0]) {
    const row: AlertRow = { id: randomUUID(), status: "open", createdAt: this.now(), acknowledgedBy: null, acknowledgedAt: null, handledBy: null, handledAt: null, ...a };
    this.alerts.push(row); return row;
  }
  async updateAlert(id: string, patch: Partial<AlertRow>) { const a = this.alerts.find((x) => x.id === id); if (!a) return null; Object.assign(a, patch); return a; }
  async listAlerts(o?: { openOnly?: boolean }) { return this.alerts.filter((a) => !o?.openOnly || a.status !== "handled"); }

  async audit(e: Parameters<Store["audit"]>[0]) { this.auditRows.push({ id: this.auditRows.length + 1, at: this.now(), ...e }); }
  async listAudit(limit = 200) { return [...this.auditRows].reverse().slice(0, limit); }

  async replaceGuestList(a: Parameters<Store["replaceGuestList"]>[0]) {
    if (this.checkins.length) throw new Error("IMPORT_BLOCKED_CHECKINS_EXIST");
    this.people.clear(); this.regs.clear(); this.suggestions = []; this.alerts = [];
    const byRow = new Map<number, string>();
    for (const r of a.registrations) {
      const personId = randomUUID(); this.people.set(personId, r.status);
      const id = randomUUID(); byRow.set(r.rowNumber, id);
      const { status: _s, ...rest } = r; void _s;
      this.regs.set(id, { ...rest, id, personId });
    }
    this.suggestions = a.suggestions.map((s) => ({
      id: randomUUID(), registrationA: byRow.get(s.rowA)!, registrationB: byRow.get(s.rowB)!,
      strength: s.strength, reason: s.reason, decision: "pending", decidedBy: null, decidedAt: null,
    }));
  }

  async recordLogin(ip: string, ok: boolean) { this.logins.push({ ip, ok, at: new Date().toISOString() }); }
  async recentFailedLogins(ip: string, since: string) { return this.logins.filter((l) => l.ip === ip && !l.ok && l.at >= since).length; }
}
