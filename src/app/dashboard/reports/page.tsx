"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import UploadButton from "../upload-button";
import SyncStatus from "../sync-status";
import { mmdGroup } from "@/lib/mmd-mapping";
import { matchSkuIcon } from "@/lib/sku-icon";
import SkuImagePopup from "../sku-image-popup";
import { broadcastTickerSync } from "@/lib/ticker-sync";

/* Row: [month,trade,region,city,category,status,sku,
         poQty,poVal,grnQty,grnVal,dateYYYYMMDD,poId] */

type Data = { meta: any; dims: Record<string, string[]>; rows: number[][] };

const DIM_IDX: Record<string, number> = { sku: 6, city: 3, category: 4, trade: 1, region: 2 };
const L = (n: number, d = 1) =>
  n.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: 0 });
const L2 = (n: number) =>
  n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

const frPill = (fr: number) =>
  "px-2.5 py-0.5 rounded-full text-xs font-bold " +
  (fr >= 90
    ? "bg-emerald-100 text-emerald-800"
    : fr >= 75
    ? "bg-amber-100 text-amber-800"
    : "bg-rose-100 text-rose-800");

const TABS = [
  { key: "sku", label: "Gap by SKU" },
  { key: "city", label: "Gap by City" },
  { key: "category", label: "Gap by Category" },
  { key: "trade", label: "Gap by Trade" },
  { key: "region", label: "Gap by Region" },
  { key: "skucity", label: "Gap by SKU × City" },
  { key: "date", label: "Gap by Date" },
  { key: "citypo", label: "City PO Status" },
];

/* Quick date jumps relative to latest PO date */
const DATE_PRESETS = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "MTD", days: 0 },
  { label: "All", days: -1 },
];

const ymdToDate = (n: number) => {
  const s = String(n);
  return s.length === 8 ? s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8) : "";
};
const dateToYmd = (s: string) => (s ? +s.replaceAll("-", "") : 0);

