"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import UploadButton from "./upload-button";
import SyncStatus from "./sync-status";
import { mmdGroup } from "@/lib/mmd-mapping";
import { matchSkuIcon } from "@/lib/sku-icon";
import SkuImagePopup from "./sku-image-popup";
import { broadcastTickerSync } from "@/lib/ticker-sync";

// Poll periodically so the page picks up a new upload without a manual reload.
const POLL_MS = 30_000;

/* Row: [month,trade,region,city,category,status,sku,
         poQty,poVal,grnQty,grnVal,dateYYYYMMDD,poId] */

type Data = { meta: any; dims: Record<string, string[]>; rows: number[][] };

const L = (n: number, d = 1) =>
  n.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: 0 });
const frClass = (fr: number) =>
  fr >= 90 ? "text-emerald-600" : fr >= 75 ? "text-amber-600" : "text-rose-600";
const frBg = (fr: number) =>
  fr >= 90 ? "bg-emerald-500" : fr >= 75 ? "bg-amber-400" : "bg-rose-500";
const TARGET = 90;

/* quick date jumps, relative to the newest PO date in the data */
const DATE_PRESETS = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "MTD", days: 0 },
  { label: "All", days: -1 },
];

export default function OverviewPage() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [metric, setMetric] = useState<"val" | "qty">("val");
  const DIMS = ["month", "trade", "region", "city", "category", "status", "sku"] as const;
  const [sel, setSel] = useState<Record<string, number[]>>(
    Object.fromEntries(DIMS.map((k) => [k, []]))
  );
  const [openF, setOpenF] = useState<string | null>(null);
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const dateToYmd = (x: string) => (x ? +x.replaceAll("-", "") : 0);
  const toggleSel = (dim: string, i: number) =>
    setSel((p) => {
      const a = p[dim].includes(i) ? p[dim].filter((x) => x !== i) : [...p[dim], i];
      return { ...p, [dim]: a };
    });
  const setAll = (dim: string, idxs: number[]) => setSel((p) => ({ ...p, [dim]: idxs }));

  useEffect(() => {
    const load = () =>
      fetch("/api/data")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
        .then((data) => {
          setD(data);
          // Pre-select the 3 core statuses (EXPIRED, COMPLETED, GRN_DONE)
          if (data?.dims?.status) {
            const idxs = data.dims.status
              .map((s: string, i: number) => ({ s: s.trim().toUpperCase(), i }))
              .filter((x: any) => x.s === "EXPIRED" || x.s === "COMPLETED" || x.s === "GRN_DONE")
              .map((x: any) => x.i);
            if (idxs.length > 0) {
              setSel((prev) => (prev.status.length === 0 ? { ...prev, status: idxs } : prev));
            }
          }
        })
        .catch((e) => setErr(String(e.message || e)));
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, []);

  const PO = metric === "val" ? 8 : 7;
  const GRN = metric === "val" ? 10 : 9;
  const unit = metric === "val" ? "₹L" : "units";

  /* Presets work off the last PO date in the dataset, not today's date. */
  function applyPreset(days: number) {
    if (!d) return;
    const max = d.meta.date_max as string;
    if (days === -1) { setFFrom(""); setFTo(""); return; }
    if (days === 0) { setFFrom(max.slice(0, 7) + "-01"); setFTo(max); return; }
    const dt = new Date(max + "T00:00:00Z");
    dt.setUTCDate(dt.getUTCDate() - (days - 1));
    setFFrom(dt.toISOString().slice(0, 10));
    setFTo(max);
  }

  const rows = useMemo(() => {
    if (!d) return [];
    const from = dateToYmd(fFrom), to = dateToYmd(fTo);
    const S: Record<string, Set<number>> = Object.fromEntries(
      Object.entries(sel).map(([k, v]) => [k, new Set(v)])
    );
    const pass = (set: Set<number>, v: number) => set.size === 0 || set.has(v);
    return d.rows.filter(
      (r) =>
        pass(S.month, r[0]) && pass(S.trade, r[1]) && pass(S.region, r[2]) &&
        pass(S.city, r[3]) && pass(S.category, r[4]) && pass(S.status, r[5]) &&
        pass(S.sku, r[6]) &&
        (!from || r[11] === 0 || r[11] >= from) &&
        (!to || r[11] === 0 || r[11] <= to)
    );
  }, [d, sel, fFrom, fTo]);

  const calc = useMemo(() => {
    if (!d) return null;
    let po = 0, grn = 0, poV = 0, grnV = 0;
    const pos = new Set<number>();
    const byMonth = d.dims.month.map(() => ({ po: 0, grn: 0 }));
    const byTrade = d.dims.trade.map((t) => ({ name: t, po: 0, grn: 0 }));
    const byRegion = d.dims.region.map((t) => ({ name: t, po: 0, grn: 0 }));
    const bySku = new Map<string, { name: string; po: number; grn: number }>();
    const byDate = new Map<number, { po: number; grn: number }>();
    const byStatus = new Map<string, { poVal: number; grnVal: number; gapVal: number; poCount: Set<number> }>();
    const byCity = new Map<string, { poVal: number; grnVal: number; gapVal: number }>();

    for (const r of rows) {
      po += r[PO]; grn += r[GRN]; poV += r[8]; grnV += r[10];
      pos.add(r[12]);
      byMonth[r[0]].po += r[PO]; byMonth[r[0]].grn += r[GRN];
      byTrade[r[1]].po += r[PO]; byTrade[r[1]].grn += r[GRN];
      byRegion[r[2]].po += r[PO]; byRegion[r[2]].grn += r[GRN];
      const g = mmdGroup(d.dims.sku[r[6]]);
      const sb = bySku.get(g.key) || { name: g.name, po: 0, grn: 0 };
      sb.po += r[PO]; sb.grn += r[GRN];
      bySku.set(g.key, sb);
      if (r[11] > 0) {
        const e = byDate.get(r[11]) || { po: 0, grn: 0 };
        e.po += r[PO]; e.grn += r[GRN];
        byDate.set(r[11], e);
      }

      const statusName = d.dims.status[r[5]] || "Unknown";
      const cityName = d.dims.city[r[3]] || "Unknown";

      const stb = byStatus.get(statusName) || { poVal: 0, grnVal: 0, gapVal: 0, poCount: new Set<number>() };
      stb.poVal += r[8];
      stb.grnVal += r[10];
      stb.gapVal += Math.max(0, r[8] - r[10]);
      stb.poCount.add(r[12]);
      byStatus.set(statusName, stb);

      const cb = byCity.get(cityName) || { poVal: 0, grnVal: 0, gapVal: 0 };
      cb.poVal += r[8];
      cb.grnVal += r[10];
      cb.gapVal += Math.max(0, r[8] - r[10]);
      byCity.set(cityName, cb);
    }

    const fr = po ? (grn / po) * 100 : 0;
    const mFr = byMonth.map((m) => (m.po ? (m.grn / m.po) * 100 : 0));
    const withData = mFr.map((v, i) => ({ v, i })).filter((x) => byMonth[x.i].po > 0);
    const mom =
      withData.length > 1
        ? withData[withData.length - 1].v - withData[withData.length - 2].v
        : 0;
    const mkPerf = (arr: any[]) =>
      arr.filter((x) => x.po > 0)
        .map((x) => ({ name: x.name, fr: (x.grn / x.po) * 100, po: x.po, grn: x.grn, gap: x.po - x.grn }))
        .sort((a, b) => b.gap - a.gap);
    const tradesPerf = mkPerf(byTrade);
    const regionsPerf = mkPerf(byRegion);
    const perfTotal = (rows2: any[]) => {
      const po = rows2.reduce((a, r) => a + r.po, 0);
      const grn = rows2.reduce((a, r) => a + r.grn, 0);
      return { po, grn, gap: po - grn, fr: po ? (grn / po) * 100 : 0 };
    };
    const skuRank = Array.from(bySku.values())
      .filter((s) => s.po > 0)
      .map((s) => ({ name: s.name, fr: (s.grn / s.po) * 100, gap: s.po - s.grn, po: s.po }));
    const sig = skuRank.filter((s) => s.po >= (metric === "val" ? 10 : 1000));
    const pool = sig.length >= 10 ? sig : skuRank;
    const gainers = [...pool].sort((a, b) => b.fr - a.fr).slice(0, 20);
    const losers = [...pool].sort((a, b) => a.fr - b.fr).slice(0, 20);
    const daily = [...byDate.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([ymd, v]) => ({ ymd, fr: v.po ? (v.grn / v.po) * 100 : 0, po: v.po }));

    const statusBreakdown = Array.from(byStatus.entries()).map(([status, val]) => ({
      status,
      poVal: val.poVal,
      grnVal: val.grnVal,
      gapVal: val.gapVal,
      frVal: val.poVal > 0 ? (val.grnVal / val.poVal) * 100 : 0,
      poCount: val.poCount.size,
    }));

    const cities = Array.from(byCity.entries())
      .map(([name, val]) => ({
        name,
        poVal: val.poVal,
        grnVal: val.grnVal,
        gapVal: val.gapVal,
        frVal: val.poVal > 0 ? (val.grnVal / val.poVal) * 100 : 0,
      }))
      .filter((c) => c.gapVal > 0)
      .sort((a, b) => b.gapVal - a.gapVal);

    return {
      po,
      grn,
      gap: po - grn,
      fr,
      mom,
      poV,
      grnV,
      gapV: poV - grnV,
      poCount: pos.size,
      tradesPerf,
      regionsPerf,
      tradeTot: perfTotal(tradesPerf),
      regionTot: perfTotal(regionsPerf),
      gainers,
      losers,
      daily,
      statusBreakdown,
      cities,
    };
  }, [d, rows, PO, GRN, metric]);

  // Sync scrolling ticker with active selection in real time
  useEffect(() => {
    if (!calc || !d) return;
    const selectedStatuses = (sel.status || []).map((idx) => d.dims.status[idx]).filter(Boolean);

    broadcastTickerSync({
      activeViewTitle: selectedStatuses.length > 0 ? `${selectedStatuses.length} STATUSES ACTIVE` : "OVERVIEW LIVE",
      selectedStatuses,
      poVal: calc.poV,
      poQty: calc.po,
      grnVal: calc.grnV,
      grnQty: calc.grn,
      gapVal: calc.gapV,
      frVal: calc.poV ? (calc.grnV / calc.poV) * 100 : 0,
      frQty: calc.fr,
      poCount: calc.poCount,
      statusBreakdown: calc.statusBreakdown,
      trades: calc.tradesPerf.map((t: any) => ({
        name: t.name,
        poVal: t.po,
        grnVal: t.grn,
        gapVal: t.gap,
        frVal: t.fr,
      })),
      cities: calc.cities,
    });
  }, [calc, sel.status, d]);

  if (err) return <div className="p-8 text-sm text-red-600">Could not load data: {err}</div>;
  if (!d || !calc) return <div className="p-8 text-sm text-slate-500">Loading overview…</div>;

  return (
    <div className="min-h-full text-slate-800 p-4 sm:p-5 lg:p-8">
      {/* ---- report header ---- */}
      <div className="flex items-start justify-between flex-wrap gap-3 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-600 grid place-items-center font-black text-white">M</div>
          <div>
            <div className="font-extrabold tracking-wide text-lg">MILKY MIST <span className="text-sky-600">· TRADE FR</span></div>
            <div className="text-[11px] text-slate-500">WHERE FILL RATE MEETS DISCIPLINE</div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-extrabold tracking-widest text-lg">TRADE REPORT 2026</div>
          <div className="text-[11px] text-sky-600">{d.meta.date_min} → {d.meta.date_max} · {L(calc.poCount, 0)} POs</div>
          <div className="mt-1.5 flex justify-end">
            <SyncStatus size="lg" />
          </div>
        </div>
      </div>

      {/* ---- PRIORITY PO FILL NOW ALERT BANNER ---- */}
      <div className="mt-4 bg-gradient-to-r from-rose-900 via-purple-950 to-indigo-950 rounded-2xl p-4 sm:p-5 text-white shadow-xl shadow-purple-950/20 border border-rose-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 grid place-items-center text-2xl shrink-0 animate-pulse">
            🚨
          </div>
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-rose-500/30 border border-rose-400/40 text-rose-300 text-[10px] font-extrabold uppercase tracking-wider mb-1">
              Priority Command Center
            </div>
            <h2 className="text-base sm:text-lg font-black tracking-tight text-white">
              Which POs Need to be Filled Now?
            </h2>
            <p className="text-xs text-purple-200/80 mt-0.5">
              Ranked fulfillment queue of critical expiring POs & urgent gap SKUs requiring immediate dispatch.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
          <Link
            href="/dashboard/priority-po"
            className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white font-extrabold text-xs shadow-lg shadow-rose-900/30 active:scale-95 transition-all"
          >
            <span>Open Priority PO Queue</span>
            <span className="group-hover:translate-x-1 transition-transform">→</span>
          </Link>
        </div>
      </div>

      {/* ---- full filter bar ---- */}
      <div className="mt-4 bg-white border border-slate-200 rounded-xl p-3.5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs">
            <div className="text-[10px] font-semibold text-slate-500 tracking-wider mb-0.5">PO DATE RANGE</div>
            <span className="flex items-center gap-1.5 text-slate-500">
              <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)}
                min={d.meta.date_min} max={d.meta.date_max}
                className="bg-white border border-slate-300 text-slate-700 rounded-lg px-2 py-1.5 text-xs" />
              →
              <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)}
                min={d.meta.date_min} max={d.meta.date_max}
                className="bg-white border border-slate-300 text-slate-700 rounded-lg px-2 py-1.5 text-xs" />
            </span>
          </label>
          <span className="flex gap-1 pb-0.5">
            {DATE_PRESETS.map((p) => (
              <button key={p.label} onClick={() => applyPreset(p.days)}
                className="px-2 py-1 rounded-md border border-slate-300 text-[11px] font-semibold text-slate-600 hover:bg-sky-50 hover:border-sky-500">
                {p.label}
              </button>
            ))}
          </span>
          {DIMS.map((k) => (
            <MultiSel key={k} label={k.toUpperCase()} opts={d.dims[k]}
              selected={sel[k]} open={openF === k}
              onOpen={() => setOpenF(openF === k ? null : k)}
              onToggle={(i: number) => toggleSel(k, i)}
              onAll={() => setAll(k, d.dims[k].map((_, i) => i))}
              onClear={() => setAll(k, [])} />
          ))}
          <button
            onClick={() => { setSel(Object.fromEntries(DIMS.map((k) => [k, []]))); setFFrom(""); setFTo(""); setOpenF(null); }}
            className="px-3 py-1.5 rounded-lg border border-rose-300 text-rose-600 text-xs font-semibold hover:bg-rose-50">
            Reset filters
          </button>
          <div className="ml-auto flex items-center gap-3">
            <div className="flex rounded-lg overflow-hidden border border-slate-300 text-xs font-semibold">
              <button onClick={() => setMetric("val")}
                className={"px-3 py-1.5 " + (metric === "val" ? "bg-sky-500 text-white" : "bg-white text-slate-600")}>₹ Value</button>
              <button onClick={() => setMetric("qty")}
                className={"px-3 py-1.5 " + (metric === "qty" ? "bg-sky-500 text-white" : "bg-white text-slate-600")}>Qty</button>
            </div>
            <a href="/api/export" download
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 whitespace-nowrap">
              ⭳ Download raw data
            </a>
            <UploadButton variant="light" />
            <Link href="/dashboard/opportunity" className="text-xs text-purple-700 font-bold hover:underline whitespace-nowrap">🎯 Opportunity →</Link>
            <Link href="/dashboard/trending-analysis" className="text-xs text-sky-700 font-bold hover:underline whitespace-nowrap">📈 Trending →</Link>
            <Link href="/dashboard/heatmap" className="text-xs text-amber-700 font-bold hover:underline whitespace-nowrap">🔥 Heatmap →</Link>
            <Link href="/dashboard/month-compare" className="text-xs text-indigo-600 font-semibold hover:underline whitespace-nowrap">🗓️ Month comparison →</Link>
            <Link href="/dashboard/full" className="text-xs text-slate-700 font-semibold hover:underline whitespace-nowrap">📊 Full dashboard →</Link>
          </div>
        </div>
      </div>

      {/* ---- KEY INDICES ---- */}
      <Section title="KEY METRICS" icon="📊">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <BigCard icon="🎯" iconBg="bg-indigo-50" iconColor="text-indigo-600"
            label={"FILL RATE (" + (metric === "val" ? "VALUE" : "QTY") + ")"}
            value={L(calc.fr) + "%"}
            delta={(calc.mom >= 0 ? "▲ " : "▼ ") + L(Math.abs(calc.mom)) + "% MoM"}
            up={calc.mom >= 0} accentClass={frClass(calc.fr)}
            barPct={calc.fr} barClass={frBg(calc.fr)} />
          <BigCard icon="⚠️" iconBg="bg-rose-50" iconColor="text-rose-600"
            label={metric === "val" ? "VALUE GAP" : "QTY GAP"}
            value={(metric === "val" ? "₹" : "") + L(calc.gap, 0) + (metric === "val" ? " L" : "")}
            delta={"▼ " + L(calc.po ? (calc.gap / calc.po) * 100 : 0) + "% of PO"} up={false}
            accentClass="text-rose-600"
            barPct={calc.po ? (calc.gap / calc.po) * 100 : 0} barClass="bg-rose-500" />
          <BigCard icon="🧾" iconBg="bg-sky-50" iconColor="text-sky-600"
            label={metric === "val" ? "PO VALUE" : "PO QTY"}
            value={(metric === "val" ? "₹" : "") + L(calc.po, 0) + (metric === "val" ? " L" : "")}
            delta={"GRN " + (metric === "val" ? "₹" : "") + L(calc.grn, 0) + (metric === "val" ? " L" : "")} up={null}
            accentClass="text-sky-700"
            barPct={calc.po ? (calc.grn / calc.po) * 100 : 0} barClass="bg-sky-500"
            barLabel="supplied" />
        </div>
      </Section>

      {/* ---- SPECIALIZED DASHBOARDS & SUITE NAVIGATION ---- */}
      <Section title="SPECIALIZED DASHBOARDS & ANALYTICS" icon="✨">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          <Link
            href="/dashboard/opportunity"
            className="group relative bg-gradient-to-br from-purple-50 via-white to-indigo-50/40 hover:to-purple-100/50 border border-purple-200/80 hover:border-purple-400 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="w-9 h-9 rounded-xl bg-purple-600 text-white grid place-items-center text-lg shadow-sm shadow-purple-600/30 group-hover:scale-110 transition-transform">
                  🎯
                </span>
                <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-extrabold uppercase tracking-wider">
                  Profit Engine
                </span>
              </div>
              <h3 className="text-sm font-extrabold text-slate-900 group-hover:text-purple-700 transition-colors">
                Opportunity & Profit Recovery
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Simulate profit gain from unfulfilled demand gaps and compare MoM recovery opportunities by SKU, City & Category.
              </p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-purple-100 flex items-center justify-between text-xs font-bold text-purple-700">
              <span>Open Opportunity Suite</span>
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </div>
          </Link>

          <Link
            href="/dashboard/trending-analysis"
            className="group relative bg-gradient-to-br from-sky-50 via-white to-cyan-50/40 hover:to-sky-100/50 border border-sky-200/80 hover:border-sky-400 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="w-9 h-9 rounded-xl bg-sky-600 text-white grid place-items-center text-lg shadow-sm shadow-sky-600/30 group-hover:scale-110 transition-transform">
                  📈
                </span>
                <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 text-[10px] font-extrabold uppercase tracking-wider">
                  MoM Velocity
                </span>
              </div>
              <h3 className="text-sm font-extrabold text-slate-900 group-hover:text-sky-700 transition-colors">
                Trending Analysis
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Longitudinal telemetry curves tracking Demand vs. Supplied progression, shortfall trajectory, and SKU speed.
              </p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-sky-100 flex items-center justify-between text-xs font-bold text-sky-700">
              <span>Open Trending Curves</span>
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </div>
          </Link>

          <Link
            href="/dashboard/heatmap"
            className="group relative bg-gradient-to-br from-amber-50 via-white to-orange-50/40 hover:to-amber-100/50 border border-amber-200/80 hover:border-amber-400 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="w-9 h-9 rounded-xl bg-amber-600 text-white grid place-items-center text-lg shadow-sm shadow-amber-600/30 group-hover:scale-110 transition-transform">
                  🔥
                </span>
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-extrabold uppercase tracking-wider">
                  Cycle Matrix
                </span>
              </div>
              <h3 className="text-sm font-extrabold text-slate-900 group-hover:text-amber-700 transition-colors">
                Heatmap Matrix
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Multi-dimensional fulfillment intensity across 10-day cycles (1–10, 11–20, 21–31), City, and Category matrix.
              </p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-amber-100 flex items-center justify-between text-xs font-bold text-amber-700">
              <span>Open Heatmap Matrix</span>
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </div>
          </Link>

          <Link
            href="/dashboard/priority-po"
            className="group relative bg-gradient-to-br from-rose-50 via-white to-pink-50/40 hover:to-rose-100/50 border border-rose-200/80 hover:border-rose-400 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="w-9 h-9 rounded-xl bg-rose-600 text-white grid place-items-center text-lg shadow-sm shadow-rose-600/30 group-hover:scale-110 transition-transform">
                  🚨
                </span>
                <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-extrabold uppercase tracking-wider">
                  Urgent Dispatch
                </span>
              </div>
              <h3 className="text-sm font-extrabold text-slate-900 group-hover:text-rose-700 transition-colors">
                Priority PO Dispatch
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Real-time urgency ranking & pick lists to immediately dispatch upcoming expiring POs and urgent SKU gaps.
              </p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-rose-100 flex items-center justify-between text-xs font-bold text-rose-700">
              <span>Open Priority Queue</span>
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </div>
          </Link>

          <Link
            href="/dashboard/month-compare"
            className="group relative bg-gradient-to-br from-indigo-50 via-white to-blue-50/40 hover:to-indigo-100/50 border border-indigo-200/80 hover:border-indigo-400 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="w-9 h-9 rounded-xl bg-indigo-600 text-white grid place-items-center text-lg shadow-sm shadow-indigo-600/30 group-hover:scale-110 transition-transform">
                  🗓️
                </span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-extrabold uppercase tracking-wider">
                  MoM Comparison
                </span>
              </div>
              <h3 className="text-sm font-extrabold text-slate-900 group-hover:text-indigo-700 transition-colors">
                Month Comparison
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Side-by-side comparative analysis of demand, supplied value, and fill-rate variances across any 2 months.
              </p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-indigo-100 flex items-center justify-between text-xs font-bold text-indigo-700">
              <span>Open Month Comparison</span>
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </div>
          </Link>

          <Link
            href="/dashboard/full"
            className="group relative bg-gradient-to-br from-slate-50 via-white to-slate-100/40 hover:to-slate-100 border border-slate-200 hover:border-slate-400 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="w-9 h-9 rounded-xl bg-slate-700 text-white grid place-items-center text-lg shadow-sm shadow-slate-700/30 group-hover:scale-110 transition-transform">
                  📊
                </span>
                <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-800 text-[10px] font-extrabold uppercase tracking-wider">
                  Deep Intelligence
                </span>
              </div>
              <h3 className="text-sm font-extrabold text-slate-900 group-hover:text-slate-800 transition-colors">
                Full Intelligence Dashboard
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Multi-dimensional slicers, cross-filtering, SKU × City breakdown tables, and raw data export engine.
              </p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700">
              <span>Open Full Dashboard</span>
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </div>
          </Link>
        </div>
      </Section>

      {/* ---- TRADE PERFORMANCE (separate, with total) ---- */}
      <Section title="TRADE PERFORMANCE" icon="🏷️">
        <PerfList items={calc.tradesPerf} total={calc.tradeTot} overallFr={calc.fr} metric={metric} />
      </Section>

      {/* ---- REGION PERFORMANCE (separate, with total) ---- */}
      <Section title="REGION PERFORMANCE" icon="🗺️">
        <PerfList items={calc.regionsPerf} total={calc.regionTot} overallFr={calc.fr} metric={metric} />
      </Section>

      {/* ---- TOP GAINERS / LOSERS (scroll + sort + total) ---- */}
      <Section title="TOP GAINERS / LOSERS — SKU FILL RATE" icon="📈">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <RankPanel title="Top Gainers" rows={calc.gainers} up metric={metric} />
          <RankPanel title="Top Losers" rows={calc.losers} up={false} metric={metric} />
        </div>
      </Section>

      {/* ---- DAILY CHART with target line ---- */}
      <Section title={"DAILY FILL RATE (" + (metric === "val" ? "VALUE" : "QTY") + ") · TARGET " + TARGET + "%"} icon="🎯">
        <DailyChart daily={calc.daily} />
        <div className="flex gap-4 mt-2 text-[11px] text-slate-500">
          <span><span className="inline-block w-2.5 h-2.5 bg-emerald-500 rounded-sm mr-1.5" />≥ {TARGET}% (good)</span>
          <span><span className="inline-block w-2.5 h-2.5 bg-amber-400 rounded-sm mr-1.5" />75–{TARGET}% (average)</span>
          <span><span className="inline-block w-2.5 h-2.5 bg-rose-500 rounded-sm mr-1.5" />&lt; 75% (low)</span>
          <span className="ml-auto">— — Target line at {TARGET}%</span>
        </div>
      </Section>

      {openF && <div className="fixed inset-0 z-30" onClick={() => setOpenF(null)} />}

      {/* ---- OVERALL TOTAL row ---- */}
      <div className="mt-5 rounded-xl border border-indigo-200 bg-slate-50 px-4 py-3 flex flex-wrap items-center gap-x-8 gap-y-2">
        <span className="text-xs font-bold tracking-widest text-sky-600">OVERALL TOTAL</span>
        <Tot label={"PO " + unit} v={L(calc.po, 0)} />
        <Tot label={"GRN " + unit} v={L(calc.grn, 0)} />
        <Tot label={"GAP " + unit} v={L(calc.gap, 0)} cls="text-rose-600" />
        {metric === "qty" && <Tot label="PO ₹L" v={L(calc.poV, 0)} />}
        <Tot label="POs" v={L(calc.poCount, 0)} />
        <span className={"ml-auto px-3 py-1 rounded-full text-sm font-bold bg-slate-100 " + frClass(calc.fr)}>
          FR {L(calc.fr)}%
        </span>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: any) {
  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.2em] text-sky-600 mb-2.5">
        <span>{icon}</span>{title}
        <span className="flex-1 h-px bg-gradient-to-r from-sky-300 to-transparent" />
      </div>
      {children}
    </div>
  );
}

