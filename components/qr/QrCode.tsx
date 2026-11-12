"use client";
// Owned by the QR agent (T7). Client-side QR image (PNG data URL) for showing a ticket on a laptop screen.
import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui";

export function QrCode({ value, size = 320, label = "Ticket QR code" }: { value: string; size?: number; label?: string }) {
  const [src, setSrc] = useState<{ value: string; url: string } | null>(null);

  useEffect(() => {
    let alive = true;
    import("qrcode")
      .then((QR) => QR.toDataURL(value, { margin: 1, errorCorrectionLevel: "M", width: size * 2, color: { dark: "#2a2140", light: "#ffffff" } }))
      .then((url) => { if (alive) setSrc({ value, url }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [value, size]);

  if (!src || src.value !== value) {
    return (
      <div className="grid place-items-center" style={{ width: size, height: size, maxWidth: "100%" }}>
        <Spinner />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src.url} alt={label} width={size} height={size} className="block h-auto max-w-full [image-rendering:pixelated]" />;
}
