"use client";

// Galaxy arrivals wall: companies orbit a glowing sun; new arrivals launch in as comets.
// Companies only, never personal names. Canvas + requestAnimationFrame, no libraries.
import { useEffect, useRef, useState } from "react";
import type { WallData } from "@/lib/service/wall";

const POLL_MS = 4000;
const CY = 0.555; // sun centre as a fraction of height (the DOM count overlay uses the same value)
const RINGS = 5;
const TILT = 0.4; // ellipse ry / rx
const MAX_PLANETS = 60;
const PALETTE = ["#FB7730", "#826DEC", "#E083E4", "#FF6660", "#C6C2FF", "#F49560"];
const TAU = Math.PI * 2;

interface Planet {
  key: string; name: string; count: number; ring: number; phase: number; color: string;
  r: number; born: number; pulse: number; hidden: boolean;
}
interface Star { x: number; y: number; z: number; r: number; tw: number; ph: number; tint: string }
interface Comet { key: string; fx: number; fy: number; t0: number; dur: number; trail: { x: number; y: number }[] }
interface Burst { x: number; y: number; t0: number; color: string }

const now = () => performance.now() / 1000;
const keyOf = (c: string) => c.toLocaleLowerCase("en");
const short = (s: string) => (s.length > 30 ? `${s.slice(0, 28).trimEnd()}…` : s);
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
const ringPeriod = (i: number) => 90 + i * 38; // seconds per orbit, inner rings faster
const ringWeight = (i: number) => 0.55 + i * 0.4; // ~circumference share
const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

function makeStars(n: number): Star[] {
  const tints = ["255,255,255", "255,255,255", "198,194,255", "255,214,190", "224,231,255"];
  return Array.from({ length: n }, () => {
    const z = 0.2 + Math.random() * 0.8;
    return {
      x: Math.random(), y: Math.random(), z, r: 0.4 + Math.random() * 1.2 * z,
      tw: 0.5 + Math.random() * 2.2, ph: Math.random() * TAU, tint: tints[Math.floor(Math.random() * tints.length)],
    };
  });
}

/** Phase in the middle of the widest gap on a ring (planets on one ring share angular speed). */
function widestGap(phases: number[]): number {
  if (!phases.length) return Math.random() * TAU;
  const p = phases.map((x) => ((x % TAU) + TAU) % TAU).sort((a, b) => a - b);
  let best = 0, at = 0;
  for (let i = 0; i < p.length; i++) {
    const next = i + 1 < p.length ? p[i + 1] : p[0] + TAU;
    if (next - p[i] > best) { best = next - p[i]; at = p[i] + best / 2; }
  }
  return at;
}