function BigCard({ icon, iconBg, iconColor, label, value, delta, up, accentClass, barPct, barClass, barLabel }: any) {
  return (
    <div className="bg-gradient-to-b from-white to-slate-50 border border-slate-200 rounded-xl px-5 py-5">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] tracking-wider text-slate-500 font-semibold pt-1.5">{label}</div>
        {icon && (
          <div className={"shrink-0 w-9 h-9 rounded-lg grid place-items-center text-base " + iconBg + " " + iconColor}>
            {icon}
          </div>
        )}
      </div>
      <div className={"mt-1.5 text-4xl font-extrabold " + accentClass}>{value}</div>
      {delta && (
        <div className={"mt-1.5 text-xs font-semibold " +
          (up === null ? "text-slate-500" : up ? "text-emerald-600" : "text-rose-600")}>
          {delta}
        </div>
      )}
      {typeof barPct === "number" && (
        <div className="mt-3.5">
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div className={"h-full rounded-full " + barClass}
              style={{ width: Math.min(100, Math.max(0, barPct)) + "%" }} />
          </div>
          {barLabel && (
            <div className="mt-1 text-[10px] text-slate-400 font-semibold">
              {L(Math.min(100, Math.max(0, barPct)))}% {barLabel}
            </div>
          )}
        </div>
      )}
    </div>
  );
}



