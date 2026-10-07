"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import UploadButton from "../upload-button";
import SyncStatus from "../sync-status";
import { lookupMmd, mmdGroup } from "@/lib/mmd-mapping";
import { matchSkuIcon } from "@/lib/sku-icon";
import SkuImagePopup from "../sku-image-popup";
import { lookupDepoByCity } from "@/lib/depo-mapping";
import { broadcastTickerSync } from "@/lib/ticker-sync";

/* Row shape from /api/data:
   [month, trade, region, city, category, status, sku,
    poQty, poVal, grnQty, grnVal, dateYYYYMMDD, poId, expiryYYYYMMDD] */

type Data = { meta: any; dims: Record<string, string[]>; rows: number[][] };

const L = (n: number, d = 1) =>
  n.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: 0 });
const L2 = (n: number) =>
  n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

const ymdToDate = (n: number) => {
  const s = String(n);
  return s.length === 8 ? s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8) : "—";
};
const dateToYmd = (s: string) => (s ? +s.replaceAll("-", "") : 0);

const DATE_PRESETS = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "MTD", days: 0 },
  { label: "All", days: -1 },
];

const ANALYSIS_TABS = [
  { key: "sku", label: "By SKU" },
  { key: "city", label: "By City" },
  { key: "category", label: "By Category" },
  { key: "trade", label: "By Trade" },
  { key: "skucity", label: "By SKU × City" },
  { key: "date", label: "By Date" },
] as const;

type TabKey = (typeof ANALYSIS_TABS)[number]["key"];

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

