"use client";
// Top-of-page manager alerts: polls every 3 s, chimes on new alerts, "On my way" / "Done".
import { useCallback, useEffect, useRef, useState } from "react";
import { Banner, Button, IconCheck, cx, type BannerVariant } from "@/components/ui";

interface Alert {
  id: string;
  kind: "arrival" | "help";
  tone: "vip" | "access" | "help";
  reason: string | null;
  raisedBy: string;
  status: "open" | "acknowledged" | "handled";
  createdAt: string;
  acknowledgedBy: string | null;
  guest: null | { registrationId: string; regId: string; name: string; company: string | null; guestType: string };
}

const VISIBLE = 3;
const variantOf: Record<Alert["tone"], BannerVariant> = { vip: "vip", access: "access", help: "warn" };

function ago(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min ago`;
}

function titleOf(a: Alert) {
  const who = a.guest?.name;
  if (a.kind === "help") return who ? `Desk needs you: ${who}` : "Desk needs a manager";
  const what = a.tone === "access" ? "Accessibility guest arrived" : "VIP arrived";
  return who ? `${what}: ${who}` : what;
}

/** Short pleasant two-tone chime. Only after the page has had a user gesture (autoplay rules). */
function useChime() {
  const ctx = useRef<AudioContext | null>(null);
  useEffect(() => {
    const unlock = () => {
      try {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        ctx.current ??= new AC();
        void ctx.current.resume();
      } catch { /* no audio */ }
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  }, []);
  useEffect(() => () => { void ctx.current?.close().catch(() => {}); }, []);

  return useCallback(() => {
    try { navigator.vibrate?.([80, 40, 80]); } catch { /* unsupported */ }
    const ac = ctx.current;
    if (!ac || ac.state !== "running") return;
    try {
      const t0 = ac.currentTime;
      [[880, 0], [1318.5, 0.16]].forEach(([freq, at]) => {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t0 + at);
        gain.gain.exponentialRampToValueAtTime(0.25, t0 + at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.28);
        osc.connect(gain).connect(ac.destination);
        osc.start(t0 + at);
        osc.stop(t0 + at + 0.3);
      });
    } catch { /* ignore audio errors */ }
  }, []);
}

export function ManagerAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [now, setNow] = useState(0);
  const [allowed, setAllowed] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const chime = useChime();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/manager/alerts", { cache: "no-store" });
      if (res.status === 401 || res.status === 403) { setAllowed(false); return; }
      if (!res.ok) return;
      const { alerts: list } = (await res.json()) as { alerts: Alert[] };
      const first = seen.current === null;
      const known = seen.current ?? new Set<string>();
      const fresh = list.some((a) => !known.has(a.id));
      seen.current = new Set([...known, ...list.map((a) => a.id)]);
      if (fresh && !first) chime();
      setAlerts(list);
      setNow(Date.now());
    } catch { /* network blip; next poll will retry */ }
  }, [chime]);

  useEffect(() => {
    if (!allowed) return;
    const first = setTimeout(load, 0);
    const t = setInterval(load, 3000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [allowed, load]);

  async function act(id: string, action: "acknowledge" | "handle") {
    setBusy(`${id}:${action}`);
    try {
      const res = await fetch("/api/manager/alerts", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, action }),
      });
      if (res.ok && action === "handle") setAlerts((l) => l.filter((a) => a.id !== id));
      await load();
    } catch { /* keep it on screen; the manager can retry */ }
    finally { setBusy(null); }
  }

  if (!allowed || alerts.length === 0) return null;
  const shown = expanded ? alerts : alerts.slice(0, VISIBLE);
  const hidden = alerts.length - shown.length;

  return (
    <section aria-label="Open alerts" className="flex flex-col gap-2">
      {shown.map((a) => {
        const guestLine = a.guest ? [a.guest.company, a.guest.guestType].filter(Boolean).join(" · ") : null;
        const who = a.kind === "help" ? `Called by ${a.raisedBy}` : `Checked in by ${a.raisedBy}`;
        return (
          <Banner
            key={a.id}
            variant={variantOf[a.tone]}
            title={titleOf(a)}
            detail={
              <>
                {guestLine && <span className="block font-semibold">{guestLine}</span>}
                {a.reason && <span className="block">{a.reason}</span>}
                <span className="block text-sm text-white/85">
                  {who}, {ago(a.createdAt, now)}
                  {a.status === "acknowledged" && a.acknowledgedBy ? ` · ${a.acknowledgedBy} is on the way` : ""}
                </span>
              </>
            }
            action={
              <div className="flex gap-2">
                {a.status === "open" && (
                  <Button size="sm" variant="secondary" className="flex-1 sm:flex-none"
                    loading={busy === `${a.id}:acknowledge`} disabled={!!busy} onClick={() => act(a.id, "acknowledge")}>
                    On my way
                  </Button>
                )}
                <Button size="sm" variant={a.status === "open" ? "ghost" : "secondary"}
                  className={cx("flex-1 sm:flex-none", a.status === "open" && "border-2 border-white/70 text-white hover:bg-white/15")}
                  icon={<IconCheck size={16} />}
                  loading={busy === `${a.id}:handle`} disabled={!!busy} onClick={() => act(a.id, "handle")}>
                  Done
                </Button>
              </div>
            }
          />
        );
      })}
      {(hidden > 0 || expanded) && alerts.length > VISIBLE && (
        <Button size="sm" variant="ghost" className="self-start" onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Show fewer" : `Show ${hidden} more alert${hidden === 1 ? "" : "s"}`}
        </Button>
      )}
    </section>
  );
}
