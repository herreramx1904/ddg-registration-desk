"use client";
// Desk "Call manager": one tap raises a help alert, then polls its state every 3 s.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, IconCheck, IconPhone, Spinner, cx } from "@/components/ui";

export interface CallManagerButtonProps { registrationId: string | null; guestName: string; compact?: boolean }

type Status = "open" | "acknowledged" | "handled";
type Call = { id: string; status: Status; acknowledgedBy: string | null };

export function CallManagerButton({ registrationId, guestName, compact }: CallManagerButtonProps) {
  const router = useRouter();
  const [call, setCall] = useState<Call | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A different guest on the same card: forget the previous call.
  const [forGuest, setForGuest] = useState(registrationId);
  if (forGuest !== registrationId) { setForGuest(registrationId); setCall(null); setError(null); }

  const callId = call?.id ?? null;
  const done = call?.status === "handled";

  useEffect(() => {
    if (!callId || done) return;
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/alerts?id=${encodeURIComponent(callId)}`, { cache: "no-store" });
        if (res.status === 401) { router.replace("/"); return; }
        if (!res.ok) return;
        const s = (await res.json()) as { status: Status; acknowledgedBy: string | null };
        if (alive) setCall((c) => (c && c.id === callId ? { ...c, ...s } : c));
      } catch { /* offline for a moment; keep polling */ }
    };
    const t = setInterval(poll, 3000);
    return () => { alive = false; clearInterval(t); };
  }, [callId, done, router]);

  async function press() {
    setSending(true); setError(null);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ registrationId, reason: guestName ? `Help with ${guestName}` : undefined }),
      });
      if (res.status === 401) { router.replace("/"); return; }
      if (!res.ok) throw new Error();
      const { id } = (await res.json()) as { id: string };
      setCall({ id, status: "open", acknowledgedBy: null });
    } catch {
      setError("Could not reach a manager. Try again.");
    } finally {
      setSending(false);
    }
  }

  const active = call && call.status !== "handled";

  return (
    <div className={cx("flex flex-col gap-2", compact ? "items-start" : "w-full")}>
      <Button
        variant="secondary"
        size={compact ? "sm" : "md"}
        fullWidth={!compact}
        icon={<IconPhone size={compact ? 16 : 20} />}
        loading={sending}
        disabled={!!active}
        onClick={press}
      >
        {active ? "Manager called" : done ? "Call again" : "Call manager"}
      </Button>
      {call && <CallState call={call} />}
      {error && <p role="alert" className="text-sm font-semibold text-danger-strong">{error}</p>}
    </div>
  );
}

function CallState({ call }: { call: Call }) {
  const base = "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold";
  if (call.status === "open") {
    return (
      <p role="status" aria-live="polite" className={cx(base, "bg-warn-soft text-warn-strong")}>
        <Spinner size="sm" label="Waiting" /> Waiting for a manager…
      </p>
    );
  }
  if (call.status === "acknowledged") {
    return (
      <p role="status" aria-live="polite" className={cx(base, "bg-ok-soft text-ok-strong")}>
        <IconCheck size={16} /> {call.acknowledgedBy ?? "A manager"} is coming
      </p>
    );
  }
  return (
    <p role="status" aria-live="polite" className={cx(base, "bg-ddg-soft text-ddg-muted")}>
      <IconCheck size={16} /> Handled{call.acknowledgedBy ? ` by ${call.acknowledgedBy}` : ""}
    </p>
  );
}
