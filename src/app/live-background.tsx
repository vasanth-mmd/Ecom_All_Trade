"use client";

import { useEffect, useRef } from "react";

/* ─────────────────────────────────────────────────────────────────────────────
   ✨ NEXT-GEN MULTITRADE VIBRANT CELESTIAL AURORA & KINETIC NEBULA WALLPAPER
   • Dynamic Chromatic Plasma Energy Orbs (Electric Violet, Rose Neon, Mango Gold, Cyan Aurora)
   • Interactive Kinetic Particle Constellations with Proximity Synapse Beams
   • Silky Liquid Sine-Ribbon Waves with Refractive Mouse Distortion
   • Multi-tier Bokeh Depth-of-Field Light Rings with 3D Parallax
   • Twinkling Cross-Flare Starlight Sparkles & Interactive Liquid Ripple Shockwaves
   • Ultra-responsive Mouse Magnetic Field with Chromatic Halos
   ───────────────────────────────────────────────────────────────────────────── */

interface PlasmaOrb {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseRadius: number;
  radius: number;
  color: string;
  glow: string;
  phase: number;
  phaseSpeed: number;
}

interface ConstellationNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseX: number;
  baseY: number;
  radius: number;
  alpha: number;
  color: string;
  pulsePhase: number;
}

interface BokehRing {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  borderWidth: number;
  color: string;
  alpha: number;
  rotation: number;
  rotSpeed: number;
}

interface StarSparkle {
  x: number;
  y: number;
  size: number;
  maxSize: number;
  alpha: number;
  speed: number;
  phase: number;
  color: string;
  points: number;
}

interface RippleShockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  color: string;
  lineWidth: number;
}

