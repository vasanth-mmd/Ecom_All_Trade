"use client";

import { useEffect, useRef } from "react";

/* ─────────────────────────────────────────────────────────────────────────────
   VIVID & APPETIZING LIVE DAIRY AURORA BACKGROUND
   • Multi-layer organic fluid aurora waves (rich cream, berry yogurt, strawberry, mango gold, fresh mint)
   • Floating iridescent gourmet cream orbs & dew bubbles with specular shine
   • Dynamic interactive mouse gravity halo + multi-color liquid ripples
   • Ambient twinkling starlight sparkles
   ───────────────────────────────────────────────────────────────────────────── */

interface Bubble {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseRadius: number;
  alpha: number;
  pulsePhase: number;
  pulseSpeed: number;
  hue: number;
  color: string;
  glowColor: string;
}

interface WaveLayer {
  yFraction: number;
  color1: string;
  color2: string;
  amplitude: number;
  frequency: number;
  speed: number;
  phaseOffset: number;
}

interface Ripple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  color: string;
}

interface Sparkle {
  x: number;
  y: number;
  size: number;
  maxSize: number;
  alpha: number;
  speed: number;
  phase: number;
  color: string;
}

export default function LiveBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -2000, y: -2000, targetX: -2000, targetY: -2000, isHovering: false });
  const ripplesRef = useRef<Ripple[]>([]);
  const animationFrameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let bubbles: Bubble[] = [];
    let sparkles: Sparkle[] = [];

    // Vivid appetizing dairy & gourmet palette
    const bubblePalettes = [
      { color: "rgba(168, 85, 247, 0.75)", glow: "rgba(168, 85, 247, 0.4)", hue: 275 }, // Berry Violet
      { color: "rgba(236, 72, 153, 0.7)", glow: "rgba(236, 72, 153, 0.35)", hue: 330 },  // Strawberry Curd
      { color: "rgba(245, 158, 11, 0.7)", glow: "rgba(245, 158, 11, 0.35)", hue: 42 },   // Mango & Butter
      { color: "rgba(56, 189, 248, 0.7)", glow: "rgba(56, 189, 248, 0.35)", hue: 198 },  // Fresh Mint Dew
      { color: "rgba(139, 92, 246, 0.75)", glow: "rgba(139, 92, 246, 0.4)", hue: 255 },  // Royal Purple
    ];

    // High-visibility Silky organic wave ribbons
    const waves: WaveLayer[] = [
      {
        yFraction: 0.16,
        color1: "rgba(244, 114, 182, 0.18)", // Strawberry
        color2: "rgba(168, 85, 247, 0.12)",
        amplitude: 85,
        frequency: 0.0016,
        speed: 0.0007,
        phaseOffset: 0,
      },
      {
        yFraction: 0.38,
        color1: "rgba(168, 85, 247, 0.19)", // Berry Yogurt
        color2: "rgba(56, 189, 248, 0.14)",
        amplitude: 105,
        frequency: 0.0012,
        speed: 0.00055,
        phaseOffset: Math.PI / 3,
      },
      {
        yFraction: 0.65,
        color1: "rgba(251, 191, 36, 0.16)", // Golden Butter
        color2: "rgba(236, 72, 153, 0.14)",
        amplitude: 80,
        frequency: 0.0018,
        speed: 0.00075,
        phaseOffset: Math.PI / 2,
      },
      {
        yFraction: 0.86,
        color1: "rgba(56, 189, 248, 0.18)", // Fresh Dew
        color2: "rgba(139, 92, 246, 0.15)",
        amplitude: 95,
        frequency: 0.0014,
        speed: 0.0006,
        phaseOffset: Math.PI * 0.8,
      },
    ];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      ctx.scale(dpr, dpr);
      initElements();
    };

    const initElements = () => {
      // 1. Floating Glowing Cream Bubbles / Dew Drops
      const bubbleCount = Math.floor(Math.max(20, Math.min(36, (width * height) / 38000)));
      bubbles = [];
      for (let i = 0; i < bubbleCount; i++) {
        const pal = bubblePalettes[i % bubblePalettes.length];
        const baseRadius = 10 + Math.random() * 26;
        bubbles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.5,
          vy: -0.25 - Math.random() * 0.45,
          radius: baseRadius,
          baseRadius,
          alpha: 0.55 + Math.random() * 0.4,
          pulsePhase: Math.random() * Math.PI * 2,
          pulseSpeed: 0.018 + Math.random() * 0.025,
          hue: pal.hue,
          color: pal.color,
          glowColor: pal.glow,
        });
      }

      // 2. Ambient Micro-Sparkles
      const sparkleCount = Math.floor(Math.max(25, Math.min(55, (width * height) / 28000)));
      sparkles = [];
      for (let i = 0; i < sparkleCount; i++) {
        sparkles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          size: 1.2 + Math.random() * 2.8,
          maxSize: 2.5 + Math.random() * 3.5,
          alpha: 0.3 + Math.random() * 0.7,
          speed: 0.02 + Math.random() * 0.035,
          phase: Math.random() * Math.PI * 2,
          color: Math.random() > 0.35 ? "#f472b6" : "#fef08a",
        });
      }
    };

    resize();
    window.addEventListener("resize", resize);

    // Smooth Mouse tracking
    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current.targetX = e.clientX;
      mouseRef.current.targetY = e.clientY;
      mouseRef.current.isHovering = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        mouseRef.current.targetX = e.touches[0].clientX;
        mouseRef.current.targetY = e.touches[0].clientY;
        mouseRef.current.isHovering = true;
      }
    };

    const onClick = (e: MouseEvent) => {
      const colors = ["#a855f7", "#ec4899", "#f59e0b", "#06b6d4"];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      ripplesRef.current.push({
        x: e.clientX,
        y: e.clientY,
        radius: 5,
        maxRadius: 180 + Math.random() * 90,
        alpha: 0.75,
        color: randomColor,
      });
      if (ripplesRef.current.length > 8) ripplesRef.current.shift();
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("click", onClick);

    let time = 0;

    const render = () => {
      time += 1;
      ctx.clearRect(0, 0, width, height);

      // Smooth mouse interpolation
      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.08;
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.08;

      // ── Layer 1: Multi-Wave Fluid Auroras ──
      for (let i = 0; i < waves.length; i++) {
        const w = waves[i];
        const baseY = height * w.yFraction;
        const currentPhase = time * w.speed + w.phaseOffset;

        ctx.beginPath();
        ctx.moveTo(0, height);
        ctx.lineTo(0, baseY);

        for (let x = 0; x <= width; x += 16) {
          const yOffset =
            Math.sin(x * w.frequency + currentPhase) * w.amplitude +
            Math.cos(x * w.frequency * 0.6 + currentPhase * 0.8) * (w.amplitude * 0.4);

          // Interactive fluid displacement from mouse
          let mouseInfluence = 0;
          if (mouseRef.current.isHovering) {
            const dx = x - mouseRef.current.x;
            const dy = baseY - mouseRef.current.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 280) {
              mouseInfluence = (1 - dist / 280) * 32 * Math.sin(time * 0.06);
            }
          }

          ctx.lineTo(x, baseY + yOffset + mouseInfluence);
        }

        ctx.lineTo(width, height);
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, baseY - w.amplitude, width, baseY + w.amplitude * 2);
        grad.addColorStop(0, w.color1);
        grad.addColorStop(0.5, w.color2);
        grad.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // ── Layer 2: Mouse Luminous Halo ──
      if (mouseRef.current.isHovering && mouseRef.current.x > 0 && mouseRef.current.y > 0) {
        const mouseGrad = ctx.createRadialGradient(
          mouseRef.current.x,
          mouseRef.current.y,
          0,
          mouseRef.current.x,
          mouseRef.current.y,
          260
        );
        mouseGrad.addColorStop(0, "rgba(168, 85, 247, 0.22)");
        mouseGrad.addColorStop(0.4, "rgba(236, 72, 153, 0.12)");
        mouseGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = mouseGrad;
        ctx.beginPath();
        ctx.arc(mouseRef.current.x, mouseRef.current.y, 260, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Layer 3: Interactive Ripples ──
      for (let i = ripplesRef.current.length - 1; i >= 0; i--) {
        const r = ripplesRef.current[i];
        r.radius += (r.maxRadius - r.radius) * 0.065 + 1.4;
        r.alpha *= 0.94;

        if (r.alpha < 0.02 || r.radius >= r.maxRadius) {
          ripplesRef.current.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.strokeStyle = r.color;
        ctx.globalAlpha = r.alpha;
        ctx.lineWidth = 3;
        ctx.shadowColor = r.color;
        ctx.shadowBlur = 15;
        ctx.stroke();
        ctx.restore();
      }

      // ── Layer 4: Floating Iridescent Cream Bubbles & Dew Drops ──
      for (let i = 0; i < bubbles.length; i++) {
        const b = bubbles[i];

        // Organic float
        b.x += b.vx + Math.sin(time * 0.02 + b.pulsePhase) * 0.35;
        b.y += b.vy;

        // Wrap around screen seamlessly
        if (b.y < -50) {
          b.y = height + 50;
          b.x = Math.random() * width;
        }
        if (b.x < -50) b.x = width + 50;
        if (b.x > width + 50) b.x = -50;

        // Soft pulse
        b.pulsePhase += b.pulseSpeed;
        const currentRadius = b.baseRadius * (1 + Math.sin(b.pulsePhase) * 0.15);

        // Interactive mouse push
        if (mouseRef.current.isHovering) {
          const dx = b.x - mouseRef.current.x;
          const dy = b.y - mouseRef.current.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 180 && dist > 0) {
            const force = (180 - dist) / 180;
            b.x += (dx / dist) * force * 3;
            b.y += (dy / dist) * force * 3;
          }
        }

        // Draw soft outer ambient glow
        const glowGrad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, currentRadius * 2.8);
        glowGrad.addColorStop(0, b.glowColor);
        glowGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(b.x, b.y, currentRadius * 2.8, 0, Math.PI * 2);
        ctx.fill();

        // Draw Glassy Bubble Body
        ctx.save();
        const bubbleGrad = ctx.createRadialGradient(
          b.x - currentRadius * 0.35,
          b.y - currentRadius * 0.35,
          currentRadius * 0.1,
          b.x,
          b.y,
          currentRadius
        );
        bubbleGrad.addColorStop(0, "rgba(255, 255, 255, 0.85)");
        bubbleGrad.addColorStop(0.5, b.color);
        bubbleGrad.addColorStop(1, "rgba(255, 255, 255, 0.2)");

        ctx.globalAlpha = b.alpha;
        ctx.fillStyle = bubbleGrad;
        ctx.beginPath();
        ctx.arc(b.x, b.y, currentRadius, 0, Math.PI * 2);
        ctx.fill();

        // Specular highlight gleam
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        ctx.beginPath();
        ctx.arc(b.x - currentRadius * 0.35, b.y - currentRadius * 0.35, currentRadius * 0.26, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // ── Layer 5: Sparkling Micro-Stars ──
      for (let i = 0; i < sparkles.length; i++) {
        const s = sparkles[i];
        s.phase += s.speed;
        const currentSize = s.size * (0.6 + Math.sin(s.phase) * 0.5);
        const currentAlpha = Math.max(0, s.alpha * (0.4 + Math.sin(s.phase) * 0.6));

        if (currentSize > 0.4 && currentAlpha > 0.05) {
          ctx.save();
          ctx.globalAlpha = currentAlpha;
          ctx.fillStyle = s.color;
          ctx.shadowColor = s.color;
          ctx.shadowBlur = 8;

          ctx.beginPath();
          ctx.arc(s.x, s.y, currentSize * 0.9, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
        }
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("click", onClick);
    };
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none bg-gradient-to-b from-amber-50/50 via-purple-50/30 to-indigo-50/40">
      <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />
    </div>
  );
}
