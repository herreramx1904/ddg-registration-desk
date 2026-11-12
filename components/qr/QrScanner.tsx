"use client";
// Owned by the QR agent (T7). Full-screen camera overlay that decodes a QR code with `qr-scanner`
// and calls onResult(text) once (text = ticket URL or raw token). onClose when cancelled. Only mount when open.
import { useEffect, useRef, useState } from "react";
import { IconClose, IconQr } from "@/components/ui";
import { TOKEN_RE } from "./ticket-link";

export interface QrScannerProps { onResult: (text: string) => void; onClose: () => void }

type Phase = "starting" | "scanning" | "error";

function describeError(e: unknown): string {
  const name = typeof e === "object" && e && "name" in e ? String((e as { name: unknown }).name) : "";
  const msg = typeof e === "string" ? e : e instanceof Error ? e.message : "";
  if (name === "NotAllowedError" || name === "SecurityError" || /permission|denied|not allowed/i.test(msg)) {
    return "Allow camera access, or type the name instead.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError" || /not found|no camera/i.test(msg)) {
    return "No camera found on this device. Type the name instead.";
  }
  if (name === "NotReadableError" || /in use|could not start/i.test(msg)) {
    return "The camera is busy in another app. Close it and try again, or type the name instead.";
  }
  return "The camera couldn't start. Type the name instead.";
}

/** Full-screen dark overlay with the live rear camera and an orange DDG scan frame. */
export function QrScanner({ onResult, onClose }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onResultRef = useRef(onResult);
  const onCloseRef = useRef(onClose);
  const [phase, setPhase] = useState<Phase>("starting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onResultRef.current = onResult;
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    let cancelled = false;
    let done = false;
    let scanner: { stop(): void; destroy(): void } | null = null;

    const fail = (message: string) => {
      if (cancelled) return;
      setError(message);
      setPhase("error");
    };

    (async () => {
      if (typeof window !== "undefined" && !window.isSecureContext) {
        fail("The camera only works over a secure (https) connection. Type the name instead.");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        fail("This browser can't use the camera. Type the name instead.");
        return;
      }
      try {
        const { default: QrScannerLib } = await import("qr-scanner");
        if (cancelled || !videoRef.current) return;
        if (!(await QrScannerLib.hasCamera())) {
          fail("No camera found on this device. Type the name instead.");
          return;
        }
        if (cancelled || !videoRef.current) return;
        const s = new QrScannerLib(
          videoRef.current,
          (result) => {
            if (done || cancelled) return;
            const text = result.data?.trim();
            if (!text) return;
            done = true;
            try { navigator.vibrate?.(60); } catch { /* not supported */ }
            s.stop();
            onResultRef.current(text);
          },
          {
            preferredCamera: "environment",
            highlightScanRegion: true,
            highlightCodeOutline: true,
            returnDetailedScanResult: true,
            maxScansPerSecond: 15,
          },
        );
        scanner = s;
        await s.start();
        if (cancelled) { s.destroy(); return; }
        setPhase("scanning");
      } catch (e) {
        fail(describeError(e));
      }
    })();

    return () => {
      cancelled = true;
      try { scanner?.stop(); scanner?.destroy(); } catch { /* already gone */ }
    };
  }, []);

  // Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#14101f] text-white" role="dialog" aria-modal="true" aria-label="Scan ticket QR">
      {/* qr-scanner draws its own highlight SVGs; recolour them to DDG orange. */}
      <style>{`.ddg-qr .scan-region-highlight-svg,.ddg-qr .code-outline-highlight{stroke:#fb7730 !important}
.ddg-qr .scan-region-highlight-svg{stroke-width:5 !important;filter:drop-shadow(0 0 10px rgb(251 119 48 / .6))}`}</style>
      <div className="h-1 w-full shrink-0 bg-ddg-gradient" aria-hidden />
      <div className="flex shrink-0 items-center gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <IconQr size={22} />
        <p className="ddg-heading text-lg">Scan ticket<span className="text-ddg-orange">.</span></p>
        <button
          type="button"
          onClick={() => onCloseRef.current()}
          aria-label="Close scanner"
          className="ml-auto grid size-12 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 active:bg-white/25"
        >
          <IconClose size={24} />
        </button>
      </div>

      <div className="ddg-qr relative min-h-0 flex-1 overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted playsInline aria-hidden />
        {phase === "starting" && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex flex-col items-center gap-4">
              <div className="size-56 rounded-3xl border-4 border-dashed border-ddg-orange/70 animate-pulse" aria-hidden />
              <p className="text-sm uppercase tracking-[0.16em] text-white/80">Starting camera</p>
            </div>
          </div>
        )}
        {phase === "error" && (
          <div className="absolute inset-0 grid place-items-center px-6">
            <div className="max-w-sm rounded-3xl bg-white p-6 text-center text-ddg-ink shadow-ddg-lg">
              <p className="ddg-heading text-xl">No camera<span className="text-ddg-orange">.</span></p>
              <p className="mt-2 text-base" role="alert">{error}</p>
              <button
                type="button"
                onClick={() => onCloseRef.current()}
                className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-xl bg-ddg-orange px-5 uppercase tracking-wider text-white hover:bg-ddg-orange-mid"
              >
                Type the name
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 text-center text-sm text-white/80">
        Hold the guest&apos;s QR inside the orange frame.
      </p>
    </div>
  );
}

/** Extracts the ticket token from a scanned/typed value: full URL ".../t/<token>" or a bare token. Null if not a token. */
export function extractToken(text: string): string | null {
  const t = (text ?? "").trim();
  // Full or partial link: https://host/t/<token>, /t/<token>?x, also tolerates a trailing slash.
  const m = t.match(/\/t\/([A-Za-z0-9_-]{22})\/?(?:[?#].*)?$/);
  if (m) return m[1];
  return TOKEN_RE.test(t) ? t : null;
}
