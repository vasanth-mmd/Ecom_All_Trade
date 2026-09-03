"use client";

import { useRef, useState } from "react";

/* Mouse-tracked 3D tilt: rotates the card toward the cursor and lifts it,
   with a soft glare that follows the pointer. Resets smoothly on leave. */
export default function TiltCard({
  children,
  className = "",
  maxTilt = 8,
}: {
  children: React.ReactNode;
  className?: string;
  maxTilt?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const [glare, setGlare] = useState({ x: 50, y: 50, o: 0 });
  const [transitioning, setTransitioning] = useState(false);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    const rx = (0.5 - py) * maxTilt * 2;
    const ry = (px - 0.5) * maxTilt * 2;
    setTransitioning(false);
    setStyle({
      transform: `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-4px) scale(1.02)`,
    });
    setGlare({ x: px * 100, y: py * 100, o: 1 });
  };

  const onLeave = () => {
    setTransitioning(true);
    setStyle({ transform: "perspective(900px) rotateX(0deg) rotateY(0deg) translateY(0) scale(1)" });
    setGlare((g) => ({ ...g, o: 0 }));
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{
        ...style,
        transitionProperty: "transform",
        transitionDuration: transitioning ? "450ms" : "80ms",
        transitionTimingFunction: transitioning ? "cubic-bezier(0.16, 1, 0.3, 1)" : "linear",
        transformStyle: "preserve-3d",
      }}
      className={"relative will-change-transform " + className}
    >
      {children}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300"
        style={{
          opacity: glare.o * 0.5,
          background: `radial-gradient(220px circle at ${glare.x}% ${glare.y}%, rgba(255,255,255,0.85), transparent 60%)`,
        }}
      />
    </div>
  );
}