function Tot({ label, v, cls = "text-slate-800" }: any) {
  return (
    <span className="text-sm">
      <span className="text-[10px] text-slate-500 font-semibold mr-1.5">{label}</span>
      <span className={"font-bold " + cls}>{v}</span>
    </span>
  );
}

function DailyChart({ daily }: { daily: { ymd: number; fr: number }[] }) {
  const W = 900, H = 240, P = { l: 42, r: 12, t: 14, b: 30 };
  if (!daily.length) return <div className="text-xs text-slate-500">No dated rows in this selection.</div>;
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const max = 100, min = Math.max(0, Math.floor(Math.min(...daily.map((x) => x.fr), 70) / 10) * 10 - 10);
  const y = (v: number) => P.t + ih - ((Math.min(v, max) - min) / (max - min)) * ih;
  const bw = Math.max(2, Math.min(10, (iw / daily.length) * 0.7));
  const x = (i: number) => P.l + (i + 0.5) * (iw / daily.length);
  const fmt = (ymd: number) => {
    const s = String(ymd);
    return s.slice(6, 8) + "/" + s.slice(4, 6);
  };
  const labelEvery = Math.ceil(daily.length / 10);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full bg-white rounded-xl border border-slate-200">
      {[min, (min + 100) / 2, 100].map((v) => (
        <g key={v}>
          <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeWidth="1" />
          <text x={P.l - 6} y={y(v) + 3} fontSize="9" fill="#64748b" textAnchor="end">{v}%</text>
        </g>
      ))}
      {daily.map((p, i) => {
        const col = p.fr >= TARGET ? "#10b981" : p.fr >= 75 ? "#fbbf24" : "#f43f5e";
        return (
          <rect key={p.ymd} x={x(i) - bw / 2} y={y(p.fr)} width={bw}
            height={Math.max(1, y(min) - y(p.fr))} rx="1.5" fill={col} opacity="0.9" />
        );
      })}
      {/* target line */}
      <line x1={P.l} x2={W - P.r} y1={y(TARGET)} y2={y(TARGET)}
        stroke="#7c3aed" strokeWidth="2" strokeDasharray="7 5" />
      <rect x={W - P.r - 128} y={y(TARGET) - 22} width="126" height="17" rx="3" fill="#7c3aed" />
      <text x={W - P.r - 65} y={y(TARGET) - 10} fontSize="10" fill="#ffffff" textAnchor="middle" fontWeight="700">
        Target — above {TARGET}%
      </text>
      {daily.map((p, i) =>
        i % labelEvery === 0 ? (
          <text key={"l" + p.ymd} x={x(i)} y={H - 10} fontSize="9" fill="#64748b" textAnchor="middle">{fmt(p.ymd)}</text>
        ) : null
      )}
    </svg>
  );
}

