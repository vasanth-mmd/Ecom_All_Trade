"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import UploadButton from "../../upload-button";
import SyncStatus from "../../sync-status";
import { mmdGroup } from "@/lib/mmd-mapping";
import { matchSkuIcon } from "@/lib/sku-icon";
import { lookupDepoByCity } from "@/lib/depo-mapping";
import SkuImagePopup, { SkuStat } from "../../sku-image-popup";
import * as XLSX from "xlsx";

/* Row shape:
   [month, trade, region, city, category, status, sku,
    poQty, poVal, grnQty, grnVal, dateYYYYMMDD, poId, expiryYYYYMMDD]
*/

type Data = {
  meta: any;
  dims: Record<string, string[]>;
  rows: number[][];
};

const L = (n: number, d = 1) =>
  (n || 0).toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: 0 });

const L2 = (n: number) =>
  (n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

const frPill = (fr: number) => {
  if (fr >= 90) return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20";
  if (fr >= 75) return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20";
  if (fr > 0) return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20";
  return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-bold";
};

const frColor = (fr: number) => {
  if (fr >= 90) return "text-emerald-600 dark:text-emerald-400 font-bold";
  if (fr >= 75) return "text-amber-600 dark:text-amber-400 font-bold";
  if (fr > 0) return "text-orange-600 dark:text-orange-400 font-bold";
  return "text-rose-600 dark:text-rose-400 font-bold";
};

export interface CitySkuOpportunityRow {
  key: string;
  city: string;
  depot?: string;
  region: string;
  category: string;
  rawSku: string;
  name: string;
  code: string;
  icon?: string | null;
  poQty: number;
  grnQty: number;
  poVal: number;
  grnVal: number;
  fr: number;
  gapQty: number;
  gapVal: number;
  severity: "zero" | "severe" | "moderate" | "healthy";
}

type SkuPopupState = {
  icon: string | null;
  name: string;
  stats: SkuStat[];
} | null;

type FunnelTarget = {
  row: CitySkuOpportunityRow;
} | null;

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

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open, onClose]);

  return (
    <div className={`relative inline-block text-left ${open ? "z-50" : "z-10"}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={onToggle}
        className={`flex items-center justify-between gap-2 px-3 py-1.5 text-xs font-semibold rounded-xl border transition min-w-[130px] shadow-xs cursor-pointer ${
          isFiltered
            ? "border-indigo-500 bg-indigo-50 text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-200 dark:border-indigo-500"
            : "border-slate-300 dark:border-white/10 bg-white dark:bg-[#000d38] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5"
        }`}
      >
        <span className="truncate">
          <span className="text-slate-400 dark:text-slate-400 font-normal mr-1">{label}:</span>
          <span className="font-bold">{buttonLabel}</span>
        </span>
        <svg
          className={`w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/10 dark:bg-black/30" onClick={onClose} />
          <div className="absolute left-0 top-full mt-1.5 w-64 rounded-xl shadow-2xl bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/15 p-2 z-50 text-xs backdrop-blur-xl">
            <div className="flex items-center justify-between px-2 py-1 mb-1.5 border-b border-slate-100 dark:border-white/10">
              <span className="font-bold text-slate-800 dark:text-slate-200">{label} Filter</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onChange(options.map((o) => o.key))}
                  className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
                >
                  All
                </button>
                <span className="text-slate-300 dark:text-slate-600">|</span>
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="text-[11px] text-slate-500 dark:text-slate-400 hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="px-1 mb-2">
              <input
                type="text"
                placeholder={`Search ${label}...`}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full px-2 py-1 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="max-h-52 overflow-y-auto space-y-0.5 pr-1 custom-scrollbar">
              {filteredOptions.length === 0 ? (
                <div className="text-slate-400 text-center py-2">No matches</div>
              ) : (
                filteredOptions.map((o) => {
                  const checked = selSet.has(o.key);
                  return (
                    <label
                      key={o.key}
                      onClick={() => toggleItem(o.key)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition select-none ${
                        checked
                          ? "bg-indigo-50 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200 font-semibold"
                          : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {}}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-0 focus:ring-offset-0 bg-white"
                      />
                      <span className="truncate flex-1" title={o.label}>
                        {o.label}
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

export default function CitySkuOpportunityPage() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  // Single Selected Month for Opportunity Analysis
  const [selectedMonth, setSelectedMonth] = useState<string>("");

  // Synced Day Range (1..31)
  const [dayFrom, setDayFrom] = useState<number>(1);
  const [dayTo, setDayTo] = useState<number>(31);
  const [activePreset, setActivePreset] = useState<string>("full");

  // Filters
  const [selTrades, setSelTrades] = useState<string[]>([]);
  const [selRegions, setSelRegions] = useState<string[]>([]);
  const [selCities, setSelCities] = useState<string[]>([]);
  const [selCategories, setSelCategories] = useState<string[]>([]);
  const [selStatuses, setSelStatuses] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [lossFilter, setLossFilter] = useState<"all" | "gaps-only" | "zero-supply" | "severe-gap">("gaps-only");

  // Multi-select dropdown state
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Lightbox SKU Popup
  const [skuPopup, setSkuPopup] = useState<SkuPopupState>(null);

  // Funnel Drilldown
  const [funnelTarget, setFunnelTarget] = useState<FunnelTarget>(null);

  // Sorting & Pagination
  const [sortState, setSortState] = useState<{ col: keyof CitySkuOpportunityRow; dir: 1 | -1 }>({
    col: "gapVal",
    dir: -1,
  });
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Load Data
  useEffect(() => {
    let unmounted = false;
    fetch("/api/data")
      .then((res) => {
        if (!res.ok) throw new Error(`Data fetch failed: ${res.status}`);
        return res.json();
      })
      .then((data: Data) => {
        if (unmounted) return;
        setD(data);
        if (data?.dims?.month && data.dims.month.length > 0) {
          const mList = data.dims.month;
          setSelectedMonth(mList[mList.length - 1] || "");
        }
        setLoading(false);
      })
      .catch((e) => {
        if (!unmounted) {
          setErr(e.message || "Failed to load dataset");
          setLoading(false);
        }
      });

    return () => {
      unmounted = true;
    };
  }, []);

  const months = d?.dims?.month || [];
  const allTrades = d?.dims?.trade || [];
  const allRegions = d?.dims?.region || [];
  const allCities = d?.dims?.city || [];
  const allCategories = d?.dims?.category || [];
  const allStatuses = d?.dims?.status || [];

  // Filter Sets
  const tradeFilterSet = useMemo(() => new Set(selTrades), [selTrades]);
  const regionFilterSet = useMemo(() => new Set(selRegions), [selRegions]);
  const cityFilterSet = useMemo(() => new Set(selCities), [selCities]);
  const categoryFilterSet = useMemo(() => new Set(selCategories), [selCategories]);
  const statusFilterSet = useMemo(() => new Set(selStatuses), [selStatuses]);

  // Max day in selected month
  const maxDayMonth = useMemo(() => {
    if (!d || !selectedMonth || !d.dims?.month) return 31;
    let maxD = 0;
    for (const r of d.rows) {
      if (d.dims.month[r[0]] === selectedMonth && r[11] > 0) {
        const dNum = r[11] % 100;
        if (dNum > maxD) maxD = dNum;
      }
    }
    return maxD > 0 ? maxD : 31;
  }, [d, selectedMonth]);

  // Apply Day Preset
  const applyPreset = (preset: "full" | "mtd" | "7d" | "14d" | "30d") => {
    setActivePreset(preset);
    if (preset === "full") {
      setDayFrom(1);
      setDayTo(31);
    } else if (preset === "mtd") {
      setDayFrom(1);
      setDayTo(Math.max(1, maxDayMonth));
    } else if (preset === "7d") {
      const end = Math.max(1, maxDayMonth);
      setDayFrom(Math.max(1, end - 6));
      setDayTo(end);
    } else if (preset === "14d") {
      const end = Math.max(1, maxDayMonth);
      setDayFrom(Math.max(1, end - 13));
      setDayTo(end);
    } else if (preset === "30d") {
      const end = Math.max(1, maxDayMonth);
      setDayFrom(Math.max(1, end - 29));
      setDayTo(end);
    }
  };

  // Row Filter Matcher
  const rowMatchesFilters = (r: number[]) => {
    if (!d) return false;
    if (tradeFilterSet.size > 0 && !tradeFilterSet.has(d.dims.trade[r[1]])) return false;
    if (regionFilterSet.size > 0 && !regionFilterSet.has(d.dims.region[r[2]])) return false;
    if (cityFilterSet.size > 0 && !cityFilterSet.has(d.dims.city[r[3]])) return false;
    if (categoryFilterSet.size > 0 && !categoryFilterSet.has(d.dims.category[r[4]])) return false;
    if (statusFilterSet.size > 0 && !statusFilterSet.has(d.dims.status[r[5]])) return false;

    const ymd = r[11];
    if (ymd >= 19000101) {
      const day = ymd % 100;
      if (day < dayFrom || day > dayTo) return false;
    }
    return true;
  };

  /* ── Helper to calculate Opportunity Loss ── */
  const computeOpportunity = (poVal: number, grnVal: number, poQty: number, grnQty: number) => {
    const fr = poVal > 0 ? (grnVal / poVal) * 100 : 0;
    const gapVal = Math.max(0, poVal - grnVal);
    const gapQty = Math.max(0, poQty - grnQty);

    return {
      fr,
      gapVal,
      gapQty,
    };
  };

  // Build City x SKU Opportunity Rows for Single Selected Month
  const citySkuRows = useMemo(() => {
    if (!d || !selectedMonth) return [];

    type Acc = {
      city: string;
      depot: string;
      region: string;
      category: string;
      rawSku: string;
      name: string;
      code: string;
      poVal: number;
      grnVal: number;
      poQty: number;
      grnQty: number;
    };
    const map = new Map<string, Acc>();

    for (const r of d.rows) {
      const mName = d.dims.month[r[0]];
      if (mName !== selectedMonth) continue;
      if (!rowMatchesFilters(r)) continue;

      const city = d.dims.city[r[3]] || "Unknown City";
      const region = d.dims.region[r[2]] || "Other";
      const cat = d.dims.category[r[4]] || "General";
      const rawSku = d.dims.sku[r[6]] || "Unknown SKU";
      const mmd = mmdGroup(rawSku);
      const skuKey = mmd.key;
      const pairKey = `${city}___${skuKey}`;

      let entry = map.get(pairKey);
      if (!entry) {
        const depoInfo = lookupDepoByCity(city);
        entry = {
          city,
          depot: depoInfo ? depoInfo.depo : "—",
          region,
          category: cat,
          rawSku,
          name: mmd.name || rawSku,
          code: mmd.code || "",
          poVal: 0,
          grnVal: 0,
          poQty: 0,
          grnQty: 0,
        };
        map.set(pairKey, entry);
      }

      entry.poQty += r[7];
      entry.poVal += r[8];
      entry.grnQty += r[9];
      entry.grnVal += r[10];
    }

    const list: CitySkuOpportunityRow[] = [];
    map.forEach((acc, pairKey) => {
      const opp = computeOpportunity(acc.poVal, acc.grnVal, acc.poQty, acc.grnQty);
      const icon = matchSkuIcon(acc.name || acc.rawSku);

      let severity: "zero" | "severe" | "moderate" | "healthy" = "healthy";
      if (acc.poVal > 0 && acc.grnVal === 0) {
        severity = "zero";
      } else if (opp.fr < 60 && opp.gapVal > 0) {
        severity = "severe";
      } else if (opp.fr < 90 && opp.gapVal > 0) {
        severity = "moderate";
      }

      list.push({
        key: pairKey,
        icon,
        ...acc,
        ...opp,
        severity,
      });
    });

    let filtered = list;
    if (lossFilter === "gaps-only") {
      filtered = filtered.filter((x) => x.gapVal > 0.001 || x.gapQty > 0);
    } else if (lossFilter === "zero-supply") {
      filtered = filtered.filter((x) => x.grnVal === 0 && x.poVal > 0);
    } else if (lossFilter === "severe-gap") {
      filtered = filtered.filter((x) => x.fr < 60 && x.gapVal > 0.01);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (x) =>
          x.city.toLowerCase().includes(q) ||
          (x.depot && x.depot.toLowerCase().includes(q)) ||
          x.name.toLowerCase().includes(q) ||
          (x.code && x.code.toLowerCase().includes(q)) ||
          (x.category && x.category.toLowerCase().includes(q)) ||
          (x.region && x.region.toLowerCase().includes(q))
      );
    }

    return filtered;
  }, [d, selectedMonth, dayFrom, dayTo, tradeFilterSet, regionFilterSet, cityFilterSet, categoryFilterSet, statusFilterSet, lossFilter, searchQuery]);

  // Overall Aggregated Metrics for City & SKU
  const totals = useMemo(() => {
    let poVal = 0,
      grnVal = 0,
      poQty = 0,
      grnQty = 0,
      gapVal = 0,
      gapQty = 0,
      zeroSupplyCount = 0,
      severeGapCount = 0;

    for (const r of citySkuRows) {
      poVal += r.poVal;
      grnVal += r.grnVal;
      poQty += r.poQty;
      grnQty += r.grnQty;
      gapVal += r.gapVal;
      gapQty += r.gapQty;

      if (r.severity === "zero") zeroSupplyCount++;
      if (r.severity === "severe") severeGapCount++;
    }

    const fr = poVal > 0 ? (grnVal / poVal) * 100 : 0;

    return {
      count: citySkuRows.length,
      poVal,
      grnVal,
      poQty,
      grnQty,
      gapVal,
      gapQty,
      fr,
      zeroSupplyCount,
      severeGapCount,
      gapCount: citySkuRows.filter((x) => x.gapVal > 0).length,
    };
  }, [citySkuRows]);

  // Sorted Rows
  const sortedRows = useMemo(() => {
    const list = [...citySkuRows];
    list.sort((a, b) => {
      const aVal = a[sortState.col] ?? 0;
      const bVal = b[sortState.col] ?? 0;
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortState.dir === 1 ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortState.dir === 1 ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return list;
  }, [citySkuRows, sortState]);

  // Paginated Rows
  const totalPages = Math.ceil(sortedRows.length / pageSize) || 1;
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, page, pageSize]);

  const toggleSort = (col: keyof CitySkuOpportunityRow) => {
    setSortState((prev) => ({
      col,
      dir: prev.col === col ? (prev.dir === 1 ? -1 : 1) : -1,
    }));
  };

  /* ── Export to Excel Function ── */
  const exportToExcel = (dataRows: CitySkuOpportunityRow[], customFilename?: string) => {
    const sheetData = dataRows.map((r, idx) => ({
      "S.No": idx + 1,
      "City": r.city,
      "Depot": r.depot || "—",
      "Region": r.region,
      "Category": r.category,
      "SKU Code": r.code || "—",
      "SKU Name": r.name,
      "Month": selectedMonth,
      "PO Demand Qty (Units)": Math.round(r.poQty),
      "Demand Value (₹L)": +r.poVal.toFixed(2),
      "Supplied GRN Qty (Units)": Math.round(r.grnQty),
      "Supplied Value (₹L)": +r.grnVal.toFixed(2),
      "Fill Rate %": +r.fr.toFixed(1),
      "Opportunity Loss Gap Qty (Units)": Math.round(r.gapQty),
      "Opportunity Loss Gap Value (₹L)": +r.gapVal.toFixed(2),
      "Loss Status":
        r.severity === "zero"
          ? "Zero Supply (100% Loss)"
          : r.severity === "severe"
          ? "Severe Gap (<60% FR)"
          : r.severity === "moderate"
          ? "Moderate Gap (60-89% FR)"
          : "Healthy (>=90% FR)",
    }));

    const ws = XLSX.utils.json_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "City_SKU_Opportunity_Loss");
    const name = customFilename || `City_SKU_Opportunity_Loss_${selectedMonth}.xlsx`;
    XLSX.writeFile(wb, name);
  };

  /* ── Open SKU Lightbox ── */
  const openSkuLightbox = (row: CitySkuOpportunityRow) => {
    const stats: SkuStat[] = [
      { label: "City & Depot", value: `${row.city} (${row.depot})` },
      { label: "Category", value: row.category || "General" },
      { label: `${selectedMonth} Demand`, value: `₹${L2(row.poVal)} L (${L(row.poQty, 0)} Units)` },
      { label: `${selectedMonth} Supplied`, value: `₹${L2(row.grnVal)} L (${L(row.grnQty, 0)} Units)` },
      { label: `${selectedMonth} Fill Rate`, value: `${row.fr.toFixed(1)}%`, cls: frColor(row.fr) },
      { label: "Opportunity Loss", value: `₹${L2(row.gapVal)} L (${L(row.gapQty, 0)} Units)`, cls: "text-rose-600 font-bold" },
    ];

    setSkuPopup({
      icon: row.icon || null,
      name: `${row.name} - ${row.city}`,
      stats,
    });
  };

  // Top Loss Cities
  const topLossCities = useMemo(() => {
    const map = new Map<string, { city: string; region: string; gapVal: number; poVal: number; grnVal: number }>();
    for (const r of citySkuRows) {
      let cur = map.get(r.city);
      if (!cur) {
        cur = { city: r.city, region: r.region, gapVal: 0, poVal: 0, grnVal: 0 };
        map.set(r.city, cur);
      }
      cur.gapVal += r.gapVal;
      cur.poVal += r.poVal;
      cur.grnVal += r.grnVal;
    }
    return Array.from(map.values()).sort((a, b) => b.gapVal - a.gapVal).slice(0, 5);
  }, [citySkuRows]);

  // Top Loss SKUs
  const topLossSkus = useMemo(() => {
    const map = new Map<string, { name: string; code: string; category: string; icon?: string | null; gapVal: number; poVal: number; grnVal: number }>();
    for (const r of citySkuRows) {
      let cur = map.get(r.name);
      if (!cur) {
        cur = { name: r.name, code: r.code, category: r.category, icon: r.icon, gapVal: 0, poVal: 0, grnVal: 0 };
        map.set(r.name, cur);
      }
      cur.gapVal += r.gapVal;
      cur.poVal += r.poVal;
      cur.grnVal += r.grnVal;
    }
    return Array.from(map.values()).sort((a, b) => b.gapVal - a.gapVal).slice(0, 5);
  }, [citySkuRows]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-slate-500">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm font-bold">Loading City &amp; SKU Opportunity Loss data...</span>
      </div>
    );
  }

  if (err) {
    return (
      <div className="p-6 max-w-lg mx-auto bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-2xl text-center text-rose-700 dark:text-rose-300 space-y-3">
        <div className="text-3xl">⚠️</div>
        <div className="font-bold text-base">Error Loading Data</div>
        <div className="text-xs">{err}</div>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-rose-600 text-white font-bold rounded-xl text-xs hover:bg-rose-700 transition"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1750px] mx-auto text-slate-900 dark:text-slate-100">
      {/* ── HEADER TITLE & ACTIONS ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white/80 dark:bg-[#000d38]/80 backdrop-blur-md p-5 rounded-2xl border border-slate-200/80 dark:border-white/10 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-2xl md:text-3xl p-2.5 rounded-2xl bg-gradient-to-br from-rose-500 via-pink-600 to-indigo-600 text-white shadow-md shadow-rose-500/20">
              🏙️
            </span>
            <div>
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                Which City &amp; SKU Opportunity Loss
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200 border border-rose-200 dark:border-rose-800">
                  Excel Downloader
                </span>
              </h1>
              <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Identify which specific City and SKU cross-combinations have unfulfilled demand deficits and download complete loss reports in Excel.
              </p>
            </div>
          </div>
        </div>

        {/* Global actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard/opportunity"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 text-xs font-bold transition border border-slate-200 dark:border-white/10"
          >
            <span>← Back to Opportunity Suite</span>
          </Link>
          <SyncStatus />
          <UploadButton />
          <button
            onClick={() => exportToExcel(sortedRows)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition active:scale-95 cursor-pointer"
            title="Download City & SKU Opportunity Loss Excel"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>Download Excel Report (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* ── KPI EXECUTIVE SUMMARY METRICS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Opportunity Loss */}
        <div className="relative overflow-hidden bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-transparent dark:from-rose-950/40 dark:via-rose-950/10 p-5 rounded-2xl border border-rose-500/20 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
              ⚠️ Opportunity Loss Gap
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-600 text-white font-bold">
              {selectedMonth}
            </span>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-rose-600 dark:text-rose-400">
              ₹{L2(totals.gapVal)} <span className="text-xs font-bold">Lakhs</span>
            </div>
            <div className="text-xs text-slate-500 mt-1 font-semibold">
              {L(totals.gapQty, 0)} Units unfulfilled demand
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 border-t border-rose-500/10 pt-2">
            <span>Pairs with Gaps:</span>
            <span className="font-bold text-rose-600">{totals.gapCount} Combinations</span>
          </div>
        </div>

        {/* Card 2: Overall Fill Rate */}
        <div className="relative overflow-hidden bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-transparent dark:from-indigo-950/40 dark:via-indigo-950/10 p-5 rounded-2xl border border-indigo-500/20 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
              🎯 Overall Fill Rate
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${frPill(totals.fr)}`}>
              {totals.fr.toFixed(1)}%
            </span>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-indigo-700 dark:text-indigo-300">
              {totals.fr.toFixed(1)}%
            </div>
            <div className="text-xs text-slate-500 mt-1 font-semibold">
              PO: ₹{L2(totals.poVal)}L • GRN: ₹{L2(totals.grnVal)}L
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 border-t border-indigo-500/10 pt-2">
            <span>Supplied Value:</span>
            <span className="font-bold text-indigo-600">₹{L2(totals.grnVal)} Lakhs</span>
          </div>
        </div>

        {/* Card 4: High Risk / Zero Supply Pairs */}
        <div className="relative overflow-hidden bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent dark:from-amber-950/40 dark:via-amber-950/10 p-5 rounded-2xl border border-amber-500/20 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              🚨 Zero-Supply Pairs
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-600 text-white font-bold">
              100% Deficit
            </span>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-amber-600 dark:text-amber-400">
              {totals.zeroSupplyCount} <span className="text-xs font-bold">Pairs</span>
            </div>
            <div className="text-xs text-slate-500 mt-1 font-semibold">
              + {totals.severeGapCount} Severe Gap (&lt;60% FR)
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 border-t border-amber-500/10 pt-2">
            <span>Affected City-SKUs</span>
            <span className="font-bold text-amber-600">Immediate Attention</span>
          </div>
        </div>

        {/* Card 5: Total Combinations Analyzed */}
        <div className="relative overflow-hidden bg-slate-50 dark:bg-white/5 p-5 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              📦 Combinations Analyzed
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-white/10 text-slate-800 dark:text-slate-200 font-bold">
              Filtered
            </span>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-slate-800 dark:text-white">
              {sortedRows.length} <span className="text-xs font-bold">City-SKUs</span>
            </div>
            <div className="text-xs text-slate-500 mt-1 font-semibold">
              Total PO Qty: {L(totals.poQty, 0)} Units
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200/60 dark:border-white/5 pt-2">
            <span>Active Filter:</span>
            <span className="font-bold text-indigo-600 dark:text-indigo-400 uppercase">{lossFilter}</span>
          </div>
        </div>
      </div>

      {/* ── INTERACTIVE CONTROLS & FILTER BAR ── */}
      <div className="bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 rounded-2xl p-4 shadow-sm space-y-4">
        {/* Row 1: Single Month Selector & Presets */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-100 dark:border-white/10">
          <div className="flex flex-wrap items-center gap-3">
            {/* Single Selected Month */}
            <div className="flex items-center gap-2 bg-indigo-50/80 dark:bg-indigo-950/40 px-3.5 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800/60 shadow-xs">
              <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">
                Select Month:
              </span>
              <select
                value={selectedMonth}
                onChange={(e) => {
                  setSelectedMonth(e.target.value);
                  setPage(1);
                }}
                className="bg-transparent font-black text-indigo-900 dark:text-indigo-100 text-xs focus:outline-none cursor-pointer"
              >
                {months.map((m) => (
                  <option key={m} value={m} className="text-slate-900 bg-white">
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Date Presets */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-white/5 p-1 rounded-xl border border-slate-200 dark:border-white/10">
            <span className="text-[11px] font-bold text-slate-500 px-2">Days:</span>
            {(
              [
                { id: "full", label: "Full Month" },
                { id: "mtd", label: "MTD" },
                { id: "7d", label: "Last 7D" },
                { id: "14d", label: "Last 14D" },
                { id: "30d", label: "Last 30D" },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                onClick={() => applyPreset(p.id)}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                  activePreset === p.id
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: Search & Severity Loss Filter */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-gradient-to-r from-indigo-50/50 via-purple-50/40 to-sky-50/50 dark:from-indigo-950/30 dark:via-purple-950/20 dark:to-sky-950/30 rounded-xl border border-indigo-100 dark:border-indigo-900/30">
          {/* Search */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Search City / Depot / SKU Name / Code / Category:
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Type city name, SKU, depot, category..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:border-indigo-500 shadow-xs"
              />
              <span className="absolute left-2.5 top-1.5 text-slate-400 text-xs">🔍</span>
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setPage(1);
                  }}
                  className="absolute right-2.5 top-1.5 text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Loss Severity Filter */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Loss Severity &amp; Opportunity Filter:
            </label>
            <select
              value={lossFilter}
              onChange={(e) => {
                setLossFilter(e.target.value as any);
                setPage(1);
              }}
              className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200 text-xs font-semibold focus:outline-none focus:border-indigo-500 shadow-xs cursor-pointer"
            >
              <option value="gaps-only">🔴 Loss Gaps Only ({totals.gapCount} Combinations with Gaps)</option>
              <option value="all">🌐 All Combinations ({citySkuRows.length} Total Pairs)</option>
              <option value="zero-supply">🚨 Zero-Supply Only ({totals.zeroSupplyCount} 100% Deficit Pairs)</option>
              <option value="severe-gap">⚠️ Severe Gaps Only (&lt;60% FR)</option>
            </select>
          </div>
        </div>

        {/* Row 3: Dimension Multi-Select Dropdowns */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <MultiSelectDropdown
            label="Trade / Platform"
            options={allTrades.map((t) => ({ key: t, label: t }))}
            selected={selTrades}
            onChange={(s) => { setSelTrades(s); setPage(1); }}
            open={openDropdown === "trade"}
            onToggle={() => setOpenDropdown(openDropdown === "trade" ? null : "trade")}
            onClose={() => setOpenDropdown(null)}
          />

          <MultiSelectDropdown
            label="Region"
            options={allRegions.map((r) => ({ key: r, label: r }))}
            selected={selRegions}
            onChange={(s) => { setSelRegions(s); setPage(1); }}
            open={openDropdown === "region"}
            onToggle={() => setOpenDropdown(openDropdown === "region" ? null : "region")}
            onClose={() => setOpenDropdown(null)}
          />

          <MultiSelectDropdown
            label="City"
            options={allCities.map((c) => ({ key: c, label: c }))}
            selected={selCities}
            onChange={(s) => { setSelCities(s); setPage(1); }}
            open={openDropdown === "city"}
            onToggle={() => setOpenDropdown(openDropdown === "city" ? null : "city")}
            onClose={() => setOpenDropdown(null)}
          />

          <MultiSelectDropdown
            label="Category"
            options={allCategories.map((c) => ({ key: c, label: c }))}
            selected={selCategories}
            onChange={(s) => { setSelCategories(s); setPage(1); }}
            open={openDropdown === "category"}
            onToggle={() => setOpenDropdown(openDropdown === "category" ? null : "category")}
            onClose={() => setOpenDropdown(null)}
          />

          <MultiSelectDropdown
            label="Status"
            options={allStatuses.map((s) => ({ key: s, label: s }))}
            selected={selStatuses}
            onChange={(s) => { setSelStatuses(s); setPage(1); }}
            open={openDropdown === "status"}
            onToggle={() => setOpenDropdown(openDropdown === "status" ? null : "status")}
            onClose={() => setOpenDropdown(null)}
          />

          {(selTrades.length > 0 || selRegions.length > 0 || selCities.length > 0 || selCategories.length > 0 || selStatuses.length > 0 || searchQuery) && (
            <button
              onClick={() => {
                setSelTrades([]);
                setSelRegions([]);
                setSelCities([]);
                setSelCategories([]);
                setSelStatuses([]);
                setSearchQuery("");
                setPage(1);
              }}
              className="px-2.5 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition cursor-pointer"
            >
              Reset Filters ↺
            </button>
          )}
        </div>
      </div>

      {/* ── QUICK EXPORT CARDS ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Export 1: All Filtered City-SKU Loss */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 shadow-sm flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="text-xs font-black text-slate-800 dark:text-white flex items-center gap-1.5">
              <span>📥</span> Complete Report
            </div>
            <div className="text-[11px] text-slate-400">
              Export all {sortedRows.length} City × SKU pairs
            </div>
          </div>
          <button
            onClick={() => exportToExcel(sortedRows, `Complete_City_SKU_Opportunity_Loss_${selectedMonth}.xlsx`)}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition active:scale-95 cursor-pointer shrink-0"
          >
            Export All (.xlsx)
          </button>
        </div>

        {/* Export 2: Zero Supply Lost Demand */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 shadow-sm flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="text-xs font-black text-slate-800 dark:text-white flex items-center gap-1.5">
              <span>❌</span> Zero-Supply Deficits
            </div>
            <div className="text-[11px] text-slate-400">
              Export {totals.zeroSupplyCount} items with 100% loss
            </div>
          </div>
          <button
            onClick={() => {
              const zeroRows = citySkuRows.filter((x) => x.severity === "zero");
              exportToExcel(zeroRows, `Zero_Supply_Lost_Demand_${selectedMonth}.xlsx`);
            }}
            className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition active:scale-95 cursor-pointer shrink-0"
          >
            Zero Supply (.xlsx)
          </button>
        </div>

        {/* Export 3: Top 50 Opportunity Loss */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 shadow-sm flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="text-xs font-black text-slate-800 dark:text-white flex items-center gap-1.5">
              <span>🔥</span> Top 50 Loss Drivers
            </div>
            <div className="text-[11px] text-slate-400">
              Highest unfulfilled gap value pairs
            </div>
          </div>
          <button
            onClick={() => {
              const top50 = [...citySkuRows].sort((a, b) => b.gapVal - a.gapVal).slice(0, 50);
              exportToExcel(top50, `Top50_City_SKU_Opportunity_Loss_${selectedMonth}.xlsx`);
            }}
            className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs transition active:scale-95 cursor-pointer shrink-0"
          >
            Top 50 (.xlsx)
          </button>
        </div>
      </div>

      {/* ── TOP 5 LOSS HIGHLIGHTS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 5 Loss Cities */}
        <div className="bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-2">
              <span>🏙️</span> Top 5 Cities by Opportunity Loss
            </h2>
            <span className="text-[11px] font-bold text-rose-600">{selectedMonth} Shortage</span>
          </div>
          <div className="space-y-2.5">
            {topLossCities.map((c, idx) => {
              const fr = c.poVal > 0 ? (c.grnVal / c.poVal) * 100 : 0;
              return (
                <div
                  key={c.city}
                  className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200 font-black text-[10px] grid place-items-center shrink-0">
                      {idx + 1}
                    </span>
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                        {c.city}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {c.region} • Depot: {lookupDepoByCity(c.city)?.depo || "—"}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs font-black text-rose-600 dark:text-rose-400">
                      ₹{L2(c.gapVal)}L Loss
                    </div>
                    <div className="text-[10px] text-slate-400">
                      FR: <strong className={frColor(fr)}>{fr.toFixed(1)}%</strong> • PO: ₹{L2(c.poVal)}L
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top 5 Loss SKUs */}
        <div className="bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-2">
              <span>📦</span> Top 5 SKUs by Opportunity Loss
            </h2>
            <span className="text-[11px] font-bold text-rose-600">{selectedMonth} Shortage</span>
          </div>
          <div className="space-y-2.5">
            {topLossSkus.map((sku, idx) => {
              const fr = sku.poVal > 0 ? (sku.grnVal / sku.poVal) * 100 : 0;
              return (
                <div
                  key={sku.name}
                  className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200 font-black text-[10px] grid place-items-center shrink-0">
                      {idx + 1}
                    </span>
                    <div className="w-7 h-7 rounded-lg bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 grid place-items-center shrink-0 overflow-hidden">
                      {sku.icon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={sku.icon} alt="" className="max-w-full max-h-full object-contain" />
                      ) : (
                        <span className="text-xs">🥛</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate" title={sku.name}>
                        {sku.name}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {sku.category} {sku.code && `(${sku.code})`}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs font-black text-rose-600 dark:text-rose-400">
                      ₹{L2(sku.gapVal)}L Loss
                    </div>
                    <div className="text-[10px] text-slate-400">
                      FR: <strong className={frColor(fr)}>{fr.toFixed(1)}%</strong> • PO: ₹{L2(sku.poVal)}L
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── CITY & SKU MAIN DATA TABLE ── */}
      <div className="bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between p-4 border-b border-slate-200 dark:border-white/10 gap-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🏙️📦</span>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                City &amp; SKU Opportunity Loss Master Data Table
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300 font-bold">
                  {sortedRows.length} Rows
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Sorted by highest Opportunity Loss Gap (₹ Lakhs). Click columns to sort or Funnel button for visual breakdown.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => exportToExcel(sortedRows)}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Download Excel Table 📥</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[650px] custom-scrollbar">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="sticky top-0 z-20 shadow-xs">
              <tr className="bg-slate-50 dark:bg-[#000d38] text-[11px] font-bold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-white/10 select-none">
                <th
                  onClick={() => toggleSort("city")}
                  className="py-2.5 px-3 sticky left-0 bg-slate-50 dark:bg-[#000d38] z-30 min-w-[130px] cursor-pointer hover:text-indigo-600"
                >
                  City &amp; Depot {sortState.col === "city" ? (sortState.dir === 1 ? "▲" : "▼") : ""}
                </th>
                <th
                  onClick={() => toggleSort("name")}
                  className="py-2.5 px-3 sticky left-[130px] bg-slate-50 dark:bg-[#000d38] z-30 min-w-[190px] cursor-pointer hover:text-indigo-600"
                >
                  SKU Name &amp; Code {sortState.col === "name" ? (sortState.dir === 1 ? "▲" : "▼") : ""}
                </th>
                <th className="py-2.5 px-2 text-center">Funnel</th>
                <th onClick={() => toggleSort("region")} className="py-2.5 px-2 cursor-pointer hover:text-indigo-600">
                  Region {sortState.col === "region" ? (sortState.dir === 1 ? "▲" : "▼") : ""}
                </th>
                <th onClick={() => toggleSort("category")} className="py-2.5 px-2 cursor-pointer hover:text-indigo-600">
                  Category {sortState.col === "category" ? (sortState.dir === 1 ? "▲" : "▼") : ""}
                </th>
                <th onClick={() => toggleSort("poQty")} className="py-2.5 px-2 text-right cursor-pointer hover:text-indigo-600">
                  PO Qty (U) {sortState.col === "poQty" ? (sortState.dir === 1 ? "▲" : "▼") : ""}
                </th>
                <th onClick={() => toggleSort("grnQty")} className="py-2.5 px-2 text-right cursor-pointer hover:text-indigo-600">
                  GRN Qty (U) {sortState.col === "grnQty" ? (sortState.dir === 1 ? "▲" : "▼") : ""}
                </th>
                <th onClick={() => toggleSort("gapQty")} className="py-2.5 px-2 text-right text-rose-600 cursor-pointer hover:text-rose-700">
                  Gap Qty (U) {sortState.col === "gapQty" ? (sortState.dir === 1 ? "▲" : "▼") : ""}
                </th>
                <th
                  onClick={() => toggleSort("poVal")}
                  className="py-2.5 px-2 text-right bg-indigo-50/40 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200 cursor-pointer hover:text-indigo-600"
                >
                  PO Demand (₹L) {sortState.col === "poVal" ? (sortState.dir === 1 ? "▲" : "▼") : ""}
                </th>
                <th
                  onClick={() => toggleSort("grnVal")}
                  className="py-2.5 px-2 text-right bg-indigo-50/40 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200 cursor-pointer hover:text-indigo-600"
                >
                  Supplied GRN (₹L) {sortState.col === "grnVal" ? (sortState.dir === 1 ? "▲" : "▼") : ""}
                </th>
                <th
                  onClick={() => toggleSort("fr")}
                  className="py-2.5 px-2 text-center bg-indigo-50/40 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200 cursor-pointer hover:text-indigo-600"
                >
                  Fill Rate % {sortState.col === "fr" ? (sortState.dir === 1 ? "▲" : "▼") : ""}
                </th>
                <th
                  onClick={() => toggleSort("gapVal")}
                  className="py-2.5 px-2 text-right bg-rose-50/60 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 font-black cursor-pointer hover:text-rose-600"
                >
                  Opportunity Loss (₹L) {sortState.col === "gapVal" ? (sortState.dir === 1 ? "▲" : "▼") : ""}
                </th>
                <th className="py-2.5 px-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {paginatedRows.map((r) => (
                <tr key={r.key} className="hover:bg-indigo-50/40 dark:hover:bg-white/5 transition group">
                  {/* City */}
                  <td className="py-2 px-3 sticky left-0 bg-white dark:bg-[#000d38] z-10 font-bold text-slate-900 dark:text-slate-100">
                    <div>{r.city}</div>
                    <div className="text-[10px] text-slate-400 font-normal">{r.depot}</div>
                  </td>

                  {/* SKU */}
                  <td className="py-2 px-3 sticky left-[130px] bg-white dark:bg-[#000d38] z-10">
                    <div className="flex items-center gap-2">
                      <div
                        onClick={() => openSkuLightbox(r)}
                        className="w-7 h-7 rounded-lg bg-slate-50 dark:bg-white/10 border border-slate-200 dark:border-white/10 grid place-items-center shrink-0 overflow-hidden cursor-pointer hover:scale-105 transition"
                      >
                        {r.icon ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.icon} alt="" className="max-w-full max-h-full object-contain" />
                        ) : (
                          <span className="text-xs">🥛</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div
                          onClick={() => setFunnelTarget({ row: r })}
                          className="font-bold text-slate-900 dark:text-slate-100 truncate group-hover:text-indigo-600 transition cursor-pointer"
                          title={r.name}
                        >
                          {r.name}
                        </div>
                        {r.code && <div className="text-[10px] text-slate-400 font-mono">{r.code}</div>}
                      </div>
                    </div>
                  </td>

                  {/* Funnel Button */}
                  <td className="py-2 px-2 text-center">
                    <button
                      onClick={() => setFunnelTarget({ row: r })}
                      className="px-2 py-0.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold border border-indigo-200 dark:border-indigo-800 transition cursor-pointer"
                      title="Open Funnel Breakdown"
                    >
                      🌪️
                    </button>
                  </td>

                  {/* Region & Cat */}
                  <td className="py-2 px-2 text-slate-500">{r.region}</td>
                  <td className="py-2 px-2 text-slate-500">{r.category}</td>

                  {/* Quantities */}
                  <td className="py-2 px-2 text-right font-medium">{L(r.poQty, 0)}</td>
                  <td className="py-2 px-2 text-right text-slate-600 dark:text-slate-400">{L(r.grnQty, 0)}</td>
                  <td className="py-2 px-2 text-right font-bold text-rose-500">{L(r.gapQty, 0)}</td>

                  {/* Values */}
                  <td className="py-2 px-2 text-right font-semibold">₹{L2(r.poVal)}</td>
                  <td className="py-2 px-2 text-right text-slate-700 dark:text-slate-300">₹{L2(r.grnVal)}</td>
                  <td className="py-2 px-2 text-center">
                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${frPill(r.fr)}`}>
                      {r.fr.toFixed(1)}%
                    </span>
                  </td>

                  {/* Opportunity Loss (Gap ₹L) */}
                  <td className="py-2 px-2 text-right font-black text-rose-600 dark:text-rose-400 bg-rose-50/30 dark:bg-rose-950/20">
                    ₹{L2(r.gapVal)}
                  </td>

                  {/* Status */}
                  <td className="py-2 px-2 text-center">
                    {r.severity === "zero" && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-600 text-white">
                        Zero Supply
                      </span>
                    )}
                    {r.severity === "severe" && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
                        Severe Gap
                      </span>
                    )}
                    {r.severity === "moderate" && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-200">
                        Moderate
                      </span>
                    )}
                    {r.severity === "healthy" && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
                        Healthy
                      </span>
                    )}
                  </td>
                </tr>
              ))}

              {/* Total Row */}
              <tr className="bg-slate-100/90 dark:bg-white/10 font-black border-t-2 border-slate-300 dark:border-white/20">
                <td className="py-2.5 px-3 sticky left-0 bg-slate-100 dark:bg-[#000d38] z-30">
                  TOTAL ({sortedRows.length} Pairs)
                </td>
                <td className="py-2.5 px-3 sticky left-[130px] bg-slate-100 dark:bg-[#000d38] z-30">
                  —
                </td>
                <td className="py-2.5 px-2 text-center">—</td>
                <td className="py-2.5 px-2">—</td>
                <td className="py-2.5 px-2">—</td>
                <td className="py-2.5 px-2 text-right">{L(totals.poQty, 0)}</td>
                <td className="py-2.5 px-2 text-right">{L(totals.grnQty, 0)}</td>
                <td className="py-2.5 px-2 text-right text-rose-600">{L(totals.gapQty, 0)}</td>
                <td className="py-2.5 px-2 text-right">₹{L2(totals.poVal)}</td>
                <td className="py-2.5 px-2 text-right">₹{L2(totals.grnVal)}</td>
                <td className="py-2.5 px-2 text-center text-indigo-700 dark:text-indigo-300">
                  {totals.fr.toFixed(1)}%
                </td>
                <td className="py-2.5 px-2 text-right text-rose-600 dark:text-rose-400 bg-rose-100/50 dark:bg-rose-950/40">
                  ₹{L2(totals.gapVal)}
                </td>
                <td className="py-2.5 px-2 text-center">—</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="flex flex-wrap items-center justify-between p-3 border-t border-slate-200 dark:border-white/10 text-xs text-slate-500 bg-slate-50/50 dark:bg-white/5">
          <div className="flex items-center gap-2">
            <span>
              Showing {sortedRows.length > 0 ? (page - 1) * pageSize + 1 : 0}–
              {Math.min(page * pageSize, sortedRows.length)} of {sortedRows.length} Pairs
            </span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(+e.target.value);
                setPage(1);
              }}
              className="bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1 text-xs cursor-pointer"
            >
              <option value="15">15 per page</option>
              <option value="25">25 per page</option>
              <option value="50">50 per page</option>
              <option value="100">100 per page</option>
              <option value="250">250 per page</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 font-bold disabled:opacity-40 cursor-pointer"
            >
              Previous
            </button>
            <span className="px-2 font-bold text-slate-700 dark:text-slate-300">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 font-bold disabled:opacity-40 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* ── INTERACTIVE FUNNEL MODAL ── */}
      {funnelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/15 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-white/5">
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-xl bg-purple-600 text-white text-lg">🌪️</span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base md:text-lg font-black text-slate-900 dark:text-white">
                      City &amp; SKU Opportunity Funnel
                    </h2>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200 border border-purple-200 dark:border-purple-800">
                      {funnelTarget.row.city}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                    {funnelTarget.row.name} ({funnelTarget.row.code || "No Code"}) • {funnelTarget.row.depot} • {selectedMonth}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setFunnelTarget(null)}
                className="w-8 h-8 rounded-full bg-slate-200 dark:bg-white/10 hover:bg-rose-100 hover:text-rose-600 text-slate-600 dark:text-slate-300 grid place-items-center text-sm font-bold transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-6 custom-scrollbar">
              {/* Funnel Visual Stages */}
              <div className="space-y-2.5 max-w-xl mx-auto py-2">
                {/* Stage 1 */}
                <div className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-3.5 text-white shadow-md text-center">
                  <div className="text-[10px] uppercase font-bold tracking-widest text-blue-100">
                    Stage 1 • Gross Demand (100%)
                  </div>
                  <div className="text-2xl font-black mt-0.5">
                    ₹{L2(funnelTarget.row.poVal)} Lakhs
                  </div>
                  <div className="text-[11px] text-blue-100">
                    Ordered: {L(funnelTarget.row.poQty, 0)} Units
                  </div>
                </div>

                {/* Connector 1 */}
                <div className="flex items-center justify-between px-8 text-[11px] font-bold text-slate-500">
                  <span className="flex items-center gap-1">
                    ↓ <span className={frColor(funnelTarget.row.fr)}>{funnelTarget.row.fr.toFixed(1)}% Supplied</span>
                  </span>
                  <span className="text-rose-500">
                    {(100 - funnelTarget.row.fr).toFixed(1)}% Unfulfilled Drop
                  </span>
                </div>

                {/* Stage 2 */}
                <div
                  className="mx-auto bg-gradient-to-r from-teal-500 to-emerald-600 rounded-2xl p-3 text-white shadow-md text-center transition-all duration-300"
                  style={{ width: `${Math.max(65, Math.min(95, funnelTarget.row.fr))}%` }}
                >
                  <div className="text-[10px] uppercase font-bold tracking-widest text-emerald-100">
                    Stage 2 • Supplied (GRN)
                  </div>
                  <div className="text-xl font-black mt-0.5">
                    ₹{L2(funnelTarget.row.grnVal)} Lakhs
                  </div>
                  <div className="text-[11px] text-emerald-100">
                    Delivered: {L(funnelTarget.row.grnQty, 0)} Units ({funnelTarget.row.fr.toFixed(1)}% FR)
                  </div>
                </div>

                {/* Connector 2 */}
                <div className="flex items-center justify-between px-12 text-[11px] font-bold text-slate-500">
                  <span>↓ Demand Deficit</span>
                  <span className="text-rose-600 font-extrabold">
                    ₹{L2(funnelTarget.row.gapVal)} L Lost
                  </span>
                </div>

                {/* Stage 3 */}
                <div
                  className="mx-auto bg-gradient-to-r from-rose-500 to-pink-600 rounded-2xl p-3 text-white shadow-md text-center transition-all duration-300"
                  style={{ width: `${Math.max(50, Math.min(85, ((funnelTarget.row.gapVal / (funnelTarget.row.poVal || 1)) * 100) + 30))}%` }}
                >
                  <div className="text-[10px] uppercase font-bold tracking-widest text-rose-100">
                    Stage 3 • Opportunity Loss (Shortage)
                  </div>
                  <div className="text-xl font-black mt-0.5">
                    ₹{L2(funnelTarget.row.gapVal)} Lakhs
                  </div>
                  <div className="text-[11px] text-rose-100">
                    Unmet: {L(funnelTarget.row.gapQty, 0)} Units
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-xs">
              <button
                onClick={() => exportToExcel([funnelTarget.row], `${funnelTarget.row.city}_${funnelTarget.row.name}_Opportunity.xlsx`)}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition flex items-center gap-1.5 cursor-pointer"
              >
                <span>Export Row to Excel 📥</span>
              </button>
              <button
                onClick={() => setFunnelTarget(null)}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition cursor-pointer"
              >
                Close Funnel ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SKU IMAGE POPUP ── */}
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