export default function LiveBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({
    x: -2000,
    y: -2000,
    targetX: -2000,
    targetY: -2000,
    isHovering: false,
    speed: 0,
    lastX: -2000,
    lastY: -2000,
  });
  const ripplesRef = useRef<RippleShockwave[]>([]);
  const animationFrameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let orbs: PlasmaOrb[] = [];
    let nodes: ConstellationNode[] = [];
    let bokehRings: BokehRing[] = [];
    let sparkles: StarSparkle[] = [];

    // Vivid MultiTrade Color Palette
    const palette = [
      { color: "rgba(147, 51, 234, 0.45)", glow: "rgba(168, 85, 247, 0.35)", hex: "#a855f7" }, // Vivid Purple
      { color: "rgba(236, 72, 153, 0.42)", glow: "rgba(244, 114, 182, 0.35)", hex: "#ec4899" }, // Rose Pink
      { color: "rgba(59, 130, 246, 0.40)", glow: "rgba(96, 165, 250, 0.30)", hex: "#3b82f6" },  // Sky Indigo
      { color: "rgba(245, 158, 11, 0.38)", glow: "rgba(251, 191, 36, 0.30)", hex: "#f59e0b" },  // Amber Sun
      { color: "rgba(6, 182, 212, 0.40)", glow: "rgba(34, 211, 238, 0.32)", hex: "#06b6d4" },  // Cyan Aqua
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
      initWorld();
    };

    const initWorld = () => {
      // 1. Plasma Energy Orbs (Deep ambient illumination)
      const orbCount = Math.max(5, Math.min(8, Math.floor(width / 260)));
      orbs = [];
      for (let i = 0; i < orbCount; i++) {
        const pal = palette[i % palette.length];
        const baseRadius = Math.min(width, height) * (0.2 + Math.random() * 0.18);
        orbs.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.45,
          vy: (Math.random() - 0.5) * 0.45,
          baseRadius,
          radius: baseRadius,
          color: pal.color,
          glow: pal.glow,
          phase: Math.random() * Math.PI * 2,
          phaseSpeed: 0.008 + Math.random() * 0.012,
        });
      }

      // 2. Kinetic Constellation Nodes
      const nodeCount = Math.max(28, Math.min(50, Math.floor((width * height) / 30000)));
      nodes = [];
      for (let i = 0; i < nodeCount; i++) {
        const pal = palette[i % palette.length];
        const x = Math.random() * width;
        const y = Math.random() * height;
        nodes.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
          baseX: x,
          baseY: y,
          radius: 2 + Math.random() * 3.5,
          alpha: 0.4 + Math.random() * 0.55,
          color: pal.hex,
          pulsePhase: Math.random() * Math.PI * 2,
        });
      }

      // 3. Bokeh Depth Rings
      const bokehCount = Math.max(12, Math.min(22, Math.floor(width / 80)));
      bokehRings = [];
      for (let i = 0; i < bokehCount; i++) {
        const pal = palette[i % palette.length];
        bokehRings.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.3,
          vy: -0.2 - Math.random() * 0.35,
          radius: 18 + Math.random() * 45,
          borderWidth: 1.5 + Math.random() * 2.5,
          color: pal.hex,
          alpha: 0.15 + Math.random() * 0.25,
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.01,
        });
      }

      // 4. Starlight Cross Sparkles
      const sparkleCount = Math.max(25, Math.min(45, Math.floor((width * height) / 28000)));
      sparkles = [];
      for (let i = 0; i < sparkleCount; i++) {
        const isGold = Math.random() > 0.4;
        sparkles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          size: 2 + Math.random() * 4,
          maxSize: 4 + Math.random() * 5,
          alpha: 0.3 + Math.random() * 0.7,
          speed: 0.025 + Math.random() * 0.04,
          phase: Math.random() * Math.PI * 2,
          color: isGold ? "#fbbf24" : "#f472b6",
          points: Math.random() > 0.5 ? 4 : 5,
        });
      }
    };

    resize();
    window.addEventListener("resize", resize);

    const onMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - mouseRef.current.targetX;
      const dy = e.clientY - mouseRef.current.targetY;
      mouseRef.current.speed = Math.sqrt(dx * dx + dy * dy);
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
      const rippleColors = ["#a855f7", "#ec4899", "#3b82f6", "#f59e0b", "#06b6d4"];
      for (let k = 0; k < 2; k++) {
        ripplesRef.current.push({
          x: e.clientX,
          y: e.clientY,
          radius: 5 + k * 18,
          maxRadius: 200 + Math.random() * 120 + k * 40,
          alpha: 0.85 - k * 0.2,
          color: rippleColors[(ripplesRef.current.length + k) % rippleColors.length],
          lineWidth: 3.5 - k * 1,
        });
      }
      if (ripplesRef.current.length > 12) ripplesRef.current.splice(0, 2);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("click", onClick);

    let time = 0;

    // Helper to draw shiny cross star
    const drawCrossStar = (
      c: CanvasRenderingContext2D,
      cx: number,
      cy: number,
      spikes: number,
      outerRadius: number,
      innerRadius: number,
      color: string,
      alpha: number
    ) => {
      c.save();
      c.beginPath();
      c.translate(cx, cy);
      c.rotate(time * 0.015);
      let rot = (Math.PI / 2) * 3;
      let x = 0;
      let y = 0;
      const step = Math.PI / spikes;

      c.moveTo(0, -outerRadius);
      for (let i = 0; i < spikes; i++) {
        x = Math.cos(rot) * outerRadius;
        y = Math.sin(rot) * outerRadius;
        c.lineTo(x, y);
        rot += step;

        x = Math.cos(rot) * innerRadius;
        y = Math.sin(rot) * innerRadius;
        c.lineTo(x, y);
        rot += step;
      }
      c.lineTo(0, -outerRadius);
      c.closePath();

      c.fillStyle = color;
      c.globalAlpha = alpha;
      c.shadowColor = color;
      c.shadowBlur = 10;
      c.fill();
      c.restore();
    };

    const render = () => {
      time += 1;
      ctx.clearRect(0, 0, width, height);

      // Smooth mouse interpolation
      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.07;
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.07;

      // ── Layer 1: Ambient Plasma Glowing Orbs ──
      for (let i = 0; i < orbs.length; i++) {
        const o = orbs[i];
        o.phase += o.phaseSpeed;
        o.x += o.vx + Math.sin(time * 0.008 + o.phase) * 0.6;
        o.y += o.vy + Math.cos(time * 0.008 + o.phase) * 0.6;

        if (o.x < -o.baseRadius) o.x = width + o.baseRadius;
        if (o.x > width + o.baseRadius) o.x = -o.baseRadius;
        if (o.y < -o.baseRadius) o.y = height + o.baseRadius;
        if (o.y > height + o.baseRadius) o.y = -o.baseRadius;

        o.radius = o.baseRadius * (1 + Math.sin(o.phase) * 0.18);

        // Mouse displacement
        if (mouseRef.current.isHovering) {
          const dx = o.x - mouseRef.current.x;
          const dy = o.y - mouseRef.current.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 400 && dist > 0) {
            const push = (400 - dist) / 400;
            o.x += (dx / dist) * push * 2.5;
            o.y += (dy / dist) * push * 2.5;
          }
        }

        const grad = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.radius);
        grad.addColorStop(0, o.color);
        grad.addColorStop(0.5, o.glow);
        grad.addColorStop(1, "rgba(255, 255, 255, 0)");

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Layer 2: Silky Undulating Neon Waves ──
      const waveConfigs = [
        { yRel: 0.22, amp: 55, freq: 0.002, speed: 0.0012, c1: "rgba(168, 85, 247, 0.12)", c2: "rgba(236, 72, 153, 0.06)" },
        { yRel: 0.52, amp: 70, freq: 0.0015, speed: 0.0009, c1: "rgba(59, 130, 246, 0.10)", c2: "rgba(6, 182, 212, 0.05)" },
        { yRel: 0.78, amp: 60, freq: 0.0018, speed: 0.0014, c1: "rgba(245, 158, 11, 0.10)", c2: "rgba(168, 85, 247, 0.05)" },
      ];

      for (let w = 0; w < waveConfigs.length; w++) {
        const cfg = waveConfigs[w];
        const baseY = height * cfg.yRel;
        const curPhase = time * cfg.speed + w * 1.5;

        ctx.beginPath();
        ctx.moveTo(0, height);
        ctx.lineTo(0, baseY);

        for (let x = 0; x <= width; x += 18) {
          const yOff =
            Math.sin(x * cfg.freq + curPhase) * cfg.amp +
            Math.cos(x * cfg.freq * 0.7 + curPhase * 1.2) * (cfg.amp * 0.4);

          let mouseAttract = 0;
          if (mouseRef.current.isHovering) {
            const dx = x - mouseRef.current.x;
            const dy = baseY - mouseRef.current.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 260) {
              mouseAttract = (1 - dist / 260) * 35 * Math.sin(time * 0.08);
            }
          }

          ctx.lineTo(x, baseY + yOff + mouseAttract);
        }

        ctx.lineTo(width, height);
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, baseY - cfg.amp, width, baseY + cfg.amp * 2);
        grad.addColorStop(0, cfg.c1);
        grad.addColorStop(0.6, cfg.c2);
        grad.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // ── Layer 3: Interactive Kinetic Constellation Mesh ──
      const connectDist = 130;
      for (let i = 0; i < nodes.length; i++) {
        const n1 = nodes[i];
        n1.x += n1.vx;
        n1.y += n1.vy;

        if (n1.x < 0 || n1.x > width) n1.vx *= -1;
        if (n1.y < 0 || n1.y > height) n1.vy *= -1;

        // Mouse gravitational attraction
        if (mouseRef.current.isHovering) {
          const dx = mouseRef.current.x - n1.x;
          const dy = mouseRef.current.y - n1.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 190 && dist > 0) {
            const force = (190 - dist) / 190;
            n1.x += (dx / dist) * force * 1.8;
            n1.y += (dy / dist) * force * 1.8;
          }
        }

        // Draw connections between neighboring nodes
        for (let j = i + 1; j < nodes.length; j++) {
          const n2 = nodes[j];
          const dx = n1.x - n2.x;
          const dy = n1.y - n2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < connectDist) {
            const lineAlpha = (1 - dist / connectDist) * 0.28;
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(n1.x, n1.y);
            ctx.lineTo(n2.x, n2.y);
            ctx.strokeStyle = n1.color;
            ctx.globalAlpha = lineAlpha;
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
          }
        }

        // Draw node with glow
        n1.pulsePhase += 0.03;
        const curR = n1.radius * (1 + Math.sin(n1.pulsePhase) * 0.2);
        ctx.save();
        ctx.beginPath();
        ctx.arc(n1.x, n1.y, curR, 0, Math.PI * 2);
        ctx.fillStyle = n1.color;
        ctx.globalAlpha = n1.alpha;
        ctx.shadowColor = n1.color;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.restore();
      }

      // ── Layer 4: Bokeh Geometric Light Rings ──
      for (let i = 0; i < bokehRings.length; i++) {
        const b = bokehRings[i];
        b.x += b.vx;
        b.y += b.vy;
        b.rotation += b.rotSpeed;

        if (b.y < -b.radius) {
          b.y = height + b.radius;
          b.x = Math.random() * width;
        }
        if (b.x < -b.radius) b.x = width + b.radius;
        if (b.x > width + b.radius) b.x = -b.radius;

        ctx.save();
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.strokeStyle = b.color;
        ctx.globalAlpha = b.alpha;
        ctx.lineWidth = b.borderWidth;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 12;
        ctx.stroke();

        // Inner glowing core
        const coreGrad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.radius * 0.8);
        coreGrad.addColorStop(0, b.color);
        coreGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = coreGrad;
        ctx.globalAlpha = b.alpha * 0.4;
        ctx.fill();
        ctx.restore();
      }

      // ── Layer 5: Interactive Click Shockwave Ripples ──
      for (let i = ripplesRef.current.length - 1; i >= 0; i--) {
        const r = ripplesRef.current[i];
        r.radius += (r.maxRadius - r.radius) * 0.06 + 2.0;
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
        ctx.lineWidth = r.lineWidth;
        ctx.shadowColor = r.color;
        ctx.shadowBlur = 16;
        ctx.stroke();
        ctx.restore();
      }

      // ── Layer 6: Interactive Mouse Chromatic Aura ──
      if (mouseRef.current.isHovering && mouseRef.current.x > 0 && mouseRef.current.y > 0) {
        const auraGrad = ctx.createRadialGradient(
          mouseRef.current.x,
          mouseRef.current.y,
          0,
          mouseRef.current.x,
          mouseRef.current.y,
          280
        );
        auraGrad.addColorStop(0, "rgba(168, 85, 247, 0.26)");
        auraGrad.addColorStop(0.35, "rgba(236, 72, 153, 0.16)");
        auraGrad.addColorStop(0.7, "rgba(59, 130, 246, 0.08)");
        auraGrad.addColorStop(1, "rgba(255, 255, 255, 0)");

        ctx.save();
        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(mouseRef.current.x, mouseRef.current.y, 280, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // ── Layer 7: Twinkling Starlight Cross Sparkles ──
      for (let i = 0; i < sparkles.length; i++) {
        const s = sparkles[i];
        s.phase += s.speed;
        const curSize = s.size * (0.6 + Math.sin(s.phase) * 0.6);
        const curAlpha = Math.max(0, s.alpha * (0.4 + Math.sin(s.phase) * 0.6));

        if (curSize > 0.6 && curAlpha > 0.06) {
          drawCrossStar(ctx, s.x, s.y, s.points, curSize * 2.2, curSize * 0.45, s.color, curAlpha);
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
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none bg-gradient-to-br from-purple-50/60 via-amber-50/30 to-indigo-50/50">
      <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />
    </div>
  );
}
