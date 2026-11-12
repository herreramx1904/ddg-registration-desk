import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Questrial } from "next/font/google";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

const questrial = Questrial({
  variable: "--font-questrial",
  subsets: ["latin", "latin-ext"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DDG Registration Desk",
  description: "Registration desk for OrbitBot Galaxy · Kraftverket Oslo · 3 Dec 2026. Run by DDG Europe.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FB7730",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${questrial.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-white text-ddg-ink">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
