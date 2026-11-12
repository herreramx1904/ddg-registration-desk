import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { wallKeyOk } from "@/lib/service/wall";
import GalaxyWall from "./GalaxyWall";

export const metadata: Metadata = {
  title: "Arrivals · OrbitBot Galaxy",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

// Big-screen arrivals wall. Access is the secret link /wall/<WALL_KEY>; anything else is a plain 404.
export default async function WallPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!wallKeyOk(key)) notFound();
  return <GalaxyWall wallKey={key} />;
}
