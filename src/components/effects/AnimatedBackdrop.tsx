"use client";

import { useEffect, useRef } from "react";

export type BackdropVariant = "aurora" | "rain" | "snow" | "starfield" | "fireflies";

interface Props {
  variant: BackdropVariant;
  /** Pointer-follow + click-burst effects (landing page). Off for wallpapers. */
  interactive?: boolean;
  /** 0–1 multiplier on glow/alpha — lower = subtler colors. */
  intensity?: number;
  className?: string;
  style?: React.CSSProperties;
}

/* ── tiny helpers ─────────────────────────────────────────────────── */
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

interface Particle {
  x: number; y: number; vx: number; vy: number;
  r: number; life: number; maxLife: number; hue: string;
  phase: number; depth: number;
}

interface Blob { x: number; y: number; r: number; dx: number; dy: number; color: string; t: number }
interface Ripple { x: number; y: number; r: number; alpha: number }

const PINK = "255,95,162";
const PURPLE = "176,107,246";
const INDIGO = "99,102,241";
const BLUE = "143,182,255";

/**
 * Code-generated animated backdrop rendered to a single <canvas>.
 * Variants: aurora (drifting gradient blobs), rain, snow, starfield, fireflies.
 * Pauses when the tab is hidden; renders one static frame for reduced motion.
 */
