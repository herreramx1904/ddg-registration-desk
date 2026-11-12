"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { CheckInResult, DeskGuest, Role } from "@/lib/domain/types";
import {
  AppShell, Button, Card, Counter, EmptyState, IconQr, IconUserPlus, SearchInput, Spinner, useToast,
} from "@/components/ui";
import { QrScanner, extractToken } from "@/components/qr/QrScanner";
import { DeskWalkinStatus, WalkinSheet } from "@/components/walkins/WalkinSheet";
import { GuestCard, type CheckInMode } from "./GuestCard";
import { StatusBadge, TypeAndWarningBadges } from "./GuestBadges";
import { buildIndex, fullName, searchGuests } from "./search";

interface CounterData {
  checkedIn: number; expected: number; internalIn: number; internalExpected: number;
  walkinsApproved: number; walkinsPending: number;
}
interface Me { role: Role; staff: string }

const POLL_MS = 3000;

function goLogin() {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = "/";
}

export function DeskScreen() {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [guests, setGuests] = useState<DeskGuest[] | null>(null);
  const [count, setCount] = useState<CounterData | null>(null);
  const [offline, setOffline] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<DeskGuest | null>(null);
  const [via, setVia] = useState<"search" | "qr">("search");
  const [raceLost, setRaceLost] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [walkinOpen, setWalkinOpen] = useState(false);
  // Bumped on every local mutation so an in-flight poll cannot overwrite the optimistic state with stale data.
  const mutationSeq = useRef(0);

  const focusSearch = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // ---- session ----
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/auth/me", { signal: ctrl.signal, cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) return goLogin();
        if (res.ok) setMe((await res.json()) as Me);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  // ---- live guest list + counter (poll every 3 s) ----
  const refresh = useCallback(async () => {
    const seq = mutationSeq.current;
    try {
      const res = await fetch("/api/desk/guests", { cache: "no-store" });
      if (res.status === 401) return goLogin();
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { guests: DeskGuest[]; counter: CounterData };
      setOffline(false);
      if (seq !== mutationSeq.current) return; // a check-in/undo happened meanwhile; next poll will be fresh
      setGuests(data.guests);
      setCount(data.counter);
      const byId = new Map(data.guests.map((g) => [g.registrationId, g]));
      setSelected((s) => (s ? byId.get(s.registrationId) ?? s : s));
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const t = setInterval(() => {
      if (!document.hidden) void refresh();
    }, POLL_MS);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [refresh]);

  // ---- search ----
  const index = useMemo(() => buildIndex(guests ?? []), [guests]);
  const { results, total } = useMemo(() => searchGuests(index, query), [index, query]);

  /** Apply a fresh DeskGuest (from a check-in/undo response) to every registration of that person. */
  const applyGuest = useCallback((g: DeskGuest) => {
    mutationSeq.current++;
    setGuests((list) => list?.map((x) => (x.registrationId === g.registrationId ? g
      : x.personId === g.personId ? { ...x, checkedIn: g.checkedIn, status: g.status } : x)) ?? list);
    setSelected((s) => (s && s.personId === g.personId ? (s.registrationId === g.registrationId ? g : { ...s, checkedIn: g.checkedIn, status: g.status }) : s));
  }, []);

  const bumpCounter = useCallback((g: DeskGuest, delta: 1 | -1) => {
    setCount((c) => c && (g.guestType === "Internal"
      ? { ...c, internalIn: Math.max(0, c.internalIn + delta) }
      : { ...c, checkedIn: Math.max(0, c.checkedIn + delta) }));
  }, []);

  const openGuest = useCallback((g: DeskGuest, how: "search" | "qr") => {
    setSelected(g);
    setVia(how);
    setRaceLost(false);
  }, []);

  const backToSearch = useCallback(() => {
    setSelected(null);
    setRaceLost(false);
    setQuery("");
    focusSearch();
  }, [focusSearch]);

  // ---- QR / ticket lookup ----
  const lookupToken = useCallback(async (token: string) => {
    setLookingUp(true);
    try {
      const res = await fetch(`/api/desk/token?t=${encodeURIComponent(token)}`, { cache: "no-store" });
      if (res.status === 401) return goLogin();
      if (res.ok) {
        const { guest } = (await res.json()) as { guest: DeskGuest };
        setQuery("");
        openGuest(guest, "qr");
        return;
      }
      toast({ title: "Ticket not recognised", detail: "Search by name instead.", tone: "warn" });
      setQuery("");
      focusSearch();
    } catch {
      toast({ title: "Could not read the ticket", detail: "Check the connection and try again.", tone: "danger" });
    } finally {
      setLookingUp(false);
    }
  }, [toast, openGuest, focusSearch]);

  const onScan = useCallback((text: string) => {
    setScanOpen(false);
    const token = extractToken(text);
    if (token) void lookupToken(token);
    else {
      toast({ title: "Not a DDG ticket", detail: "Search by name instead.", tone: "warn" });
      focusSearch();
    }
  }, [lookupToken, toast, focusSearch]);

  function onSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { backToSearch(); return; }
    if (e.key !== "Enter") return;
    e.preventDefault();
    const token = extractToken(query);
    if (token) void lookupToken(token);
    else if (results.length === 1) openGuest(results[0], "search");
  }

  // ---- check-in / undo ----
  const undo = useCallback(async (checkInId: string, g: DeskGuest) => {
    try {
      const res = await fetch("/api/desk/undo", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ checkInId }),
      });
      if (res.status === 401) return goLogin();
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; guest?: DeskGuest | null };
      if (res.ok && data.ok) {
        applyGuest(data.guest ?? { ...g, checkedIn: null });
        bumpCounter(g, -1);
        toast({ title: "Check-in undone", detail: `${fullName(g)} is not checked in.`, tone: "info" });
      } else {
        toast({ title: "Nothing to undo", detail: "That check-in was already undone.", tone: "warn" });
      }
    } catch {
      toast({ title: "Undo failed", detail: "Check the connection and try again.", tone: "danger" });
    }
    void refresh();
  }, [applyGuest, bumpCounter, toast, refresh]);

  const checkIn = useCallback(async (g: DeskGuest, mode: CheckInMode) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/desk/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registrationId: g.registrationId,
          via: mode === "managerOverride" ? "manager" : via,
          confirmCancelled: mode === "confirmCancelled" || undefined,
          managerOverride: mode === "managerOverride" || undefined,
        }),
      });
      if (res.status === 401) return goLogin();
      if (!res.ok) throw new Error(String(res.status));
      const r = (await res.json()) as CheckInResult;
      if (r.ok) {
        applyGuest(r.guest);
        bumpCounter(r.guest, 1);
        const notes = [
          r.guest.breakout ? `Breakout ${r.guest.breakout}` : null,
          r.guest.flags.some((f) => f.severity === "warning") ? "Managers notified" : null,
        ].filter(Boolean).join(" · ");
        const checkInId = r.checkInId;
        const guest = r.guest;
        toast({
          title: `Welcome, ${guest.firstName}!`,
          detail: notes || undefined,
          tone: "ok",
          duration: 6000,
          action: { label: "Undo", onClick: () => void undo(checkInId, guest) },
        });
        backToSearch();
        return;
      }
      if (r.reason === "not_found") {
        toast({ title: "Guest not found", detail: "They may have been removed. Search again.", tone: "danger" });
        backToSearch();
        return;
      }
      applyGuest(r.guest);
      if (r.reason === "already_checked_in") {
        setRaceLost(true);
        toast({ title: "Already checked in", detail: `At ${new Date(r.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} by ${r.staff}`, tone: "info" });
      } else if (r.reason === "needs_cancel_confirm") {
        toast({ title: "This guest cancelled", detail: "Please confirm entry.", tone: "warn" });
      } else if (r.reason === "do_not_admit") {
        toast({ title: "Do not admit", detail: "A manager must decide.", tone: "danger" });
      }
    } catch {
      toast({ title: "Check-in did not go through", detail: "Check the connection and try again.", tone: "danger" });
    } finally {
      setBusy(false);
    }
  }, [busy, via, applyGuest, bumpCounter, toast, undo, backToSearch]);

  // ---- render ----
  const scanButton = (
    <button
      type="button"
      aria-label="Scan ticket QR code"
      onClick={() => setScanOpen(true)}
      className="grid h-12 w-14 place-items-center rounded-xl bg-ddg-orange text-white active:scale-95"
    >
      {lookingUp ? <Spinner size="sm" /> : <IconQr size={26} />}
    </button>
  );

  return (
    <AppShell area="Desk" staff={me?.staff} width="narrow">
      <div className="flex flex-col gap-3">
        <Card padding="md" className="flex items-center gap-3">
          <Counter
            className="flex-1"
            size="lg"
            tone="ok"
            label="Checked in"
            value={count?.checkedIn ?? 0}
            total={count?.expected ?? 0}
            hint={count
              ? `Internal ${count.internalIn}/${count.internalExpected} · Walk-ins pending ${count.walkinsPending}${offline ? " · Reconnecting…" : ""}`
              : offline ? "Reconnecting…" : "Loading…"}
          />
          <Button variant="secondary" size="md" icon={<IconUserPlus size={20} />} onClick={() => setWalkinOpen(true)}>
            Walk-in
          </Button>
        </Card>

        <SearchInput
          ref={inputRef}
          autoFocus
          value={query}
          onValueChange={(v) => {
            setQuery(v);
            if (selected) { setSelected(null); setRaceLost(false); }
          }}
          onKeyDown={onSearchKey}
          placeholder="Name, company or scan"
          trailing={scanButton}
        />

        <DeskWalkinStatus />

        <div className="min-h-[50dvh]">
          {selected ? (
            <GuestCard
              guest={selected}
              isManager={me?.role === "manager"}
              busy={busy}
              raceLost={raceLost}
              onCheckIn={(mode) => void checkIn(selected, mode)}
              onBack={backToSearch}
            />
          ) : guests === null ? (
            <div className="grid place-items-center py-10"><Spinner /></div>
          ) : query.trim() === "" ? (
            <p className="px-1 py-6 text-center text-lg text-ddg-muted">
              Type a few letters of the name or company, or scan the ticket.
            </p>
          ) : results.length === 0 ? (
            <EmptyState
              title="No match"
              detail="Try the company or another spelling. Not on the list? Register a walk-in."
              action={
                <Button variant="primary" size="lg" icon={<IconUserPlus size={20} />} onClick={() => setWalkinOpen(true)}>
                  Register walk-in
                </Button>
              }
            />
          ) : (
            <ul className="flex flex-col gap-2" aria-label="Search results">
              {results.map((g) => (
                <li key={g.registrationId}>
                  <ResultRow g={g} onOpen={() => openGuest(g, "search")} />
                </li>
              ))}
              {total > results.length && (
                <li className="px-1 pt-1 text-center text-sm text-ddg-muted">
                  {total - results.length} more – keep typing to narrow down
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      {scanOpen && <QrScanner onResult={onScan} onClose={() => { setScanOpen(false); focusSearch(); }} />}
      <WalkinSheet open={walkinOpen} onClose={() => { setWalkinOpen(false); focusSearch(); }} />
    </AppShell>
  );
}

function ResultRow({ g, onOpen }: { g: DeskGuest; onOpen: () => void }) {
  const tint = g.checkedIn ? "border-l-ok" : g.status === "do_not_admit" ? "border-l-danger"
    : g.status === "cancelled" ? "border-l-warn" : "border-l-ddg-orange";
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex min-h-[72px] w-full items-center gap-3 rounded-2xl border border-l-[6px] border-ddg-line bg-white px-4 py-3 text-left shadow-ddg transition-colors hover:border-ddg-orange active:scale-[0.99] ${tint}`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-xl leading-tight text-ddg-ink">{fullName(g)}</p>
        <p className="truncate text-sm text-ddg-muted">{g.company ?? "No company"}</p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <TypeAndWarningBadges g={g} />
        </div>
      </div>
      <div className="shrink-0">
        <StatusBadge g={g} size="md" />
      </div>
    </button>
  );
}
