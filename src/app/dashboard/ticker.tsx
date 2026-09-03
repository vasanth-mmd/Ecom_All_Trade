"use client";

import { useEffect, useState } from "react";
import { TickerSyncPayload } from "@/lib/ticker-sync";

type Item = {
  label: string;
  value: string;
  delta?: string;
  up?: boolean | null;
  detail?: string;
  badgeCls?: string;
};

const L = (n: number, d = 1) =>
  n.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: 0 });
const L2 = (n: number) =>
  n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

const ymdToUTC = (n: number) => {
  const s = String(n);
  return s.length === 8 ? Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)) : null;
};
const diffDays = (fromYmd: number, toYmd: number) => {
  const a = ymdToUTC(fromYmd),
    b = ymdToUTC(toYmd);
  if (a == null || b == null) return null;
  return Math.round((b - a) / 86400000);
};
const todayYmd = () => {
  const t = new Date();
  return t.getUTCFullYear() * 10000 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate();
};

const POLL_MS = 30_000;

// Default 3 Core Finalized Statuses
const DEFAULT_3_STATUSES = new Set(["COMPLETED", "GRN_DONE", "EXPIRED"]);

export default function Ticker() {
  const [items, setItems] = useState<Item[]>([]);
  const [tickerBadge, setTickerBadge] = useState("3 STATUSES ACTIVE");
  const [popup, setPopup] = useState<{ it: Item; x: number } | null>(null);

  // 1. Listen for active dashboard filter synchronization events
  useEffect(() => {
    const handleSync = (e: Event) => {
      const customEvent = e as CustomEvent<TickerSyncPayload>;
      const p = customEvent.detail;
      if (!p) return;

      const selStatuses = p.selectedStatuses || [];
      const hasStatusFilter = selStatuses.length > 0;

      const badgeText = hasStatusFilter
        ? selStatuses.length === 3
          ? "3 STATUSES ACTIVE"
          : `${selStatuses.length} STATUSES ACTIVE`
        : p.activeViewTitle || "LIVE";
      setTickerBadge(badgeText);

      const list: Item[] = [
        {
          label: "FILL RATE (3 STATUSES)",
          value: L(p.frVal, 1) + "%",
          delta: p.frVal >= 90 ? "▲ TARGET MET" : "▼ BELOW TARGET",
          up: p.frVal >= 90,
          detail: `Based strictly on selected statuses [${selStatuses.join(
            ", "
          )}]: PO ₹${L2(p.poVal)}L · GRN ₹${L2(p.grnVal)}L · Gap ₹${L2(p.gapVal)}L (${L(
            p.poCount
          )} POs)`,
        },
        {
          label: "PO VALUE",
          value: "₹" + L2(p.poVal) + " L",
          delta: `${L(p.poCount)} Orders`,
          up: null,
          detail: `Total PO Value for selected statuses: ₹${L2(p.poVal)} Lakhs (${L(
            p.poQty
          )} units across ${L(p.poCount)} POs)`,
        },
        {
          label: "GRN VALUE",
          value: "₹" + L2(p.grnVal) + " L",
          delta: `${p.frVal.toFixed(1)}% Supplied`,
          up: true,
          detail: `Goods Received Value: ₹${L2(p.grnVal)} Lakhs (${L(p.grnQty)} units fulfilled)`,
        },
        {
          label: "VALUE GAP",
          value: "₹" + L2(p.gapVal) + " L",
          delta: p.gapVal > 0 ? "Open Gap" : "Zero Gap",
          up: p.gapVal === 0,
          detail: `Unfulfilled Gap Value (PO − GRN): ₹${L2(p.gapVal)} Lakhs`,
        },
      ];

      // Show ONLY the selected/ticked status breakdown cards in the ticker
      if (p.statusBreakdown && p.statusBreakdown.length > 0) {
        // Filter to only include statuses that the user actually ticked
        const activeStatusItems = hasStatusFilter
          ? p.statusBreakdown.filter((sb) =>
              selStatuses.some((s) => s.trim().toUpperCase() === sb.status.trim().toUpperCase())
            )
          : p.statusBreakdown.filter((sb) => DEFAULT_3_STATUSES.has(sb.status.trim().toUpperCase()));

        for (const sb of activeStatusItems) {
          const isDone =
            sb.status.toUpperCase() === "COMPLETED" ||
            sb.status.toUpperCase() === "GRN_DONE" ||
            sb.status.toUpperCase() === "FULLY SUPPLIED";
          const isExp = sb.status.toUpperCase() === "EXPIRED";

          list.push({
            label: `${isDone ? "✓ " : isExp ? "🚨 " : "• "}${sb.status.toUpperCase()}`,
            value: `₹${L2(sb.grnVal > 0 ? sb.grnVal : sb.poVal)} L`,
            delta: `${sb.poCount} POs · ${sb.frVal.toFixed(0)}% FR`,
            up: isDone ? true : isExp ? false : null,
            detail: `Status [${sb.status}]: PO ₹${L2(sb.poVal)}L, GRN ₹${L2(sb.grnVal)}L, Gap ₹${L2(
              sb.gapVal
            )}L across ${sb.poCount} POs`,
          });
        }
      }

      // Add Trade channels for selected statuses
      if (p.trades && p.trades.length > 0) {
        for (const t of p.trades) {
          list.push({
            label: t.name.toUpperCase(),
            value: L(t.frVal, 1) + "%",
            delta: `Gap ₹${L2(t.gapVal)}L`,
            up: t.frVal >= p.frVal,
            detail: `${t.name} (selected statuses): PO ₹${L2(t.poVal)}L · GRN ₹${L2(
              t.grnVal
            )}L · Gap ₹${L2(t.gapVal)}L (${t.frVal.toFixed(1)}% FR)`,
          });
        }
      }

      // Add Cities for selected statuses
      if (p.cities && p.cities.length > 0) {
        for (const c of p.cities.slice(0, 5)) {
          list.push({
            label: `${c.name.toUpperCase()} GAP`,
            value: `₹${L2(c.gapVal)} L`,
            delta: `${c.frVal.toFixed(0)}% FR`,
            up: false,
            detail: `${c.name} (selected statuses): PO ₹${L2(c.poVal)}L · GRN ₹${L2(
              c.grnVal
            )}L · Gap ₹${L2(c.gapVal)}L`,
          });
        }
      }

      setItems(list);
    };

    window.addEventListener("trade_fr:ticker_sync", handleSync as EventListener);
    return () =>
      window.removeEventListener("trade_fr:ticker_sync", handleSync as EventListener);
  }, []);

  // 2. Default fetch from /api/data on initial load: strictly calculate for 3 Core Statuses (COMPLETED, GRN_DONE, EXPIRED)
  useEffect(() => {
    const load = () =>
      fetch("/api/data")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d || !Array.isArray(d.rows) || !d.dims || !Array.isArray(d.dims.month)) return;
          let latestDate = 0;
          let cur = -1;
          for (const r of d.rows) {
            const dt = r[11] || 0;
            if (dt && dt > latestDate) {
              latestDate = dt;
              cur = r[0];
            }
          }
          if (cur < 0) return;
          const monthHasRows = d.dims.month.map(() => false);
          for (const r of d.rows) {
            if (r[0] !== undefined) monthHasRows[r[0]] = true;
          }
          const mName = d.dims.month[cur] || "";

          // Filter strictly for the 3 ticked statuses: COMPLETED, GRN_DONE, EXPIRED
          let poQ = 0,
            poV = 0,
            gQ = 0,
            gV = 0;
          const trades = (d.dims.trade || []).map((t: string) => ({ t, poV: 0, gV: 0 }));
          const cities = (d.dims.city || []).map((c: string) => ({ c, poV: 0, gV: 0 }));

          const byStatus = new Map<
            string,
            { poVal: number; grnVal: number; gapVal: number; poCount: Set<number> }
          >();
          const pos = new Set<number>();

          for (const r of d.rows) {
            if (r[0] === cur) {
              const statusName = (d.dims.status?.[r[5]] || "").trim().toUpperCase();
              // Only include rows matching the 3 statuses
              if (
                statusName !== "COMPLETED" &&
                statusName !== "GRN_DONE" &&
                statusName !== "EXPIRED" &&
                statusName !== "FULLY SUPPLIED" &&
                statusName !== "PO FULLY SUPPLIED"
              ) {
                continue;
              }

              poQ += r[7];
              poV += r[8];
              gQ += r[9];
              gV += r[10];
              pos.add(r[12]);
              trades[r[1]].poV += r[8];
              trades[r[1]].gV += r[10];
              cities[r[3]].poV += r[8];
              cities[r[3]].gV += r[10];

              const stb = byStatus.get(statusName) || {
                poVal: 0,
                grnVal: 0,
                gapVal: 0,
                poCount: new Set<number>(),
              };
              stb.poVal += r[8];
              stb.grnVal += r[10];
              stb.gapVal += Math.max(0, r[8] - r[10]);
              stb.poCount.add(r[12]);
              byStatus.set(statusName, stb);
            }
          }

          const frV = poV ? (gV / poV) * 100 : 0;
          const gapV = Math.max(0, poV - gV);

          setTickerBadge("3 STATUSES ACTIVE");

          const list: Item[] = [
            {
              label: `${mName.toUpperCase()} FILL RATE (3 STATUSES)`,
              value: L(frV, 1) + "%",
              delta: frV >= 90 ? "▲ TARGET MET" : "▼ BELOW TARGET",
              up: frV >= 90,
              detail: `Calculated strictly for [EXPIRED, COMPLETED, GRN_DONE]: PO ₹${L2(
                poV
              )}L · GRN ₹${L2(gV)}L · Gap ₹${L2(gapV)}L (${L(pos.size)} POs)`,
            },
            {
              label: "PO VALUE",
              value: "₹" + L2(poV) + " L",
              delta: `${L(pos.size)} Orders`,
              up: null,
              detail: `${mName} PO Value for the 3 ticked statuses: ₹${L2(poV)} Lakhs across ${L(
                pos.size
              )} orders`,
            },
            {
              label: "GRN VALUE",
              value: "₹" + L2(gV) + " L",
              delta: `${frV.toFixed(1)}% Supplied`,
              up: true,
              detail: `${mName} GRN Value for the 3 ticked statuses: ₹${L2(gV)} Lakhs`,
            },
            {
              label: "VALUE GAP",
              value: "₹" + L2(gapV) + " L",
              delta: gapV > 0 ? "Open Gap" : "Zero Gap",
              up: gapV === 0,
              detail: `Unfulfilled Gap (PO − GRN) for 3 statuses: ₹${L2(gapV)} Lakhs`,
            },
          ];

          // Add the 3 Status Cards ONLY
          for (const [status, sb] of byStatus.entries()) {
            const isDone =
              status === "COMPLETED" ||
              status === "GRN_DONE" ||
              status === "FULLY SUPPLIED";
            const isExp = status === "EXPIRED";
            const fr = sb.poVal > 0 ? (sb.grnVal / sb.poVal) * 100 : 0;

            list.push({
              label: `${isDone ? "✓ " : isExp ? "🚨 " : "• "}${status}`,
              value: `₹${L2(sb.grnVal > 0 ? sb.grnVal : sb.poVal)} L`,
              delta: `${sb.poCount.size} POs · ${fr.toFixed(0)}% FR`,
              up: isDone ? true : isExp ? false : null,
              detail: `Status [${status}]: PO ₹${L2(sb.poVal)}L, GRN ₹${L2(sb.grnVal)}L, Gap ₹${L2(
                sb.gapVal
              )}L across ${sb.poCount.size} POs`,
            });
          }

          // Add Trades for 3 statuses
          for (const t of trades.filter((t: any) => t.poV > 0).sort((a: any, b: any) => b.poV - a.poV)) {
            const fr = (t.gV / t.poV) * 100;
            list.push({
              label: t.t.toUpperCase(),
              value: L(fr, 1) + "%",
              delta: `Gap ₹${L2(t.poV - t.gV)}L`,
              up: fr >= frV,
              detail: `${t.t} (3 statuses): PO ₹${L2(t.poV)}L · GRN ₹${L2(t.gV)}L · Gap ₹${L2(
                t.poV - t.gV
              )}L`,
            });
          }

          // Add Cities for 3 statuses
          for (const c of cities
            .map((c: any) => ({ c: c.c, gap: c.poV - c.gV, poV: c.poV, gV: c.gV }))
            .filter((c: any) => c.gap > 0)
            .sort((a: any, b: any) => b.gap - a.gap)
            .slice(0, 5)) {
            list.push({
              label: `${c.c.toUpperCase()} GAP`,
              value: `₹${L2(c.gap)} L`,
              delta: `${((c.gV / (c.poV || 1)) * 100).toFixed(0)}% FR`,
              up: false,
              detail: `${c.c} value gap for 3 statuses: ₹${L2(c.gap)} Lakhs`,
            });
          }

          setItems(list);
        })
        .catch(() => {});

    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, []);

  if (!items.length) return null;
  const strip = (
    <div className="flex items-center shrink-0">
      {items.map((it, i) => (
        <span
          key={i}
          onClick={(e) => setPopup({ it, x: (e as any).clientX })}
          className="flex items-baseline gap-2 px-6 whitespace-nowrap border-r border-sky-500/15 cursor-pointer hover:bg-white/5 transition-colors"
        >
          <span className="text-[10px] tracking-wider text-sky-400/90 font-bold">{it.label}</span>
          <span className="text-sm font-extrabold text-white drop-shadow">{it.value}</span>
          {it.delta && (
            <span
              className={
                "text-[11px] font-semibold " +
                (it.up === true
                  ? "text-emerald-400"
                  : it.up === false
                  ? "text-rose-400"
                  : "text-amber-300")
              }
            >
              {it.delta}
            </span>
          )}
          {!it.delta && it.up === false && <span className="text-rose-400 text-[11px]">▼</span>}
        </span>
      ))}
    </div>
  );

  return (
    <div
      className="bg-[#070d24] border-b-2 border-sky-500/40 overflow-hidden select-none flex items-center shadow-md relative z-30"
      title={"Live figures calculated strictly from the 3 ticked statuses"}
    >
      <style>{`
        @keyframes mmtick { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .mmticker { display: flex; width: max-content; animation: mmtick 45s linear infinite; }
        .mmticker:hover { animation-play-state: paused; }
      `}</style>
      <span className="shrink-0 z-10 bg-sky-500 text-[#071022] text-[10px] font-black tracking-widest px-3.5 py-2.5 uppercase shadow-sm">
        {tickerBadge}
      </span>
      <div className="overflow-hidden">
        <div className="mmticker py-2.5">
          {strip}
          {strip}
        </div>
      </div>
      {popup && (
        <div
          className="fixed z-50 top-11 bg-slate-900 text-white text-xs rounded-2xl shadow-2xl p-4 border border-sky-400/40 max-w-sm backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
          style={{ left: Math.min(window.innerWidth - 320, Math.max(16, popup.x - 140)) }}
          onClick={() => setPopup(null)}
        >
          <div className="flex items-center justify-between gap-2 border-b border-sky-500/30 pb-1.5 mb-2">
            <span className="font-extrabold text-sky-400 uppercase tracking-wider text-[11px]">
              {popup.it.label}
            </span>
            <span className="text-white/60 hover:text-white cursor-pointer font-bold">✕</span>
          </div>
          <div className="text-lg font-black text-white mb-1">{popup.it.value}</div>
          {popup.it.detail && (
            <p className="text-slate-300 font-medium text-xs leading-relaxed">{popup.it.detail}</p>
          )}
        </div>
      )}
    </div>
  );
}