export function AnimatedBackdrop({ variant, interactive = false, intensity = 1, className, style }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let running = true;
    let W = 0, H = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const pointer = { x: 0.5, y: 0.42, tx: 0.5, ty: 0.42 };
    const ripples: Ripple[] = [];
    const burst: Particle[] = [];

    const cv = canvas;
    function resize() {
      W = cv.clientWidth;
      H = cv.clientHeight;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    /* ── per-variant setup ──────────────────────────────────────── */
    const blobs: Blob[] = [];
    const parts: Particle[] = [];

    if (variant === "aurora") {
      const palette = [PINK, PURPLE, INDIGO, PINK];
      for (let i = 0; i < 4; i++) {
        blobs.push({
          x: rand(0.1, 0.9), y: rand(0.1, 0.9),
          r: rand(0.32, 0.5),
          dx: rand(-0.00012, 0.00012), dy: rand(-0.0001, 0.0001),
          color: palette[i], t: rand(0, TAU),
        });
      }
    } else if (variant === "rain") {
      for (let i = 0; i < 110; i++) {
        parts.push({
          x: Math.random(), y: Math.random(), vx: 0, vy: rand(0.55, 1.15),
          r: rand(7, 16), life: 0, maxLife: 1, hue: i % 4 === 0 ? PURPLE : BLUE,
          phase: rand(0, TAU), depth: rand(0.35, 1),
        });
      }
    } else if (variant === "snow") {
      for (let i = 0; i < 130; i++) {
        parts.push({
          x: Math.random(), y: Math.random(), vx: rand(-0.02, 0.02), vy: rand(0.03, 0.1),
          r: rand(1, 3.2), life: 0, maxLife: 1, hue: "255,255,255",
          phase: rand(0, TAU), depth: rand(0.3, 1),
        });
      }
    } else if (variant === "starfield") {
      for (let i = 0; i < 160; i++) {
        parts.push({
          x: Math.random(), y: Math.random(), vx: 0, vy: 0,
          r: rand(0.4, 1.7), life: 0, maxLife: 1,
          hue: i % 6 === 0 ? PINK : i % 5 === 0 ? PURPLE : "255,255,255",
          phase: rand(0, TAU), depth: rand(0.2, 1),
        });
      }
    } else if (variant === "fireflies") {
      for (let i = 0; i < 38; i++) {
        parts.push({
          x: Math.random(), y: Math.random(), vx: rand(-0.02, 0.02), vy: rand(-0.02, 0.02),
          r: rand(1.4, 3), life: 0, maxLife: 1,
          hue: i % 3 === 0 ? PINK : i % 2 === 0 ? PURPLE : "255,214,140",
          phase: rand(0, TAU), depth: rand(0.4, 1),
        });
      }
    }

    let shootingStar: { x: number; y: number; vx: number; vy: number; life: number } | null = null;

    /* ── frame ──────────────────────────────────────────────────── */
    let last = performance.now();
    function frame(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      ctx!.clearRect(0, 0, W, H);

      pointer.x += (pointer.tx - pointer.x) * 0.03;
      pointer.y += (pointer.ty - pointer.y) * 0.03;

      if (variant === "aurora") {
        ctx!.globalCompositeOperation = "lighter";
        for (const b of blobs) {
          b.t += dt * 0.35;
          b.x += b.dx * dt * 1000 + Math.sin(b.t) * 0.0002;
          b.y += b.dy * dt * 1000 + Math.cos(b.t * 0.8) * 0.00018;
          if (b.x < 0.05 || b.x > 0.95) b.dx *= -1;
          if (b.y < 0.05 || b.y > 0.95) b.dy *= -1;
          // gentle pull toward the pointer when interactive
          const px = interactive ? (pointer.x - b.x) * 0.012 : 0;
          const py = interactive ? (pointer.y - b.y) * 0.012 : 0;
          const cx = (b.x + px) * W;
          const cy = (b.y + py) * H;
          const r = b.r * Math.max(W, H) * (1 + Math.sin(b.t * 1.4) * 0.06);
          const g = ctx!.createRadialGradient(cx, cy, 0, cx, cy, r);
          g.addColorStop(0, `rgba(${b.color},${0.34 * intensity})`);
          g.addColorStop(1, `rgba(${b.color},0)`);
          ctx!.fillStyle = g;
          ctx!.beginPath();
          ctx!.arc(cx, cy, r, 0, TAU);
          ctx!.fill();
        }
        ctx!.globalCompositeOperation = "source-over";
      } else if (variant === "rain") {
        ctx!.lineCap = "round";
        for (const p of parts) {
          p.y += p.vy * p.depth * dt;
          p.x -= 0.04 * p.depth * dt;
          if (p.y > 1.05) { p.y = -0.05; p.x = Math.random() * 1.1; }
          const x = p.x * W, y = p.y * H;
          const len = p.r * p.depth;
          ctx!.strokeStyle = `rgba(${p.hue},${0.16 + p.depth * 0.22})`;
          ctx!.lineWidth = p.depth * 1.4;
          ctx!.beginPath();
          ctx!.moveTo(x, y);
          ctx!.lineTo(x + len * 0.18, y + len);
          ctx!.stroke();
        }
      } else if (variant === "snow") {
        for (const p of parts) {
          p.phase += dt;
          p.y += p.vy * p.depth * dt;
          p.x += (p.vx + Math.sin(p.phase) * 0.012) * p.depth * dt;
          if (p.y > 1.03) { p.y = -0.03; p.x = Math.random(); }
          if (p.x > 1.03) p.x = -0.03;
          if (p.x < -0.03) p.x = 1.03;
          ctx!.fillStyle = `rgba(${p.hue},${0.25 + p.depth * 0.5})`;
          ctx!.beginPath();
          ctx!.arc(p.x * W, p.y * H, p.r * p.depth, 0, TAU);
          ctx!.fill();
        }
      } else if (variant === "starfield") {
        for (const p of parts) {
          p.phase += dt * rand(0.6, 1.4);
          const tw = 0.35 + Math.abs(Math.sin(p.phase)) * 0.65;
          ctx!.fillStyle = `rgba(${p.hue},${tw * p.depth})`;
          ctx!.beginPath();
          ctx!.arc(p.x * W, p.y * H, p.r, 0, TAU);
          ctx!.fill();
        }
        if (!shootingStar && Math.random() < 0.003) {
          shootingStar = { x: rand(0.1, 0.8), y: rand(0.05, 0.3), vx: rand(0.4, 0.7), vy: rand(0.15, 0.3), life: 1 };
        }
        if (shootingStar) {
          const s = shootingStar;
          s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt * 1.4;
          const x = s.x * W, y = s.y * H;
          const grad = ctx!.createLinearGradient(x, y, x - 70, y - 28);
          grad.addColorStop(0, `rgba(255,255,255,${Math.max(s.life, 0)})`);
          grad.addColorStop(1, "rgba(255,255,255,0)");
          ctx!.strokeStyle = grad;
          ctx!.lineWidth = 1.6;
          ctx!.beginPath();
          ctx!.moveTo(x, y);
          ctx!.lineTo(x - 70, y - 28);
          ctx!.stroke();
          if (s.life <= 0 || s.x > 1.1) shootingStar = null;
        }
      } else if (variant === "fireflies") {
        ctx!.globalCompositeOperation = "lighter";
        for (const p of parts) {
          p.phase += dt;
          p.vx += rand(-0.004, 0.004); p.vy += rand(-0.004, 0.004);
          p.vx = Math.max(-0.035, Math.min(0.035, p.vx));
          p.vy = Math.max(-0.035, Math.min(0.035, p.vy));
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.x < 0 || p.x > 1) p.vx *= -1;
          if (p.y < 0 || p.y > 1) p.vy *= -1;
          const glow = 0.25 + Math.abs(Math.sin(p.phase * 1.6)) * 0.75;
          const x = p.x * W, y = p.y * H;
          const g = ctx!.createRadialGradient(x, y, 0, x, y, p.r * 7);
          g.addColorStop(0, `rgba(${p.hue},${glow * 0.8})`);
          g.addColorStop(1, `rgba(${p.hue},0)`);
          ctx!.fillStyle = g;
          ctx!.beginPath();
          ctx!.arc(x, y, p.r * 7, 0, TAU);
          ctx!.fill();
        }
        ctx!.globalCompositeOperation = "source-over";
      }

      /* click bursts + ripples (interactive only) */
      if (interactive) {
        for (let i = ripples.length - 1; i >= 0; i--) {
          const rp = ripples[i];
          rp.r += 240 * dt;
          rp.alpha -= dt * 1.4;
          if (rp.alpha <= 0) { ripples.splice(i, 1); continue; }
          ctx!.strokeStyle = `rgba(${PINK},${rp.alpha * 0.6})`;
          ctx!.lineWidth = 1.5;
          ctx!.beginPath();
          ctx!.arc(rp.x, rp.y, rp.r, 0, TAU);
          ctx!.stroke();
          ctx!.strokeStyle = `rgba(${PURPLE},${rp.alpha * 0.4})`;
          ctx!.beginPath();
          ctx!.arc(rp.x, rp.y, rp.r * 0.65, 0, TAU);
          ctx!.stroke();
        }
        ctx!.globalCompositeOperation = "lighter";
        for (let i = burst.length - 1; i >= 0; i--) {
          const p = burst[i];
          p.life += dt;
          if (p.life > p.maxLife) { burst.splice(i, 1); continue; }
          p.vy += 60 * dt;
          p.x += p.vx * dt; p.y += p.vy * dt;
          const a = 1 - p.life / p.maxLife;
          ctx!.fillStyle = `rgba(${p.hue},${a})`;
          ctx!.beginPath();
          ctx!.arc(p.x, p.y, p.r * a + 0.4, 0, TAU);
          ctx!.fill();
        }
        ctx!.globalCompositeOperation = "source-over";
      }

      if (running && !reduced) raf = requestAnimationFrame(frame);
    }

    function onPointerMove(e: PointerEvent) {
      pointer.tx = e.clientX / Math.max(W, 1);
      pointer.ty = e.clientY / Math.max(H, 1);
    }
    function onClick(e: MouseEvent) {
      const rect = cv.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      ripples.push({ x, y, r: 6, alpha: 1 });
      const palette = [PINK, PURPLE, INDIGO, "255,214,140"];
      for (let i = 0; i < 22; i++) {
        const ang = rand(0, TAU);
        const speed = rand(60, 240);
        burst.push({
          x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed - 40,
          r: rand(1.2, 3), life: 0, maxLife: rand(0.5, 1),
          hue: palette[i % palette.length], phase: 0, depth: 1,
        });
      }
    }
    function onVisibility() {
      running = !document.hidden;
      if (running && !reduced) { last = performance.now(); raf = requestAnimationFrame(frame); }
    }

    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    if (interactive) {
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("click", onClick);
    }

    // Reduced motion: paint a single static frame
    frame(performance.now());

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      if (interactive) {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("click", onClick);
      }
    };
  }, [variant, interactive, intensity]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: "100%", height: "100%", display: "block", ...style }}
      aria-hidden
    />
  );
}
