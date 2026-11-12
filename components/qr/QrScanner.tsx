"use client";
// STUB — owned by the QR agent (T7). Contract: full-screen camera overlay that decodes a QR code with `qr-scanner`
// and calls onResult(text) once (text = ticket URL or raw token). onClose when cancelled. Only mount when open.
export interface QrScannerProps { onResult: (text: string) => void; onClose: () => void }
export function QrScanner(props: QrScannerProps) { void props; return null; }
/** Extracts the ticket token from a scanned/typed value: full URL ".../t/<token>" or a bare token. Null if not a token. */
export function extractToken(text: string): string | null {
  const t = text.trim();
  const m = t.match(/\/t\/([A-Za-z0-9_-]{16,64})(?:[?#].*)?$/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{22}$/.test(t) ? t : null;
}
