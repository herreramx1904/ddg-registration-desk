"use client";

import type { DeskGuest } from "@/lib/domain/types";
import { Badge, Banner, Button, Card, IconCheck, IconClose } from "@/components/ui";
import { CallManagerButton } from "@/components/alerts/CallManagerButton";
import { StatusBadge, TypeAndWarningBadges } from "./GuestBadges";
import { accessFlags, extraNote, fullName, infoFlags, timeOf, vipFlag } from "./search";

export type CheckInMode = "normal" | "confirmCancelled" | "managerOverride";

export interface GuestCardProps {
  guest: DeskGuest;
  isManager: boolean;
  busy: boolean;
  /** Set when a check-in attempt just lost a race with another desk. */
  raceLost?: boolean;
  onCheckIn: (mode: CheckInMode) => void;
  onBack: () => void;
}

export function GuestCard({ guest: g, isManager, busy, raceLost, onCheckIn, onBack }: GuestCardProps) {
  const name = fullName(g);
  const vip = vipFlag(g);
  const access = accessFlags(g);
  const info = infoFlags(g);
  const note = extraNote(g);
  const accent = g.checkedIn ? "ok" : g.status === "do_not_admit" ? "danger" : g.status === "cancelled" ? "warn"
    : vip ? "vip" : access.length ? "access" : "orange";

  return (
    <section aria-label={`Guest ${name}`} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="md" icon={<IconClose size={20} />} onClick={onBack}>
          Back to search
        </Button>
        <CallManagerButton registrationId={g.registrationId} guestName={name} compact />
      </div>

      {vip && (
        <Banner
          variant="vip"
          title={vip.label || "VIP"}
          detail={vip.detail ?? "Give them a personal welcome"}
          action={<CallManagerButton registrationId={g.registrationId} guestName={name} compact />}
        />
      )}
      {access.map((f, i) => (
        <Banner
          key={i}
          variant="access"
          title={f.label}
          detail={f.detail}
          action={<CallManagerButton registrationId={g.registrationId} guestName={name} compact />}
        />
      ))}

      <Card accent={accent} padding="lg">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="break-words text-3xl leading-tight text-ddg-ink sm:text-4xl">{name}</h2>
            {g.company && <p className="mt-1 break-words text-lg text-ddg-muted">{g.company}</p>}
          </div>
          <StatusBadge g={g} size="md" />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <TypeAndWarningBadges g={g} size="md" />
          {g.breakout && <Badge size="md" variant="brand">Breakout {g.breakout}</Badge>}
          {info.map((f, i) => (
            <Badge key={i} size="md" variant="info">{f.detail ? `${f.label} ${f.detail}` : f.label}</Badge>
          ))}
          <Badge size="md" variant="neutral" className="tabular">{g.regId}</Badge>
        </div>
        {note && <p className="mt-3 rounded-xl bg-ddg-soft px-3 py-2 text-base text-ddg-ink">{note}</p>}
        {g.linkedRegIds.length > 0 && (
          <p className="mt-3 text-sm text-ddg-muted">
            Same person as {g.linkedRegIds.join(", ")}. One check-in covers both.
          </p>
        )}
      </Card>

      <StatusAction g={g} name={name} isManager={isManager} busy={busy} raceLost={raceLost} onCheckIn={onCheckIn} />
    </section>
  );
}

function StatusAction({ g, name, isManager, busy, raceLost, onCheckIn }: {
  g: DeskGuest; name: string; isManager: boolean; busy: boolean; raceLost?: boolean; onCheckIn: (m: CheckInMode) => void;
}) {
  if (g.checkedIn) {
    return (
      <Banner
        variant="ok"
        title={`Already checked in at ${timeOf(g.checkedIn.at)}`}
        detail={`By ${g.checkedIn.staff}.${raceLost ? " Another desk got there first." : " No need to do anything."}`}
      />
    );
  }
  if (g.status === "do_not_admit") {
    return (
      <div className="flex flex-col gap-3">
        <Banner
          variant="danger"
          title="Do not admit"
          detail="A manager must decide. Please ask the guest to wait a moment."
          action={<CallManagerButton registrationId={g.registrationId} guestName={name} />}
        />
        {isManager && (
          <Button variant="danger" size="xl" loading={busy} onClick={() => onCheckIn("managerOverride")}>
            Manager override – admit
          </Button>
        )}
      </div>
    );
  }
  if (g.status === "cancelled") {
    return (
      <div className="flex flex-col gap-3">
        <Banner variant="warn" title="Cancelled" detail="They told us they would not come. Confirm only if they are here now." />
        <Button variant="warn" size="xl" loading={busy} onClick={() => onCheckIn("confirmCancelled")}>
          Confirm entry
        </Button>
      </div>
    );
  }
  return (
    <Button variant="success" size="xl" loading={busy} icon={<IconCheck size={30} strokeWidth={3} />} onClick={() => onCheckIn("normal")}>
      Check in
    </Button>
  );
}
