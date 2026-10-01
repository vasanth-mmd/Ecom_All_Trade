"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { dateRangeLabel } from "@/lib/date-range";

const items = [
  { href: "/dashboard", label: "Overview", icon: "▦" },
  { href: "/dashboard/priority-po", label: "Priority PO Dispatch", icon: "🚨" },
  { href: "/dashboard/opportunity", label: "Opportunity Dashboard", icon: "🎯" },
  { href: "/dashboard/trending-analysis", label: "Trending Analysis", icon: "📈" },
  { href: "/dashboard/heatmap", label: "Heatmap Matrix", icon: "🔥" },
  { href: "/dashboard/full", label: "Full Dashboard", icon: "📊" },
  { href: "/dashboard/month-compare", label: "Month Comparison", icon: "🗓️" },
  { href: "/dashboard/reports", label: "Reports", icon: "📋" },
  { href: "/dashboard/daily-po", label: "Daily PO & Gap Tracker", icon: "📅" },
  { href: "/dashboard/city-sku", label: "City SKU Performance", icon: "🏙️" },
  { href: "/dashboard/fry-summary", label: "FR % Summary", icon: "🧮" },
  { href: "/dashboard/po-expiry", label: "PO Expiry Alert", icon: "⏰" },
  { href: "/dashboard/ai", label: "AI", icon: "🤖" },
  { href: "/dashboard/data-source", label: "Data Source & Reference", icon: "📁" },
  { href: "/dashboard/upload", label: "Sync Data", icon: "🔄" },
];

type Theme = "dark" | "light";

export default function SideNav({ email }: { email: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [tradeRanges, setTradeRanges] = useState<{ name: string; label: string }[]>([]);
  const [theme, setTheme] = useState<Theme>("dark");

  // load saved theme on mount
  useEffect(() => {
    const saved = window.localStorage.getItem("nav-theme") as Theme | null;
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      window.localStorage.setItem("nav-theme", next);
      return next;
    });
  };

  useEffect(() => {
    fetch("/api/data")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || !d.dims || !Array.isArray(d.dims.trade) || !Array.isArray(d.rows)) return;
        const trades: string[] = d.dims.trade;
        const minD = new Array(trades.length).fill(0);
        const maxD = new Array(trades.length).fill(0);
        for (const r of d.rows as number[][]) {
          const t = r[1], dt = r[11];
          if (t !== undefined && dt > 0) {
            if (!minD[t] || dt < minD[t]) minD[t] = dt;
            if (!maxD[t] || dt > maxD[t]) maxD[t] = dt;
          }
        }
        setTradeRanges(
          trades
            .map((name, i) => ({ name, label: dateRangeLabel(minD[i], maxD[i]) }))
            .filter((x) => x.label)
        );
      })
      .catch(() => {});
  }, []);

  const isDark = theme === "dark";

  // shared style tokens so light/dark stay consistent
  const bg = isDark ? "bg-[#00072D]" : "bg-white";
  const border = isDark ? "border-white/10" : "border-slate-200";
  const brandText = isDark ? "text-white" : "text-[#12275e]";
  const subText = isDark ? "text-slate-400" : "text-slate-500";
  const sectionLabel = isDark ? "text-slate-500" : "text-slate-400";
  const idleItem = isDark
    ? "text-slate-300 hover:bg-white/10 hover:text-white"
    : "text-slate-600 hover:bg-slate-100";
  const activeItem = isDark
    ? "bg-indigo-500/20 text-white"
    : "bg-indigo-50 text-indigo-700";
  const chipBg = isDark ? "bg-white/5" : "bg-slate-50";
  const chipName = isDark ? "text-slate-200" : "text-slate-700";
  const chipLabel = isDark ? "text-slate-400" : "text-slate-500";
  const signOutBtn = isDark
    ? "border-white/15 text-slate-200 hover:bg-white/10"
    : "border-slate-300 hover:bg-slate-100";
  const iconBtn = isDark
    ? "text-slate-300 hover:bg-white/10"
    : "text-slate-600 hover:bg-slate-100";

  return (
    <>
      {/* ---- mobile top bar: hamburger + brand (hidden on md+) ---- */}
      <div className={`md:hidden fixed top-0 inset-x-0 z-40 h-14 ${bg} border-b ${border} flex items-center gap-3 px-4`}>
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className={`w-9 h-9 -ml-1.5 grid place-items-center rounded-lg ${iconBtn}`}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <div className={`text-base font-extrabold tracking-tight ${brandText}`}>Milky Mist</div>
      </div>

      {/* ---- backdrop, mobile only, while drawer is open ---- */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={
          `w-60 shrink-0 ${bg} border-r ${border} flex flex-col ` +
          "fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-out " +
          "md:static md:translate-x-0 " +
          (open ? "translate-x-0" : "-translate-x-full")
        }
      >
        <div className={`px-5 py-5 border-b ${border} flex items-center justify-between`}>
          <div>
            <div className={`text-lg font-extrabold tracking-tight ${brandText}`}>
              Milky Mist
            </div>
            <div className={`text-[11px] ${subText} mt-0.5`}>MultiTrade Fill Rate Report 2026</div>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className={`md:hidden w-8 h-8 grid place-items-center rounded-lg ${iconBtn}`}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className={`px-3 pt-4 text-[11px] font-semibold tracking-wider ${sectionLabel} uppercase`}>
          General
        </div>
        <nav className="px-3 py-2 space-y-1 flex-1 overflow-y-auto min-h-0">
          {items.map((it) => {
            const active =
              it.href === "/dashboard" ? path === "/dashboard" : path.startsWith(it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                onClick={() => setOpen(false)}
                className={
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition " +
                  (active ? activeItem : idleItem)
                }
              >
                <span className="w-5 text-center">{it.icon}</span>
                {it.label}
              </Link>
            );
          })}
        </nav>

        {tradeRanges.length > 0 && (
          <div className="px-4 pb-3">
            <div className={`text-[11px] font-semibold tracking-wider ${sectionLabel} uppercase px-1 mb-1.5`}>
              Trade Date Range
            </div>
            <div className="space-y-1">
              {tradeRanges.map((t) => (
                <div
                  key={t.name}
                  className={`flex items-center justify-between px-2 py-1 rounded-md ${chipBg} text-xs`}
                >
                  <span className={`font-medium ${chipName} truncate`}>{t.name}</span>
                  <span className={`${chipLabel} shrink-0 ml-2`}>{t.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ---- theme toggle ---- */}
        <div className={`px-5 py-3 border-t ${border} flex items-center justify-between`}>
          <span className={`text-xs font-medium ${isDark ? "text-slate-300" : "text-slate-600"}`}>
            {isDark ? "Dark Mode" : "Light Mode"}
          </span>
          <button
            onClick={toggleTheme}
            aria-label="Toggle color theme"
            aria-pressed={isDark}
            className={
              "relative w-10 h-5 rounded-full transition-colors " +
              (isDark ? "bg-indigo-500" : "bg-slate-300")
            }
          >
            <span
              className={
                "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform " +
                (isDark ? "translate-x-5" : "translate-x-0")
              }
            />
          </button>
        </div>

        <div className={`px-5 py-4 border-t ${border}`}>
          <div className={`text-xs ${subText} truncate`} title={email}>
            {email}
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className={`mt-2 w-full text-sm font-medium px-3 py-1.5 rounded-lg border ${signOutBtn} transition`}
          >
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}