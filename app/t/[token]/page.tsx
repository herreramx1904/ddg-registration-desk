// Public guest ticket page (no login). Owned by the QR agent (T7).
// Shows first name + company and a large QR of this page's URL. Never shows status, email or phone.
import type { Metadata } from "next";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { Logo } from "@/components/ui";
import { isTicketToken, originFromHeaders, ticketUrl } from "@/components/qr/ticket-link";
import { getStore } from "@/lib/server/store/supabase";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your ticket · OrbitBot Galaxy",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

async function findTicket(token: string) {
  if (!isTicketToken(token)) return null;
  try {
    return await getStore().getRegistrationByToken(token);
  } catch (e) {
    console.error("ticket lookup failed", e);
    return null;
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center bg-ddg-gradient px-4 py-6 sm:py-10">
      <div className="w-full max-w-sm">{children}</div>
      <p className="mt-6 text-center text-[11px] uppercase tracking-[0.16em] text-white/85">
        Run by DDG Europe · OrbitBot Galaxy
      </p>
    </main>
  );
}

function Invalid() {
  return (
    <Shell>
      <div className="rounded-3xl bg-white p-6 text-center shadow-ddg-lg">
        <Logo variant="aura" size="md" />
        <h1 className="ddg-heading mt-6 text-2xl">
          Ticket not valid<span className="text-ddg-orange">.</span>
        </h1>
        <p className="mt-3 text-base text-ddg-ink">
          This ticket isn&apos;t valid. Please contact the registration desk.
        </p>
      </div>
    </Shell>
  );
}

export default async function TicketPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const reg = await findTicket(token);
  if (!reg) return <Invalid />;

  const url = ticketUrl(originFromHeaders(await headers()), reg.ticketToken);
  const svg = await QRCode.toString(url, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#2a2140", light: "#ffffff" },
  });
  const firstName = reg.firstName?.trim() || "Guest";

  return (
    <Shell>
      <article className="overflow-hidden rounded-3xl bg-white shadow-ddg-lg" aria-label="Event ticket">
        <header className="px-6 pb-5 pt-6">
          <div className="flex items-start justify-between gap-3">
            <Logo variant="stacked" size="sm" />
            <span className="rounded-full bg-ddg-cream px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-ddg-orange-dark">
              Admit one
            </span>
          </div>
          <p className="mt-6 text-xs uppercase tracking-[0.18em] text-ddg-muted">You&apos;re invited</p>
          <h1 className="ddg-heading mt-1 text-[2.1rem] leading-[0.95] text-ddg-ink">
            OrbitBot Galaxy<span className="text-ddg-orange">.</span>
          </h1>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-[10px] uppercase tracking-[0.16em] text-ddg-muted">Venue</dt>
              <dd className="text-ddg-ink">Kraftverket, Oslo</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.16em] text-ddg-muted">Date</dt>
              <dd className="text-ddg-ink">Thu 3 Dec 2026</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.16em] text-ddg-muted">Doors</dt>
              <dd className="tabular text-ddg-ink">11:30</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[10px] uppercase tracking-[0.16em] text-ddg-muted">Guest</dt>
              <dd className="truncate text-ddg-ink">{firstName}</dd>
            </div>
          </dl>
        </header>

        {/* Tear line */}
        <div className="mx-5 border-t-2 border-dashed border-ddg-line" aria-hidden />

        <section className="px-6 pb-6 pt-5 text-center">
          <p className="ddg-heading text-2xl text-ddg-ink">
            Hi {firstName}<span className="text-ddg-orange">.</span>
          </p>
          {reg.company && <p className="mt-1 truncate text-sm text-ddg-muted">{reg.company}</p>}
          <div
            className="mx-auto mt-5 aspect-square w-full max-w-[280px] rounded-2xl border-4 border-ddg-orange bg-white p-2 [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
            role="img"
            aria-label="Your ticket QR code"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <p className="mt-5 text-base text-ddg-ink">Show this at the registration desk.</p>
          <p className="mt-1 text-xs text-ddg-muted">Turn your screen brightness up for a quick scan.</p>
          <p className="tabular mt-4 text-[11px] uppercase tracking-[0.16em] text-ddg-muted">Reg ID {reg.regId}</p>
        </section>
      </article>
    </Shell>
  );
}
