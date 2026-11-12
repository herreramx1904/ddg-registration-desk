"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Heading, Input, Logo } from "@/components/ui";

const NAME_KEY = "ddg.lastStaffName";

type LoginResponse = { role?: "desk" | "manager"; error?: string; retryAfter?: number };

function homeFor(role: string | undefined) {
  return role === "manager" ? "/manager" : "/desk";
}

export default function LoginPage() {
  const nameRef = useRef<HTMLInputElement>(null);
  const pinRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lockedFor, setLockedFor] = useState(0);

  // Already logged in? Go straight to work. Otherwise prefill the last name used on this device.
  useEffect(() => {
    let stored = "";
    try {
      stored = localStorage.getItem(NAME_KEY) ?? "";
    } catch {
      // storage blocked: fine
    }
    if (stored && nameRef.current && !nameRef.current.value) {
      nameRef.current.value = stored;
      pinRef.current?.focus();
    } else {
      nameRef.current?.focus();
    }

    const ctrl = new AbortController();
    fetch("/api/auth/me", { signal: ctrl.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return;
        const me = (await res.json()) as { role?: string };
        if (me.role) window.location.replace(homeFor(me.role));
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  // Rate-limit countdown.
  useEffect(() => {
    if (lockedFor <= 0) return;
    const t = setTimeout(() => setLockedFor((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [lockedFor]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const staff = (nameRef.current?.value ?? "").trim();
    const pin = (pinRef.current?.value ?? "").trim();
    if (!staff) {
      setError("Please add your name, so your check-ins are signed.");
      nameRef.current?.focus();
      return;
    }
    if (!pin) {
      setError("Please enter the PIN for your role.");
      pinRef.current?.focus();
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staff, pin }),
      });
      const data = (await res.json().catch(() => ({}))) as LoginResponse;
      if (res.ok && data.role) {
        try {
          localStorage.setItem(NAME_KEY, staff);
        } catch {
          // ignore
        }
        window.location.href = homeFor(data.role);
        return;
      }
      if (res.status === 429) {
        const wait = Math.max(1, Math.ceil(data.retryAfter ?? 30));
        setLockedFor(wait);
        setError(data.error ?? "Too many tries.");
      } else if (res.status === 401) {
        setError(data.error ?? "That PIN didn't work. Try again.");
      } else {
        setError(data.error ?? "Something went wrong. Try again.");
      }
      if (pinRef.current) pinRef.current.value = "";
      pinRef.current?.focus();
    } catch {
      setError("No connection. Check the Wi-Fi and try again.");
    }
    setLoading(false);
  }

  const locked = lockedFor > 0;

  return (
    <div className="flex min-h-dvh flex-col bg-white lg:flex-row">
      {/* Hero */}
      <section className="relative isolate overflow-hidden px-5 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))] text-white lg:flex lg:w-1/2 lg:flex-col lg:justify-between lg:px-12 lg:py-12">
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(120% 90% at 100% 100%, #FB7730 0%, rgba(251,119,48,0) 55%), radial-gradient(90% 70% at 0% 100%, #F15401 0%, rgba(241,84,1,0) 60%), linear-gradient(165deg, #6d4fe0 0%, #826DEC 30%, #AB365A 70%, #F46920 100%)",
          }}
        />
        <OrbitArt />
        <Logo variant="aura" tone="light" size="lg" />
        <div className="mt-14 lg:mt-0">
          <p className="mb-3 text-xs uppercase tracking-[0.22em] text-white/85">StellarX AI presents</p>
          <Heading as="h1" size="display" className="text-white">
            Registration
            <br />
            Desk
          </Heading>
          <p className="mt-5 max-w-sm text-lg leading-snug text-white/95">
            OrbitBot Galaxy launch. Every guest, welcomed in seconds.
          </p>
          <dl className="mt-6 flex flex-wrap gap-2 text-xs uppercase tracking-[0.14em]">
            <div className="rounded-full bg-white/15 px-3 py-1.5 ring-1 ring-white/30 backdrop-blur-sm">
              <dt className="sr-only">Date</dt>
              <dd>Thu 3 Dec 2026</dd>
            </div>
            <div className="rounded-full bg-white/15 px-3 py-1.5 ring-1 ring-white/30 backdrop-blur-sm">
              <dt className="sr-only">Doors</dt>
              <dd>Doors 11:30</dd>
            </div>
            <div className="rounded-full bg-white/15 px-3 py-1.5 ring-1 ring-white/30 backdrop-blur-sm">
              <dt className="sr-only">Venue</dt>
              <dd>Kraftverket Oslo</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Form */}
      <main className="relative -mt-5 flex flex-1 flex-col rounded-t-[1.75rem] bg-white px-5 pb-8 pt-8 lg:mt-0 lg:items-center lg:justify-center lg:rounded-none lg:px-12">
        <div className="w-full max-w-md">
          <Heading as="h2" size="lg">
            Start your shift
          </Heading>
          <p className="mt-2 text-ddg-muted">Your name goes on every check-in you make. The PIN decides desk or manager.</p>

          <form onSubmit={onSubmit} className="mt-7 flex flex-col gap-5" noValidate>
            <Input
              ref={nameRef}
              name="staff"
              label="Your name"
              placeholder="e.g. Tuva"
              autoComplete="nickname"
              autoCapitalize="words"
              enterKeyHint="next"
              maxLength={40}
              disabled={loading}
            />
            <Input
              ref={pinRef}
              name="pin"
              label="PIN"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="current-password"
              enterKeyHint="go"
              placeholder="••••"
              maxLength={12}
              disabled={loading}
              className="tracking-[0.4em] placeholder:tracking-[0.4em]"
            />

            {error && (
              <div
                role="alert"
                className="animate-pop rounded-xl border-l-[5px] border-danger bg-danger-soft px-4 py-3 text-danger-strong"
              >
                <p>{error}</p>
                {locked && <p className="tabular mt-1 text-sm">You can try again in {lockedFor}s.</p>}
              </div>
            )}

            <Button type="submit" size="lg" fullWidth loading={loading} disabled={locked} className="mt-1 h-16 text-lg">
              {locked ? `Wait ${lockedFor}s` : "Start shift"}
              {!loading && !locked && <span aria-hidden>→</span>}
            </Button>
          </form>

          <p className="mt-8 text-center text-[11px] uppercase tracking-[0.14em] text-ddg-muted">
            Run by DDG Europe<span className="text-ddg-orange"> · </span>Guest data stays in the EU
          </p>
        </div>
      </main>
    </div>
  );
}

/** Decorative orbit rings + planets (OrbitBot Galaxy nod). Pure SVG. */
function OrbitArt() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 400 400"
      className="pointer-events-none absolute -right-28 -top-20 -z-10 w-[26rem] opacity-60 lg:-right-20 lg:top-auto lg:bottom-[-6rem] lg:w-[34rem]"
      fill="none"
    >
      <circle cx="200" cy="200" r="190" stroke="white" strokeOpacity="0.25" />
      <circle cx="200" cy="200" r="140" stroke="white" strokeOpacity="0.3" strokeDasharray="2 6" />
      <circle cx="200" cy="200" r="90" stroke="white" strokeOpacity="0.35" />
      <circle cx="200" cy="200" r="38" fill="#FB7730" />
      <circle cx="200" cy="200" r="38" fill="url(#g)" />
      <circle cx="339" cy="105" r="9" fill="white" />
      <circle cx="111" cy="232" r="6" fill="#C6C2FF" />
      <circle cx="230" cy="391" r="5" fill="#E083E4" />
      <defs>
        <radialGradient id="g" cx="0.35" cy="0.35" r="0.8">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}