export default function GalaxyWall({ wallKey }: { wallKey: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const [data, setData] = useState<WallData | null>(null);
  const [caption, setCaption] = useState<{ id: number; text: string } | null>(null);
  const [lost, setLost] = useState(false);
  const [gone, setGone] = useState(false);
  const [reduced, setReduced] = useState(false);

  // Mutable scene state read by the animation loop.
  const world = useRef({
    planets: new Map<string, Planet>(),
    comets: [] as Comet[],
    bursts: [] as Burst[],
    stars: [] as Star[],
    target: 0, shown: 0,
    t0: 0, dirty: true, reduced: false,
    lastAt: "" as string, loaded: false,
    queue: [] as string[],
  });

  // prefers-reduced-motion
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const set = () => { setReduced(mq.matches); world.current.reduced = mq.matches; world.current.dirty = true; };
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);

  // Polling (one request in flight at a time). `?demo` simulates arrivals with fictional companies.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("demo")) {
      const sim = demoFeed();
      const first = setTimeout(() => setData(sim()), 0);
      const id = setInterval(() => setData(sim()), POLL_MS);
      return () => { clearTimeout(first); clearInterval(id); };
    }
    let alive = true, busy = false, fails = 0;
    const load = async () => {
      if (busy) return;
      busy = true;
      try {
        const res = await fetch(`/api/wall?key=${encodeURIComponent(wallKey)}`, { cache: "no-store" });
        if (res.status === 404) { if (alive) setGone(true); return; }
        if (!res.ok) throw new Error(String(res.status));
        const d = (await res.json()) as WallData;
        if (!alive) return;
        fails = 0; setLost(false); setData(d);
      } catch {
        if (alive && ++fails >= 3) setLost(true);
      } finally { busy = false; }
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [wallKey]);

  // Merge new data into the scene
  useEffect(() => {
    if (!data) return;
    const w = world.current;
    const t = now() - w.t0;
    w.target = data.total;
    w.dirty = true;

    const ringPhases = (ring: number) => [...w.planets.values()].filter((p) => p.ring === ring).map((p) => p.phase);
    const pickRing = () => {
      let best = 0, score = Infinity;
      for (let i = 0; i < RINGS; i++) {
        const s = (ringPhases(i).length + 1) / ringWeight(i);
        if (s < score) { score = s; best = i; }
      }
      return best;
    };

    const fresh: Planet[] = [];
    for (const c of data.companies) {
      const k = keyOf(c.company);
      const p = w.planets.get(k);
      if (p) { p.count = c.count; continue; }
      if (w.planets.size + fresh.length >= MAX_PLANETS) continue;
      const planet: Planet = {
        key: k, name: c.company, count: c.count, ring: 0, phase: 0, color: PALETTE[hash(k) % PALETTE.length],
        r: 0, born: t, pulse: -10, hidden: false,
      };
      if (w.loaded) { planet.ring = pickRing(); planet.phase = widestGap(ringPhases(planet.ring)); planet.hidden = !w.reduced; }
      w.planets.set(k, planet);
      fresh.push(planet);
    }
    // Drop companies that left the data (e.g. an undone check-in)
    const live = new Set(data.companies.map((c) => keyOf(c.company)));
    for (const k of [...w.planets.keys()]) if (!live.has(k)) w.planets.delete(k);

    if (!w.loaded) {
      // First load: spread evenly over rings, fade in staggered, no comets.
      fresh.forEach((p, i) => { p.born = t + 0.4 + i * 0.06; });
      const perRing: Planet[][] = Array.from({ length: RINGS }, () => []);
      for (const p of fresh) {
        let best = 0, score = Infinity;
        for (let i = 0; i < RINGS; i++) { const s = (perRing[i].length + 1) / ringWeight(i); if (s < score) { score = s; best = i; } }
        p.ring = best; perRing[best].push(p);
      }
      perRing.forEach((ps, ring) => ps.forEach((p, j) => { p.phase = (TAU * j) / ps.length + ring * 0.9; }));
      w.loaded = true;
      w.lastAt = data.recent[0]?.at ?? "";
      return;
    }

    // New arrivals since last poll (oldest first), newest few only
    const arrivals = data.recent.filter((r) => r.at > w.lastAt).reverse();
    if (data.recent[0] && data.recent[0].at > w.lastAt) w.lastAt = data.recent[0].at;
    if (arrivals.length) {
      w.queue.push(...arrivals.map((a) => a.company));
      if (w.queue.length > 4) w.queue = w.queue.slice(-4);
    }
    // Reveal brand-new planets that are not waiting for a comet
    for (const p of fresh) if (!w.queue.some((c) => keyOf(c) === p.key)) { p.hidden = false; p.born = t; }
  }, [data]);

  // Arrival queue: one launch + welcome caption at a time
  useEffect(() => {
    let n = 0;
    const tick = () => {
      const w = world.current;
      const company = w.queue.shift();
      if (!company) return;
      const k = keyOf(company);
      setCaption({ id: ++n, text: company });
      if (w.reduced) { const p = w.planets.get(k); if (p) p.hidden = false; w.dirty = true; return; }
      const W = window.innerWidth, H = window.innerHeight;
      const left = Math.random() < 0.5;
      w.comets.push({
        key: k, t0: now() - w.t0, dur: 2.1, trail: [],
        fx: left ? -80 : W + 80, fy: -60 + Math.random() * H * 0.35,
      });
    };
    const id = setInterval(tick, 3800);
    const first = setTimeout(tick, 600);
    return () => { clearInterval(id); clearTimeout(first); };
  }, []);

  useEffect(() => {
    if (!caption) return;
    const id = setTimeout(() => setCaption(null), 3700);
    return () => clearTimeout(id);
  }, [caption]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = world.current;
    w.t0 = now();
    w.stars = makeStars(Math.round(Math.min(420, Math.max(180, (window.innerWidth * window.innerHeight) / 5200))));
    const fontVar = getComputedStyle(document.documentElement).getPropertyValue("--font-questrial").trim();
    const font = `${fontVar ? `${fontVar}, ` : ""}"Century Gothic", ui-sans-serif, system-ui, sans-serif`;

    let W = 0, H = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      w.dirty = true;
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0, last = now();
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const real = now();
      const dt = Math.min(0.1, real - last); last = real;
      const still = w.reduced;

      // Count ticker
      if (countRef.current) {
        if (still) w.shown = w.target;
        else if (Math.abs(w.target - w.shown) < 0.02) w.shown = w.target;
        else w.shown += (w.target - w.shown) * Math.min(1, dt * 2.6);
        const txt = String(Math.round(w.shown));
        if (countRef.current.textContent !== txt) countRef.current.textContent = txt;
      }
      if (still && !w.dirty) return;
      w.dirty = false;
      const t = still ? 1000 : real - w.t0;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // --- stars with slow parallax drift and twinkle
      const sway = still ? 0 : Math.sin(t * 0.05);
      for (const s of w.stars) {
        const x = (((s.x * W + (still ? 0 : t * 5 * s.z)) % W) + W) % W;
        const y = s.y * H + sway * 8 * s.z;
        const a = (0.25 + 0.65 * s.z) * (still ? 0.8 : 0.55 + 0.45 * Math.sin(t * s.tw + s.ph));
        ctx.fillStyle = `rgba(${s.tint},${a.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(x, y, s.r, 0, TAU); ctx.fill();
        if (s.z > 0.92 && a > 0.75) { // occasional sparkle cross on the brightest
          ctx.fillRect(x - s.r * 3, y - 0.3, s.r * 6, 0.6);
          ctx.fillRect(x - 0.3, y - s.r * 3, 0.6, s.r * 6);
        }
      }

      // --- geometry
      const k = Math.max(0.55, Math.min(1.4, Math.min(W / 1920, H / 1080)));
      const cx = W / 2, cy = H * CY;
      const sunR = Math.min(W, H) * 0.11;
      const labelPad = 175 * k;
      const rxMax = Math.max(sunR * 3, Math.min(W / 2 - labelPad, (H * 0.405) / TILT));
      const rxMin = Math.min(rxMax * 0.6, sunR * 2.35);
      const ringRx = (i: number) => rxMin + ((rxMax - rxMin) * i) / (RINGS - 1);

      // orbit paths
      ctx.lineWidth = 1;
      for (let i = 0; i < RINGS; i++) {
        ctx.strokeStyle = `rgba(198,194,255,${0.07 + 0.03 * (RINGS - i) / RINGS})`;
        ctx.beginPath(); ctx.ellipse(cx, cy, ringRx(i), ringRx(i) * TILT, 0, 0, TAU); ctx.stroke();
      }

      const pos = (p: Planet) => {
        const a = p.phase + (TAU / ringPeriod(p.ring)) * t;
        const rx = ringRx(p.ring);
        return { x: cx + rx * Math.cos(a), y: cy + rx * TILT * Math.sin(a), depth: (Math.sin(a) + 1) / 2 };
      };

      const drawPlanet = (p: Planet) => {
        if (p.hidden) return;
        const { x, y, depth } = pos(p);
        const fade = still ? 1 : Math.max(0, Math.min(1, (t - p.born) / 0.8));
        if (fade <= 0) return;
        const target = k * Math.min(26, 6 + 4.6 * Math.sqrt(p.count));
        p.r = still || !p.r ? target : p.r + (target - p.r) * Math.min(1, dt * 3);
        const s = 0.8 + 0.25 * depth;
        const pulse = still ? 0 : Math.max(0, 1 - (t - p.pulse) / 1.6);
        const r = p.r * s * (1 + 0.35 * pulse);
        const alpha = fade * (0.6 + 0.4 * depth);

        ctx.globalAlpha = alpha;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, r * (3.2 + pulse * 2));
        glow.addColorStop(0, `${p.color}88`); glow.addColorStop(1, `${p.color}00`);
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(x, y, r * (3.2 + pulse * 2), 0, TAU); ctx.fill();
        const body = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.1, x, y, r);
        body.addColorStop(0, "#ffffff"); body.addColorStop(0.35, p.color); body.addColorStop(1, "#1a1033");
        ctx.fillStyle = body;
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        if (p.count >= 4) { // a ring for the bigger delegations
          ctx.strokeStyle = `${p.color}aa`; ctx.lineWidth = Math.max(1, r * 0.12);
          ctx.beginPath(); ctx.ellipse(x, y, r * 1.75, r * 0.5, -0.35, 0, TAU); ctx.stroke();
        }

        // label "Company · n"
        const fs = Math.round(k * (15 + Math.min(p.count, 6) * 1.4) * s);
        ctx.font = `${fs}px ${font}`;
        ctx.textBaseline = "middle";
        const name = short(p.name), sep = "  ·  ", num = String(p.count);
        const wName = ctx.measureText(name).width, wSep = ctx.measureText(sep).width, wNum = ctx.measureText(num).width;
        const total = wName + wSep + wNum;
        const right = x >= cx;
        const lx = right ? x + r + 10 * k : x - r - 10 * k - total;
        ctx.globalAlpha = alpha * (0.75 + 0.25 * depth);
        ctx.shadowColor = "rgba(5,3,13,0.9)"; ctx.shadowBlur = 6;
        ctx.fillStyle = "#ffffff"; ctx.fillText(name, lx, y);
        ctx.fillStyle = "rgba(198,194,255,0.8)"; ctx.fillText(sep, lx + wName, y);
        ctx.fillStyle = "#FB7730"; ctx.fillText(num, lx + wName + wSep, y);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      };

      const planets = [...w.planets.values()];
      const back = planets.filter((p) => pos(p).depth < 0.5).sort((a, b) => pos(a).depth - pos(b).depth);
      const front = planets.filter((p) => pos(p).depth >= 0.5).sort((a, b) => pos(a).depth - pos(b).depth);
      back.forEach(drawPlanet);

      // --- the sun
      const breathe = still ? 1 : 1 + 0.025 * Math.sin(t * 0.9);
      const R = sunR * breathe;
      let g = ctx.createRadialGradient(cx, cy, R * 0.5, cx, cy, R * 3.4);
      g.addColorStop(0, "rgba(130,109,236,0.45)"); g.addColorStop(0.45, "rgba(130,109,236,0.12)"); g.addColorStop(1, "rgba(130,109,236,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 3.4, 0, TAU); ctx.fill();
      g = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * 1.9);
      g.addColorStop(0, "rgba(251,119,48,0.55)"); g.addColorStop(1, "rgba(251,119,48,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.9, 0, TAU); ctx.fill();
      // slowly rotating corona rays
      if (!still) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.04);
        for (let i = 0; i < 12; i++) {
          ctx.rotate(TAU / 12);
          const len = R * (1.45 + 0.12 * Math.sin(t * 0.7 + i * 1.7));
          const rg = ctx.createLinearGradient(0, 0, len, 0);
          rg.addColorStop(0.6, "rgba(251,150,90,0.18)"); rg.addColorStop(1, "rgba(251,150,90,0)");
          ctx.fillStyle = rg;
          ctx.beginPath(); ctx.moveTo(0, -R * 0.12); ctx.lineTo(len, 0); ctx.lineTo(0, R * 0.12); ctx.fill();
        }
        ctx.restore();
      }
      g = ctx.createRadialGradient(cx - R * 0.25, cy - R * 0.3, R * 0.05, cx, cy, R);
      g.addColorStop(0, "#ffd2b0"); g.addColorStop(0.35, "#FB7730"); g.addColorStop(0.78, "#c4549a"); g.addColorStop(1, "#826DEC");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
      ctx.strokeStyle = "rgba(255,220,200,0.35)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();

      front.forEach(drawPlanet);

      // --- comets
      w.comets = w.comets.filter((c) => {
        const p = w.planets.get(c.key);
        const tgt = p ? pos(p) : { x: cx, y: cy - R * 1.2 };
        const raw = Math.min(1, (t - c.t0) / c.dur);
        const e = easeInOut(raw);
        const bend = Math.sin(Math.PI * e) * 140 * k;
        const dx = tgt.x - c.fx, dy = tgt.y - c.fy, len = Math.hypot(dx, dy) || 1;
        const x = c.fx + dx * e + (-dy / len) * bend, y = c.fy + dy * e + (dx / len) * bend;
        c.trail.push({ x, y });
        if (c.trail.length > 34) c.trail.shift();
        for (let i = 1; i < c.trail.length; i++) {
          const f = i / c.trail.length;
          ctx.strokeStyle = `rgba(255,${Math.round(150 + 90 * f)},${Math.round(90 + 140 * f)},${(f * 0.85).toFixed(3)})`;
          ctx.lineWidth = k * (1 + 6 * f);
          ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(c.trail[i - 1].x, c.trail[i - 1].y); ctx.lineTo(c.trail[i].x, c.trail[i].y); ctx.stroke();
        }
        const hg = ctx.createRadialGradient(x, y, 0, x, y, 26 * k);
        hg.addColorStop(0, "rgba(255,255,255,1)"); hg.addColorStop(0.25, "rgba(255,190,140,0.8)"); hg.addColorStop(1, "rgba(251,119,48,0)");
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(x, y, 26 * k, 0, TAU); ctx.fill();
        if (raw >= 1) {
          if (p) { if (p.hidden) { p.hidden = false; p.born = t; } p.pulse = t; }
          w.bursts.push({ x: tgt.x, y: tgt.y, t0: t, color: p?.color ?? "#FB7730" });
          return false;
        }
        return true;
      });

      // --- landing bursts
      w.bursts = w.bursts.filter((b) => {
        const q = (t - b.t0) / 1.4;
        if (q >= 1) return false;
        ctx.globalAlpha = 1 - q;
        ctx.strokeStyle = b.color; ctx.lineWidth = 3 * k * (1 - q);
        ctx.beginPath(); ctx.arc(b.x, b.y, k * (10 + 110 * easeInOut(q)), 0, TAU); ctx.stroke();
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5 * k * (1 - q);
        ctx.beginPath(); ctx.arc(b.x, b.y, k * (6 + 60 * q), 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
        return true;
      });
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  if (gone) return <div className="fixed inset-0 grid place-items-center bg-white text-ddg-ink">Not found</div>;

  const companies = data?.companies.length ?? 0;
  const recent = data?.recent.slice(0, 5) ?? [];

  return (
    <div
      className="galaxy fixed inset-0 overflow-hidden cursor-none select-none text-white"
      style={{
        background:
          "radial-gradient(ellipse 60% 50% at 50% 56%, rgba(251,119,48,0.16), transparent 70%)," +
          "radial-gradient(ellipse 55% 45% at 14% 20%, rgba(130,109,236,0.30), transparent 70%)," +
          "radial-gradient(ellipse 45% 40% at 88% 82%, rgba(224,131,228,0.16), transparent 70%)," +
          "radial-gradient(ellipse 40% 30% at 78% 8%, rgba(130,109,236,0.16), transparent 70%)," +
          "radial-gradient(ellipse 120% 90% at 50% 50%, #0c0820 0%, #05030d 75%)",
      }}
    >
      <style>{CSS}</style>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />

      {/* Title */}
      <header className="absolute inset-x-0 top-0 px-4 pt-[3.2vmin] text-center">
        <h1 className="galaxy-title tracking-[0.2em] text-white" style={{ fontSize: "clamp(26px, 5vmin, 72px)", lineHeight: 1.05 }}>
          ORBITBOT GALAXY<span className="text-ddg-orange">.</span>
        </h1>
        <p className="mt-[1vmin] uppercase tracking-[0.32em] text-ddg-purple-light/80" style={{ fontSize: "clamp(11px, 1.55vmin, 22px)" }}>
          StellarX AI · Kraftverket Oslo · 3 December 2026
        </p>
      </header>

      {/* Live count inside the sun */}
      <div
        className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center"
        style={{ left: "50%", top: `${CY * 100}%` }}
        aria-live="polite"
      >
        <span
          ref={countRef}
          className="tabular leading-none"
          style={{ fontSize: "10.5vmin", textShadow: "0 0 2.5vmin rgba(90,30,60,0.55), 0 0.3vmin 0.8vmin rgba(40,10,40,0.5)" }}
        >
          0
        </span>
        <span className="mt-[0.6vmin] uppercase tracking-[0.35em] text-white/90" style={{ fontSize: "1.5vmin", textShadow: "0 0 1vmin rgba(60,20,60,0.6)" }}>
          arrived
        </span>
      </div>

      {/* Welcome caption */}
      {caption && (
        <div key={caption.id} className="galaxy-caption pointer-events-none absolute inset-x-0 isolate px-4 text-center" style={{ top: "15.5%" }}>
          <div className="absolute inset-x-[15%] -inset-y-[3vmin] -z-10" style={{ background: "radial-gradient(ellipse at center, rgba(5,3,13,0.72), transparent 70%)" }} />
          <div className="uppercase tracking-[0.4em] text-ddg-orange" style={{ fontSize: "clamp(12px, 1.8vmin, 26px)" }}>
            Welcome<span className="text-white/70">,</span>
          </div>
          <div className="mt-[0.6vmin] text-white" style={{ fontSize: "clamp(26px, 5.6vmin, 84px)", lineHeight: 1.1, textShadow: "0 0 3vmin rgba(130,109,236,0.75), 0 0 1vmin rgba(251,119,48,0.5)" }}>
            {caption.text}
          </div>
        </div>
      )}

      {/* Latest arrivals */}
      <aside className="pointer-events-none absolute bottom-[4.5vmin] left-[3vmin] hidden text-left lg:block" style={{ fontSize: "clamp(12px, 1.5vmin, 20px)" }}>
        {recent.length ? (
          <>
            <div className="mb-[0.8vmin] uppercase tracking-[0.3em] text-ddg-purple-light/70">Just arrived</div>
            <ul className="space-y-[0.4vmin]">
              {recent.map((r, i) => (
                <li key={`${r.at}-${i}`} className="flex items-center gap-[0.8vmin]" style={{ opacity: 1 - i * 0.16 }}>
                  <span className="inline-block h-[0.8vmin] w-[0.8vmin] rounded-full bg-ddg-orange" style={{ boxShadow: "0 0 1vmin #FB7730" }} />
                  {short(r.company)}
                </li>
              ))}
            </ul>
          </>
        ) : data ? (
          <div className="uppercase tracking-[0.3em] text-ddg-purple-light/70">The galaxy awaits its first arrivals</div>
        ) : null}
      </aside>

      {companies > 0 && (
        <div className="pointer-events-none absolute bottom-[4.5vmin] right-[3vmin] hidden text-right uppercase tracking-[0.3em] text-ddg-purple-light/70 lg:block" style={{ fontSize: "clamp(12px, 1.5vmin, 20px)" }}>
          <span className="tabular text-white">{companies}</span> {companies === 1 ? "company" : "companies"} in orbit
        </div>
      )}

      {/* Footer */}
      <footer className="pointer-events-none absolute inset-x-0 bottom-[1.6vmin] text-center uppercase tracking-[0.35em] text-white/55" style={{ fontSize: "clamp(10px, 1.3vmin, 18px)" }}>
        Run by DDG Europe<span className="text-ddg-orange">.</span>
      </footer>

      {lost && (
        <div className="absolute right-[2vmin] top-[2vmin] flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/50">
          <span className="h-2 w-2 animate-pulse rounded-full bg-warn" /> Reconnecting
        </div>
      )}
      {reduced && <span className="sr-only">Animations are reduced.</span>}
    </div>
  );
}

/** Demo feed: fictional companies only, a few arrivals per tick. */
function demoFeed() {
  const names = [
    "Helix Pharma Nordic", "Polar Quantum Labs", "Bergen Bionics", "Krystal Data AS", "Midnight Sun Robotics",
    "Aurora Analytics Group", "Tundra Cloud Systems", "Vik & Vang Consulting", "Lumen Fintech Nordic", "Skarven Maritime Tech",
    "Glacier Health AB", "Orion Retail Group", "Solstice Media House", "Nebula Insurance Nordic", "Starling Partners",
    "Cobalt Ventures Oslo", "Halo Automation", "Ember Energy Systems", "Quasar Telecom", "Vega Legal Partners",
    "Pulsar Logistics", "Zenith Foods Nordic", "Comet Capital", "Atlas Robotics Europe", "Aurelia Ventures",
    "Fjellvind Engineering", "Nordkapp Mobility", "Saga Learning", "Isbre Security", "Kvasar Health Tech",
  ];
  const counts = new Map<string, { count: number; last: string }>();
  const recent: { company: string; at: string }[] = [];
  let total = 0, clock = Date.now() - 60 * 60 * 1000;
  const arrive = (n: number) => {
    for (let i = 0; i < n; i++) {
      const pool = Math.min(names.length, 8 + Math.floor(total / 3));
      const company = names[Math.floor(Math.pow(Math.random(), 1.6) * pool)];
      clock += 1000 + Math.floor(Math.random() * 20000);
      const at = new Date(clock).toISOString();
      const c = counts.get(company) ?? { count: 0, last: at };
      c.count++; c.last = at; counts.set(company, c);
      recent.unshift({ company, at }); recent.length = Math.min(recent.length, 12);
      total++;
    }
  };
  arrive(34);
  return (): WallData => {
    if (Math.random() < 0.7) arrive(1 + Math.floor(Math.random() * 1.6));
    if (Math.random() < 0.1) total++; // a walk-in without a company
    return {
      total,
      companies: [...counts].map(([company, c]) => ({ company, count: c.count, lastArrivalAt: c.last })).sort((a, b) => b.count - a.count),
      recent: [...recent],
    };
  };
}

const CSS = `
.galaxy-title { text-shadow: 0 0 2.4vmin rgba(130,109,236,0.55); }
.galaxy-caption { animation: galaxy-welcome 3.6s cubic-bezier(.2,.7,.2,1) both; }
@keyframes galaxy-welcome {
  0% { opacity: 0; transform: translateY(1.5vmin) scale(.94); filter: blur(6px); }
  14% { opacity: 1; transform: none; filter: none; }
  80% { opacity: 1; transform: none; }
  100% { opacity: 0; transform: translateY(-1vmin) scale(1.02); }
}
@media (prefers-reduced-motion: reduce) {
  .galaxy-caption { animation: none; }
}
`;
