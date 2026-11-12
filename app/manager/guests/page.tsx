"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, FilterChips, Heading, SearchInput, Spinner, Table, type Column } from "@/components/ui";
import type { ManagerGuest } from "@/lib/service/arrivals";
import { fold } from "@/lib/service/checkin";
import { Badges, checkinLabel, GuestSheet } from "./GuestSheet";

type Filter = "all" | "in" | "notyet" | "vip" | "review" | "dupes" | "restricted";
const FILTERS: { key: Filter; label: string; test: (g: ManagerGuest) => boolean }[] = [
  { key: "all", label: "All", test: () => true },
  { key: "in", label: "Checked in", test: (g) => !!g.checkedIn },
  { key: "notyet", label: "Not yet", test: (g) => !g.checkedIn && g.status === "registered" },
  { key: "vip", label: "VIP", test: (g) => g.badges.includes("vip") },
  { key: "review", label: "Flagged for review", test: (g) => g.flaggedForReview },
  { key: "dupes", label: "Possible duplicate", test: (g) => g.suggestions.some((s) => s.decision === "pending") },
  { key: "restricted", label: "Cancelled / Do not admit", test: (g) => g.status !== "registered" },
];

type Sort = { key: string; dir: "asc" | "desc" };
const statusRank = (g: ManagerGuest) => (g.checkedIn ? 0 : g.status === "registered" ? 1 : g.status === "cancelled" ? 2 : 3);

export default function GuestsPage() {
  const [guests, setGuests] = useState<ManagerGuest[] | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>({ key: "name", dir: "asc" });
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

  const columns = useMemo<Column<ManagerGuest>[]>(() => [
    {
      key: "name", header: "Name", sortable: true,
      render: (g) => (
        <span className="block min-w-0">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-semibold text-ddg-ink">{g.name}</span>
            <span className="flex shrink-0 gap-1"><Badges badges={g.badges.filter((b) => b === "vip" || b === "access")} /></span>
          </span>
          {g.company && <span className="block truncate text-xs text-ddg-muted sm:hidden">{g.company}</span>}
        </span>
      ),
    },
    { key: "company", header: "Company", sortable: true, hideBelow: "sm", render: (g) => <span className="truncate">{g.company ?? <span className="text-ddg-muted">None</span>}</span> },
    { key: "type", header: "Guest type", hideBelow: "md", render: (g) => <span className="text-ddg-muted">{g.guestType}</span> },
    {
      key: "flags", header: "Flags", hideBelow: "md",
      render: (g) => {
        const data = g.flags.filter((f) => f.severity === "data").length;
        const pending = g.suggestions.filter((s) => s.decision === "pending").length;
        return (
          <span className="flex flex-wrap gap-1">
            {g.badges.filter((b) => b === "press" || b === "speaker" || b === "internal").length > 0 && (
              <Badges badges={g.badges.filter((b) => b === "press" || b === "speaker" || b === "internal")} />
            )}
            {data > 0 && <Badge variant="warn">{data} to review</Badge>}
            {pending > 0 && <Badge variant="warn">Possible duplicate</Badge>}
            {g.linked.length > 0 && <Badge variant="ok">Linked</Badge>}
            {g.regIdGenerated && <Badge variant="neutral">Generated ID</Badge>}
          </span>
        );
      },
    },
    {
      key: "status", header: "Check-in", sortable: true, width: "9.5rem",
      render: (g) => { const c = checkinLabel(g); return <Badge variant={c.variant} solid={!!g.checkedIn}>{c.label}</Badge>; },
    },
    { key: "regId", header: "Reg ID", hideBelow: "lg", width: "7rem", render: (g) => <span className="font-mono text-xs text-ddg-muted">{g.regId}</span> },
  ], []);

  if (!guests) return <div className="grid place-items-center py-20"><Spinner size="lg" /></div>;

  const terms = fold(q).split(" ").filter(Boolean);
  const test = FILTERS.find((f) => f.key === filter)!.test;
  const dir = sort.dir === "asc" ? 1 : -1;
  const shown = guests
    .filter((g) => test(g) && terms.every((t) => index.get(g.registrationId)?.includes(t)))
    .sort((a, b) => {
      if (sort.key === "company") return dir * (a.company ?? "").localeCompare(b.company ?? "") || a.name.localeCompare(b.name);
      if (sort.key === "status") return dir * (statusRank(a) - statusRank(b)) || a.name.localeCompare(b.name);
      return dir * a.name.localeCompare(b.name);
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Heading as="h1" size="md">Guests</Heading>
        <p className="tabular text-sm text-ddg-muted">{shown.length} of {guests.length}</p>
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="lg:w-80 lg:shrink-0">
          <SearchInput size="sm" value={q} onValueChange={setQ} placeholder="Name, company, email or Reg ID" />
        </div>
        <FilterChips
          options={FILTERS.map((f) => ({ value: f.key, label: f.label, count: counts[f.key] }))}
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
        />
      </div>

      <Table<ManagerGuest>
        columns={columns}
        rows={shown.slice(0, 400)}
        rowKey={(g) => g.registrationId}
        onRowClick={(g) => setOpenId(g.registrationId)}
        selectedKey={openId}
        sort={sort}
        onSortChange={setSort}
        stickyHeader
        empty={<span>No guests match. Try another search or filter.</span>}
      />

      <GuestSheet registrationId={openId} onClose={() => setOpenId(null)} onChanged={load} />
    </div>
  );
}
