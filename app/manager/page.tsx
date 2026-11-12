"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Card, Counter, cx, EmptyState, Heading, Modal, Spinner, StatTile } from "@/components/ui";
import type { ArrivalItem, ArrivalsData, ExpectedPerson } from "@/lib/service/arrivals";
import { Badges, GuestSheet, time } from "./guests/GuestSheet";

type Filter = "all" | "vip" | "access" | "press" | "walkin" | "notyet";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "vip", label: "VIP" },
  { key: "access", label: "Accessibility" },
  { key: "press", label: "Press" },
  { key: "walkin", label: "Walk-ins" },
  { key: "notyet", label: "Not yet arrived" },
];

const tileTone: Record<string, "vip" | "access" | "purple" | "orange" | "ok"> = {
  vip: "vip", access: "access", press: "purple", speaker: "orange", internal: "purple",
};
const viaLabel: Record<ArrivalItem["via"], string> = { search: "Search", qr: "QR", manager: "Manager", walkin: "Walk-in" };

export default function ArrivalsPage() {
  const [data, setData] = useState<ArrivalsData | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [walkin, setWalkin] = useState<ArrivalItem | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/manager/arrivals", { cache: "no-store" });
      if (res.status === 401) { window.location.assign("/"); return; }
      if (!res.ok) { setError(true); return; }
      setData(await res.json());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch + 3 s polling
    void load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  if (!data) {
    return (
      <div className="grid place-items-center py-20">
        {error ? <p className="text-sm text-ddg-muted">Can&apos;t reach the server. Retrying…</p> : <Spinner size="lg" />}
      </div>
    );
  }

  const c = data.counter;
  const feed = data.feed.filter((f) =>
    filter === "all" ? true : filter === "walkin" ? f.kind === "walkin" : f.badges.includes(filter as "vip" | "access" | "press"),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <Heading as="h1" size="xl">Arrivals</Heading>
        <p className="text-xs text-ddg-muted">
          {error ? "Connection lost, retrying" : `Live · updated ${time(data.generatedAt)}`}
        </p>
      </div>

      <Card padding="lg" className="grid gap-5 sm:grid-cols-[1.4fr_1fr]">
        <Counter
          size="lg"
          value={c.checkedIn}
          total={c.expected}
          label="Guests checked in"
          hint={`+ ${c.walkinsApproved} walk-ins approved${c.walkinsPending ? ` · ${c.walkinsPending} pending` : ""}`}
        />
        <Counter value={c.internalIn} total={c.internalExpected} label="Internal staff (separate)" tone="purple" size="sm" />
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {data.byType.map((t) => (
          <StatTile key={t.key} size="sm" value={t.arrived} total={t.expected} label={t.label} tone={tileTone[t.key] ?? "ok"} />
        ))}
      </div>

      {data.vipsExpected.length > 0 && (
        <Card accent="vip" padding="md">
          <h2 className="text-[11px] uppercase tracking-[0.16em] text-vip-strong">VIPs still expected ({data.vipsExpected.length})</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {data.vipsExpected.map((p) => (
              <li key={p.personId}>
                <button
                  type="button"
                  onClick={() => setOpenId(p.registrationId)}
                  className="rounded-full bg-vip-soft px-3 py-1.5 text-left text-sm text-vip-strong hover:bg-vip/20"
                >
                  {p.name}
                  {p.company && <span className="text-vip-strong/70"> · {p.company}</span>}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={cx(
                "h-10 shrink-0 rounded-full px-4 text-xs uppercase tracking-[0.12em] ring-1 ring-inset transition-colors",
                filter === f.key ? "bg-ddg-ink text-white ring-ddg-ink" : "bg-white text-ddg-ink ring-ddg-line hover:ring-ddg-orange",
              )}
            >
              {f.label}
              {f.key === "notyet" && <span className="tabular ml-1.5 opacity-70">{data.notArrived.length}</span>}
            </button>
          ))}
        </div>
      </div>

      {filter === "notyet" ? (
        <NotArrived people={data.notArrived} onOpen={setOpenId} />
      ) : feed.length === 0 ? (
        <EmptyState title="No arrivals yet" detail="Check-ins appear here within a few seconds." />
      ) : (
        <ul className="space-y-2">
          {feed.map((f) => (
            <li key={f.key}>
              <button
                type="button"
                onClick={() => (f.registrationId ? setOpenId(f.registrationId) : setWalkin(f))}
                className="w-full text-left"
              >
                <Card
                  padding="sm"
                  accent={f.override ? (f.override === "manager_override" ? "danger" : "warn") : f.badges.includes("vip") ? "vip" : f.badges.includes("access") ? "access" : "ok"}
                  className="flex items-center gap-3 transition-shadow hover:shadow-ddg-lg"
                >
                  <span className="tabular w-12 shrink-0 text-lg text-ddg-ink">{time(f.at)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base">
                      {f.name}
                      {f.company && <span className="text-ddg-muted"> · {f.company}</span>}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badges badges={f.badges} />
                      {f.override === "cancelled_admitted" && <Badge variant="warn" solid>Cancelled but admitted</Badge>}
                      {f.override === "manager_override" && <Badge variant="danger" solid>Manager override</Badge>}
                      <span className="text-xs text-ddg-muted">
                        {f.guestType} · {f.kind === "walkin" ? `by ${f.staff}${f.decidedBy ? `, approved by ${f.decidedBy}` : ""}` : `${f.staff} · ${viaLabel[f.via]}`}
                      </span>
                    </div>
                  </div>
                </Card>
              </button>
            </li>
          ))}
        </ul>
      )}

      <GuestSheet registrationId={openId} onClose={() => setOpenId(null)} onChanged={load} />
      <Modal
        open={!!walkin}
        onClose={() => setWalkin(null)}
        variant="dialog"
        size="sm"
        title={walkin?.name ?? "Walk-in"}
        description={walkin ? [walkin.company, walkin.guestType].filter(Boolean).join(" · ") : undefined}
      >
        {walkin && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 pb-4 text-sm">
            <dt className="text-ddg-muted">Reason</dt><dd>{walkin.reason || "None given"}</dd>
            <dt className="text-ddg-muted">Registered by</dt><dd>{walkin.staff}</dd>
            <dt className="text-ddg-muted">Approved by</dt><dd>{walkin.decidedBy ?? "Unknown"}</dd>
            <dt className="text-ddg-muted">Approved at</dt><dd>{time(walkin.at)}</dd>
          </dl>
        )}
      </Modal>
    </div>
  );
}

function NotArrived({ people, onOpen }: { people: ExpectedPerson[]; onOpen: (id: string) => void }) {
  if (people.length === 0) return <EmptyState title="Everyone is here" detail="All expected guests have checked in." />;
  return (
    <Card padding="none">
      <ul className="divide-y divide-ddg-line">
        {people.map((p) => (
          <li key={p.personId}>
            <button type="button" onClick={() => onOpen(p.registrationId)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-ddg-soft">
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  {p.name}
                  {p.company && <span className="text-ddg-muted"> · {p.company}</span>}
                </p>
                <p className="text-xs text-ddg-muted">{p.guestType} · {p.regId}</p>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1"><Badges badges={p.badges} /></div>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