/* ── Multi-Select Checkbox Dropdown ── */
interface MultiSelectProps {
  label: string;
  options: { key: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}

function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  open,
  onToggle,
  onClose,
}: MultiSelectProps) {
  const [q, setQ] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selSet = useMemo(() => new Set(selected), [selected]);

  const filteredOptions = useMemo(() => {
    if (!q.trim()) return options;
    const lower = q.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(lower));
  }, [options, q]);

  const toggleItem = (key: string) => {
    if (selSet.has(key)) {
      onChange(selected.filter((k) => k !== key));
    } else {
      onChange([...selected, key]);
    }
  };

  let buttonLabel = `All (${options.length})`;
  if (selected.length > 0 && selected.length < options.length) {
    if (selected.length === 1) {
      const found = options.find((o) => o.key === selected[0]);
      buttonLabel = found ? found.label : selected[0];
    } else {
      buttonLabel = `${selected.length} selected`;
    }
  }

  const isFiltered = selected.length > 0 && selected.length < options.length;

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
        {label}
      </label>
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-semibold text-left transition-all cursor-pointer ${
          isFiltered
            ? "border-purple-500 bg-purple-50/70 text-purple-900 ring-1 ring-purple-400"
            : "border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100"
        }`}
      >
        <span className="truncate">{buttonLabel}</span>
        <span className="text-xs text-slate-400 shrink-0">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} />
          <div
            className="absolute left-0 top-full mt-1.5 z-50 w-72 max-w-[90vw] bg-white border border-purple-200 rounded-2xl shadow-2xl p-3 space-y-2 animate-in fade-in zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative">
              <input
                autoFocus
                type="text"
                placeholder={`Search ${label.toLowerCase()}...`}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <span className="absolute left-2.5 top-1.5 text-xs text-slate-400">🔍</span>
              {q && (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  className="absolute right-2.5 top-1.5 text-xs text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center justify-between px-1 text-[11px] font-bold text-slate-500 border-b border-slate-100 pb-1.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onChange(options.map((o) => o.key))}
                  className="text-purple-600 hover:text-purple-800 hover:underline cursor-pointer"
                >
                  Select All
                </button>
                <span>·</span>
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="text-slate-500 hover:text-slate-800 hover:underline cursor-pointer"
                >
                  Clear
                </button>
              </div>
              <span className="text-slate-400">
                {selected.length}/{options.length}
              </span>
            </div>

            <div className="max-h-56 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
              {filteredOptions.length === 0 ? (
                <div className="text-center py-4 text-xs text-slate-400 font-medium">
                  No matches found
                </div>
              ) : (
                filteredOptions.map((opt) => {
                  const isChecked = selSet.has(opt.key);
                  return (
                    <label
                      key={opt.key}
                      className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                        isChecked
                          ? "bg-purple-50 text-purple-900 font-bold"
                          : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleItem(opt.key)}
                        className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 h-4 w-4 accent-purple-600 cursor-pointer shrink-0"
                      />
                      <span className="truncate flex-1" title={opt.label}>
                        {opt.label}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function ReportsPage() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("sku");
  const [downloading, setDownloading] = useState(false);
  const [downloadingOne, setDownloadingOne] = useState(false);

  // Filters State
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [selMonths, setSelMonths] = useState<string[]>([]);
  const [selTrades, setSelTrades] = useState<string[]>([]);
  const [selRegions, setSelRegions] = useState<string[]>([]);
  const [selCities, setSelCities] = useState<string[]>([]);
  const [selCategories, setSelCategories] = useState<string[]>([]);
  const [selStatuses, setSelStatuses] = useState<string[]>([]);
  const [selSkus, setSelSkus] = useState<string[]>([]);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [skuPopup, setSkuPopup] = useState<{
    icon: string | null;
    name: string;
    stats: { label: string; value: string; cls?: string }[];
  } | null>(null);

  const POLL_MS = 30_000;

  const loadData = () => {
    fetch("/api/data")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
      .then((data) => {
        setD(data);
        setErr("");
        if (data?.meta?.date_max) {
          setFFrom("");
          setFTo("");
        }
      })
      .catch((e) => setErr(String(e.message || e)));
  };

  useEffect(() => {
    loadData();
    const id = setInterval(loadData, POLL_MS);
    return () => clearInterval(id);
  }, []);

  function applyPreset(days: number) {
    if (!d) return;
    const max = d.meta.date_max as string;
    if (days === -1) {
      setFFrom("");
      setFTo("");
      return;
    }
    if (days === 0) {
      setFFrom(max.slice(0, 7) + "-01");
      setFTo(max);
      return;
    }
    const dt = new Date(max + "T00:00:00Z");
    dt.setUTCDate(dt.getUTCDate() - (days - 1));
    setFFrom(dt.toISOString().slice(0, 10));
    setFTo(max);
  }

  function resetFilters() {
    setSelMonths([]);
    setSelTrades([]);
    setSelRegions([]);
    setSelCities([]);
    setSelCategories([]);
    setSelSkus([]);
    setQ("");
    if (d?.dims?.status) {
      const default3 = d.dims.status.filter((s: string) => {
        const up = s.trim().toUpperCase();
        return up === "EXPIRED" || up === "COMPLETED" || up === "GRN_DONE";
      });
      setSelStatuses(default3.length > 0 ? default3 : []);
    } else {
      setSelStatuses([]);
    }
    if (d?.meta?.date_max) {
      const max = d.meta.date_max as string;
      setFFrom(max.slice(0, 7) + "-01");
      setFTo(max);
    } else {
      setFFrom("");
      setFTo("");
    }
  }

  const rows = useMemo(() => {
    if (!d) return [];
    const from = dateToYmd(fFrom);
    const to = dateToYmd(fTo);

    const monthSet = new Set(selMonths);
    const tradeSet = new Set(selTrades);
    const regionSet = new Set(selRegions);
    const citySet = new Set(selCities);
    const categorySet = new Set(selCategories);
    const statusSet = new Set(selStatuses);
    const skuSet = new Set(selSkus);

    return d.rows.filter((r) => {
      const rowMonth = d.dims.month[r[0]];
      const rowTrade = d.dims.trade[r[1]];
      const rowRegion = d.dims.region[r[2]];
      const rowCity = d.dims.city[r[3]];
      const rowCategory = d.dims.category[r[4]];
      const rowStatus = d.dims.status[r[5]];
      const rowSku = d.dims.sku[r[6]];
      const rowPoDate = r[11];

      if (monthSet.size > 0 && !monthSet.has(rowMonth)) return false;
      if (tradeSet.size > 0 && !tradeSet.has(rowTrade)) return false;
      if (regionSet.size > 0 && !regionSet.has(rowRegion)) return false;
      if (citySet.size > 0 && !citySet.has(rowCity)) return false;
      if (categorySet.size > 0 && !categorySet.has(rowCategory)) return false;
      if (statusSet.size > 0 && !statusSet.has(rowStatus)) return false;
      if (skuSet.size > 0 && !skuSet.has(rowSku)) return false;

      if (from && rowPoDate > 0 && rowPoDate < from) return false;
      if (to && rowPoDate > 0 && rowPoDate > to) return false;

      return true;
    });
  }, [
    d,
    fFrom,
    fTo,
    selMonths,
    selTrades,
    selRegions,
    selCities,
    selCategories,
    selStatuses,
    selSkus,
  ]);

  // Synchronize with scrolling ticker
  useEffect(() => {
    if (!d) return;
    let poQ = 0,
      poV = 0,
      grnQ = 0,
      grnV = 0;
    const poSet = new Set<number>();
    const byStatus = new Map<string, { poVal: number; grnVal: number; gapVal: number; poCount: Set<number> }>();
    const byTrade = new Map<string, { poVal: number; grnVal: number; gapVal: number }>();
    const byCity = new Map<string, { poVal: number; grnVal: number; gapVal: number }>();

    for (const r of rows) {
      poQ += r[7];
      poV += r[8];
      grnQ += r[9];
      grnV += r[10];
      poSet.add(r[12]);

      const sName = d.dims.status[r[5]] || "Unknown";
      const tName = d.dims.trade[r[1]] || "Unknown";
      const cName = d.dims.city[r[3]] || "Unknown";

      const sb = byStatus.get(sName) || { poVal: 0, grnVal: 0, gapVal: 0, poCount: new Set<number>() };
      sb.poVal += r[8];
      sb.grnVal += r[10];
      sb.gapVal += Math.max(0, r[8] - r[10]);
      sb.poCount.add(r[12]);
      byStatus.set(sName, sb);

      const tb = byTrade.get(tName) || { poVal: 0, grnVal: 0, gapVal: 0 };
      tb.poVal += r[8];
      tb.grnVal += r[10];
      tb.gapVal += Math.max(0, r[8] - r[10]);
      byTrade.set(tName, tb);

      const cb = byCity.get(cName) || { poVal: 0, grnVal: 0, gapVal: 0 };
      cb.poVal += r[8];
      cb.grnVal += r[10];
      cb.gapVal += Math.max(0, r[8] - r[10]);
      byCity.set(cName, cb);
    }

    const gapVal = Math.max(0, poV - grnV);
    const frVal = poV > 0 ? (grnV / poV) * 100 : 0;
    const frQty = poQ > 0 ? (grnQ / poQ) * 100 : 0;

    const statusBreakdown = Array.from(byStatus.entries()).map(([status, val]) => ({
      status,
      poVal: val.poVal,
      grnVal: val.grnVal,
      gapVal: val.gapVal,
      frVal: val.poVal > 0 ? (val.grnVal / val.poVal) * 100 : 0,
      poCount: val.poCount.size,
    }));

    const trades = Array.from(byTrade.entries())
      .filter(([, val]) => val.poVal > 0)
      .map(([name, val]) => ({
        name,
        poVal: val.poVal,
        grnVal: val.grnVal,
        gapVal: val.gapVal,
        frVal: val.poVal > 0 ? (val.grnVal / val.poVal) * 100 : 0,
      }))
      .sort((a, b) => b.poVal - a.poVal);

    const cities = Array.from(byCity.entries())
      .filter(([, val]) => val.gapVal > 0)
      .map(([name, val]) => ({
        name,
        poVal: val.poVal,
        grnVal: val.grnVal,
        gapVal: val.gapVal,
        frVal: val.poVal > 0 ? (val.grnVal / val.poVal) * 100 : 0,
      }))
      .sort((a, b) => b.gapVal - a.gapVal);

    broadcastTickerSync({
      activeViewTitle: selStatuses.length > 0 ? `${selStatuses.length} STATUSES ACTIVE` : "REPORTS",
      selectedStatuses: selStatuses,
      poVal: poV,
      poQty: poQ,
      grnVal: grnV,
      grnQty: grnQ,
      gapVal,
      frVal,
      frQty,
      poCount: poSet.size,
      statusBreakdown,
      trades,
      cities,
    });
  }, [d, rows, selStatuses]);

  function gapAgg(dimKey: string) {
    if (!d) return [];
    type A = {
      name: string;
      sub?: string;
      mmdCode: string;
      mmdName: string;
      poQty: number;
      poVal: number;
      grnQty: number;
      grnVal: number;
      lines: number;
      pos: Set<number>;
    };
    const bag = new Map<string, A>();
    const grab = (key: string, name: string, sub?: string, mmdCode = "", mmdName = "") => {
      let a = bag.get(key);
      if (!a) {
        a = {
          name,
          sub,
          mmdCode,
          mmdName,
          poQty: 0,
          poVal: 0,
          grnQty: 0,
          grnVal: 0,
          lines: 0,
          pos: new Set(),
        };
        bag.set(key, a);
      }
      return a;
    };
    for (const r of rows) {
      let a: A;
      if (dimKey === "sku") {
        const g = mmdGroup(d.dims.sku[r[6]]);
        a = grab(g.key, g.name, undefined, g.code, g.code ? g.name : "");
      } else if (dimKey === "skucity") {
        const g = mmdGroup(d.dims.sku[r[6]]);
        a = grab(g.key + "|" + r[3], g.name, d.dims.city[r[3]], g.code, g.code ? g.name : "");
      } else if (dimKey === "date") a = grab(String(r[11]), ymdToDate(r[11]) || "(no date)");
      else {
        const i = DIM_IDX[dimKey];
        a = grab(String(r[i]), d.dims[dimKey][r[i]]);
      }
      a.poQty += r[7];
      a.poVal += r[8];
      a.grnQty += r[9];
      a.grnVal += r[10];
      a.lines++;
      a.pos.add(r[12]);
    }
    const out = Array.from(bag.values()).map((a) => ({
      name: a.name,
      sub: a.sub,
      mmdCode: a.mmdCode,
      mmdName: a.mmdName,
      fr: a.poVal ? (a.grnVal / a.poVal) * 100 : 0,
      poVal: a.poVal,
      grnVal: a.grnVal,
      gap: a.poVal - a.grnVal,
      poQty: a.poQty,
      grnQty: a.grnQty,
      lines: a.lines,
      pos: a.pos.size,
    }));
    return dimKey === "date"
      ? out.sort((x, y) => (x.name < y.name ? -1 : 1))
      : out.sort((x, y) => y.gap - x.gap);
  }

  const gapTable = useMemo(() => {
    if (tab === "citypo") return null;
    const all = gapAgg(tab);
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        (r.sub || "").toLowerCase().includes(needle) ||
        r.mmdCode.toLowerCase().includes(needle)
    );
  }, [d, rows, tab, q]);

  const CAP = 500;
  const gapShown = useMemo(
    () => (gapTable && !showAll && gapTable.length > CAP ? gapTable.slice(0, CAP) : gapTable),
    [gapTable, showAll]
  );

  const gapTotal = useMemo(() => {
    if (!gapTable) return null;
    const t = gapTable.reduce(
      (acc, r) => ({
        poVal: acc.poVal + r.poVal,
        grnVal: acc.grnVal + r.grnVal,
        gap: acc.gap + r.gap,
        lines: acc.lines + r.lines,
      }),
      { poVal: 0, grnVal: 0, gap: 0, lines: 0 }
    );
    return { ...t, fr: t.poVal ? (t.grnVal / t.poVal) * 100 : 0 };
  }, [gapTable]);

  const cityPo = useMemo(() => {
    if (!d) return null;
    const fullIdxs = new Set<number>();
    const partIdxs = new Set<number>();
    const zeroIdxs = new Set<number>();
    d.dims.status.forEach((s, i) => {
      const lower = s.toLowerCase();
      if (lower.includes("full") || lower.includes("completed") || lower.includes("grn_done")) fullIdxs.add(i);
      else if (lower.includes("part")) partIdxs.add(i);
      else if (lower.includes("zero")) zeroIdxs.add(i);
    });
    const per = d.dims.city.map((c) => ({
      city: c,
      full: new Set<number>(),
      part: new Set<number>(),
      zero: new Set<number>(),
      all: new Set<number>(),
    }));
    for (const r of rows) {
      const p = per[r[3]];
      p.all.add(r[12]);
      if (fullIdxs.has(r[5])) p.full.add(r[12]);
      else if (partIdxs.has(r[5])) p.part.add(r[12]);
      else if (zeroIdxs.has(r[5])) p.zero.add(r[12]);
    }
    return per
      .filter((p) => p.all.size > 0)
      .map((p) => ({
        city: p.city,
        full: p.full.size,
        part: p.part.size,
        zero: p.zero.size,
        total: p.all.size,
        pctFull: p.all.size ? (p.full.size / p.all.size) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [d, rows]);

  const cityTotal = useMemo(() => {
    if (!cityPo) return null;
    const t = cityPo.reduce(
      (a, c) => ({
        full: a.full + c.full,
        part: a.part + c.part,
        zero: a.zero + c.zero,
        total: a.total + c.total,
      }),
      { full: 0, part: 0, zero: 0, total: 0 }
    );
    return { ...t, pctFull: t.total ? (t.full / t.total) * 100 : 0 };
  }, [cityPo]);

  async function downloadExcelSingleSheet() {
    if (!d) return;
    setDownloadingOne(true);
    try {
      const XLSX = await import("xlsx");
      const rowsOut: any[] = [];
      for (const t of ["sku", "city", "category", "trade", "region", "skucity", "date"]) {
        const label =
          t === "skucity"
            ? "Gap by SKU x City"
            : t === "date"
            ? "Gap by Date"
            : "Gap by " + t[0].toUpperCase() + t.slice(1);
        const dimLabel = t === "skucity" ? "SKU" : t === "date" ? "PO DATE" : t.toUpperCase();
        const group = gapAgg(t).map((a) => ({
          Report: label,
          [dimLabel]: a.name,
          ...(t === "skucity" ? { CITY: a.sub } : {}),
          ...(t === "sku" || t === "skucity"
            ? { "MMD ITEM CODE": a.mmdCode, "MMD SKU NAME": a.mmdName }
            : {}),
          "FR %": +a.fr.toFixed(1),
          "PO Value (₹L)": +a.poVal.toFixed(2),
          "GRN Value (₹L)": +a.grnVal.toFixed(2),
          "Gap (₹L)": +a.gap.toFixed(2),
          "PO Qty": a.poQty,
          "GRN Qty": a.grnQty,
          Lines: a.lines,
        }));
        const tot = group.reduce(
          (acc, r) => ({
            po: acc.po + r["PO Value (₹L)"],
            grn: acc.grn + r["GRN Value (₹L)"],
            gap: acc.gap + r["Gap (₹L)"],
            poQ: acc.poQ + r["PO Qty"],
            grnQ: acc.grnQ + r["GRN Qty"],
            ln: acc.ln + r.Lines,
          }),
          { po: 0, grn: 0, gap: 0, poQ: 0, grnQ: 0, ln: 0 }
        );
        group.push({
          Report: label,
          [dimLabel]: "TOTAL",
          "FR %": tot.po ? +((tot.grn / tot.po) * 100).toFixed(1) : 0,
          "PO Value (₹L)": +tot.po.toFixed(2),
          "GRN Value (₹L)": +tot.grn.toFixed(2),
          "Gap (₹L)": +tot.gap.toFixed(2),
          "PO Qty": tot.poQ,
          "GRN Qty": tot.grnQ,
          Lines: tot.ln,
        });
        rowsOut.push(...group, {});
      }
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rowsOut), "All Gaps");
      XLSX.writeFile(wb, "Trade_FR_Report_AllGaps.xlsx");
    } finally {
      setDownloadingOne(false);
    }
  }

  async function downloadExcel() {
    if (!d) return;
    setDownloading(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      for (const t of ["sku", "city", "category", "trade", "region", "skucity", "date"]) {
        const label = t === "skucity" ? "SKU" : t === "date" ? "PO DATE" : t.toUpperCase();
        const rowsOut: any[] = gapAgg(t).map((a) => ({
          [label]: a.name,
          ...(t === "skucity" ? { CITY: a.sub } : {}),
          ...(t === "sku" || t === "skucity"
            ? { "MMD ITEM CODE": a.mmdCode, "MMD SKU NAME": a.mmdName }
            : {}),
          "FR %": +a.fr.toFixed(1),
          "PO Value (₹L)": +a.poVal.toFixed(2),
          "GRN Value (₹L)": +a.grnVal.toFixed(2),
          "Gap (₹L)": +a.gap.toFixed(2),
          "PO Qty": a.poQty,
          "GRN Qty": a.grnQty,
          Lines: a.lines,
        }));
        const tot = rowsOut.reduce(
          (acc, r) => ({
            po: acc.po + r["PO Value (₹L)"],
            grn: acc.grn + r["GRN Value (₹L)"],
            gap: acc.gap + r["Gap (₹L)"],
            poQ: acc.poQ + r["PO Qty"],
            grnQ: acc.grnQ + r["GRN Qty"],
            ln: acc.ln + r.Lines,
          }),
          { po: 0, grn: 0, gap: 0, poQ: 0, grnQ: 0, ln: 0 }
        );
        rowsOut.push({
          [label]: "TOTAL",
          "FR %": tot.po ? +((tot.grn / tot.po) * 100).toFixed(1) : 0,
          "PO Value (₹L)": +tot.po.toFixed(2),
          "GRN Value (₹L)": +tot.grn.toFixed(2),
          "Gap (₹L)": +tot.gap.toFixed(2),
          "PO Qty": tot.poQ,
          "GRN Qty": tot.grnQ,
          Lines: tot.ln,
        });
        const sheetName =
          t === "skucity"
            ? "Gap by SKU x City"
            : t === "date"
            ? "Gap by Date"
            : "Gap by " + t[0].toUpperCase() + t.slice(1);
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rowsOut), sheetName);
      }
      if (cityPo && cityTotal) {
        const rowsOut: any[] = cityPo.map((c) => ({
          City: c.city,
          "Fully Supplied": c.full,
          "Partially Supplied": c.part,
          "Zero Supply": c.zero,
          "Total POs": c.total,
          "% Full": +c.pctFull.toFixed(1),
        }));
        rowsOut.push({
          City: "TOTAL",
          "Fully Supplied": cityTotal.full,
          "Partially Supplied": cityTotal.part,
          "Zero Supply": cityTotal.zero,
          "Total POs": cityTotal.total,
          "% Full": +cityTotal.pctFull.toFixed(1),
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rowsOut), "City PO Status");
      }
      XLSX.writeFile(wb, "Trade_FR_Report.xlsx");
    } finally {
      setDownloading(false);
    }
  }

  if (err) return <div className="p-8 text-sm text-red-600">Could not load data: {err}</div>;
  if (!d) return <div className="p-8 text-sm text-slate-500">Loading reports…</div>;

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-6">
      {/* ── Top Header Banner ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Reports & Detailed Breakdowns
            </h1>
            <SyncStatus />
          </div>
          <p className="text-xs font-medium text-slate-500 mt-1">
            Full tabular data · values in ₹ Lakh · {L(rows.length, 0)} lines in active selection
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <UploadButton variant="light" />
          <button
            onClick={downloadExcelSingleSheet}
            disabled={downloadingOne}
            className="px-4 py-2 rounded-xl bg-purple-900 hover:bg-purple-950 text-white font-bold text-xs shadow-md transition active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {downloadingOne ? "Preparing…" : "⬇ Download All Gaps (1 sheet)"}
          </button>
          <button
            onClick={downloadExcel}
            disabled={downloading}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {downloading ? "Preparing…" : "⬇ Download Excel (8 sheets + totals)"}
          </button>
        </div>
      </div>

      {/* ── Comprehensive Filter Bar with Presets & Multi-Select Filters ── */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {/* PO Date Range */}
          <div className="sm:col-span-2 md:col-span-2 lg:col-span-2">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                PO Date Range
              </label>
              <div className="flex items-center gap-1">
                {DATE_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => applyPreset(p.days)}
                    className="px-1.5 py-0.5 rounded text-[10px] font-bold border border-slate-200 bg-slate-50 hover:bg-purple-50 hover:border-purple-300 hover:text-purple-800 transition cursor-pointer"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={fFrom}
                onChange={(e) => setFFrom(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <span className="text-xs text-slate-400 font-bold">→</span>
              <input
                type="date"
                value={fTo}
                onChange={(e) => setFTo(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          {/* Month Slicer */}
          <MultiSelectDropdown
            label="Month"
            options={d.dims.month.map((m) => ({ key: m, label: m }))}
            selected={selMonths}
            onChange={(s) => setSelMonths(s)}
            open={openDropdown === "month"}
            onToggle={() => setOpenDropdown(openDropdown === "month" ? null : "month")}
            onClose={() => setOpenDropdown(null)}
          />

          {/* Trade Slicer */}
          <MultiSelectDropdown
            label="Trade Channel"
            options={d.dims.trade.map((t) => ({ key: t, label: t }))}
            selected={selTrades}
            onChange={(s) => setSelTrades(s)}
            open={openDropdown === "trade"}
            onToggle={() => setOpenDropdown(openDropdown === "trade" ? null : "trade")}
            onClose={() => setOpenDropdown(null)}
          />

          {/* Region Slicer */}
          <MultiSelectDropdown
            label="Region"
            options={d.dims.region.map((r) => ({ key: r, label: r }))}
            selected={selRegions}
            onChange={(s) => setSelRegions(s)}
            open={openDropdown === "region"}
            onToggle={() => setOpenDropdown(openDropdown === "region" ? null : "region")}
            onClose={() => setOpenDropdown(null)}
          />

          {/* City Slicer */}
          <MultiSelectDropdown
            label="City"
            options={d.dims.city.map((c) => ({ key: c, label: c }))}
            selected={selCities}
            onChange={(s) => setSelCities(s)}
            open={openDropdown === "city"}
            onToggle={() => setOpenDropdown(openDropdown === "city" ? null : "city")}
            onClose={() => setOpenDropdown(null)}
          />

          {/* Category Slicer */}
          <MultiSelectDropdown
            label="Category"
            options={d.dims.category.map((c) => ({ key: c, label: c }))}
            selected={selCategories}
            onChange={(s) => setSelCategories(s)}
            open={openDropdown === "category"}
            onToggle={() => setOpenDropdown(openDropdown === "category" ? null : "category")}
            onClose={() => setOpenDropdown(null)}
          />

          {/* Status Slicer */}
          <MultiSelectDropdown
            label="Status"
            options={d.dims.status.map((s) => ({ key: s, label: s }))}
            selected={selStatuses}
            onChange={(s) => setSelStatuses(s)}
            open={openDropdown === "status"}
            onToggle={() => setOpenDropdown(openDropdown === "status" ? null : "status")}
            onClose={() => setOpenDropdown(null)}
          />
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex-1 max-w-md">
            <MultiSelectDropdown
              label="SKU Slicer"
              options={d.dims.sku.map((sku) => ({ key: sku, label: sku }))}
              selected={selSkus}
              onChange={(s) => setSelSkus(s)}
              open={openDropdown === "sku"}
              onToggle={() => setOpenDropdown(openDropdown === "sku" ? null : "sku")}
              onClose={() => setOpenDropdown(null)}
            />
          </div>

          <div className="flex items-center gap-3 self-end sm:self-center">
            <button
              onClick={resetFilters}
              className="px-4 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <span>✕</span>
              <span>Reset Filters</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Tabs Navigation ── */}
      <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 px-4 py-2 rounded-2xl text-xs font-extrabold transition cursor-pointer ${
              tab === t.key
                ? "bg-purple-900 text-white shadow-md shadow-purple-950/20 ring-1 ring-purple-900"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Table Container ── */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {tab !== "citypo" && gapTable && (
          <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="relative max-w-sm w-full">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={tab === "skucity" ? "Search SKU or city…" : "Search this table…"}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <span className="absolute left-2.5 top-2 text-slate-400 text-xs">🔍</span>
            </div>

            <div className="flex items-center gap-3 text-xs font-semibold text-slate-500">
              <span>
                {L(gapTable.length, 0)} rows
                {gapTable.length > CAP && !showAll && ` · showing top ${CAP}`}
              </span>
              {gapTable.length > CAP && (
                <button
                  onClick={() => setShowAll(!showAll)}
                  className="font-bold text-purple-700 hover:underline cursor-pointer"
                >
                  {showAll ? `Show top ${CAP} only` : `Show all ${L(gapTable.length, 0)}`}
                </button>
              )}
              {q && (
                <button
                  onClick={() => setQ("")}
                  className="font-bold text-rose-600 hover:underline cursor-pointer"
                >
                  Clear search
                </button>
              )}
            </div>
          </div>
        )}

        <div className="max-h-[65vh] overflow-auto">
          {tab !== "citypo" && gapTable && gapTotal && (
            <table className="w-full min-w-[760px] text-sm text-left">
              <thead className="sticky top-0 z-10">
                <tr className="text-xs font-extrabold uppercase tracking-wider text-slate-600 bg-slate-100">
                  <th className="py-3 px-4">
                    {tab === "skucity" ? "SKU" : tab === "date" ? "PO DATE" : tab.toUpperCase()}
                  </th>
                  {tab === "skucity" && <th className="py-3 px-3">CITY</th>}
                  {(tab === "sku" || tab === "skucity") && (
                    <>
                      <th className="py-3 px-3">MMD ITEM CODE</th>
                      <th className="py-3 px-3">MMD SKU NAME</th>
                    </>
                  )}
                  <th className="py-3 px-3 text-right">FR %</th>
                  <th className="py-3 px-3 text-right">PO ₹L</th>
                  <th className="py-3 px-3 text-right">GRN ₹L</th>
                  <th className="py-3 px-3 text-right">GAP ₹L</th>
                  <th className="py-3 px-4 text-right">LINES</th>
                </tr>
                {/* Grand Total Bar */}
                <tr className="bg-purple-100/70 border-b border-purple-200 font-black text-slate-900">
                  <td className="py-3 px-4">TOTAL SUMMARY</td>
                  {tab === "skucity" && <td className="py-3 px-3" />}
                  {(tab === "sku" || tab === "skucity") && (
                    <>
                      <td className="py-3 px-3" />
                      <td className="py-3 px-3" />
                    </>
                  )}
                  <td className="py-3 px-3 text-right">
                    <span className={frPill(gapTotal.fr)}>{L(gapTotal.fr, 0)}%</span>
                  </td>
                  <td className="py-3 px-3 text-right font-black">{L2(gapTotal.poVal)}</td>
                  <td className="py-3 px-3 text-right font-black text-emerald-700">
                    {L2(gapTotal.grnVal)}
                  </td>
                  <td className="py-3 px-3 text-right font-black text-rose-700">
                    {L2(gapTotal.gap)}
                  </td>
                  <td className="py-3 px-4 text-right font-black">{L(gapTotal.lines, 0)}</td>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {(gapShown || []).map((r, i) => {
                  const icon = tab === "sku" || tab === "skucity" ? matchSkuIcon(r.name) : null;
                  return (
                    <tr
                      key={r.name + "|" + (r.sub || "") + i}
                      className="hover:bg-purple-50/40 transition-colors"
                    >
                      <td className="py-2.5 px-4 font-bold text-slate-900">
                        {icon ? (
                          <div className="flex items-center gap-2.5">
                            <button
                              type="button"
                              onClick={() =>
                                setSkuPopup({
                                  icon,
                                  name: r.mmdName || r.name,
                                  stats: [
                                    { label: "FR %", value: L(r.fr, 0) + "%" },
                                    { label: "PO ₹L", value: L2(r.poVal) },
                                    { label: "GRN ₹L", value: L2(r.grnVal) },
                                    { label: "GAP ₹L", value: L2(r.gap), cls: "text-rose-600" },
                                    { label: "LINES", value: L(r.lines, 0) },
                                  ],
                                })
                              }
                              className="shrink-0 w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 grid place-items-center overflow-hidden hover:border-purple-400 hover:ring-2 hover:ring-purple-100 transition cursor-pointer"
                              title="Click to enlarge"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={icon} alt="" className="max-w-full max-h-full object-contain" />
                            </button>
                            <span
                              onClick={() => {
                                if (icon) {
                                  setSkuPopup({
                                    icon,
                                    name: r.mmdName || r.name,
                                    stats: [
                                      { label: "FR %", value: L(r.fr, 0) + "%" },
                                      { label: "PO ₹L", value: L2(r.poVal) },
                                      { label: "GRN ₹L", value: L2(r.grnVal) },
                                      { label: "GAP ₹L", value: L2(r.gap), cls: "text-rose-600" },
                                      { label: "LINES", value: L(r.lines, 0) },
                                    ],
                                  });
                                }
                              }}
                              className="hover:text-purple-700 cursor-pointer"
                            >
                              {r.name}
                            </span>
                          </div>
                        ) : (
                          r.name
                        )}
                      </td>
                      {tab === "skucity" && <td className="py-2.5 px-3 text-slate-600 font-semibold">{r.sub}</td>}
                      {(tab === "sku" || tab === "skucity") && (
                        <>
                          <td className="py-2.5 px-3 text-slate-500 font-mono text-xs">{r.mmdCode || "—"}</td>
                          <td className="py-2.5 px-3 text-slate-700 font-medium">{r.mmdName || "—"}</td>
                        </>
                      )}
                      <td className="py-2.5 px-3 text-right">
                        <span className={frPill(r.fr)}>{L(r.fr, 0)}%</span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900">{L2(r.poVal)}</td>
                      <td className="py-2.5 px-3 text-right font-semibold text-emerald-700">{L2(r.grnVal)}</td>
                      <td className="py-2.5 px-3 text-right font-black text-rose-700">{L2(r.gap)}</td>
                      <td className="py-2.5 px-4 text-right text-slate-500 font-semibold">{L(r.lines, 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {tab === "citypo" && cityPo && cityTotal && (
            <table className="w-full min-w-[680px] text-sm text-left">
              <thead className="sticky top-0 z-10">
                <tr className="text-xs font-extrabold uppercase tracking-wider text-slate-600 bg-slate-100">
                  <th className="py-3 px-4">CITY</th>
                  <th className="py-3 px-3 text-right">FULLY SUPPLIED</th>
                  <th className="py-3 px-3 text-right">PARTIALLY SUPPLIED</th>
                  <th className="py-3 px-3 text-right">ZERO SUPPLY</th>
                  <th className="py-3 px-3 text-right">TOTAL POS</th>
                  <th className="py-3 px-4 text-right">% FULL</th>
                </tr>
                <tr className="bg-purple-100/70 border-b border-purple-200 font-black text-slate-900">
                  <td className="py-3 px-4">TOTAL</td>
                  <td className="py-3 px-3 text-right text-emerald-700">{L(cityTotal.full, 0)}</td>
                  <td className="py-3 px-3 text-right text-amber-600">{L(cityTotal.part, 0)}</td>
                  <td className="py-3 px-3 text-right text-rose-600">{L(cityTotal.zero, 0)}</td>
                  <td className="py-3 px-3 text-right">{L(cityTotal.total, 0)}</td>
                  <td className="py-3 px-4 text-right">
                    <span className={frPill(cityTotal.pctFull >= 60 ? 92 : cityTotal.pctFull >= 35 ? 80 : 60)}>
                      {L(cityTotal.pctFull, 0)}%
                    </span>
                  </td>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {cityPo.map((c) => (
                  <tr key={c.city} className="hover:bg-purple-50/40 transition-colors">
                    <td className="py-2.5 px-4 font-bold text-slate-900">{c.city}</td>
                    <td className="py-2.5 px-3 text-right text-emerald-700 font-bold">{L(c.full, 0)}</td>
                    <td className="py-2.5 px-3 text-right text-amber-600 font-semibold">{L(c.part, 0)}</td>
                    <td className="py-2.5 px-3 text-right text-rose-600 font-semibold">{L(c.zero, 0)}</td>
                    <td className="py-2.5 px-3 text-right font-black">{L(c.total, 0)}</td>
                    <td className="py-2.5 px-4 text-right">
                      <span className={frPill(c.pctFull >= 60 ? 92 : c.pctFull >= 35 ? 80 : 60)}>
                        {L(c.pctFull, 0)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {skuPopup && (
        <SkuImagePopup
          icon={skuPopup.icon}
          name={skuPopup.name}
          stats={skuPopup.stats}
          onClose={() => setSkuPopup(null)}
        />
      )}
    </div>
  );
}
