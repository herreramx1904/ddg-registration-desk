// Storage contract (owned by lead). Two implementations: memory (tests) and supabase (prod).
// Agents: call these methods; do not add tables. Ask the lead for new methods.
import type {
  CleanFields, FieldChange, Flag, GuestType, PersonStatus, SuggestionStrength,
} from "@/lib/domain/types";

export interface RegRow {
  id: string;
  personId: string;
  personStatus: PersonStatus;
  rowNumber: number;
  regId: string;
  regIdGenerated: boolean;
  firstName: string;
  lastName: string;
  company: string | null;
  guestType: GuestType;
  breakout: string | null;
  searchText: string;
  raw: Record<string, string | null>;
  clean: CleanFields;
  flags: Flag[];
  changes: FieldChange[];
  deskNote: string | null;
  managerNotes: string | null;
  ticketToken: string;
}

export interface CheckinRow {
  id: string;
  personId: string;
  registrationId: string | null;
  at: string;
  staff: string;
  via: "search" | "qr" | "manager";
  override: "cancelled_confirmed" | "manager_override" | null;
  undoneAt: string | null;
  undoneBy: string | null;
}

export type NewCheckin = Pick<CheckinRow, "personId" | "registrationId" | "staff" | "via" | "override">;

export interface WalkinRow {
  id: string;
  firstName: string;
  lastName: string;
  company: string | null;
  guestType: GuestType;
  reason: string;
  idChecked: boolean;
  email: string | null;
  replacesRegistration: string | null;
  status: "pending" | "approved" | "rejected";
  registeredBy: string;
  createdAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

export type NewWalkin = Pick<WalkinRow,
  "firstName" | "lastName" | "company" | "guestType" | "reason" | "idChecked" | "email" | "replacesRegistration" | "registeredBy">;

export interface SuggestionRow {
  id: string;
  registrationA: string;
  registrationB: string;
  strength: SuggestionStrength;
  reason: string;
  decision: "pending" | "confirmed" | "rejected";
  decidedBy: string | null;
  decidedAt: string | null;
}

export interface AlertRow {
  id: string;
  kind: "arrival" | "help";
  registrationId: string | null;
  walkinId: string | null;
  reason: string | null;
  raisedBy: string;
  status: "open" | "acknowledged" | "handled";
  createdAt: string;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  handledBy: string | null;
  handledAt: string | null;
}

export type NewAlert = Pick<AlertRow, "kind" | "registrationId" | "walkinId" | "reason" | "raisedBy">;

export interface AuditEntry {
  staff: string;
  role: string;
  action: string; // e.g. "checkin", "checkin.undo", "status.set", "walkin.approve"
  target?: string | null;
  details?: Record<string, unknown> | null;
}
export interface AuditRow extends AuditEntry { id: number; at: string }

export interface NewRegistration {
  rowNumber: number;
  regId: string;
  regIdGenerated: boolean;
  firstName: string;
  lastName: string;
  company: string | null;
  guestType: GuestType;
  breakout: string | null;
  searchText: string;
  raw: Record<string, string | null>;
  clean: CleanFields;
  flags: Flag[];
  changes: FieldChange[];
  deskNote: string | null;
  managerNotes: string | null;
  ticketToken: string;
  status: PersonStatus;
}

export interface Store {
  // --- registrations / people ---
  listRegistrations(): Promise<RegRow[]>;
  getRegistration(id: string): Promise<RegRow | null>;
  getRegistrationByToken(token: string): Promise<RegRow | null>;
  setPersonStatus(personId: string, status: PersonStatus): Promise<void>;
  /** Move registrations onto one person (duplicate confirm). Orphaned people are removed. */
  movePerson(registrationIds: string[], toPersonId: string): Promise<void>;
  setTicketToken(registrationId: string, token: string): Promise<void>;

  // --- check-ins: insert is atomic; at most one active per person ---
  insertCheckin(c: NewCheckin): Promise<{ ok: true; checkin: CheckinRow } | { ok: false; existing: CheckinRow }>;
  getActiveCheckin(personId: string): Promise<CheckinRow | null>;
  getCheckin(id: string): Promise<CheckinRow | null>;
  undoCheckin(id: string, staff: string): Promise<CheckinRow | null>; // null if not found / already undone
  listCheckins(opts?: { activeOnly?: boolean }): Promise<CheckinRow[]>;
  countCheckinsEver(): Promise<number>;

  // --- walk-ins ---
  insertWalkin(w: NewWalkin): Promise<WalkinRow>;
  updateWalkin(id: string, patch: Partial<Pick<WalkinRow, "status" | "decidedBy" | "decidedAt" | "decisionNote">>): Promise<WalkinRow | null>;
  getWalkin(id: string): Promise<WalkinRow | null>;
  listWalkins(): Promise<WalkinRow[]>;

  // --- duplicate suggestions ---
  listSuggestions(): Promise<SuggestionRow[]>;
  getSuggestion(id: string): Promise<SuggestionRow | null>;
  decideSuggestion(id: string, decision: "confirmed" | "rejected", staff: string): Promise<SuggestionRow | null>;

  // --- alerts ---
  insertAlert(a: NewAlert): Promise<AlertRow>;
  updateAlert(id: string, patch: Partial<Pick<AlertRow, "status" | "acknowledgedBy" | "acknowledgedAt" | "handledBy" | "handledAt">>): Promise<AlertRow | null>;
  listAlerts(opts?: { openOnly?: boolean }): Promise<AlertRow[]>; // openOnly => status != handled

  // --- audit ---
  audit(e: AuditEntry): Promise<void>;
  listAudit(limit?: number): Promise<AuditRow[]>;

  // --- import ---
  /** Atomically replaces the whole guest list. Throws Error("IMPORT_BLOCKED_CHECKINS_EXIST") if any check-in exists. */
  replaceGuestList(args: {
    staff: string; fileName: string | null; report: unknown;
    registrations: NewRegistration[];
    suggestions: { rowA: number; rowB: number; strength: SuggestionStrength; reason: string }[];
  }): Promise<void>;

  // --- login rate limiting ---
  recordLogin(ip: string, ok: boolean): Promise<void>;
  recentFailedLogins(ip: string, sinceIso: string): Promise<number>;
}