function MultiSel({ label, opts, selected, open, onOpen, onToggle, onAll, onClear }: any) {
  const [q, setQ] = useState("");
  const selSet = new Set<number>(selected);
  const shown = opts
    .map((o: string, i: number) => ({ o, i }))
    .filter((x: any) => !q || x.o.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="relative text-xs z-40">
      <div className="text-[10px] font-semibold text-slate-500 tracking-wider mb-0.5">{label}</div>
      <button
        onClick={onOpen}
        className={"bg-white border rounded-lg px-2.5 py-1.5 text-xs min-w-[104px] max-w-[170px] text-left truncate " +
          (selSet.size ? "border-sky-400 text-sky-700 font-semibold" : "border-slate-300 text-slate-700")}
      >
        {selSet.size === 0 ? "All" : selSet.size === 1 ? opts[selected[0]] : selSet.size + " selected"} ▾
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-64 bg-slate-50 border border-indigo-200 rounded-xl shadow-xl p-2"
          onClick={(e) => e.stopPropagation()}>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={"Search " + label.toLowerCase() + "…"}
            className="w-full bg-white border border-slate-300 text-slate-700 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-sky-400"
          />
          <div className="flex gap-2 mt-1.5 px-0.5">
            <button onClick={onAll} className="text-[11px] text-sky-600 hover:underline">Select all</button>
            <button onClick={onClear} className="text-[11px] text-rose-600 hover:underline">Clear</button>
            <span className="ml-auto text-[11px] text-slate-500">{selSet.size}/{opts.length}</span>
          </div>
          <div className="mt-1 max-h-56 overflow-y-auto pr-1">
            {shown.map(({ o, i }: any) => (
              <label key={i}
                className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-slate-100 cursor-pointer text-slate-700">
                <input type="checkbox" checked={selSet.has(i)} onChange={() => onToggle(i)}
                  className="accent-sky-500" />
                <span className="truncate" title={o}>{o}</span>
              </label>
            ))}
            {!shown.length && <div className="text-slate-500 text-[11px] px-1.5 py-2">No matches</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Trade/Region performance list with sticky OVERALL TOTAL row ---- */
function PerfList({ items, total, overallFr, metric }: any) {
  const money = (n: number) => (metric === "val" ? "₹" : "") + L(n, 0) + (metric === "val" ? " L" : "");
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between bg-indigo-50 border-b border-indigo-200 px-3.5 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="text-[11px] font-black tracking-widest text-sky-600">OVERALL TOTAL</span>
          <span className="text-slate-800 text-sm font-semibold">PO {money(total.po)} · GRN {money(total.grn)} · gap {money(total.gap)}</span>
        </div>
        <span className={"font-extrabold text-sm " + frClass(total.fr)}>{L(total.fr)}%</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-slate-200">
        {items.map((s: any) => (
          <div key={s.name} className="flex items-center justify-between bg-slate-50 px-3.5 py-2.5">
            <div className="flex items-center gap-2.5">
              <span className={"w-2 h-2 rounded-full " + frBg(s.fr)} />
              <span className="font-semibold text-sm">{s.name}</span>
              <span className="text-slate-500 text-xs">gap {money(s.gap)}</span>
            </div>
            <span className={"font-bold text-sm " + frClass(s.fr)}>
              {s.fr >= overallFr ? "▲" : "▼"} {L(s.fr)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- Gainers/Losers panel: scrollable, sortable, with SUM total footer ---- */
function RankPanel({ title, rows, up, metric }: any) {
  const [sortKey, setSortKey] = useState<"fr" | "gap" | "name">("fr");
  const [dir, setDir] = useState<1 | -1>(up ? -1 : 1);
  const [skuPopup, setSkuPopup] = useState<{ icon: string | null; name: string; stats: { label: string; value: string; cls?: string }[] } | null>(null);
  const money = (n: number) => (metric === "val" ? "₹" : "") + L(n, 0) + (metric === "val" ? " L" : "");
  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    if (typeof av === "string") return av.localeCompare(bv) * dir;
    return (av - bv) * dir;
  });
  const totGap = rows.reduce((a: number, r: any) => a + r.gap, 0);
  const totPo = rows.reduce((a: number, r: any) => a + r.po, 0);
  const totGrn = totPo - totGap;
  const totFr = totPo ? (totGrn / totPo) * 100 : 0;
  const th = (k: any, label: string, cls = "") => (
    <button onClick={() => (sortKey === k ? setDir((d) => (d === 1 ? -1 : 1)) : (setSortKey(k), setDir(-1)))}
      className={"text-[10px] font-bold tracking-wider text-slate-500 hover:text-sky-600 " + cls}>
      {label}{sortKey === k ? (dir === -1 ? " ↓" : " ↑") : ""}
    </button>
  );
  return (
    <>
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-slate-200 bg-slate-50">
        <span className="text-xs font-bold text-slate-700">{title} <span className="text-slate-500">({rows.length})</span></span>
        <span className="flex gap-4">{th("name", "SKU")}{th("gap", "GAP")}{th("fr", "FR%")}</span>
      </div>
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-indigo-200 bg-indigo-50">
        <span className="text-[11px] font-black tracking-widest text-sky-600">SUM TOTAL</span>
        <span className="flex items-center gap-3">
          <span className="text-[11px] text-slate-600">gap {money(totGap)}</span>
          <span className={"font-extrabold text-sm w-16 text-right " + (totFr >= 90 ? "text-emerald-600" : totFr >= 75 ? "text-amber-600" : "text-rose-600")}>{L(totFr)}%</span>
        </span>
      </div>
      <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
        {sorted.map((s: any) => {
          const icon = matchSkuIcon(s.name);
          return (
            <div key={s.name} className="flex items-center justify-between px-3.5 py-2">
              <span className="flex items-center gap-2 min-w-0 pr-3">
                <button
                  type="button"
                  onClick={() => setSkuPopup({
                    icon, name: s.name,
                    stats: [
                      { label: "PO", value: money(s.po) },
                      { label: "GRN", value: money(s.po - s.gap) },
                      { label: "GAP", value: money(s.gap), cls: "text-rose-600" },
                      { label: "FR %", value: L(s.fr, 0) + "%" },
                    ],
                  })}
                  className="shrink-0 w-6 h-6 rounded-md bg-slate-50 border border-slate-200 grid place-items-center overflow-hidden hover:border-indigo-300 hover:ring-2 hover:ring-indigo-100 transition"
                  title="Click to enlarge"
                >
                  {icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={icon} alt="" className="max-w-full max-h-full object-contain" />
                  ) : (
                    <span className="text-[10px]">🥛</span>
                  )}
                </button>
                <span className="text-[13px] font-medium truncate" title={s.name}>{s.name}</span>
              </span>
              <span className="flex items-center gap-3 shrink-0">
                <span className="text-[11px] text-slate-500">{money(s.gap)}</span>
                <span className={"font-bold text-sm w-16 text-right " + (s.fr >= 90 ? "text-emerald-600" : s.fr >= 75 ? "text-amber-600" : "text-rose-600")}>
                  {up ? "▲" : "▼"} {L(s.fr)}%
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
    {skuPopup && (
      <SkuImagePopup icon={skuPopup.icon} name={skuPopup.name} stats={skuPopup.stats} onClose={() => setSkuPopup(null)} />
    )}
    </>
  );
}