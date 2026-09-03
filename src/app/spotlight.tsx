"use client";

import { useState } from "react";

/* Soft radial highlight that follows the cursor across the hero. Renders as
   display:contents (no box of its own) so it just wraps the section's
   existing children — mousemove still bubbles up to it from every child,
   including buttons, and the gradient overlay it renders positions itself
   against the nearest positioned ancestor (the hero <section>). */
export default function Spotlight({ children }: { children: React.ReactNode }) {
  const [pos, setPos] = useState({ x: 50, y: 0, o: 0 });

  return (
    <div
      style={{ display: "contents" }}
      onMouseMove={(e) => {
        const r = e.currentTarget.parentElement!.getBoundingClientRect();
        setPos({
          x: ((e.clientX - r.left) / r.width) * 100,
          y: ((e.clientY - r.top) / r.height) * 100,
          o: 1,
        });
      }}
      onMouseLeave={() => setPos((p) => ({ ...p, o: 0 }))}
    >
      {children}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={{
          opacity: pos.o * 0.6,
          background: `radial-gradient(480px circle at ${pos.x}% ${pos.y}%, rgba(255,255,255,0.55), transparent 65%)`,
        }}
      />
    </div>
  );
}
