"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge, FilterChips, Heading, Kpi, KpiRow, Modal, Section, Spinner, Table, type Column,
} from "@/components/ui";
import type { ArrivalItem, ArrivalsData, ExpectedPerson } from "@/lib/service/arrivals";
import type { ManagerAlert } from "@/lib/service/alerts";
import type { ManagerWalkin } from "@/lib/service/walkins";
import { Badges, GuestSheet, time } from "./guests/GuestSheet";

type Filter = "all" | "vip" | "access" | "press" | "walkin" | "exceptions";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "vip", label: "VIP" },
  { key: "access", label: "Accessibility" },
  { key: "press", label: "Press" },
  { key: "walkin", label: "Walk-ins" },
  { key: "exceptions", label: "Exceptions" },
];
const viaLabel: Record<ArrivalItem["via"], string> = { search: "Search", qr: "QR", manager: "Manager", walkin: "Walk-in" };

export default function ArrivalsPage() {
  const [data, setData] = useState<ArrivalsData | null>(null);
  const [walkins, setWalkins] = useState<ManagerWalkin[]>([]);
  const [alerts, setAlerts] = useState<ManagerAlert[]>([]);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [walkin, setWalkin] = useState<ArrivalItem | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, w, al] = await Promise.all([
        fetch("/api/manager/arrivals", { cache: "no-store" }),
        fetch("/api/manager/walkins", { cache: "no-store" }).catch(() => null),
        fetch("/api/manager/alerts", { cache: "no-store" }).catch(() => null),
      ]);
      if (a.status === 401) { window.location.assign("/"); return; }
      if (!a.ok) { setError(true); return; }
      setData(await a.json());
      if (w?.ok) setWalkins((await w.json()).walkins ?? []);
      if (al?.ok) setAlerts((await al.json()).alerts ?? []);
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

  const columns = useMemo<Column<ArrivalItem>[]>(() => [
    { key: "at", header: "Time", width: "3.5rem", render: (f) => <span className="tabular">{time(f.at)}</span> },
    {
      key: "guest", header: "Guest",
      render: (f) => (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-semibold text-ddg-ink">{f.name}</span>
          <span className="flex shrink-0 gap-1">
            <Badges badges={f.badges} />
            {f.override === "cancelled_admitted" && <Badge variant="warn">Cancelled, admitted</Badge>}
            {f.override === "manager_override" && <Badge variant="danger">Manager override</Badge>}
          </span>
        </span>
      ),
    },
    { key: "company", header: "Company", hideBelow: "sm", render: (f) => <span className="truncate text-ddg-muted">{f.company ?? ""}</span> },
    { key: "staff", header: "Desk", hideBelow: "md", render: (f) => <span className="text-ddg-muted">{f.staff}</span> },
    { key: "via", header: "Via", hideBelow: "md", width: "5rem", render: (f) => <span className="text-ddg-muted">{viaLabel[f.via]}</span> },
  ], []);

  if (!data) {
    return (
      <div className="grid place-items-center py-20">
        {error ? <p className="text-sm text-ddg-muted">Can&apos;t reach the server. Retrying…</p> : <Spinner size="lg" />}
      </div>
    );
  }

  const k = data.kpis;
  const feed = data.feed.filter((f) =>
    filter === "all" ? true
      : filter === "walkin" ? f.kind === "walkin"
      : filter === "exceptions" ? f.override !== null
      : f.badges.includes(filter),
  );
  const pendingWalkins = walkins.filter((w) => w.status === "pending");
  const openAlerts = alerts.filter((a) => a.status !== "handled");
  const attention = pendingWalkins.length + openAlerts.length + data.exceptions.length;
  const checkinTimes = data.feed.filter((f) => f.kind === "checkin").map((f) => f.at);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Heading as="h1" size="md">Arrivals</Heading>
        <p className="text-sm text-ddg-muted">
          {error ? "Connection lost, retrying" : `Live · updated ${time(data.generatedAt)}`}
        </p>
      </div>

      <KpiRow>
        <Kpi label="Guests checked in" value={k.guestsIn} total={k.guestsExpected} tone="ok" hint="Eligible people, internal excluded" />
        <Kpi label="VIPs checked in" value={k.vipsIn} total={k.vipsExpected} tone="vip" hint={`${k.vipsExpected - k.vipsIn} still expected`} />
        <Kpi label="Internal staff" value={k.internalIn} total={k.internalExpected} hint="Counted separately" />
        <Kpi label="Approved walk-ins" value={k.walkinsApproved} hint={k.walkinsPending ? `${k.walkinsPending} pending approval` : "Not part of guest count"} tone={k.walkinsPending ? "warn" : "neutral"} />
      </KpiRow>

      <Section
        title="Needs attention"
        actions={<span className="tabular text-sm text-ddg-muted">{attention}</span>}
      >
        {attention === 0 ? (
          <p className="text-sm text-ddg-muted">Nothing waiting. Pending walk-ins, open desk requests and admission exceptions appear here.</p>
        ) : (
          <ul className="divide-y divide-ddg-line text-sm">
            {pendingWalkins.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-2 py-2 first:pt-0 last:pb-0">
                <Badge variant="warn">Walk-in pending</Badge>
                <span className="font-semibold">{w.firstName} {w.lastName}</span>
                {w.company && <span className="text-ddg-muted">{w.company}</span>}
                <span className="text-ddg-muted">· {w.reason}</span>
                <span className="ml-auto flex items-center gap-2 text-xs text-ddg-muted">
                  <span className="tabular">{time(w.createdAt)} by {w.registeredBy}</span>
                  <Link href="/manager/walkins" className="font-medium text-ddg-orange-dark underline">Decide</Link>
                </span>
              </li>
            ))}
            {openAlerts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 py-2 first:pt-0 last:pb-0">
                <Badge variant={a.tone === "vip" ? "vip" : a.tone === "access" ? "access" : "info"}>
                  {a.status === "acknowledged" ? "Acknowledged" : "Desk request"}
                </Badge>
                {a.guest ? (
                  <button type="button" className="font-semibold underline-offset-2 hover:underline" onClick={() => setOpenId(a.guest!.registrationId)}>
                    {a.guest.name}
                  </button>
                ) : <span className="font-semibold">Desk</span>}
                {a.reason && <span className="text-ddg-muted">· {a.reason}</span>}
                <span className="ml-auto tabular text-xs text-ddg-muted">{time(a.createdAt)} by {a.raisedBy}</span>
              </li>
            ))}
            {data.exceptions.map((e) => (
              <li key={e.key} className="flex flex-wrap items-center gap-2 py-2 first:pt-0 last:pb-0">
                <Badge variant={e.override === "manager_override" ? "danger" : "warn"}>
                  {e.override === "manager_override" ? "Do-not-admit overridden" : "Cancelled but admitted"}
                </Badge>
                <button type="button" className="font-semibold underline-offset-2 hover:underline" onClick={() => e.registrationId && setOpenId(e.registrationId)}>
                  {e.name}
                </button>
                {e.company && <span className="text-ddg-muted">{e.company}</span>}
                <span className="ml-auto tabular text-xs text-ddg-muted">{time(e.at)} by {e.staff}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {checkinTimes.length > 0 && (
        <Section title="Arrival activity" description="Check-ins per 15 minutes">
          <ActivityChart times={checkinTimes} />
        </Section>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <Section
          title="Recent arrivals"
          actions={<span className="tabular text-sm text-ddg-muted">{feed.length}</span>}
          className="min-w-0"
        >
          <div className="mb-3">
            <FilterChips
              options={FILTERS.map((f) => ({
                value: f.key, label: f.label,
                count: f.key === "exceptions" ? data.exceptions.length : f.key === "walkin" ? k.walkinsApproved : undefined,
              }))}
              value={filter}
              onChange={(v) => setFilter(v as Filter)}
            />
          </div>
          <Table<ArrivalItem>
            columns={columns}
            rows={feed.slice(0, 200)}
            rowKey={(f) => f.key}
            dense
            onRowClick={(f) => (f.registrationId ? setOpenId(f.registrationId) : setWalkin(f))}
            empty={<span>No arrivals yet. Check-ins appear here within a few seconds.</span>}
          />
        </Section>

        <Section
          title="VIPs expected"
          actions={<span className="tabular text-sm text-ddg-muted">{data.vipsExpected.length}</span>}
          className="min-w-0"
        >
          <VipList people={data.vipsExpected} onOpen={setOpenId} />
        </Section>
      </div>

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
            <dt className="text-ddg-muted">Approved at</dt><dd className="tabular">{time(walkin.at)}</dd>
          </dl>
        )}
      </Modal>
    </div>
  );
}

function VipList({ people, onOpen }: { people: ExpectedPerson[]; onOpen: (id: string) => void }) {
  if (people.length === 0) return <p className="text-sm text-ddg-muted">All VIPs have arrived.</p>;
  return (
    <ul className="-mx-3 -my-1 divide-y divide-ddg-line">
      {people.map((p) => (
        <li key={p.personId}>
          <button
            type="button"
            onClick={() => onOpen(p.registrationId)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-ddg-soft focus-visible:bg-ddg-soft"
          >
            <span className="min-w-0 flex-1 truncate">
              <span className="font-semibold text-ddg-ink">{p.name}</span>
              {p.company && <span className="text-ddg-muted"> · {p.company}</span>}
            </span>
            {p.badges.includes("access") && <Badge variant="access">Accessibility</Badge>}
            {p.deskNote && <Badge variant="neutral" title={p.deskNote}>Note</Badge>}
          </button>
        </li>
      ))}
    </ul>
  );
}

const BUCKET = 15 * 60 * 1000;

/** Check-ins per 15-minute bucket, from the first to the last real check-in. Inline SVG, no library. */
function ActivityChart({ times }: { times: string[] }) {
  const ms = times.map((t) => new Date(t).getTime()).filter((n) => Number.isFinite(n));
  if (ms.length === 0) return null;
  const start = Math.floor(Math.min(...ms) / BUCKET) * BUCKET;
  const end = Math.floor(Math.max(...ms) / BUCKET) * BUCKET;
  const n = Math.min(Math.max(1, (end - start) / BUCKET + 1), 96);
  const counts = new Array<number>(n).fill(0);
  for (const t of ms) { const i = Math.floor((t - start) / BUCKET); if (i >= 0 && i < n) counts[i]++; }
  const max = Math.max(...counts, 1);
  const W = 720, H = 120, padL = 24, padB = 18, padT = 6;
  const innerW = W - padL - 4, innerH = H - padB - padT;
  const bw = innerW / n;
  const labelEvery = Math.max(1, Math.ceil(n / 8));
  const hhmm = (t: number) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full" role="img" aria-label={`Check-ins per 15 minutes, peak ${max}`}>
      <text x={padL - 4} y={padT + 8} textAnchor="end" className="fill-ddg-muted" fontSize="10">{max}</text>
      <text x={padL - 4} y={padT + innerH} textAnchor="end" className="fill-ddg-muted" fontSize="10">0</text>
      <line x1={padL} x2={W - 4} y1={padT + innerH} y2={padT + innerH} className="stroke-ddg-line" strokeWidth="1" />
      {counts.map((c, i) => {
        const h = (c / max) * innerH;
        const x = padL + i * bw;
        return (
          <g key={i}>
            <rect x={x + 1} y={padT + innerH - h} width={Math.max(1, bw - 2)} height={h} rx="2" className="fill-ddg-orange">
              <title>{`${hhmm(start + i * BUCKET)}: ${c}`}</title>
            </rect>
            {i % labelEvery === 0 && (
              <text x={x + bw / 2} y={H - 4} textAnchor="middle" className="fill-ddg-muted tabular" fontSize="10">
                {hhmm(start + i * BUCKET)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