export default function FullDashboardPage() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");

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

  // Analysis Tab & Metric Switch
  const [activeTab, setActiveTab] = useState<TabKey>("sku");
  const [metric, setMetric] = useState<"val" | "qty">("val");
  const [tableSearch, setTableSearch] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  // Lightbox
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

  function resetAllFilters() {
    setSelMonths([]);
    setSelTrades([]);
    setSelRegions([]);
    setSelCities([]);
    setSelCategories([]);
    setSelSkus([]);
    setTableSearch("");
    setPage(1);
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

  // Filtered Rows
  const filteredRows = useMemo(() => {
    if (!d) return [];
    const fromYmd = dateToYmd(fFrom);
    const toYmd = dateToYmd(fTo);

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

      if (fromYmd && rowPoDate > 0 && rowPoDate < fromYmd) return false;
      if (toYmd && rowPoDate > 0 && rowPoDate > toYmd) return false;

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

  // Executive KPIs
  const kpis = useMemo(() => {
    let poQ = 0,
      poV = 0,
      grnQ = 0,
      grnV = 0;
    const poSet = new Set<number>();

    for (const r of filteredRows) {
      poQ += r[7];
      poV += r[8];
      grnQ += r[9];
      grnV += r[10];
      poSet.add(r[12]);
    }

    const gapV = Math.max(0, poV - grnV);
    const gapQ = Math.max(0, poQ - grnQ);
    const frVal = poV > 0 ? (grnV / poV) * 100 : 0;
    const frQty = poQ > 0 ? (grnQ / poQ) * 100 : 0;

    return {
      poQ,
      poV,
      grnQ,
      grnV,
      gapV,
      gapQ,
      frVal,
      frQty,
      poCount: poSet.size,
      lineCount: filteredRows.length,
    };
  }, [filteredRows]);

  // Synchronize with live scrolling ticker
  useEffect(() => {
    if (!d || !kpis) return;
    const byStatus = new Map<string, { poVal: number; grnVal: number; gapVal: number; poCount: Set<number> }>();
    const byTrade = new Map<string, { poVal: number; grnVal: number; gapVal: number }>();
    const byCity = new Map<string, { poVal: number; grnVal: number; gapVal: number }>();

    for (const r of filteredRows) {
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
      activeViewTitle: selStatuses.length > 0 ? `${selStatuses.length} STATUSES ACTIVE` : "FULL DASHBOARD",
      selectedStatuses: selStatuses,
      poVal: kpis.poV,
      poQty: kpis.poQ,
      grnVal: kpis.grnV,
      grnQty: kpis.grnQ,
      gapVal: kpis.gapV,
      frVal: kpis.frVal,
      frQty: kpis.frQty,
      poCount: kpis.poCount,
      statusBreakdown,
      trades,
      cities,
    });
  }, [d, kpis, filteredRows, selStatuses]);

  // Tab-wise Aggregated Table Engine
  const tabRows = useMemo(() => {
    if (!d) return [];

    type RowAgg = {
      key: string;
      label: string;
      subLabel?: string;
      icon?: string | null;
      mmdCode?: string;   // MMD Item Code from MMD_SKU.xlsx
      mmdName?: string;   // MMD SKU Name from MMD_SKU.xlsx
      tradeSku?: string;  // Original trade (Zepto) SKU name
      poVal: number;
      grnVal: number;
      gapVal: number;
      poQty: number;
      grnQty: number;
      gapQty: number;
      frVal: number;
      frQty: number;
      lineCount: number;
      poIds: Set<number>;
    };

    const map = new Map<string, RowAgg>();

    for (const r of filteredRows) {
      let key = "";
      let label = "";
      let subLabel: string | undefined = undefined;
      let icon: string | null = null;
      let mmdCode: string | undefined = undefined;
      let mmdName: string | undefined = undefined;
      let tradeSku: string | undefined = undefined;

      if (activeTab === "sku") {
        const rawSku = d.dims.sku[r[6]];
        const m = lookupMmd(rawSku);
        key = rawSku;
        label = rawSku; // Original trade/Zepto SKU name
        subLabel = d.dims.category[r[4]];
        icon = matchSkuIcon(m?.name || rawSku);
        mmdCode = m?.code || undefined;
        mmdName = m?.name || undefined;
        tradeSku = rawSku;
      } else if (activeTab === "city") {
        key = d.dims.city[r[3]];
        label = key;
        const depo = lookupDepoByCity(key)?.depo;
        subLabel = depo ? `Depot: ${depo}` : d.dims.region[r[2]];
      } else if (activeTab === "category") {
        key = d.dims.category[r[4]];
        label = key;
      } else if (activeTab === "trade") {
        key = d.dims.trade[r[1]];
        label = key;
      } else if (activeTab === "skucity") {
        const rawSku = d.dims.sku[r[6]];
        const city = d.dims.city[r[3]];
        const m = lookupMmd(rawSku);
        key = `${rawSku}|${city}`;
        label = rawSku; // Original trade SKU name
        subLabel = `📍 ${city}`;
        icon = matchSkuIcon(m?.name || rawSku);
        mmdCode = m?.code || undefined;
        mmdName = m?.name || undefined;
        tradeSku = rawSku;
      } else if (activeTab === "date") {
        key = String(r[11]);
        label = ymdToDate(r[11]);
      }

      let agg = map.get(key);
      if (!agg) {
        agg = {
          key,
          label,
          subLabel,
          icon,
          mmdCode,
          mmdName,
          tradeSku,
          poVal: 0,
          grnVal: 0,
          gapVal: 0,
          poQty: 0,
          grnQty: 0,
          gapQty: 0,
          frVal: 0,
          frQty: 0,
          lineCount: 0,
          poIds: new Set(),
        };
        map.set(key, agg);
      }

      agg.poVal += r[8];
      agg.grnVal += r[10];
      agg.poQty += r[7];
      agg.grnQty += r[9];
      agg.lineCount += 1;
      agg.poIds.add(r[12]);
    }

    const res = Array.from(map.values()).map((row) => {
      const gapVal = Math.max(0, row.poVal - row.grnVal);
      const gapQty = Math.max(0, row.poQty - row.grnQty);
      const frVal = row.poVal > 0 ? (row.grnVal / row.poVal) * 100 : 0;
      const frQty = row.poQty > 0 ? (row.grnQty / row.poQty) * 100 : 0;

      return {
        ...row,
        gapVal,
        gapQty,
        frVal,
        frQty,
      };
    });

    // Sort by largest gap value / qty, except dates which sort chronologically
    if (activeTab === "date") {
      return res.sort((a, b) => +a.key - +b.key);
    }

    return res.sort((a, b) => (metric === "val" ? b.gapVal - a.gapVal : b.gapQty - a.gapQty));
  }, [d, filteredRows, activeTab, metric]);

  // Search Filtered Tab Rows
  const searchedTabRows = useMemo(() => {
    if (!tableSearch.trim()) return tabRows;
    const q = tableSearch.toLowerCase();
    return tabRows.filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        (r.subLabel && r.subLabel.toLowerCase().includes(q)) ||
        (r.mmdCode && r.mmdCode.toLowerCase().includes(q)) ||
        (r.mmdName && r.mmdName.toLowerCase().includes(q))
    );
  }, [tabRows, tableSearch]);

  // Paginated Rows
  const paginatedTabRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return searchedTabRows.slice(start, start + pageSize);
  }, [searchedTabRows, page, pageSize]);

  // Export CSV
  function downloadFilteredCsv() {
    if (!searchedTabRows.length) return;
    const isSKUTab = activeTab === "sku" || activeTab === "skucity";
    const headers = [
      isSKUTab ? "Trade SKU Name" : "Item / Dimension",
      ...(isSKUTab ? ["MMD Item Code", "MMD SKU Name"] : ["Sub Detail"]),
      "PO Value (₹L)",
      "Filled GRN (₹L)",
      "Gap Value (₹L)",
      "PO Qty",
      "Filled Qty",
      "Gap Qty",
      "Fill Rate % (Value)",
      "Fill Rate % (Qty)",
      "PO Orders Count",
      "PO Lines",
    ];

    const csvRows = searchedTabRows.map((r) => [
      `"${r.label}"`,
      ...(isSKUTab
        ? [`"${r.mmdCode || "—"}"`, `"${r.mmdName || "—"}"`]
        : [`"${r.subLabel || ""}"`]),
      r.poVal.toFixed(2),
      r.grnVal.toFixed(2),
      r.gapVal.toFixed(2),
      r.poQty,
      r.grnQty,
      r.gapQty,
      r.frVal.toFixed(1) + "%",
      r.frQty.toFixed(1) + "%",
      r.poIds.size,
      r.lineCount,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...csvRows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `trade-fill-rate-${activeTab}-${dateToYmd(fTo) || "export"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  if (err) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700">
          Failed to load dashboard: {err}
        </div>
      </div>
    );
  }

  if (!d) {
    return (
      <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
        <span className="font-semibold text-sm">Loading Full Trade Fill Rate Dashboard...</span>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-6">
      {/* ── Top Header Banner ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-700 via-fuchsia-600 to-indigo-700 grid place-items-center text-white font-black text-xl shadow-md shadow-purple-700/20">
            M
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Trade Fill Rate — 2026
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-900 text-xs font-bold">
                Full Dashboard
              </span>
            </div>
            <p className="text-xs font-medium text-slate-500 mt-0.5">
              PO fulfilment intelligence across quick-commerce trades · {L(kpis.lineCount)} PO lines ({L(kpis.poCount)} Orders)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <SyncStatus />
          <UploadButton variant="light" />
          <button
            onClick={downloadFilteredCsv}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-900 hover:bg-purple-950 text-white font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer"
          >
            <span>📥</span>
            <span>Export Filtered CSV</span>
          </button>
        </div>
      </div>

      {/* ── Comprehensive Filter Bar with Presets & Multi-Select Filters ── */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
        {/* Row 1: Date Range, Presets & Dimension Slicers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {/* From Date */}
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

          {/* Status Slicer (with 3 Ticked Defaults) */}
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

        {/* Row 2: SKU Search & Reset Filters Button */}
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
              onClick={resetAllFilters}
              className="px-4 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <span>✕</span>
              <span>Reset Filters</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Executive KPI Cards (Overall Fill Rate, PO Val, GRN Val, Gap) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Fill Rate Card with Radial & Progress Bar */}
        <div className="sm:col-span-2 lg:col-span-2 bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
            Overall Fill Rate
          </div>
          <div className="my-2 flex items-baseline gap-6">
            <div>
              <div className="text-4xl sm:text-5xl font-black text-slate-900">
                {kpis.frVal.toFixed(0)}%
              </div>
              <div className="text-xs font-bold text-slate-500 uppercase mt-0.5">By Value</div>
            </div>
            <div className="border-l border-slate-200 pl-6">
              <div className="text-4xl sm:text-5xl font-black text-purple-900">
                {kpis.frQty.toFixed(0)}%
              </div>
              <div className="text-xs font-bold text-slate-500 uppercase mt-0.5">By Qty</div>
            </div>
          </div>

          {/* Visual Fill Rate Progress Bar */}
          <div>
            <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex">
              <div
                className="bg-emerald-500 h-full rounded-l-full transition-all duration-500"
                style={{ width: `${Math.min(100, kpis.frVal)}%` }}
              />
              <div
                className="bg-rose-500 h-full rounded-r-full transition-all duration-500"
                style={{ width: `${Math.max(0, 100 - kpis.frVal)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs font-bold mt-1.5">
              <span className="text-emerald-700 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Supplied ₹{L2(kpis.grnV)}L
              </span>
              <span className="text-rose-700 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                Gap ₹{L2(kpis.gapV)}L
              </span>
            </div>
          </div>
        </div>

        {/* PO Value */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
            PO Value
          </div>
          <div className="text-3xl sm:text-4xl font-black text-purple-950">
            {L(kpis.poV, 0)} <span className="text-sm font-bold text-slate-400">₹L</span>
          </div>
          <div className="text-xs font-bold text-purple-700">
            ≈ ₹{(kpis.poV / 100).toFixed(2)} Cr · {L(kpis.poQ, 0)} units
          </div>
        </div>

        {/* GRN Value */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-600">
            GRN Value
          </div>
          <div className="text-3xl sm:text-4xl font-black text-emerald-700">
            {L(kpis.grnV, 0)} <span className="text-sm font-bold text-slate-400">₹L</span>
          </div>
          <div className="text-xs font-bold text-emerald-600">
            Received {L(kpis.grnQ, 0)} units
          </div>
        </div>

        {/* Value Gap */}
        <div className="bg-white rounded-3xl p-5 border border-rose-200 bg-rose-50/30 shadow-sm flex flex-col justify-between">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-rose-600">
            Value Gap
          </div>
          <div className="text-3xl sm:text-4xl font-black text-rose-700">
            {L(kpis.gapV, 0)} <span className="text-sm font-bold text-rose-400">₹L</span>
          </div>
          <div className="text-xs font-bold text-rose-600">
            Not fulfilled ({L(kpis.gapQ, 0)} units gap)
          </div>
        </div>
      </div>

      {/* ── Gap Analysis Interactive Engine with Tabs ── */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Navigation & Controls Bar */}
        <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-black text-slate-900">
              Gap Analysis — Where the Gap Sits
            </h3>
            <p className="text-xs font-medium text-slate-500">
              Ranked breakdown across {ANALYSIS_TABS.find((t) => t.key === activeTab)?.label}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Analysis Tabs */}
            <div className="flex items-center gap-1 p-1 rounded-2xl bg-slate-100 border border-slate-200">
              {ANALYSIS_TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => {
                    setActiveTab(t.key);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                    activeTab === t.key
                      ? "bg-white text-purple-950 shadow-xs ring-1 ring-purple-300"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Metric Toggle */}
            <div className="flex items-center gap-1 p-1 rounded-2xl bg-purple-50 border border-purple-200">
              <button
                onClick={() => setMetric("val")}
                className={`px-3 py-1 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                  metric === "val" ? "bg-purple-700 text-white shadow-xs" : "text-purple-900"
                }`}
              >
                ₹ Value
              </button>
              <button
                onClick={() => setMetric("qty")}
                className={`px-3 py-1 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                  metric === "qty" ? "bg-purple-700 text-white shadow-xs" : "text-purple-900"
                }`}
              >
                Qty
              </button>
            </div>
          </div>
        </div>

        {/* Free Search Filter for Table */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="relative max-w-sm w-full">
            <input
              type="text"
              placeholder={`Search in ${ANALYSIS_TABS.find((t) => t.key === activeTab)?.label}...`}
              value={tableSearch}
              onChange={(e) => {
                setTableSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <span className="absolute left-2.5 top-2 text-slate-400 text-xs">🔍</span>
          </div>

          <span className="text-xs font-semibold text-slate-500">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, searchedTabRows.length)} of{" "}
            {searchedTabRows.length} items
          </span>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 font-extrabold uppercase text-[11px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4 text-center">#</th>
                <th className="py-3.5 px-4">
                  {activeTab === "sku" || activeTab === "skucity"
                    ? "SKU (Trade Name)"
                    : activeTab === "city"
                    ? "City"
                    : activeTab === "category"
                    ? "Category"
                    : activeTab === "trade"
                    ? "Trade Channel"
                    : "PO Date"}
                </th>
                {/* MMD columns only for SKU tabs */}
                {(activeTab === "sku" || activeTab === "skucity") && (
                  <>
                    <th className="py-3.5 px-4 text-center text-violet-700">MMD Item Code</th>
                    <th className="py-3.5 px-4 text-violet-700">MMD SKU Name</th>
                  </>
                )}
                <th className="py-3.5 px-4 text-right">
                  {metric === "val" ? "PO Value (₹L)" : "PO Qty"}
                </th>
                <th className="py-3.5 px-4 text-right">
                  {metric === "val" ? "Filled GRN (₹L)" : "Filled Qty"}
                </th>
                <th className="py-3.5 px-4 text-right text-rose-600">
                  {metric === "val" ? "Gap Value (₹L)" : "Gap Qty"}
                </th>
                <th className="py-3.5 px-4 text-center">Fill Rate %</th>
                <th className="py-3.5 px-4 text-center">Orders</th>
                <th className="py-3.5 px-4 text-center">Lines</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {paginatedTabRows.length === 0 ? (
                <tr>
                  <td colSpan={(activeTab === "sku" || activeTab === "skucity") ? 10 : 8} className="py-12 text-center text-slate-400 font-bold">
                    No records found matching active filters
                  </td>
                </tr>
              ) : (
                paginatedTabRows.map((r, idx) => {
                  const globalIdx = (page - 1) * pageSize + idx + 1;
                  const fr = metric === "val" ? r.frVal : r.frQty;

                  return (
                    <tr key={r.key} className="hover:bg-purple-50/40 transition-colors">
                      {/* Rank */}
                      <td className="py-3.5 px-4 text-center font-mono text-xs font-bold text-slate-400">
                        {globalIdx}
                      </td>

                      {/* Name & Sub details */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          {r.icon && (
                            <div
                              onClick={() =>
                                setSkuPopup({
                                  icon: r.icon || null,
                                  name: r.label,
                                  stats: [
                                    { label: "Ordered", value: metric === "val" ? `₹${L2(r.poVal)}L` : L(r.poQty, 0) },
                                    { label: "Supplied", value: metric === "val" ? `₹${L2(r.grnVal)}L` : L(r.grnQty, 0) },
                                    { label: "Gap", value: metric === "val" ? `₹${L2(r.gapVal)}L` : L(r.gapQty, 0), cls: "text-rose-600 font-bold" },
                                    { label: "Fill Rate", value: `${fr.toFixed(1)}%` },
                                  ],
                                })
                              }
                              className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 grid place-items-center shrink-0 overflow-hidden cursor-pointer hover:scale-105 transition-transform"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={r.icon} alt="" className="max-w-full max-h-full object-contain" />
                            </div>
                          )}
                          <div>
                            <div
                              onClick={() => {
                                if (r.icon) {
                                  setSkuPopup({
                                    icon: r.icon,
                                    name: r.label,
                                    stats: [
                                      { label: "Ordered", value: metric === "val" ? `₹${L2(r.poVal)}L` : L(r.poQty, 0) },
                                      { label: "Supplied", value: metric === "val" ? `₹${L2(r.grnVal)}L` : L(r.grnQty, 0) },
                                      { label: "Gap", value: metric === "val" ? `₹${L2(r.gapVal)}L` : L(r.gapQty, 0), cls: "text-rose-600 font-bold" },
                                      { label: "Fill Rate", value: `${fr.toFixed(1)}%` },
                                    ],
                                  });
                                }
                              }}
                              className={`font-bold text-slate-900 ${r.icon ? "hover:text-purple-700 cursor-pointer" : ""}`}
                            >
                              {r.label}
                            </div>
                            {r.subLabel && (
                              <div className="text-[11px] font-semibold text-slate-400">
                                {r.subLabel}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* MMD Item Code + MMD SKU Name columns (SKU tabs only) */}
                      {(activeTab === "sku" || activeTab === "skucity") && (
                        <>
                          <td className="py-3.5 px-4 text-center">
                            {r.mmdCode ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-violet-100 text-violet-800 text-[11px] font-mono font-bold tracking-tight">
                                {r.mmdCode}
                              </span>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="text-sm font-semibold text-slate-700">
                              {r.mmdName || <span className="text-slate-300">—</span>}
                            </span>
                          </td>
                        </>
                      )}

                      {/* PO Val / Qty */}
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                        {metric === "val" ? `₹${L2(r.poVal)}` : L(r.poQty, 0)}
                      </td>

                      {/* GRN Val / Qty */}
                      <td className="py-3.5 px-4 text-right font-semibold text-emerald-700">
                        {metric === "val" ? `₹${L2(r.grnVal)}` : L(r.grnQty, 0)}
                      </td>

                      {/* Gap Val / Qty */}
                      <td className="py-3.5 px-4 text-right font-black text-rose-700">
                        {metric === "val" ? `₹${L2(r.gapVal)}` : L(r.gapQty, 0)}
                      </td>

                      {/* Fill Rate % */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            fr >= 90
                              ? "bg-emerald-100 text-emerald-800"
                              : fr >= 75
                              ? "bg-amber-100 text-amber-800"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {fr.toFixed(1)}%
                        </span>
                      </td>

                      {/* PO Orders Count */}
                      <td className="py-3.5 px-4 text-center text-xs font-bold text-purple-900">
                        {r.poIds.size}
                      </td>

                      {/* Lines */}
                      <td className="py-3.5 px-4 text-center text-xs font-semibold text-slate-500">
                        {r.lineCount}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-semibold">Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(+e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700"
            >
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold disabled:opacity-40 hover:bg-slate-50 cursor-pointer"
            >
              ← Prev
            </button>
            <span className="text-xs font-bold text-slate-700">
              Page {page} of {Math.ceil(searchedTabRows.length / pageSize) || 1}
            </span>
            <button
              disabled={page >= Math.ceil(searchedTabRows.length / pageSize)}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold disabled:opacity-40 hover:bg-slate-50 cursor-pointer"
            >
              Next →
            </button>
          </div>
        </div>
      </div>

      {/* ── Single SKU Lightbox ── */}
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
