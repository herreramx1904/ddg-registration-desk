"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Card, cx, EmptyState, Heading, SearchInput, Spinner } from "@/components/ui";
import type { ManagerGuest } from "@/lib/service/arrivals";
import { fold } from "@/lib/service/checkin";
import { Badges, GuestSheet, statusMeta, time } from "./GuestSheet";

type Filter = "all" | "in" | "notyet" | "cancelled" | "do_not_admit" | "vip" | "review" | "dupes";
const FILTERS: { key: Filter; label: string; test: (g: ManagerGuest) => boolean }[] = [
  { key: "all", label: "All", test: () => true },
  { key: "in", label: "Checked in", test: (g) => !!g.checkedIn },
  { key: "notyet", label: "Not yet", test: (g) => !g.checkedIn && g.status === "registered" },
  { key: "vip", label: "VIP", test: (g) => g.badges.includes("vip") },
  { key: "cancelled", label: "Cancelled", test: (g) => g.status === "cancelled" },
  { key: "do_not_admit", label: "Do not admit", test: (g) => g.status === "do_not_admit" },
  { key: "review", label: "Flagged for review", test: (g) => g.flaggedForReview },
  { key: "dupes", label: "Possible duplicates", test: (g) => g.suggestions.some((s) => s.decision === "pending") || g.linked.length > 0 },
];

export default function GuestsPage() {
  const [guests, setGuests] = useState<ManagerGuest[] | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/manager/guests", { cache: "no-store" });
      if (res.status === 401) { window.location.assign("/"); return; }
      if (res.ok) setGuests((await res.json()).guests);
    } catch {
      // next poll retries
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch + 3 s polling
    void load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  const index = useMemo(
    () => new Map((guests ?? []).map((g) => [g.registrationId, fold(`${g.name} ${g.company ?? ""} ${g.regId} ${g.clean.email ?? ""}`)])),
    [guests],
  );
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, (guests ?? []).filter(f.test).length])),
    [guests],
  );

  if (!guests) return <div className="grid place-items-center py-20"><Spinner size="lg" /></div>;

  const terms = fold(q).split(" ").filter(Boolean);
  const test = FILTERS.find((f) => f.key === filter)!.test;
  const shown = guests.filter((g) => test(g) && terms.every((t) => index.get(g.registrationId)?.includes(t)));

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-2">
        <Heading as="h1" size="xl">Guests</Heading>
        <p className="tabular text-sm text-ddg-muted">{shown.length} of {guests.length}</p>
      </div>
      <SearchInput value={q} onValueChange={setQ} placeholder="Name, company, email or Reg ID" />
      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={cx(
                "h-10 shrink-0 rounded-full px-4 text-xs uppercase tracking-[0.12em] ring-1 ring-inset",
                filter === f.key ? "bg-ddg-ink text-white ring-ddg-ink" : "bg-white text-ddg-ink ring-ddg-line hover:ring-ddg-orange",
              )}
            >
              {f.label} <span className="tabular ml-1 opacity-70">{counts[f.key]}</span>
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState title="No guests match" detail="Try another search or filter." />
      ) : (
        <Card padding="none">
          <ul className="divide-y divide-ddg-line">
            {shown.slice(0, 300).map((g) => (
              <li key={g.registrationId}>
                <button
                  type="button"
                  onClick={() => setOpenId(g.registrationId)}
                  className="grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-ddg-soft sm:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_auto]"
                >
                  <div className="min-w-0">
                    <p className="truncate">{g.name}</p>
                    <p className="truncate text-xs text-ddg-muted">{g.company ?? "No company"} · {g.regId}</p>
                  </div>
                  <div className="col-span-2 row-start-2 flex flex-wrap gap-1 sm:col-span-1 sm:row-start-auto">
                    <Badges badges={g.badges} />
                    {g.status !== "registered" && <Badge variant={statusMeta[g.status].variant}>{statusMeta[g.status].label}</Badge>}
                    {g.flaggedForReview && <Badge variant="warn">Review</Badge>}
                    {g.suggestions.some((s) => s.decision === "pending") && <Badge variant="info">Possible duplicate</Badge>}
                    {g.linked.length > 0 && <Badge variant="ok">Linked</Badge>}
                  </div>
                  <div className="col-start-2 row-start-1 text-right sm:col-start-auto sm:row-start-auto">
                    {g.checkedIn ? <Badge variant="ok" solid>In {time(g.checkedIn.at)}</Badge> : <span className="text-xs text-ddg-muted">Not in</span>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <GuestSheet registrationId={openId} onClose={() => setOpenId(null)} onChanged={load} />
    </div>
  );
}
