"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/* Glassmorphic navbar with harmonious purple-aurora palette */
export default function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={
        "sticky top-0 z-30 transition-all duration-300 " +
        (scrolled
          ? "bg-white/80 backdrop-blur-xl shadow-lg shadow-purple-950/5 border-b border-purple-100/50"
          : "bg-white/60 backdrop-blur-md border-b border-transparent")
      }
    >
      <div className="max-w-7xl mx-auto flex items-center gap-3 sm:gap-8 px-4 sm:px-6 py-4">
        <div className="flex items-baseline gap-1 select-none">
          <span className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-purple-950 via-purple-900 to-fuchsia-950 bg-clip-text text-transparent">
            Milky&nbsp;Mist
          </span>
          <span className="text-[10px] font-extrabold text-purple-800 align-super">®</span>
        </div>
        <nav className="hidden md:flex items-center gap-7 text-[15px] font-semibold text-slate-700">
          <NavLink active>Home</NavLink>
          <NavLink>Zepto Trade FR 2026</NavLink>
          <NavLink>Zepto - Reports</NavLink>
          <NavLink>Jarvis AI</NavLink>
        </nav>
        <div className="flex-1" />
        <Link
          href="/login"
          className="group relative inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-purple-950 bg-white/90 border border-purple-200/90 shadow-md shadow-purple-500/10 hover:shadow-xl hover:shadow-purple-500/25 hover:border-purple-400 hover:-translate-y-0.5 active:scale-95 transition-all duration-300 overflow-hidden"
        >
          {/* Animated gradient accent background on hover */}
          <span className="absolute inset-0 bg-gradient-to-r from-purple-500/15 via-fuchsia-500/20 to-amber-400/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          
          {/* Shimmer sweep effect */}
          <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full duration-1000 bg-gradient-to-r from-transparent via-white/80 to-transparent transform -skew-x-12 transition-transform ease-in-out" />
          
          {/* AI Sparkle Icon / Dot */}
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-gradient-to-tr from-purple-600 to-fuchsia-500" />
          </span>
          
          <span className="relative z-10 font-extrabold bg-gradient-to-r from-purple-950 via-purple-900 to-fuchsia-950 group-hover:from-purple-700 group-hover:to-fuchsia-600 bg-clip-text text-transparent transition-colors">
            Log in
          </span>
          
          <span className="text-xs text-purple-600 group-hover:translate-x-0.5 transition-transform duration-200">
            ✦
          </span>
        </Link>
      </div>
    </header>
  );
}

function NavLink({ children, active = false }: { children: React.ReactNode; active?: boolean }) {
  return (
    <span
      className={
        "relative cursor-default pb-1 " +
        (active ? "text-purple-700 font-bold" : "hover:text-purple-700 transition-colors")
      }
    >
      {children}
      <span
        className={
          "absolute left-0 -bottom-0.5 h-0.5 rounded-full bg-gradient-to-r from-purple-600 to-fuchsia-500 transition-all duration-300 " +
          (active ? "w-full" : "w-0 hover:w-full")
        }
      />
    </span>
  );
}

