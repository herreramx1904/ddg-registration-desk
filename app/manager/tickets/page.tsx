"use client";
// Manager > Tickets (T7). Ticket links per guest: open, show QR, reissue, CSV export.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppShell, Badge, Button, Card, EmptyState, Heading, IconQr, Modal, SearchInput, Spinner, buttonClasses, useToast,
} from "@/components/ui";
import { managerNav } from "@/components/manager/nav";
import { ManagerAlerts } from "@/components/alerts/ManagerAlerts";
import { QrCode } from "@/components/qr/QrCode";

interface Ticket {
  registrationId: string;
  regId: string;
  firstName: string;
  lastName: string;
  company: string | null;
  guestType: string;
  url: string;
}

function toLogin() {
  // Full reload on purpose (team rule): drops client state.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = "/";
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function TicketsPage() {
  const { toast } = useToast();
  const [staff, setStaff] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [showQr, setShowQr] = useState<Ticket | null>(null);
  const [confirm, setConfirm] = useState<Ticket | null>(null);
  const [reissuing, setReissuing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/manager/tickets", { cache: "no-store" });
      if (res.status === 401 || res.status === 403) {
        toLogin();
        return;
      }
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { tickets: Ticket[] };
      setTickets(data.tickets);
      setLoadError(null);
    } catch {
      setLoadError("Couldn't load the tickets. Retrying.");
    }
  }, []);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) { toLogin(); return; }
        const me = (await r.json()) as { role?: string; staff?: string };
        if (me.role !== "manager") { toLogin(); return; }
        setStaff(me.staff ?? null);
      })
      .catch(() => {});
    const first = setTimeout(load, 0);
    const id = setInterval(load, 3000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [load]);

  const shown = useMemo(() => {
    if (!tickets) return [];
    const needle = fold(q.trim());
    if (!needle) return tickets;
    return tickets.filter((t) =>
      fold(`${t.firstName} ${t.lastName} ${t.lastName} ${t.firstName} ${t.company ?? ""} ${t.regId}`).includes(needle),
    );
  }, [tickets, q]);

  async function reissue(t: Ticket) {
    setReissuing(true);
    try {
      const res = await fetch("/api/manager/tickets/reissue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: t.registrationId }),
      });
      if (res.status === 401) { toLogin(); return; }
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Couldn't reissue the ticket");
      const url = data.url;
      setTickets((list) => list?.map((x) => (x.registrationId === t.registrationId ? { ...x, url } : x)) ?? list);
      setShowQr((cur) => (cur?.registrationId === t.registrationId ? { ...cur, url } : cur));
      setConfirm(null);
      toast({ title: `New ticket for ${t.firstName} ${t.lastName}`, detail: "The old QR no longer works.", tone: "ok" });
    } catch (e) {
      toast({ title: "Reissue failed", detail: e instanceof Error ? e.message : undefined, tone: "danger" });
    } finally {
      setReissuing(false);
    }
  }

  return (
    <AppShell area="Manager" staff={staff} nav={managerNav} top={<ManagerAlerts />} width="wide">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <Heading as="h1" size="lg">Tickets</Heading>
            <p className="mt-2 max-w-2xl text-sm text-ddg-muted">
              Each guest gets a personal QR. The QR holds only a random code, no personal data. Send the links with your
              mailing tool, or open a ticket here for the demo.
            </p>
          </div>
          <a href="/api/manager/tickets?format=csv" className={buttonClasses("primary", "md")} download>
            Download ticket links (CSV)
          </a>
        </div>

        <SearchInput
          value={q}
          onValueChange={setQ}
          onClear={() => setQ("")}
          label="Search tickets"
          placeholder="Search name, company or Reg ID"
        />

        {loadError && <p className="text-sm text-danger-strong" role="alert">{loadError}</p>}

        {!tickets ? (
          <div className="grid place-items-center py-16 text-ddg-orange"><Spinner size="lg" /></div>
        ) : shown.length === 0 ? (
          <EmptyState title={q ? "No guests match" : "No guests yet"} detail={q ? "Try another spelling." : "Import the guest list first."} />
        ) : (
          <>
            <p className="tabular text-xs uppercase tracking-[0.14em] text-ddg-muted">
              {shown.length} of {tickets.length} tickets
            </p>
            <ul className="flex flex-col gap-2">
              {shown.map((t) => (
                <li key={t.registrationId}>
                  <Card padding="sm" className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-base text-ddg-ink">{t.firstName} {t.lastName}</span>
                        {t.guestType === "VIP" && <Badge variant="vip">VIP</Badge>}
                      </p>
                      <p className="truncate text-sm text-ddg-muted">
                        {t.company ?? "No company"}<span className="text-ddg-orange"> · </span>
                        <span className="tabular">{t.regId}</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a href={t.url} target="_blank" rel="noopener noreferrer" className={buttonClasses("secondary", "sm")}>
                        Open ticket
                      </a>
                      <Button variant="secondary" size="sm" icon={<IconQr size={16} />} onClick={() => setShowQr(t)}>
                        Show QR
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirm(t)}>Reissue</Button>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <Modal
        open={!!showQr}
        onClose={() => setShowQr(null)}
        title={showQr ? `${showQr.firstName} ${showQr.lastName}` : ""}
        description="Scan this from the desk phone to test the QR check-in."
        variant="dialog"
        size="md"
      >
        {showQr && (
          <div className="flex flex-col items-center gap-3 pb-4">
            <div className="rounded-2xl border-4 border-ddg-orange bg-white p-2">
              <QrCode value={showQr.url} size={340} label={`Ticket QR for ${showQr.firstName}`} />
            </div>
            <p className="tabular text-xs uppercase tracking-[0.14em] text-ddg-muted">Reg ID {showQr.regId}</p>
          </div>
        )}
      </Modal>

      <Modal
        open={!!confirm}
        onClose={() => !reissuing && setConfirm(null)}
        dismissible={!reissuing}
        title="Reissue ticket"
        description={confirm ? `${confirm.firstName} ${confirm.lastName} gets a new QR. The old one stops working right away.` : ""}
        variant="dialog"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)} disabled={reissuing}>Cancel</Button>
            <Button variant="warn" loading={reissuing} onClick={() => confirm && reissue(confirm)}>Reissue</Button>
          </>
        }
      >
        <p className="text-sm text-ddg-ink">Use this when a ticket is lost or was shared by mistake. Send the guest the new link.</p>
      </Modal>
    </AppShell>
  );
}
