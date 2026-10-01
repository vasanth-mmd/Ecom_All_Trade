"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import UploadButton from "../upload-button";
import SyncStatus from "../sync-status";
import { mmdGroup } from "@/lib/mmd-mapping";
import { matchSkuIcon } from "@/lib/sku-icon";
import { lookupDepoByCity } from "@/lib/depo-mapping";
import SkuImagePopup, { SkuStat } from "../sku-image-popup";
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

const ymdToStr = (ymd: number) => {
  if (!ymd || ymd < 19000101) return "";
  const y = Math.floor(ymd / 10000);
  const m = String(Math.floor((ymd % 10000) / 100)).padStart(2, "0");
  const day = String(ymd % 100).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

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

type TabKey = "overview" | "linechart" | "category" | "city" | "region" | "sku" | "day" | "visuals";

type SkuPopupState = {
  icon: string | null;
  name: string;
  stats: SkuStat[];
} | null;

interface OpportunityRow {
  key: string;
  name: string;
  code?: string;
  category?: string;
  icon?: string | null;
  region?: string;
  city?: string;
  // Current Month (Month B)
  bPoQty: number;
  bGrnQty: number;
  bPoVal: number;
  bGrnVal: number;
  bFr: number;
  bGapQty: number;
  bGapVal: number;
  bRecoverableVal: number;
  bProfitGain: number;
  // Last Month (Month A)
  aPoQty: number;
  aGrnQty: number;
  aPoVal: number;
  aGrnVal: number;
  aFr: number;
  aGapQty: number;
  aGapVal: number;
  aRecoverableVal: number;
  aProfitGain: number;
  // MoM Variance
  deltaPoVal?: number;
  deltaGrnVal?: number;
  deltaPoQty?: number;
  deltaGrnQty?: number;
  deltaGapVal: number;
  deltaGapQty?: number;
  deltaFR: number;
  deltaProfitGain: number;
  gapGrowthPct: number;
  poValGrowthPct?: number;
  grnValGrowthPct?: number;
  // Extra
  poCountB?: number;
  poCountA?: number;
  dateB?: string;
  dateA?: string;
  dayNum?: number;
}

type FunnelTarget = {
  type: "category" | "city" | "region" | "sku" | "day" | "overall";
  key: string;
  name: string;
  code?: string;
  category?: string;
  region?: string;
  city?: string;
  row: OpportunityRow;
} | null;

export default function OpportunityDashboardPage() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  // Active view tab
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  // Selected Months for Comparison
  const [monthA, setMonthA] = useState<string>(""); // Last Month / Baseline
  const [monthB, setMonthB] = useState<string>(""); // Current Month

  // Synced Day Range (1..31)
  const [dayFrom, setDayFrom] = useState<number>(1);
  const [dayTo, setDayTo] = useState<number>(31);
  const [activePreset, setActivePreset] = useState<string>("full");

  // Opportunity & Profit Simulation Parameters
  const [profitMarginPct, setProfitMarginPct] = useState<number>(20); // Default 20% margin
  const [targetFillRatePct, setTargetFillRatePct] = useState<number>(100); // Default 100% target FR

  // Dimension Filters
  const [selTrades, setSelTrades] = useState<string[]>([]);
  const [selRegions, setSelRegions] = useState<string[]>([]);
  const [selCities, setSelCities] = useState<string[]>([]);
  const [selCategories, setSelCategories] = useState<string[]>([]);
  const [selStatuses, setSelStatuses] = useState<string[]>([]);
  const [globalSearch, setGlobalSearch] = useState("");
  const [skuFilterType, setSkuFilterType] = useState<"all" | "zero-supply" | "severe-gap" | "top-profit">("all");

  // Multi-select open state
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Lightbox SKU Popup
  const [skuPopup, setSkuPopup] = useState<SkuPopupState>(null);

  // Funnel Drill-down Modal State
  const [funnelTarget, setFunnelTarget] = useState<FunnelTarget>(null);

  // Sorting per table
  const [sortCategory, setSortCategory] = useState<{ col: keyof OpportunityRow; dir: 1 | -1 }>({
    col: "bProfitGain",
    dir: -1,
  });
  const [sortCity, setSortCity] = useState<{ col: keyof OpportunityRow; dir: 1 | -1 }>({
    col: "bProfitGain",
    dir: -1,
  });
  const [sortRegion, setSortRegion] = useState<{ col: keyof OpportunityRow; dir: 1 | -1 }>({
    col: "bProfitGain",
    dir: -1,
  });
  const [sortSku, setSortSku] = useState<{ col: keyof OpportunityRow; dir: 1 | -1 }>({
    col: "bProfitGain",
    dir: -1,
  });
  const [sortDay, setSortDay] = useState<{ col: keyof OpportunityRow; dir: 1 | -1 }>({
    col: "dayNum",
    dir: 1,
  });

  // Multi-Metric Line Chart State
  const [chartViewMode, setChartViewMode] = useState<"all" | "value" | "qty" | "fr" | "mom">("all");
  const [showPoVal, setShowPoVal] = useState<boolean>(true);
  const [showGrnVal, setShowGrnVal] = useState<boolean>(true);
  const [showGapVal, setShowGapVal] = useState<boolean>(true);
  const [showPoQty, setShowPoQty] = useState<boolean>(true);
  const [showGrnQty, setShowGrnQty] = useState<boolean>(true);
  const [showGapQty, setShowGapQty] = useState<boolean>(true);
  const [showFrLine, setShowFrLine] = useState<boolean>(true);
  const [showLastMonthBaseline, setShowLastMonthBaseline] = useState<boolean>(false);
  const [hoveredDayIdx, setHoveredDayIdx] = useState<number | null>(null);
  const [chartMousePos, setChartMousePos] = useState<{ x: number; y: number } | null>(null);
  const lineChartSvgRef = useRef<SVGSVGElement | null>(null);

  // SKU Pagination
  const [skuPage, setSkuPage] = useState<number>(1);
  const [skuPageSize, setSkuPageSize] = useState<number>(25);

  useEffect(() => {
    fetch("/api/data")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
      .then((data: Data) => {
        setD(data);
        setLoading(false);
        if (data?.dims?.month && data.dims.month.length > 0) {
          const mList = data.dims.month;
          if (mList.length >= 2) {
            setMonthA(mList[mList.length - 2]); // Last month
            setMonthB(mList[mList.length - 1]); // Current month
          } else {
            setMonthA(mList[0]);
            setMonthB(mList[0]);
          }
        }
      })
      .catch((e) => {
        setErr(String(e.message || e));
        setLoading(false);
      });
  }, []);

  const months = useMemo(() => d?.dims?.month || [], [d]);
  const allTrades = useMemo(() => d?.dims?.trade || [], [d]);
  const allRegions = useMemo(() => d?.dims?.region || [], [d]);
  const allCities = useMemo(() => d?.dims?.city || [], [d]);
  const allCategories = useMemo(() => d?.dims?.category || [], [d]);
  const allStatuses = useMemo(() => d?.dims?.status || [], [d]);

  // Max day in months
  const maxDayMonthB = useMemo(() => {
    if (!d || !monthB || !d.dims?.month) return 31;
    let maxD = 0;
    for (const r of d.rows) {
      if (d.dims.month[r[0]] === monthB && r[11] > 0) {
        const dNum = r[11] % 100;
        if (dNum > maxD) maxD = dNum;
      }
    }
    return maxD > 0 ? maxD : 31;
  }, [d, monthB]);

  const applyPreset = (preset: "full" | "mtd" | "7d" | "14d" | "30d") => {
    setActivePreset(preset);
    if (preset === "full") {
      setDayFrom(1);
      setDayTo(31);
    } else if (preset === "mtd") {
      setDayFrom(1);
      setDayTo(Math.max(1, maxDayMonthB));
    } else if (preset === "7d") {
      const end = Math.max(1, maxDayMonthB);
      setDayFrom(Math.max(1, end - 6));
      setDayTo(end);
    } else if (preset === "14d") {
      const end = Math.max(1, maxDayMonthB);
      setDayFrom(Math.max(1, end - 13));
      setDayTo(end);
    } else if (preset === "30d") {
      const end = Math.max(1, maxDayMonthB);
      setDayFrom(Math.max(1, end - 29));
      setDayTo(end);
    }
  };

  /* ── Filter Sets ── */
  const tradeFilterSet = useMemo(() => (selTrades.length ? new Set(selTrades) : null), [selTrades]);
  const regionFilterSet = useMemo(() => (selRegions.length ? new Set(selRegions) : null), [selRegions]);
  const cityFilterSet = useMemo(() => (selCities.length ? new Set(selCities) : null), [selCities]);
  const categoryFilterSet = useMemo(() => (selCategories.length ? new Set(selCategories) : null), [selCategories]);
  const statusFilterSet = useMemo(() => (selStatuses.length ? new Set(selStatuses) : null), [selStatuses]);

  /* ── Filter Predicate ── */
  const rowMatchesFilters = (r: number[], checkDay: boolean = true) => {
    if (!d) return false;
    const trade = d.dims.trade[r[1]];
    if (tradeFilterSet && !tradeFilterSet.has(trade)) return false;

    const region = d.dims.region[r[2]];
    if (regionFilterSet && !regionFilterSet.has(region)) return false;

    const city = d.dims.city[r[3]];
    if (cityFilterSet && !cityFilterSet.has(city)) return false;

    const category = d.dims.category[r[4]];
    if (categoryFilterSet && !categoryFilterSet.has(category)) return false;

    const status = d.dims.status[r[5]];
    if (statusFilterSet && !statusFilterSet.has(status)) return false;

    if (checkDay && r[11] > 0) {
      const day = r[11] % 100;
      if (day < dayFrom || day > dayTo) return false;
    }
    return true;
  };

  /* ── Helper to calculate Opportunity & Profit ── */
  const computeOpportunity = (
    bPoVal: number,
    bGrnVal: number,
    bPoQty: number,
    bGrnQty: number,
    aPoVal: number,
    aGrnVal: number,
    aPoQty: number,
    aGrnQty: number
  ) => {
    const targetFrFrac = targetFillRatePct / 100;
    const marginFrac = profitMarginPct / 100;

    // Month B
    const bFr = bPoVal > 0 ? (bGrnVal / bPoVal) * 100 : 0;
    const bGapVal = Math.max(0, bPoVal - bGrnVal);
    const bGapQty = Math.max(0, bPoQty - bGrnQty);
    const bTargetDemand = bPoVal * targetFrFrac;
    const bRecoverableVal = Math.max(0, bTargetDemand - bGrnVal);
    const bProfitGain = bRecoverableVal * marginFrac;

    // Month A
    const aFr = aPoVal > 0 ? (aGrnVal / aPoVal) * 100 : 0;
    const aGapVal = Math.max(0, aPoVal - aGrnVal);
    const aGapQty = Math.max(0, aPoQty - aGrnQty);
    const aTargetDemand = aPoVal * targetFrFrac;
    const aRecoverableVal = Math.max(0, aTargetDemand - aGrnVal);
    const aProfitGain = aRecoverableVal * marginFrac;

    // Delta / MoM
    const deltaPoVal = bPoVal - aPoVal;
    const deltaGrnVal = bGrnVal - aGrnVal;
    const deltaPoQty = bPoQty - aPoQty;
    const deltaGrnQty = bGrnQty - aGrnQty;
    const deltaGapVal = bGapVal - aGapVal;
    const deltaGapQty = bGapQty - aGapQty;
    const deltaFR = bFr - aFr;
    const deltaProfitGain = bProfitGain - aProfitGain;
    const gapGrowthPct = aGapVal > 0 ? ((bGapVal - aGapVal) / aGapVal) * 100 : 0;
    const poValGrowthPct = aPoVal > 0 ? ((bPoVal - aPoVal) / aPoVal) * 100 : 0;
    const grnValGrowthPct = aGrnVal > 0 ? ((bGrnVal - aGrnVal) / aGrnVal) * 100 : 0;

    return {
      bFr,
      bGapVal,
      bGapQty,
      bRecoverableVal,
      bProfitGain,
      aFr,
      aGapVal,
      aGapQty,
      aRecoverableVal,
      aProfitGain,
      deltaPoVal,
      deltaGrnVal,
      deltaPoQty,
      deltaGrnQty,
      deltaGapVal,
      deltaGapQty,
      deltaFR,
      deltaProfitGain,
      gapGrowthPct,
      poValGrowthPct,
      grnValGrowthPct,
    };
  };

  /* ── Aggregated Data Collections ── */

  // 1. Overall Summary Totals
  const overallMetrics = useMemo(() => {
    if (!d || !monthB) {
      return {
        bPoVal: 0,
        bGrnVal: 0,
        bPoQty: 0,
        bGrnQty: 0,
        aPoVal: 0,
        aGrnVal: 0,
        aPoQty: 0,
        aGrnQty: 0,
        ...computeOpportunity(0, 0, 0, 0, 0, 0, 0, 0),
        bPoCount: 0,
        aPoCount: 0,
      };
    }

    let bPoVal = 0,
      bGrnVal = 0,
      bPoQty = 0,
      bGrnQty = 0,
      bPoCount = 0;
    let aPoVal = 0,
      aGrnVal = 0,
      aPoQty = 0,
      aGrnQty = 0,
      aPoCount = 0;

    for (const r of d.rows) {
      const mName = d.dims.month[r[0]];
      if (mName === monthB && rowMatchesFilters(r, true)) {
        bPoQty += r[7];
        bPoVal += r[8];
        bGrnQty += r[9];
        bGrnVal += r[10];
        bPoCount++;
      } else if (mName === monthA && rowMatchesFilters(r, true)) {
        aPoQty += r[7];
        aPoVal += r[8];
        aGrnQty += r[9];
        aGrnVal += r[10];
        aPoCount++;
      }
    }

    const opp = computeOpportunity(bPoVal, bGrnVal, bPoQty, bGrnQty, aPoVal, aGrnVal, aPoQty, aGrnQty);

    return {
      bPoVal,
      bGrnVal,
      bPoQty,
      bGrnQty,
      aPoVal,
      aGrnVal,
      aPoQty,
      aGrnQty,
      bPoCount,
      aPoCount,
      ...opp,
    };
  }, [d, monthB, monthA, dayFrom, dayTo, tradeFilterSet, regionFilterSet, cityFilterSet, categoryFilterSet, statusFilterSet, profitMarginPct, targetFillRatePct]);

  // 2. Category Opportunity Breakdown
  const categoryRows = useMemo(() => {
    if (!d || !monthB) return [];

    type Acc = {
      bPoVal: number;
      bGrnVal: number;
      bPoQty: number;
      bGrnQty: number;
      aPoVal: number;
      aGrnVal: number;
      aPoQty: number;
      aGrnQty: number;
    };
    const map = new Map<string, Acc>();

    for (const r of d.rows) {
      const mName = d.dims.month[r[0]];
      const isB = mName === monthB;
      const isA = mName === monthA;
      if (!isB && !isA) continue;
      if (!rowMatchesFilters(r, true)) continue;

      const cat = d.dims.category[r[4]] || "Other";
      let entry = map.get(cat);
      if (!entry) {
        entry = { bPoVal: 0, bGrnVal: 0, bPoQty: 0, bGrnQty: 0, aPoVal: 0, aGrnVal: 0, aPoQty: 0, aGrnQty: 0 };
        map.set(cat, entry);
      }

      if (isB) {
        entry.bPoQty += r[7];
        entry.bPoVal += r[8];
        entry.bGrnQty += r[9];
        entry.bGrnVal += r[10];
      } else if (isA) {
        entry.aPoQty += r[7];
        entry.aPoVal += r[8];
        entry.aGrnQty += r[9];
        entry.aGrnVal += r[10];
      }
    }

    const list: OpportunityRow[] = [];
    map.forEach((acc, cat) => {
      const opp = computeOpportunity(
        acc.bPoVal,
        acc.bGrnVal,
        acc.bPoQty,
        acc.bGrnQty,
        acc.aPoVal,
        acc.aGrnVal,
        acc.aPoQty,
        acc.aGrnQty
      );
      list.push({
        key: cat,
        name: cat,
        ...acc,
        ...opp,
      });
    });

    if (globalSearch.trim()) {
      const q = globalSearch.toLowerCase();
      return list.filter((x) => x.name.toLowerCase().includes(q));
    }
    return list;
  }, [d, monthB, monthA, dayFrom, dayTo, tradeFilterSet, regionFilterSet, cityFilterSet, categoryFilterSet, statusFilterSet, profitMarginPct, targetFillRatePct, globalSearch]);

  // 3. City Opportunity Breakdown
  const cityRows = useMemo(() => {
    if (!d || !monthB) return [];

    type Acc = {
      bPoVal: number;
      bGrnVal: number;
      bPoQty: number;
      bGrnQty: number;
      aPoVal: number;
      aGrnVal: number;
      aPoQty: number;
      aGrnQty: number;
      region: string;
    };
    const map = new Map<string, Acc>();

    for (const r of d.rows) {
      const mName = d.dims.month[r[0]];
      const isB = mName === monthB;
      const isA = mName === monthA;
      if (!isB && !isA) continue;
      if (!rowMatchesFilters(r, true)) continue;

      const city = d.dims.city[r[3]] || "Other";
      const region = d.dims.region[r[2]] || "Other";
      let entry = map.get(city);
      if (!entry) {
        entry = { bPoVal: 0, bGrnVal: 0, bPoQty: 0, bGrnQty: 0, aPoVal: 0, aGrnVal: 0, aPoQty: 0, aGrnQty: 0, region };
        map.set(city, entry);
      }

      if (isB) {
        entry.bPoQty += r[7];
        entry.bPoVal += r[8];
        entry.bGrnQty += r[9];
        entry.bGrnVal += r[10];
      } else if (isA) {
        entry.aPoQty += r[7];
        entry.aPoVal += r[8];
        entry.aGrnQty += r[9];
        entry.aGrnVal += r[10];
      }
    }

    const list: OpportunityRow[] = [];
    map.forEach((acc, city) => {
      const opp = computeOpportunity(
        acc.bPoVal,
        acc.bGrnVal,
        acc.bPoQty,
        acc.bGrnQty,
        acc.aPoVal,
        acc.aGrnVal,
        acc.aPoQty,
        acc.aGrnQty
      );
      list.push({
        key: city,
        name: city,
        ...acc,
        ...opp,
      });
    });

    if (globalSearch.trim()) {
      const q = globalSearch.toLowerCase();
      return list.filter((x) => x.name.toLowerCase().includes(q) || (x.region && x.region.toLowerCase().includes(q)));
    }
    return list;
  }, [d, monthB, monthA, dayFrom, dayTo, tradeFilterSet, regionFilterSet, cityFilterSet, categoryFilterSet, statusFilterSet, profitMarginPct, targetFillRatePct, globalSearch]);

  // 4. Region Opportunity Breakdown
  const regionRows = useMemo(() => {
    if (!d || !monthB) return [];

    type Acc = {
      bPoVal: number;
      bGrnVal: number;
      bPoQty: number;
      bGrnQty: number;
      aPoVal: number;
      aGrnVal: number;
      aPoQty: number;
      aGrnQty: number;
    };
    const map = new Map<string, Acc>();

    for (const r of d.rows) {
      const mName = d.dims.month[r[0]];
      const isB = mName === monthB;
      const isA = mName === monthA;
      if (!isB && !isA) continue;
      if (!rowMatchesFilters(r, true)) continue;

      const reg = d.dims.region[r[2]] || "Other";
      let entry = map.get(reg);
      if (!entry) {
        entry = { bPoVal: 0, bGrnVal: 0, bPoQty: 0, bGrnQty: 0, aPoVal: 0, aGrnVal: 0, aPoQty: 0, aGrnQty: 0 };
        map.set(reg, entry);
      }

      if (isB) {
        entry.bPoQty += r[7];
        entry.bPoVal += r[8];
        entry.bGrnQty += r[9];
        entry.bGrnVal += r[10];
      } else if (isA) {
        entry.aPoQty += r[7];
        entry.aPoVal += r[8];
        entry.aGrnQty += r[9];
        entry.aGrnVal += r[10];
      }
    }

    const list: OpportunityRow[] = [];
    map.forEach((acc, reg) => {
      const opp = computeOpportunity(
        acc.bPoVal,
        acc.bGrnVal,
        acc.bPoQty,
        acc.bGrnQty,
        acc.aPoVal,
        acc.aGrnVal,
        acc.aPoQty,
        acc.aGrnQty
      );
      list.push({
        key: reg,
        name: reg,
        ...acc,
        ...opp,
      });
    });

    if (globalSearch.trim()) {
      const q = globalSearch.toLowerCase();
      return list.filter((x) => x.name.toLowerCase().includes(q));
    }
    return list;
  }, [d, monthB, monthA, dayFrom, dayTo, tradeFilterSet, regionFilterSet, cityFilterSet, categoryFilterSet, statusFilterSet, profitMarginPct, targetFillRatePct, globalSearch]);

  // 5. SKU Opportunity Breakdown
  const skuRows = useMemo(() => {
    if (!d || !monthB) return [];

    type Acc = {
      bPoVal: number;
      bGrnVal: number;
      bPoQty: number;
      bGrnQty: number;
      aPoVal: number;
      aGrnVal: number;
      aPoQty: number;
      aGrnQty: number;
      category: string;
      rawSku: string;
      name: string;
      code: string;
    };
    const map = new Map<string, Acc>();

    for (const r of d.rows) {
      const mName = d.dims.month[r[0]];
      const isB = mName === monthB;
      const isA = mName === monthA;
      if (!isB && !isA) continue;
      if (!rowMatchesFilters(r, true)) continue;

      const rawSku = d.dims.sku[r[6]] || "Unknown SKU";
      const mmd = mmdGroup(rawSku);
      const groupKey = mmd.key;
      const cat = d.dims.category[r[4]] || "General";
      let entry = map.get(groupKey);
      if (!entry) {
        entry = {
          bPoVal: 0,
          bGrnVal: 0,
          bPoQty: 0,
          bGrnQty: 0,
          aPoVal: 0,
          aGrnVal: 0,
          aPoQty: 0,
          aGrnQty: 0,
          category: cat,
          rawSku,
          name: mmd.name || rawSku,
          code: mmd.code || "",
        };
        map.set(groupKey, entry);
      }

      if (isB) {
        entry.bPoQty += r[7];
        entry.bPoVal += r[8];
        entry.bGrnQty += r[9];
        entry.bGrnVal += r[10];
      } else if (isA) {
        entry.aPoQty += r[7];
        entry.aPoVal += r[8];
        entry.aGrnQty += r[9];
        entry.aGrnVal += r[10];
      }
    }

    const list: OpportunityRow[] = [];
    map.forEach((acc, groupKey) => {
      const opp = computeOpportunity(
        acc.bPoVal,
        acc.bGrnVal,
        acc.bPoQty,
        acc.bGrnQty,
        acc.aPoVal,
        acc.aGrnVal,
        acc.aPoQty,
        acc.aGrnQty
      );
      const icon = matchSkuIcon(acc.name || acc.rawSku);

      list.push({
        key: groupKey,
        icon,
        ...acc,
        name: acc.name || acc.rawSku,
        code: acc.code || "",
        ...opp,
      });
    });

    let filtered = list;
    if (skuFilterType === "zero-supply") {
      filtered = filtered.filter((x) => x.bGrnVal === 0 && x.bPoVal > 0);
    } else if (skuFilterType === "severe-gap") {
      filtered = filtered.filter((x) => x.bFr < 60 && x.bGapVal > 0.1);
    } else if (skuFilterType === "top-profit") {
      filtered = filtered.filter((x) => x.bProfitGain >= 0.05);
    }

    if (globalSearch.trim()) {
      const q = globalSearch.toLowerCase();
      filtered = filtered.filter(
        (x) =>
          x.name.toLowerCase().includes(q) ||
          (x.code && x.code.toLowerCase().includes(q)) ||
          (x.category && x.category.toLowerCase().includes(q))
      );
    }

    return filtered;
  }, [d, monthB, monthA, dayFrom, dayTo, tradeFilterSet, regionFilterSet, cityFilterSet, categoryFilterSet, statusFilterSet, profitMarginPct, targetFillRatePct, skuFilterType, globalSearch]);

  // 6. Day-wise Opportunity Breakdown
  const dayRows = useMemo(() => {
    if (!d || !monthB) return [];

    type DayAcc = {
      bPoVal: number;
      bGrnVal: number;
      bPoQty: number;
      bGrnQty: number;
      bPoCount: number;
      aPoVal: number;
      aGrnVal: number;
      aPoQty: number;
      aGrnQty: number;
      aPoCount: number;
      dateB: string;
      dateA: string;
    };

    const daysMap = new Map<number, DayAcc>();
    for (let day = 1; day <= 31; day++) {
      daysMap.set(day, {
        bPoVal: 0,
        bGrnVal: 0,
        bPoQty: 0,
        bGrnQty: 0,
        bPoCount: 0,
        aPoVal: 0,
        aGrnVal: 0,
        aPoQty: 0,
        aGrnQty: 0,
        aPoCount: 0,
        dateB: "",
        dateA: "",
      });
    }

    for (const r of d.rows) {
      const mName = d.dims.month[r[0]];
      const isB = mName === monthB;
      const isA = mName === monthA;
      if (!isB && !isA) continue;
      if (!rowMatchesFilters(r, false)) continue; // don't restrict day here, we aggregate across all days

      const ymd = r[11];
      if (ymd < 19000101) continue;
      const dayNum = ymd % 100;
      if (dayNum < 1 || dayNum > 31) continue;

      const entry = daysMap.get(dayNum)!;
      if (isB) {
        entry.bPoQty += r[7];
        entry.bPoVal += r[8];
        entry.bGrnQty += r[9];
        entry.bGrnVal += r[10];
        entry.bPoCount++;
        if (!entry.dateB) entry.dateB = ymdToStr(ymd);
      } else if (isA) {
        entry.aPoQty += r[7];
        entry.aPoVal += r[8];
        entry.aGrnQty += r[9];
        entry.aGrnVal += r[10];
        entry.aPoCount++;
        if (!entry.dateA) entry.dateA = ymdToStr(ymd);
      }
    }

    const list: OpportunityRow[] = [];
    daysMap.forEach((acc, dayNum) => {
      if (acc.bPoVal === 0 && acc.aPoVal === 0) return; // skip days with no activity

      const opp = computeOpportunity(
        acc.bPoVal,
        acc.bGrnVal,
        acc.bPoQty,
        acc.bGrnQty,
        acc.aPoVal,
        acc.aGrnVal,
        acc.aPoQty,
        acc.aGrnQty
      );
      list.push({
        key: `day-${dayNum}`,
        name: `Day ${dayNum} (${acc.dateB ? acc.dateB.slice(5) : monthB.slice(0, 3)})`,
        dayNum,
        poCountB: acc.bPoCount,
        poCountA: acc.aPoCount,
        ...acc,
        ...opp,
      });
    });

    return list;
  }, [d, monthB, monthA, tradeFilterSet, regionFilterSet, cityFilterSet, categoryFilterSet, statusFilterSet, profitMarginPct, targetFillRatePct]);

  // ── Multi-Metric Line Chart Data & Geometry ──
  // Filter and sort days for chart (sorted ascending by dayNum)
  const chartDays = useMemo(() => {
    return [...dayRows].sort((a, b) => (a.dayNum || 0) - (b.dayNum || 0));
  }, [dayRows]);

  // Max values for chart axes & highlight days
  const { maxChartVal, maxChartQty, peakPoDay, peakGrnDay, maxGapDay, bestFrDay } = useMemo<{
    maxChartVal: number;
    maxChartQty: number;
    peakPoDay: OpportunityRow | null;
    peakGrnDay: OpportunityRow | null;
    maxGapDay: OpportunityRow | null;
    bestFrDay: OpportunityRow | null;
  }>(() => {
    let maxV = 1;
    let maxQ = 1;
    let pPoDay: OpportunityRow | null = null;
    let pGrnDay: OpportunityRow | null = null;
    let mGapDay: OpportunityRow | null = null;
    let bFrDay: OpportunityRow | null = null;

    for (const d of chartDays) {
      if (d.bPoVal > maxV) maxV = d.bPoVal;
      if (d.bGrnVal > maxV) maxV = d.bGrnVal;
      if (d.bGapVal > maxV) maxV = d.bGapVal;
      if (d.aPoVal > maxV) maxV = d.aPoVal;
      if (d.aGrnVal > maxV) maxV = d.aGrnVal;

      if (d.bPoQty > maxQ) maxQ = d.bPoQty;
      if (d.bGrnQty > maxQ) maxQ = d.bGrnQty;
      if (d.bGapQty > maxQ) maxQ = d.bGapQty;
      if (d.aPoQty > maxQ) maxQ = d.aPoQty;
      if (d.aGrnQty > maxQ) maxQ = d.aGrnQty;

      if (!pPoDay || d.bPoVal > pPoDay.bPoVal) pPoDay = d;
      if (!pGrnDay || d.bGrnVal > pGrnDay.bGrnVal) pGrnDay = d;
      if (!mGapDay || d.bGapVal > mGapDay.bGapVal) mGapDay = d;
      if (!bFrDay || (d.bPoVal > 0 && d.bFr > bFrDay.bFr)) bFrDay = d;
    }

    return {
      maxChartVal: Math.max(1, maxV * 1.15), // 15% headroom
      maxChartQty: Math.max(10, maxQ * 1.15),
      peakPoDay: pPoDay,
      peakGrnDay: pGrnDay,
      maxGapDay: mGapDay,
      bestFrDay: bFrDay,
    };
  }, [chartDays]);

  // Chart coordinate geometry
  const chartWidth = 1000;
  const chartHeight = 390;
  const chartPad = { top: 35, right: 65, bottom: 45, left: 65 };
  const innerW = chartWidth - chartPad.left - chartPad.right;
  const innerH = chartHeight - chartPad.top - chartPad.bottom;

  const chartPoints = useMemo(() => {
    if (chartDays.length === 0) return [];
    const stepX = chartDays.length > 1 ? innerW / (chartDays.length - 1) : innerW / 2;

    return chartDays.map((d, i) => {
      const x = chartPad.left + i * stepX;
      // Value coordinates (Left Axis)
      const yPoVal = chartPad.top + innerH - (d.bPoVal / maxChartVal) * innerH;
      const yGrnVal = chartPad.top + innerH - (d.bGrnVal / maxChartVal) * innerH;
      const yGapVal = chartPad.top + innerH - (d.bGapVal / maxChartVal) * innerH;
      const yLastPoVal = chartPad.top + innerH - (d.aPoVal / maxChartVal) * innerH;
      const yLastGrnVal = chartPad.top + innerH - (d.aGrnVal / maxChartVal) * innerH;
      const yLastGapVal = chartPad.top + innerH - (d.aGapVal / maxChartVal) * innerH;

      // Quantity coordinates (Right Axis)
      const yPoQty = chartPad.top + innerH - (d.bPoQty / maxChartQty) * innerH;
      const yGrnQty = chartPad.top + innerH - (d.bGrnQty / maxChartQty) * innerH;
      const yGapQty = chartPad.top + innerH - (d.bGapQty / maxChartQty) * innerH;

      // Fill Rate coordinates (0 - 100%)
      const yFr = chartPad.top + innerH - (Math.min(100, Math.max(0, d.bFr)) / 100) * innerH;
      const yLastFr = chartPad.top + innerH - (Math.min(100, Math.max(0, d.aFr)) / 100) * innerH;

      return {
        ...d,
        x,
        yPoVal,
        yGrnVal,
        yGapVal,
        yLastPoVal,
        yLastGrnVal,
        yLastGapVal,
        yPoQty,
        yGrnQty,
        yGapQty,
        yFr,
        yLastFr,
      };
    });
  }, [chartDays, maxChartVal, maxChartQty, innerW, innerH, chartPad.left, chartPad.top]);

  // Smooth bezier curve generator
  const makeLinePath = (key: keyof (typeof chartPoints)[0]) => {
    if (chartPoints.length === 0) return "";
    if (chartPoints.length === 1) return `M ${chartPoints[0].x} ${chartPoints[0][key]}`;

    let path = `M ${chartPoints[0].x} ${chartPoints[0][key]}`;
    for (let i = 0; i < chartPoints.length - 1; i++) {
      const curr = chartPoints[i];
      const next = chartPoints[i + 1];
      const cpX1 = curr.x + (next.x - curr.x) / 2;
      const cpY1 = curr[key] as number;
      const cpX2 = curr.x + (next.x - curr.x) / 2;
      const cpY2 = next[key] as number;
      path += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${next.x} ${next[key]}`;
    }
    return path;
  };

  const makeAreaPath = (key: keyof (typeof chartPoints)[0]) => {
    if (chartPoints.length === 0) return "";
    const linePath = makeLinePath(key);
    const bottomY = chartPad.top + innerH;
    const firstX = chartPoints[0].x;
    const lastX = chartPoints[chartPoints.length - 1].x;
    return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  };

  const handleChartMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!lineChartSvgRef.current || chartPoints.length === 0) return;
    const rect = lineChartSvgRef.current.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * chartWidth;
    const mouseY = ((e.clientY - rect.top) / rect.height) * chartHeight;

    let closestIdx = 0;
    let minDiff = Infinity;
    chartPoints.forEach((p, idx) => {
      const diff = Math.abs(p.x - mouseX);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });

    setHoveredDayIdx(closestIdx);
    setChartMousePos({ x: chartPoints[closestIdx].x, y: mouseY });
  };

  const exportLineChartCsv = () => {
    const headers = `Day,Date (${monthB}),PO Value (₹ Lakhs),PO Quantity (Units),GRN Value (₹ Lakhs),GRN Quantity (Units),Gap Value (₹ Lakhs),Gap Quantity (Units),Fill Rate %,Last Mo PO Val (₹L),Last Mo GRN Val (₹L),Last Mo Gap Val (₹L),Last Mo FR %\n`;
    const rowsCsv = chartDays
      .map(
        (d) =>
          `"Day ${d.dayNum}","${d.dateB || ""}",${d.bPoVal.toFixed(2)},${d.bPoQty},${d.bGrnVal.toFixed(2)},${d.bGrnQty},${d.bGapVal.toFixed(2)},${d.bGapQty},${d.bFr.toFixed(1)},${d.aPoVal.toFixed(2)},${d.aGrnVal.toFixed(2)},${d.aGapVal.toFixed(2)},${d.aFr.toFixed(1)}`
      )
      .join("\n");
    const blob = new Blob([headers + rowsCsv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Opportunity_Multi_Metric_Line_Chart_${monthB}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ── Dynamic Drill-Down for Funnel Modal ── */
  const funnelDrillDown = useMemo(() => {
    if (!d || !monthB || !funnelTarget) return null;

    let skusMap = new Map<string, { poVal: number; grnVal: number; gapVal: number; poQty: number; grnQty: number; gapQty: number; fr: number; category: string; name: string; code: string; rawSku: string }>();
    let citiesMap = new Map<string, { poVal: number; grnVal: number; gapVal: number; poQty: number; grnQty: number; gapQty: number; fr: number; region: string }>();
    let statusesMap = new Map<string, { poVal: number; grnVal: number; gapVal: number; count: number }>();
    let tradesMap = new Map<string, { poVal: number; grnVal: number; gapVal: number }>();

    for (const r of d.rows) {
      const mName = d.dims.month[r[0]];
      if (mName !== monthB) continue;
      if (!rowMatchesFilters(r, true)) continue;

      const trade = d.dims.trade[r[1]] || "Other";
      const reg = d.dims.region[r[2]] || "Other";
      const city = d.dims.city[r[3]] || "Other";
      const cat = d.dims.category[r[4]] || "Other";
      const status = d.dims.status[r[5]] || "Other";
      const rawSku = d.dims.sku[r[6]] || "Other";
      const poQty = r[7];
      const poVal = r[8];
      const grnQty = r[9];
      const grnVal = r[10];
      const dayNum = r[11] % 100;

      // Match entity target
      let matches = false;
      if (funnelTarget.type === "overall") matches = true;
      else if (funnelTarget.type === "category" && cat === funnelTarget.key) matches = true;
      else if (funnelTarget.type === "city" && city === funnelTarget.key) matches = true;
      else if (funnelTarget.type === "region" && reg === funnelTarget.key) matches = true;
      else if (funnelTarget.type === "sku" && (mmdGroup(rawSku).key === funnelTarget.key || rawSku === funnelTarget.key)) matches = true;
      else if (funnelTarget.type === "day" && dayNum === funnelTarget.row.dayNum) matches = true;

      if (!matches) continue;

      // Accumulate SKU
      const mmd = mmdGroup(rawSku);
      const groupKey = mmd.key;
      let sEntry = skusMap.get(groupKey);
      if (!sEntry) {
        sEntry = { poVal: 0, grnVal: 0, gapVal: 0, poQty: 0, grnQty: 0, gapQty: 0, fr: 0, category: cat, name: mmd.name || rawSku, code: mmd.code || "", rawSku };
        skusMap.set(groupKey, sEntry);
      }
      sEntry.poQty += poQty;
      sEntry.poVal += poVal;
      sEntry.grnQty += grnQty;
      sEntry.grnVal += grnVal;
      sEntry.gapVal = Math.max(0, sEntry.poVal - sEntry.grnVal);
      sEntry.gapQty = Math.max(0, sEntry.poQty - sEntry.grnQty);
      sEntry.fr = sEntry.poVal > 0 ? (sEntry.grnVal / sEntry.poVal) * 100 : 0;

      // Accumulate City
      let cEntry = citiesMap.get(city);
      if (!cEntry) {
        cEntry = { poVal: 0, grnVal: 0, gapVal: 0, poQty: 0, grnQty: 0, gapQty: 0, fr: 0, region: reg };
        citiesMap.set(city, cEntry);
      }
      cEntry.poQty += poQty;
      cEntry.poVal += poVal;
      cEntry.grnQty += grnQty;
      cEntry.grnVal += grnVal;
      cEntry.gapVal = Math.max(0, cEntry.poVal - cEntry.grnVal);
      cEntry.gapQty = Math.max(0, cEntry.poQty - cEntry.grnQty);
      cEntry.fr = cEntry.poVal > 0 ? (cEntry.grnVal / cEntry.poVal) * 100 : 0;

      // Accumulate Status
      let stEntry = statusesMap.get(status);
      if (!stEntry) {
        stEntry = { poVal: 0, grnVal: 0, gapVal: 0, count: 0 };
        statusesMap.set(status, stEntry);
      }
      stEntry.poVal += poVal;
      stEntry.grnVal += grnVal;
      stEntry.gapVal = Math.max(0, stEntry.poVal - stEntry.grnVal);
      stEntry.count++;

      // Accumulate Trade
      let tEntry = tradesMap.get(trade);
      if (!tEntry) {
        tEntry = { poVal: 0, grnVal: 0, gapVal: 0 };
        tradesMap.set(trade, tEntry);
      }
      tEntry.poVal += poVal;
      tEntry.grnVal += grnVal;
      tEntry.gapVal = Math.max(0, tEntry.poVal - tEntry.grnVal);
    }

    const topSkus = Array.from(skusMap.entries())
      .map(([groupKey, stats]) => ({
        icon: matchSkuIcon(stats.name || stats.rawSku),
        ...stats,
        name: stats.name,
        code: stats.code,
      }))
      .sort((a, b) => b.gapVal - a.gapVal)
      .slice(0, 6);

    const topCities = Array.from(citiesMap.entries())
      .map(([city, stats]) => ({
        city,
        ...stats,
      }))
      .sort((a, b) => b.gapVal - a.gapVal)
      .slice(0, 6);

    const statusList = Array.from(statusesMap.entries())
      .map(([status, stats]) => ({
        status,
        ...stats,
      }))
      .sort((a, b) => b.gapVal - a.gapVal);

    const tradeList = Array.from(tradesMap.entries())
      .map(([trade, stats]) => ({
        trade,
        ...stats,
      }))
      .sort((a, b) => b.gapVal - a.gapVal);

    return { topSkus, topCities, statusList, tradeList };
  }, [d, monthB, funnelTarget, dayFrom, dayTo, tradeFilterSet, regionFilterSet, cityFilterSet, categoryFilterSet, statusFilterSet, targetFillRatePct]);

  /* ── Sorting function ── */
  const sortList = <T extends OpportunityRow>(
    list: T[],
    sortState: { col: keyof OpportunityRow; dir: 1 | -1 }
  ): T[] => {
    return [...list].sort((a, b) => {
      const valA = a[sortState.col] ?? 0;
      const valB = b[sortState.col] ?? 0;
      if (typeof valA === "string" && typeof valB === "string") {
        return sortState.dir === 1 ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortState.dir === 1 ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });
  };

  const sortedCategoryRows = useMemo(() => sortList(categoryRows, sortCategory), [categoryRows, sortCategory]);
  const sortedCityRows = useMemo(() => sortList(cityRows, sortCity), [cityRows, sortCity]);
  const sortedRegionRows = useMemo(() => sortList(regionRows, sortRegion), [regionRows, sortRegion]);
  const sortedSkuRows = useMemo(() => sortList(skuRows, sortSku), [skuRows, sortSku]);
  const sortedDayRows = useMemo(() => sortList(dayRows, sortDay), [dayRows, sortDay]);

  // Paginated SKUs
  const paginatedSkuRows = useMemo(() => {
    const start = (skuPage - 1) * skuPageSize;
    return sortedSkuRows.slice(start, start + skuPageSize);
  }, [sortedSkuRows, skuPage, skuPageSize]);

  const totalSkuPages = Math.ceil(sortedSkuRows.length / skuPageSize) || 1;

  /* ── Export to Excel ── */
  const exportToExcel = (tableName: string, dataRows: OpportunityRow[]) => {
    const sheetData = dataRows.map((r) => ({
      Name: r.name,
      Category: r.category || "",
      Region: r.region || "",
      [`${monthB} Demand (₹L)`]: +r.bPoVal.toFixed(2),
      [`${monthB} Supplied (₹L)`]: +r.bGrnVal.toFixed(2),
      [`${monthB} Fill Rate %`]: +r.bFr.toFixed(1),
      [`${monthB} Gap Value (₹L)`]: +r.bGapVal.toFixed(2),
      [`${monthB} Profit Gain (₹L)`]: +r.bProfitGain.toFixed(2),
      [`${monthA} Demand (₹L)`]: +r.aPoVal.toFixed(2),
      [`${monthA} Supplied (₹L)`]: +r.aGrnVal.toFixed(2),
      [`${monthA} Fill Rate %`]: +r.aFr.toFixed(1),
      [`${monthA} Gap Value (₹L)`]: +r.aGapVal.toFixed(2),
      [`${monthA} Profit Gain (₹L)`]: +r.aProfitGain.toFixed(2),
      "MoM Δ Gap Value (₹L)": +r.deltaGapVal.toFixed(2),
      "MoM Δ Fill Rate %": +r.deltaFR.toFixed(1),
      "MoM Δ Profit Gain (₹L)": +r.deltaProfitGain.toFixed(2),
    }));

    const ws = XLSX.utils.json_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tableName.slice(0, 30));
    XLSX.writeFile(wb, `Opportunity_${tableName}_${monthB}_vs_${monthA}.xlsx`);
  };

  const exportAllTables = () => {
    const wb = XLSX.utils.book_new();

    const addSheet = (title: string, dataRows: OpportunityRow[]) => {
      const sheetData = dataRows.map((r) => ({
        Name: r.name,
        Category: r.category || "",
        Region: r.region || "",
        [`${monthB} Demand (₹L)`]: +r.bPoVal.toFixed(2),
        [`${monthB} Supplied (₹L)`]: +r.bGrnVal.toFixed(2),
        [`${monthB} FR %`]: +r.bFr.toFixed(1),
        [`${monthB} Gap (₹L)`]: +r.bGapVal.toFixed(2),
        [`${monthB} Profit (₹L)`]: +r.bProfitGain.toFixed(2),
        [`${monthA} Demand (₹L)`]: +r.aPoVal.toFixed(2),
        [`${monthA} Supplied (₹L)`]: +r.aGrnVal.toFixed(2),
        [`${monthA} FR %`]: +r.aFr.toFixed(1),
        [`${monthA} Gap (₹L)`]: +r.aGapVal.toFixed(2),
        [`${monthA} Profit (₹L)`]: +r.aProfitGain.toFixed(2),
        "MoM Δ Gap (₹L)": +r.deltaGapVal.toFixed(2),
        "MoM Δ FR %": +r.deltaFR.toFixed(1),
        "MoM Δ Profit (₹L)": +r.deltaProfitGain.toFixed(2),
      }));
      const ws = XLSX.utils.json_to_sheet(sheetData);
      XLSX.utils.book_append_sheet(wb, ws, title);
    };

    addSheet("Category Opportunity", sortedCategoryRows);
    addSheet("City Opportunity", sortedCityRows);
    addSheet("Region Opportunity", sortedRegionRows);
    addSheet("SKU Opportunity", sortedSkuRows);
    addSheet("Day-wise Opportunity", sortedDayRows);

    XLSX.writeFile(wb, `Full_Opportunity_Report_${monthB}_vs_${monthA}.xlsx`);
  };

  /* ── Open SKU Lightbox ── */
  const openSkuLightbox = (row: OpportunityRow) => {
    const stats: SkuStat[] = [
      { label: "Category", value: row.category || "General" },
      { label: `${monthB} Demand`, value: `₹${L2(row.bPoVal)} L (${L(row.bPoQty, 0)} U)` },
      { label: `${monthB} Supplied`, value: `₹${L2(row.bGrnVal)} L (${L(row.bGrnQty, 0)} U)` },
      { label: `${monthB} Fill Rate`, value: `${row.bFr.toFixed(1)}%`, cls: frColor(row.bFr) },
      { label: `${monthB} Revenue Gap`, value: `₹${L2(row.bGapVal)} L`, cls: "text-rose-600 font-bold" },
      { label: "Potential Profit Gain", value: `+₹${L2(row.bProfitGain)} L`, cls: "text-emerald-600 font-bold" },
      { label: `${monthA} Gap Value`, value: `₹${L2(row.aGapVal)} L` },
      { label: `${monthA} Fill Rate`, value: `${row.aFr.toFixed(1)}%` },
      {
        label: "MoM Gap Trend",
        value: `${row.deltaGapVal <= 0 ? "📉 Shrinking" : "📈 Widening"} (₹${L2(Math.abs(row.deltaGapVal))} L)`,
        cls: row.deltaGapVal <= 0 ? "text-emerald-600" : "text-rose-600",
      },
      {
        label: "MoM FR Delta",
        value: `${row.deltaFR >= 0 ? "+" : ""}${row.deltaFR.toFixed(1)}%`,
        cls: row.deltaFR >= 0 ? "text-emerald-600 font-bold" : "text-rose-600 font-bold",
      },
    ];

    setSkuPopup({
      icon: row.icon || null,
      name: row.name,
      stats,
    });
  };

  /* ── Top Opportunities for Visual Highlight ── */
  const topProfitSkus = useMemo(() => {
    return [...skuRows].sort((a, b) => b.bProfitGain - a.bProfitGain).slice(0, 5);
  }, [skuRows]);

  const topGapSkus = useMemo(() => {
    return [...skuRows].sort((a, b) => b.bGapVal - a.bGapVal).slice(0, 5);
  }, [skuRows]);

  const topGapCategories = useMemo(() => {
    return [...categoryRows].sort((a, b) => b.bGapVal - a.bGapVal).slice(0, 6);
  }, [categoryRows]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1700px] mx-auto text-slate-900 dark:text-slate-100">
      {/* ── HEADER TITLE & CONTROLS ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white/80 dark:bg-[#000d38]/80 backdrop-blur-md p-5 rounded-2xl border border-slate-200/80 dark:border-white/10 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-2xl md:text-3xl p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/20">
              🎯
            </span>
            <div>
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                Opportunity Dashboard
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200 font-bold border border-indigo-200 dark:border-indigo-800">
                  Gap Profit Recovery
                </span>
              </h1>
              <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Harness unfulfilled demand gaps to recover lost sales and maximize incremental profit gains with side-by-side MoM benchmarking.
              </p>
            </div>
          </div>
        </div>

        {/* Global actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* All-India Funnel Trigger */}
          <button
            onClick={() =>
              setFunnelTarget({
                type: "overall",
                key: "overall",
                name: "All-India Overall Demand",
                row: {
                  key: "overall",
                  name: "All-India Overall Demand",
                  ...overallMetrics,
                },
              })
            }
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-bold shadow-sm transition active:scale-95 cursor-pointer"
            title="Open Interactive Opportunity Funnel Analyzer"
          >
            <span className="text-sm">🌪️</span>
            <span>Funnel Analyzer</span>
          </button>

          <Link
            href="/dashboard/trending-analysis"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 text-sky-700 dark:text-sky-300 hover:bg-sky-100 text-xs font-bold shadow-xs transition active:scale-95"
            title="Open Trending Analysis Curves"
          >
            <span>📈</span>
            <span>Trending</span>
          </Link>
          <Link
            href="/dashboard/heatmap"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-300 hover:bg-amber-100 text-xs font-bold shadow-xs transition active:scale-95"
            title="Open Heatmap Fulfillment Matrix"
          >
            <span>🔥</span>
            <span>Heatmap</span>
          </Link>
          <Link
            href="/dashboard/month-compare"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 text-xs font-bold shadow-xs transition active:scale-95"
            title="Open Month Comparison"
          >
            <span>🗓️</span>
            <span>MoM Compare</span>
          </Link>
          <SyncStatus />
          <UploadButton />
          <button
            onClick={exportAllTables}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition active:scale-95 cursor-pointer"
            title="Download full Opportunity Report with all tables"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export All to Excel
          </button>
        </div>
      </div>

      {/* ── INTERACTIVE CONTROLS & SIMULATION BAR ── */}
      <div className="bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 rounded-2xl p-4 shadow-sm space-y-4">
        {/* Row 1: Month Comparison & Presets */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-100 dark:border-white/10">
          <div className="flex flex-wrap items-center gap-3">
            {/* Month B (Current) */}
            <div className="flex items-center gap-2 bg-indigo-50/80 dark:bg-indigo-950/40 px-3 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800/60">
              <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">
                Current Month:
              </span>
              <select
                value={monthB}
                onChange={(e) => setMonthB(e.target.value)}
                className="bg-transparent font-black text-indigo-900 dark:text-indigo-100 text-xs focus:outline-none cursor-pointer"
              >
                {months.map((m) => (
                  <option key={`b-${m}`} value={m} className="text-slate-900 bg-white">
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <span className="text-slate-400 font-bold text-xs">VS</span>

            {/* Month A (Baseline / Last Month) */}
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-white/5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10">
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                Compare With (Last Month):
              </span>
              <select
                value={monthA}
                onChange={(e) => setMonthA(e.target.value)}
                className="bg-transparent font-bold text-slate-800 dark:text-slate-200 text-xs focus:outline-none cursor-pointer"
              >
                {months.map((m) => (
                  <option key={`a-${m}`} value={m} className="text-slate-900 bg-white">
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Date Range Presets */}
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

        {/* Row 2: Search & SKU Filter */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-gradient-to-r from-indigo-50/50 via-purple-50/40 to-sky-50/50 dark:from-indigo-950/30 dark:via-purple-950/20 dark:to-sky-950/30 rounded-xl border border-indigo-100 dark:border-indigo-900/30">
          {/* Quick Filter: Search */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Search SKU / City / Category:
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search across all tables..."
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:border-indigo-500 shadow-xs"
              />
              <span className="absolute left-2.5 top-1.5 text-slate-400 text-xs">🔍</span>
              {globalSearch && (
                <button
                  onClick={() => setGlobalSearch("")}
                  className="absolute right-2.5 top-1.5 text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* SKU Filter Switch */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              SKU Highlight Filter:
            </label>
            <select
              value={skuFilterType}
              onChange={(e) => setSkuFilterType(e.target.value as any)}
              className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200 text-xs font-semibold focus:outline-none focus:border-indigo-500 shadow-xs cursor-pointer"
            >
              <option value="all">All SKUs</option>
              <option value="top-profit">🔥 Top Profit Gains (&gt;₹5K)</option>
              <option value="severe-gap">🚨 Severe Gaps (FR &lt; 60%)</option>
              <option value="zero-supply">❌ Zero Supply Only</option>
            </select>
          </div>
        </div>

        {/* Row 3: Multi-Select Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <MultiSelectDropdown
            label="Trade / Platform"
            options={allTrades.map((t) => ({ key: t, label: t }))}
            selected={selTrades}
            onChange={setSelTrades}
            open={openDropdown === "trade"}
            onToggle={() => setOpenDropdown(openDropdown === "trade" ? null : "trade")}
            onClose={() => setOpenDropdown(null)}
          />

          <MultiSelectDropdown
            label="Region"
            options={allRegions.map((r) => ({ key: r, label: r }))}
            selected={selRegions}
            onChange={setSelRegions}
            open={openDropdown === "region"}
            onToggle={() => setOpenDropdown(openDropdown === "region" ? null : "region")}
            onClose={() => setOpenDropdown(null)}
          />

          <MultiSelectDropdown
            label="City"
            options={allCities.map((c) => ({ key: c, label: c }))}
            selected={selCities}
            onChange={setSelCities}
            open={openDropdown === "city"}
            onToggle={() => setOpenDropdown(openDropdown === "city" ? null : "city")}
            onClose={() => setOpenDropdown(null)}
          />

          <MultiSelectDropdown
            label="Category"
            options={allCategories.map((c) => ({ key: c, label: c }))}
            selected={selCategories}
            onChange={setSelCategories}
            open={openDropdown === "category"}
            onToggle={() => setOpenDropdown(openDropdown === "category" ? null : "category")}
            onClose={() => setOpenDropdown(null)}
          />

          <MultiSelectDropdown
            label="Status"
            options={allStatuses.map((s) => ({ key: s, label: s }))}
            selected={selStatuses}
            onChange={setSelStatuses}
            open={openDropdown === "status"}
            onToggle={() => setOpenDropdown(openDropdown === "status" ? null : "status")}
            onClose={() => setOpenDropdown(null)}
          />

          {(selTrades.length > 0 || selRegions.length > 0 || selCities.length > 0 || selCategories.length > 0 || selStatuses.length > 0 || globalSearch) && (
            <button
              onClick={() => {
                setSelTrades([]);
                setSelRegions([]);
                setSelCities([]);
                setSelCategories([]);
                setSelStatuses([]);
                setGlobalSearch("");
              }}
              className="px-2.5 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition"
            >
              Reset Filters ↺
            </button>
          )}
        </div>
      </div>

      {/* ── EXECUTIVE KPI CARDS (PO Value & Qty, GRN Value & Qty, Gap Value & Qty, Fill Rate) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: PO Demand (Value & Qty) */}
        <div
          onClick={() =>
            setFunnelTarget({
              type: "overall",
              key: "overall",
              name: "All-India Overall Demand",
              row: { key: "overall", name: "All-India Overall Demand", ...overallMetrics },
            })
          }
          className="relative overflow-hidden bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-transparent dark:from-blue-950/40 dark:via-indigo-950/10 p-5 rounded-2xl border border-blue-500/20 shadow-sm cursor-pointer hover:border-blue-500/40 hover:scale-[1.01] transition group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
              <span>📋</span> PO Demand (Orders)
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-600 text-white font-bold">
              {monthB}
            </span>
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <div>
              <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">PO Value</div>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-3xl font-black text-blue-700 dark:text-blue-300">
                  ₹{L2(overallMetrics.bPoVal)}
                </span>
                <span className="text-xs font-bold text-blue-800 dark:text-blue-400">Lakhs</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">PO Quantity</div>
              <div className="text-lg font-black text-slate-800 dark:text-white mt-0.5">
                {L(overallMetrics.bPoQty, 0)}
              </div>
              <div className="text-[10px] text-slate-400 font-medium">units</div>
            </div>
          </div>

          {/* Mini demand progress visual */}
          <div className="mt-3 space-y-1">
            <div className="flex justify-between text-[10px] text-slate-500 font-semibold">
              <span>Order Volume Baseline</span>
              <span>{overallMetrics.bPoCount} PO Lines</span>
            </div>
            <div className="h-1.5 w-full bg-blue-100 dark:bg-blue-950/60 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 rounded-full w-full" />
            </div>
          </div>

          {/* MoM Comparison Footer */}
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 border-t border-blue-500/10 pt-2">
            <span>Last Mo: ₹{L2(overallMetrics.aPoVal)}L • {L(overallMetrics.aPoQty, 0)} Qty</span>
            <span
              className={`font-bold flex items-center gap-0.5 ${
                (overallMetrics.deltaPoVal || 0) >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {(overallMetrics.deltaPoVal || 0) >= 0 ? "▲ +" : "▼ "}₹{L2(Math.abs(overallMetrics.deltaPoVal || 0))}L
            </span>
          </div>
        </div>

        {/* Card 2: GRN Supplied (Value & Qty) */}
        <div
          onClick={() =>
            setFunnelTarget({
              type: "overall",
              key: "overall",
              name: "All-India Overall Demand",
              row: { key: "overall", name: "All-India Overall Demand", ...overallMetrics },
            })
          }
          className="relative overflow-hidden bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent dark:from-emerald-950/40 dark:via-emerald-950/10 p-5 rounded-2xl border border-emerald-500/20 shadow-sm cursor-pointer hover:border-emerald-500/40 hover:scale-[1.01] transition group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
              <span>🚚</span> GRN Supplied (Delivered)
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-600 text-white font-bold">
              {overallMetrics.bFr.toFixed(1)}% Supplied
            </span>
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <div>
              <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">GRN Value</div>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
                  ₹{L2(overallMetrics.bGrnVal)}
                </span>
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">Lakhs</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">GRN Quantity</div>
              <div className="text-lg font-black text-slate-800 dark:text-white mt-0.5">
                {L(overallMetrics.bGrnQty, 0)}
              </div>
              <div className="text-[10px] text-slate-400 font-medium">units</div>
            </div>
          </div>

          {/* Mini supply fulfillment progress bar */}
          <div className="mt-3 space-y-1">
            <div className="flex justify-between text-[10px] text-slate-500 font-semibold">
              <span>Fulfillment vs Demand</span>
              <span className="text-emerald-600 font-bold">{overallMetrics.bFr.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, overallMetrics.bFr))}%` }}
              />
            </div>
          </div>

          {/* MoM Comparison Footer */}
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 border-t border-emerald-500/10 pt-2">
            <span>Last Mo: ₹{L2(overallMetrics.aGrnVal)}L • {L(overallMetrics.aGrnQty, 0)} Qty</span>
            <span
              className={`font-bold flex items-center gap-0.5 ${
                (overallMetrics.deltaGrnVal || 0) >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {(overallMetrics.deltaGrnVal || 0) >= 0 ? "▲ +" : "▼ "}₹{L2(Math.abs(overallMetrics.deltaGrnVal || 0))}L
            </span>
          </div>
        </div>

        {/* Card 3: Unfulfilled Gap (Value & Qty) */}
        <div
          onClick={() =>
            setFunnelTarget({
              type: "overall",
              key: "overall",
              name: "All-India Overall Demand",
              row: { key: "overall", name: "All-India Overall Demand", ...overallMetrics },
            })
          }
          className="relative overflow-hidden bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-transparent dark:from-rose-950/40 dark:via-rose-950/10 p-5 rounded-2xl border border-rose-500/20 shadow-sm cursor-pointer hover:border-rose-500/40 hover:scale-[1.01] transition group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
              <span>⚠️</span> Unfulfilled Gap (Deficit)
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-600 text-white font-bold">
              {(100 - overallMetrics.bFr).toFixed(1)}% Gap
            </span>
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <div>
              <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Gap Value</div>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-3xl font-black text-rose-600 dark:text-rose-400">
                  ₹{L2(overallMetrics.bGapVal)}
                </span>
                <span className="text-xs font-bold text-rose-700 dark:text-rose-300">Lakhs</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Gap Quantity</div>
              <div className="text-lg font-black text-rose-600 dark:text-rose-400 mt-0.5">
                {L(overallMetrics.bGapQty, 0)}
              </div>
              <div className="text-[10px] text-slate-400 font-medium">units lost</div>
            </div>
          </div>

          {/* Mini gap shortage progress bar */}
          <div className="mt-3 space-y-1">
            <div className="flex justify-between text-[10px] text-slate-500 font-semibold">
              <span>Lost Demand Ratio</span>
              <span className="text-rose-600 font-bold">{(100 - overallMetrics.bFr).toFixed(1)}%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-rose-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, 100 - overallMetrics.bFr))}%` }}
              />
            </div>
          </div>

          {/* MoM Comparison Footer */}
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 border-t border-rose-500/10 pt-2">
            <span>Last Mo: ₹{L2(overallMetrics.aGapVal)}L • {L(overallMetrics.aGapQty, 0)} Qty</span>
            <span
              className={`font-bold flex items-center gap-0.5 ${
                overallMetrics.deltaGapVal <= 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {overallMetrics.deltaGapVal <= 0 ? "📉 -₹" : "📈 +₹"}
              {L2(Math.abs(overallMetrics.deltaGapVal))}L ({overallMetrics.gapGrowthPct.toFixed(1)}%)
            </span>
          </div>
        </div>

        {/* Card 4: Overall Fill Rate & Performance */}
        <div
          onClick={() =>
            setFunnelTarget({
              type: "overall",
              key: "overall",
              name: "All-India Overall Demand",
              row: { key: "overall", name: "All-India Overall Demand", ...overallMetrics },
            })
          }
          className="relative overflow-hidden bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-transparent dark:from-purple-950/40 dark:via-purple-950/10 p-5 rounded-2xl border border-purple-500/20 shadow-sm cursor-pointer hover:border-purple-500/40 hover:scale-[1.01] transition group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400 flex items-center gap-1.5">
              <span>📊</span> Fill Rate Performance
            </span>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-bold text-white ${
                overallMetrics.deltaFR >= 0 ? "bg-emerald-600" : "bg-rose-600"
              }`}
            >
              {overallMetrics.deltaFR >= 0 ? "▲ +" : "▼ "}
              {overallMetrics.deltaFR.toFixed(1)}% MoM
            </span>
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <div>
              <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Value FR %</div>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className={`text-3xl font-black ${frColor(overallMetrics.bFr)}`}>
                  {overallMetrics.bFr.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Qty FR %</div>
              <div className="text-lg font-black text-purple-600 dark:text-purple-400 mt-0.5">
                {overallMetrics.bPoQty > 0 ? ((overallMetrics.bGrnQty / overallMetrics.bPoQty) * 100).toFixed(1) : "0.0"}%
              </div>
              <div className="text-[10px] text-slate-400 font-medium">{overallMetrics.bPoCount} PO Lines</div>
            </div>
          </div>

          {/* Dual-color proportional stacked bar */}
          <div className="mt-3 space-y-1">
            <div className="flex justify-between text-[10px] text-slate-500 font-semibold">
              <span className="text-emerald-600 font-bold">Supplied: ₹{L2(overallMetrics.bGrnVal)}L</span>
              <span className="text-rose-600 font-bold">Gap: ₹{L2(overallMetrics.bGapVal)}L</span>
            </div>
            <div className="h-1.5 w-full bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden flex">
              <div
                className="h-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, overallMetrics.bFr))}%` }}
                title={`Supplied: ${overallMetrics.bFr.toFixed(1)}%`}
              />
              <div
                className="h-full bg-rose-500 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, 100 - overallMetrics.bFr))}%` }}
                title={`Gap: ${(100 - overallMetrics.bFr).toFixed(1)}%`}
              />
            </div>
          </div>

          {/* MoM Comparison Footer */}
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 border-t border-purple-500/10 pt-2">
            <span>Last Month: {overallMetrics.aFr.toFixed(1)}% FR</span>
            <span className="text-purple-600 dark:text-purple-400 font-semibold">
              Target FR: {targetFillRatePct}%
            </span>
          </div>
        </div>
      </div>

      {/* ── NAVIGATION TABS ── */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-white/10 pb-2 overflow-x-auto custom-scrollbar">
        {(
          [
            { id: "overview", label: "📊 Executive Matrix (All Tables)", count: null },
            { id: "linechart", label: "📈 Multi-Metric Line Chart", count: null },
            { id: "category", label: "📂 Category-wise", count: categoryRows.length },
            { id: "city", label: "🏙️ City-wise", count: cityRows.length },
            { id: "region", label: "🗺️ Region-wise", count: regionRows.length },
            { id: "sku", label: "📦 SKU-wise", count: skuRows.length },
            { id: "day", label: "📅 Day-wise Trend", count: dayRows.length },
            { id: "visuals", label: "📊 Card Charts", count: null },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              activeTab === t.id
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-white/60 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200/60 dark:border-white/5"
            }`}
          >
            <span>{t.label}</span>
            {t.count !== null && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  activeTab === t.id ? "bg-white/20 text-white" : "bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300"
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── TAB CONTENT: MULTI-METRIC LINE CHART (PO, GRN, GAP VALUES & QUANTITIES, FILL RATE) ── */}
      {(activeTab === "overview" || activeTab === "linechart") && (
        <div className="bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-sm space-y-5">
          {/* Header & View Mode Switcher */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-white/10 pb-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xl">📈</span>
                <h2 className="text-base font-black text-slate-900 dark:text-white tracking-tight">
                  Multi-Metric Performance Line Chart (PO, GRN, Gap &amp; Fill Rate)
                </h2>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  {monthB} (Days 1–31) vs {monthA}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Explore day-by-day trajectories for PO Demand, GRN Fulfillment, and Unmet Gap across both Values (₹ Lakhs) and Quantities (Units) alongside Fill Rate %.
              </p>
            </div>

            {/* View Mode Controls & Export */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center bg-slate-100 dark:bg-white/5 p-1 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-bold">
                <button
                  onClick={() => {
                    setChartViewMode("all");
                    setShowPoVal(true);
                    setShowGrnVal(true);
                    setShowGapVal(true);
                    setShowPoQty(true);
                    setShowGrnQty(true);
                    setShowGapQty(true);
                    setShowFrLine(true);
                  }}
                  className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                    chartViewMode === "all"
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  📊 All Combined
                </button>
                <button
                  onClick={() => {
                    setChartViewMode("value");
                    setShowPoVal(true);
                    setShowGrnVal(true);
                    setShowGapVal(true);
                    setShowPoQty(false);
                    setShowGrnQty(false);
                    setShowGapQty(false);
                    setShowFrLine(false);
                  }}
                  className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                    chartViewMode === "value"
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  💰 Values (₹L)
                </button>
                <button
                  onClick={() => {
                    setChartViewMode("qty");
                    setShowPoVal(false);
                    setShowGrnVal(false);
                    setShowGapVal(false);
                    setShowPoQty(true);
                    setShowGrnQty(true);
                    setShowGapQty(true);
                    setShowFrLine(false);
                  }}
                  className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                    chartViewMode === "qty"
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  📦 Quantities (Units)
                </button>
                <button
                  onClick={() => {
                    setChartViewMode("fr");
                    setShowPoVal(false);
                    setShowGrnVal(false);
                    setShowGapVal(false);
                    setShowPoQty(false);
                    setShowGrnQty(false);
                    setShowGapQty(false);
                    setShowFrLine(true);
                  }}
                  className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                    chartViewMode === "fr"
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  🎯 Fill Rate %
                </button>
                <button
                  onClick={() => {
                    setChartViewMode("mom");
                    setShowPoVal(true);
                    setShowGrnVal(true);
                    setShowGapVal(true);
                    setShowPoQty(false);
                    setShowGrnQty(false);
                    setShowGapQty(false);
                    setShowFrLine(true);
                    setShowLastMonthBaseline(true);
                  }}
                  className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                    chartViewMode === "mom"
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  ⚡ MoM Baseline
                </button>
              </div>

              <button
                onClick={exportLineChartCsv}
                className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-xs font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 transition cursor-pointer flex items-center gap-1.5"
                title="Export Line Chart Data as CSV"
              >
                <span>Export CSV</span>
                <span>📥</span>
              </button>
            </div>
          </div>

          {/* Key Day Highlights Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40">
              <span className="text-[10px] font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider block">
                📋 Peak PO Demand Day
              </span>
              <div className="text-sm font-black text-slate-900 dark:text-white mt-1">
                {peakPoDay ? `Day ${peakPoDay.dayNum}` : "N/A"}
              </div>
              <div className="text-[11px] text-blue-700 dark:text-blue-300 font-bold mt-0.5">
                {peakPoDay ? `₹${L2(peakPoDay.bPoVal)}L • ${L(peakPoDay.bPoQty, 0)} units` : "0"}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40">
              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">
                🚚 Peak GRN Supply Day
              </span>
              <div className="text-sm font-black text-slate-900 dark:text-white mt-1">
                {peakGrnDay ? `Day ${peakGrnDay.dayNum}` : "N/A"}
              </div>
              <div className="text-[11px] text-emerald-700 dark:text-emerald-300 font-bold mt-0.5">
                {peakGrnDay ? `₹${L2(peakGrnDay.bGrnVal)}L • ${L(peakGrnDay.bGrnQty, 0)} units` : "0"}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/40">
              <span className="text-[10px] font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider block">
                ⚠️ Worst Deficit (Gap) Day
              </span>
              <div className="text-sm font-black text-slate-900 dark:text-white mt-1">
                {maxGapDay ? `Day ${maxGapDay.dayNum}` : "N/A"}
              </div>
              <div className="text-[11px] text-rose-700 dark:text-rose-300 font-bold mt-0.5">
                {maxGapDay ? `₹${L2(maxGapDay.bGapVal)}L • ${L(maxGapDay.bGapQty, 0)} units` : "0"}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200/60 dark:border-purple-900/40">
              <span className="text-[10px] font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wider block">
                🎯 Best Fill Rate Day
              </span>
              <div className="text-sm font-black text-slate-900 dark:text-white mt-1">
                {bestFrDay ? `Day ${bestFrDay.dayNum}` : "N/A"}
              </div>
              <div className="text-[11px] text-purple-700 dark:text-purple-300 font-bold mt-0.5">
                {bestFrDay ? `${bestFrDay.bFr.toFixed(1)}% FR` : "0%"}
              </div>
            </div>
          </div>

          {/* Interactive Metric Series Toggle Pills */}
          <div className="flex flex-wrap items-center gap-2 pt-1 pb-1 border-y border-slate-100 dark:border-white/5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">
              Toggle Series:
            </span>

            {/* PO Value */}
            <button
              onClick={() => setShowPoVal((v) => !v)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                showPoVal
                  ? "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700 shadow-xs"
                  : "bg-slate-100 dark:bg-white/5 text-slate-400 border border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
              <span>PO Value (₹L)</span>
            </button>

            {/* PO Qty */}
            <button
              onClick={() => setShowPoQty((v) => !v)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                showPoQty
                  ? "bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-700 shadow-xs"
                  : "bg-slate-100 dark:bg-white/5 text-slate-400 border border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              <span className="w-2.5 h-1 border-t-2 border-dashed border-sky-500 inline-block" />
              <span>PO Qty (Units)</span>
            </button>

            {/* GRN Value */}
            <button
              onClick={() => setShowGrnVal((v) => !v)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                showGrnVal
                  ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 shadow-xs"
                  : "bg-slate-100 dark:bg-white/5 text-slate-400 border border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
              <span>GRN Value (₹L)</span>
            </button>

            {/* GRN Qty */}
            <button
              onClick={() => setShowGrnQty((v) => !v)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                showGrnQty
                  ? "bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-300 dark:border-teal-700 shadow-xs"
                  : "bg-slate-100 dark:bg-white/5 text-slate-400 border border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              <span className="w-2.5 h-1 border-t-2 border-dashed border-teal-500 inline-block" />
              <span>GRN Qty (Units)</span>
            </button>

            {/* Gap Value */}
            <button
              onClick={() => setShowGapVal((v) => !v)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                showGapVal
                  ? "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-700 shadow-xs"
                  : "bg-slate-100 dark:bg-white/5 text-slate-400 border border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
              <span>Gap Value (₹L)</span>
            </button>

            {/* Gap Qty */}
            <button
              onClick={() => setShowGapQty((v) => !v)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                showGapQty
                  ? "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 shadow-xs"
                  : "bg-slate-100 dark:bg-white/5 text-slate-400 border border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              <span className="w-2.5 h-1 border-t-2 border-dashed border-amber-500 inline-block" />
              <span>Gap Qty (Units)</span>
            </button>

            {/* Fill Rate % */}
            <button
              onClick={() => setShowFrLine((v) => !v)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                showFrLine
                  ? "bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-700 shadow-xs"
                  : "bg-slate-100 dark:bg-white/5 text-slate-400 border border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" />
              <span>Fill Rate %</span>
            </button>

            {/* Last Month Baseline */}
            <button
              onClick={() => setShowLastMonthBaseline((v) => !v)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                showLastMonthBaseline
                  ? "bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-400 dark:border-slate-600 shadow-xs"
                  : "bg-slate-100 dark:bg-white/5 text-slate-400 border border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              <span className="w-2.5 h-1 border-t-2 border-dashed border-slate-500 inline-block" />
              <span>{monthA} Baseline</span>
            </button>
          </div>

          {/* SVG Interactive Line Chart Container */}
          <div className="relative bg-slate-50/50 dark:bg-[#000824]/60 rounded-2xl p-4 border border-slate-200/80 dark:border-white/5 overflow-hidden">
            {chartPoints.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-slate-400 space-y-2">
                <span className="text-3xl">📭</span>
                <span className="text-xs font-bold">No day trend data available for current filters</span>
              </div>
            ) : (
              <div className="w-full">
                <svg
                  ref={lineChartSvgRef}
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  className="w-full h-auto overflow-visible select-none cursor-crosshair"
                  onMouseMove={handleChartMouseMove}
                  onMouseLeave={() => setHoveredDayIdx(null)}
                >
                  <defs>
                    {/* Gradients */}
                    <linearGradient id="poValGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="grnValGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="gapValGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Grid Lines & Y-Axis Labels */}
                  {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
                    const y = chartPad.top + innerH - pct * innerH;
                    const valLakhs = (pct * maxChartVal).toFixed(1);
                    const qtyUnits = Math.round(pct * maxChartQty);
                    const frPct = Math.round(pct * 100);

                    return (
                      <g key={idx}>
                        <line
                          x1={chartPad.left}
                          y1={y}
                          x2={chartPad.left + innerW}
                          y2={y}
                          stroke="currentColor"
                          className="text-slate-200 dark:text-white/5"
                          strokeDasharray="3 3"
                        />
                        {/* Left Y-Axis: Value (₹ Lakhs) */}
                        <text
                          x={chartPad.left - 10}
                          y={y + 4}
                          textAnchor="end"
                          className="text-[10px] font-bold fill-slate-400 dark:fill-slate-500"
                        >
                          ₹{valLakhs}L
                        </text>

                        {/* Right Y-Axis: Quantity (Units) / FR % */}
                        <text
                          x={chartPad.left + innerW + 10}
                          y={y + 4}
                          textAnchor="start"
                          className="text-[10px] font-bold fill-slate-400 dark:fill-slate-500"
                        >
                          {chartViewMode === "fr" ? `${frPct}%` : `${qtyUnits}`}
                        </text>
                      </g>
                    );
                  })}

                  {/* X-Axis Vertical Day Grid & Labels */}
                  {chartPoints.map((p, idx) => {
                    const isEveryFifth = p.dayNum === 1 || p.dayNum! % 5 === 0 || p.dayNum === 31 || idx === chartPoints.length - 1;
                    return (
                      <g key={p.key}>
                        {isEveryFifth && (
                          <line
                            x1={p.x}
                            y1={chartPad.top}
                            x2={p.x}
                            y2={chartPad.top + innerH}
                            stroke="currentColor"
                            className="text-slate-200/60 dark:text-white/5"
                            strokeDasharray="2 4"
                          />
                        )}
                        {isEveryFifth && (
                          <text
                            x={p.x}
                            y={chartPad.top + innerH + 18}
                            textAnchor="middle"
                            className={`text-[10px] font-bold ${
                              hoveredDayIdx === idx
                                ? "fill-indigo-600 dark:fill-indigo-400 font-black text-xs"
                                : "fill-slate-400 dark:fill-slate-500"
                            }`}
                          >
                            D{p.dayNum}
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {/* Area Under Curves */}
                  {showPoVal && (
                    <path d={makeAreaPath("yPoVal")} fill="url(#poValGrad)" />
                  )}
                  {showGrnVal && (
                    <path d={makeAreaPath("yGrnVal")} fill="url(#grnValGrad)" />
                  )}
                  {showGapVal && (
                    <path d={makeAreaPath("yGapVal")} fill="url(#gapValGrad)" />
                  )}

                  {/* Last Month Baseline Lines */}
                  {showLastMonthBaseline && (
                    <>
                      <path
                        d={makeLinePath("yLastPoVal")}
                        fill="none"
                        stroke="#64748b"
                        strokeWidth="2"
                        strokeDasharray="6 4"
                        opacity="0.7"
                      />
                      <path
                        d={makeLinePath("yLastGrnVal")}
                        fill="none"
                        stroke="#059669"
                        strokeWidth="1.5"
                        strokeDasharray="4 4"
                        opacity="0.6"
                      />
                    </>
                  )}

                  {/* Series Stroke Lines */}
                  {/* 1. PO Value (Solid Blue) */}
                  {showPoVal && (
                    <path
                      d={makeLinePath("yPoVal")}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                  {/* 2. PO Qty (Dashed Sky) */}
                  {showPoQty && (
                    <path
                      d={makeLinePath("yPoQty")}
                      fill="none"
                      stroke="#0284c7"
                      strokeWidth="2"
                      strokeDasharray="5 3"
                      strokeLinecap="round"
                    />
                  )}

                  {/* 3. GRN Value (Solid Emerald) */}
                  {showGrnVal && (
                    <path
                      d={makeLinePath("yGrnVal")}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                  {/* 4. GRN Qty (Dashed Teal) */}
                  {showGrnQty && (
                    <path
                      d={makeLinePath("yGrnQty")}
                      fill="none"
                      stroke="#0d9488"
                      strokeWidth="2"
                      strokeDasharray="5 3"
                      strokeLinecap="round"
                    />
                  )}

                  {/* 5. Gap Value (Solid Rose) */}
                  {showGapVal && (
                    <path
                      d={makeLinePath("yGapVal")}
                      fill="none"
                      stroke="#f43f5e"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                  {/* 6. Gap Qty (Dashed Amber) */}
                  {showGapQty && (
                    <path
                      d={makeLinePath("yGapQty")}
                      fill="none"
                      stroke="#d97706"
                      strokeWidth="2"
                      strokeDasharray="5 3"
                      strokeLinecap="round"
                    />
                  )}

                  {/* 7. Fill Rate % (Solid Purple) */}
                  {showFrLine && (
                    <path
                      d={makeLinePath("yFr")}
                      fill="none"
                      stroke="#8b5cf6"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                  {/* Data Points on Line Chart */}
                  {chartPoints.map((p, idx) => {
                    const isHovered = hoveredDayIdx === idx;
                    return (
                      <g
                        key={p.key}
                        onClick={() =>
                          setFunnelTarget({
                            type: "day",
                            key: `Day ${p.dayNum}`,
                            name: `Day ${p.dayNum} (${p.dateB ? p.dateB.slice(5) : monthB.slice(0, 3)})`,
                            row: p,
                          })
                        }
                        className="cursor-pointer"
                      >
                        {/* Invisible large click target */}
                        <rect
                          x={p.x - 10}
                          y={chartPad.top}
                          width={20}
                          height={innerH}
                          fill="transparent"
                        />

                        {/* PO Value Point */}
                        {showPoVal && (
                          <circle
                            cx={p.x}
                            cy={p.yPoVal}
                            r={isHovered ? 6 : 3}
                            fill="#3b82f6"
                            stroke="#ffffff"
                            strokeWidth={isHovered ? 2.5 : 1}
                            className="transition-all duration-150"
                          />
                        )}

                        {/* GRN Value Point */}
                        {showGrnVal && (
                          <circle
                            cx={p.x}
                            cy={p.yGrnVal}
                            r={isHovered ? 6 : 3}
                            fill="#10b981"
                            stroke="#ffffff"
                            strokeWidth={isHovered ? 2.5 : 1}
                            className="transition-all duration-150"
                          />
                        )}

                        {/* Gap Value Point */}
                        {showGapVal && (
                          <circle
                            cx={p.x}
                            cy={p.yGapVal}
                            r={isHovered ? 6 : 3}
                            fill="#f43f5e"
                            stroke="#ffffff"
                            strokeWidth={isHovered ? 2.5 : 1}
                            className="transition-all duration-150"
                          />
                        )}

                        {/* Fill Rate Point */}
                        {showFrLine && (
                          <circle
                            cx={p.x}
                            cy={p.yFr}
                            r={isHovered ? 6.5 : 3.5}
                            fill="#8b5cf6"
                            stroke="#ffffff"
                            strokeWidth={isHovered ? 2.5 : 1}
                            className="transition-all duration-150"
                          />
                        )}
                      </g>
                    );
                  })}

                  {/* Active Hover Crosshair Line */}
                  {hoveredDayIdx !== null && chartPoints[hoveredDayIdx] && (
                    <g pointerEvents="none">
                      <line
                        x1={chartPoints[hoveredDayIdx].x}
                        y1={chartPad.top}
                        x2={chartPoints[hoveredDayIdx].x}
                        y2={chartPad.top + innerH}
                        stroke="#6366f1"
                        strokeWidth="2"
                        strokeDasharray="4 3"
                      />
                      {/* Pulse Halo on current X */}
                      <circle
                        cx={chartPoints[hoveredDayIdx].x}
                        cy={chartPad.top + innerH}
                        r="4"
                        fill="#6366f1"
                      />
                    </g>
                  )}
                </svg>

                {/* Floating Interactive Day Tooltip Card */}
                {hoveredDayIdx !== null && chartPoints[hoveredDayIdx] && (
                  <div
                    className="mt-3 p-4 rounded-2xl bg-white dark:bg-[#000c30] border-2 border-indigo-500/40 shadow-xl space-y-3 animate-in fade-in zoom-in-95 duration-150"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-black text-xs grid place-items-center">
                          D{chartPoints[hoveredDayIdx].dayNum}
                        </span>
                        <div>
                          <div className="text-xs font-black text-slate-900 dark:text-white">
                            Day {chartPoints[hoveredDayIdx].dayNum} Performance
                          </div>
                          <div className="text-[10px] text-slate-400 font-semibold">
                            Date: {chartPoints[hoveredDayIdx].dateB || `${monthB} Day ${chartPoints[hoveredDayIdx].dayNum}`} • {chartPoints[hoveredDayIdx].poCountB || 0} Orders
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-black ${frPill(chartPoints[hoveredDayIdx].bFr)}`}>
                          {chartPoints[hoveredDayIdx].bFr.toFixed(1)}% FR
                        </span>
                        <button
                          onClick={() =>
                            setFunnelTarget({
                              type: "day",
                              key: `Day ${chartPoints[hoveredDayIdx].dayNum}`,
                              name: `Day ${chartPoints[hoveredDayIdx].dayNum} (${chartPoints[hoveredDayIdx].dateB ? chartPoints[hoveredDayIdx].dateB.slice(5) : monthB.slice(0, 3)})`,
                              row: chartPoints[hoveredDayIdx],
                            })
                          }
                          className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold shadow-xs transition cursor-pointer flex items-center gap-1"
                        >
                          <span>🌪️ Funnel</span>
                        </button>
                      </div>
                    </div>

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      {/* PO Demand */}
                      <div className="p-2.5 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30">
                        <span className="text-[10px] font-bold text-blue-700 dark:text-blue-400 block">
                          📋 PO Demand
                        </span>
                        <div className="text-sm font-black text-blue-700 dark:text-blue-300 mt-0.5">
                          ₹{L2(chartPoints[hoveredDayIdx].bPoVal)}L
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium">
                          {L(chartPoints[hoveredDayIdx].bPoQty, 0)} units
                        </div>
                      </div>

                      {/* GRN Supplied */}
                      <div className="p-2.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
                        <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 block">
                          🚚 GRN Supplied
                        </span>
                        <div className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                          ₹{L2(chartPoints[hoveredDayIdx].bGrnVal)}L
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium">
                          {L(chartPoints[hoveredDayIdx].bGrnQty, 0)} units
                        </div>
                      </div>

                      {/* Unmet Gap */}
                      <div className="p-2.5 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30">
                        <span className="text-[10px] font-bold text-rose-700 dark:text-rose-400 block">
                          ⚠️ Unmet Gap
                        </span>
                        <div className="text-sm font-black text-rose-600 dark:text-rose-400 mt-0.5">
                          ₹{L2(chartPoints[hoveredDayIdx].bGapVal)}L
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium">
                          {L(chartPoints[hoveredDayIdx].bGapQty, 0)} units
                        </div>
                      </div>

                      {/* Last Month MoM Comparison */}
                      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200/60 dark:border-white/5">
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block">
                          📅 {monthA} Comparison
                        </span>
                        <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                          PO ₹{L2(chartPoints[hoveredDayIdx].aPoVal)}L • {chartPoints[hoveredDayIdx].aFr.toFixed(1)}% FR
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                          MoM Δ Gap: ₹{L2(chartPoints[hoveredDayIdx].deltaGapVal)}L
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Daily Quick Summary Scroller */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-500">
              <span>📅 Quick Daily Timeline (Days 1–31)</span>
              <span className="text-[11px] font-normal text-slate-400">Click any day to open detailed Funnel drilldown</span>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 custom-scrollbar">
              {chartDays.map((d) => (
                <button
                  key={d.key}
                  onClick={() =>
                    setFunnelTarget({
                      type: "day",
                      key: `Day ${d.dayNum}`,
                      name: `Day ${d.dayNum} (${d.dateB ? d.dateB.slice(5) : monthB.slice(0, 3)})`,
                      row: d,
                    })
                  }
                  className={`p-2 rounded-xl text-left shrink-0 min-w-[90px] border transition cursor-pointer ${
                    hoveredDayIdx !== null && chartPoints[hoveredDayIdx]?.dayNum === d.dayNum
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 shadow-xs"
                      : "border-slate-200/70 dark:border-white/5 bg-slate-50/70 dark:bg-white/5 hover:border-slate-300 dark:hover:border-white/20"
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-800 dark:text-slate-200">
                    <span>Day {d.dayNum}</span>
                    <span className={`text-[9px] px-1 rounded font-black ${frColor(d.bFr)}`}>
                      {d.bFr.toFixed(0)}%
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    PO: <strong className="text-slate-700 dark:text-slate-300">₹{L2(d.bPoVal)}L</strong>
                  </div>
                  <div className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold">
                    Gap: <strong>₹{L2(d.bGapVal)}L</strong>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB CONTENT: VISUAL ANALYTICS (CARD CHARTS) ── */}
      {(activeTab === "overview" || activeTab === "visuals") && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Visual 1: Top Category Demand & Gap Split */}
          <div className="bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-2">
                <span>📂</span> Top Category Demand & Gap Split
              </h2>
              <span className="text-[11px] font-bold text-slate-400">{monthB}</span>
            </div>
            <div className="space-y-3">
              {topGapCategories.map((c) => {
                const suppliedPct = c.bPoVal > 0 ? (c.bGrnVal / c.bPoVal) * 100 : 0;
                const gapPct = 100 - suppliedPct;
                return (
                  <div
                    key={c.key}
                    onClick={() =>
                      setFunnelTarget({
                        type: "category",
                        key: c.key,
                        name: c.name,
                        row: c,
                      })
                    }
                    className="space-y-1.5 p-2.5 rounded-xl bg-slate-50/70 dark:bg-white/5 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 border border-slate-100 dark:border-white/5 transition cursor-pointer group"
                  >
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-slate-900 dark:text-white font-bold truncate pr-2 group-hover:text-indigo-600 transition" title={c.name}>
                        {c.name}
                      </span>
                      <span className={`text-[11px] px-1.5 py-0.2 rounded font-bold ${frColor(c.bFr)}`}>
                        {c.bFr.toFixed(1)}% FR
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1 text-[11px] pt-0.5">
                      <div>
                        <span className="text-slate-400 text-[10px] block">PO Demand:</span>
                        <strong className="text-slate-800 dark:text-slate-200 font-bold">₹{L2(c.bPoVal)}L</strong>
                        <span className="text-[10px] text-slate-400 block font-normal">{L(c.bPoQty, 0)} qty</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">GRN Supplied:</span>
                        <strong className="text-emerald-600 dark:text-emerald-400 font-bold">₹{L2(c.bGrnVal)}L</strong>
                        <span className="text-[10px] text-slate-400 block font-normal">{L(c.bGrnQty, 0)} qty</span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400 text-[10px] block">Unmet Gap:</span>
                        <strong className="text-rose-600 dark:text-rose-400 font-bold">₹{L2(c.bGapVal)}L</strong>
                        <span className="text-[10px] text-slate-400 block font-normal">{L(c.bGapQty, 0)} qty</span>
                      </div>
                    </div>

                    {/* Proportional Stacked Bar */}
                    <div className="h-2 w-full bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden flex">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(0, suppliedPct))}%` }}
                        title={`Supplied: ${suppliedPct.toFixed(1)}%`}
                      />
                      <div
                        className="h-full bg-rose-500 transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(0, gapPct))}%` }}
                        title={`Gap: ${gapPct.toFixed(1)}%`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Visual 2: Top Deficit SKUs (Highest Gap) */}
          <div className="bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-2">
                <span>📦</span> Top 5 Deficit SKUs (Highest Gap)
              </h2>
              <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400">Unmet Demand</span>
            </div>
            <div className="space-y-2.5">
              {topGapSkus.map((sku, idx) => (
                <div
                  key={sku.key}
                  onClick={() =>
                    setFunnelTarget({
                      type: "sku",
                      key: sku.key,
                      name: sku.name,
                      code: sku.code,
                      category: sku.category,
                      row: sku,
                    })
                  }
                  className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/5 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 border border-slate-100 dark:border-white/5 transition cursor-pointer group space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
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
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate group-hover:text-indigo-600 transition" title={sku.name}>
                          {sku.name}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1">
                          <span>{sku.category}</span>
                        </div>
                      </div>
                    </div>
                    <span className={`text-[11px] px-1.5 py-0.2 rounded font-bold shrink-0 ${frColor(sku.bFr)}`}>
                      {sku.bFr.toFixed(0)}% FR
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1 text-[11px] pt-0.5 border-t border-slate-200/40 dark:border-white/5">
                    <div>
                      <span className="text-slate-400 text-[10px] block">PO Demand</span>
                      <strong className="text-slate-700 dark:text-slate-300 font-bold">₹{L2(sku.bPoVal)}L</strong>
                      <span className="text-[10px] text-slate-400 block font-normal">{L(sku.bPoQty, 0)} qty</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block">GRN Supplied</span>
                      <strong className="text-emerald-600 dark:text-emerald-400 font-bold">₹{L2(sku.bGrnVal)}L</strong>
                      <span className="text-[10px] text-slate-400 block font-normal">{L(sku.bGrnQty, 0)} qty</span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 text-[10px] block">Unmet Gap</span>
                      <strong className="text-rose-600 dark:text-rose-400 font-bold">₹{L2(sku.bGapVal)}L</strong>
                      <span className="text-[10px] text-slate-400 block font-normal">{L(sku.bGapQty, 0)} qty</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Visual 3: Regional Gap & Demand Split */}
          <div className="bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-2">
                <span>🗺️</span> Region-wise Demand & Gap Split
              </h2>
              <span className="text-[11px] font-bold text-slate-400">Share of Total Gap</span>
            </div>
            <div className="space-y-3">
              {regionRows.map((r) => {
                const totalGap = overallMetrics.bGapVal || 1;
                const share = (r.bGapVal / totalGap) * 100;
                return (
                  <div
                    key={r.key}
                    onClick={() =>
                      setFunnelTarget({
                        type: "region",
                        key: r.key,
                        name: r.name,
                        row: r,
                      })
                    }
                    className="space-y-1.5 p-2.5 rounded-xl bg-slate-50/70 dark:bg-white/5 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 border border-slate-100 dark:border-white/5 transition cursor-pointer group"
                  >
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-slate-800 dark:text-slate-200 font-bold group-hover:text-indigo-600 transition">{r.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 font-bold text-[11px]">{share.toFixed(1)}% Gap Share</span>
                        <span className={`text-[11px] font-bold ${frColor(r.bFr)}`}>{r.bFr.toFixed(1)}% FR</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-1 text-[11px]">
                      <div>
                        <span className="text-slate-400 text-[10px] block">PO Demand:</span>
                        <strong className="text-slate-700 dark:text-slate-300 font-bold">₹{L2(r.bPoVal)}L</strong>
                        <span className="text-[10px] text-slate-400 block font-normal">{L(r.bPoQty, 0)} qty</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">GRN Supplied:</span>
                        <strong className="text-emerald-600 dark:text-emerald-400 font-bold">₹{L2(r.bGrnVal)}L</strong>
                        <span className="text-[10px] text-slate-400 block font-normal">{L(r.bGrnQty, 0)} qty</span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400 text-[10px] block">Gap:</span>
                        <strong className="text-rose-600 dark:text-rose-400 font-bold">₹{L2(r.bGapVal)}L</strong>
                        <span className="text-[10px] text-slate-400 block font-normal">{L(r.bGapQty, 0)} qty</span>
                      </div>
                    </div>

                    <div className="h-1.5 w-full bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden flex">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(0, r.bFr))}%` }}
                      />
                      <div
                        className="h-full bg-rose-500 transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(0, 100 - r.bFr))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── TABLE 1: CATEGORY-WISE OPPORTUNITY ── */}
      {(activeTab === "overview" || activeTab === "category") && (
        <div className="bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between p-4 border-b border-slate-200 dark:border-white/10 gap-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">📂</span>
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  Category-wise Opportunity Matrix
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Side-by-side comparison of category demand, fill rate, unfulfilled gap, and potential profit gain.
                </p>
              </div>
            </div>
            <button
              onClick={() => exportToExcel("Category_Opportunity", sortedCategoryRows)}
              className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-xs font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 transition cursor-pointer"
            >
              Export Category Table 📥
            </button>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-white/5 text-[11px] font-bold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-white/10">
                  <th className="py-2.5 px-3 font-bold sticky left-0 bg-slate-50 dark:bg-[#000d38] z-10 min-w-[150px]">
                    Category
                  </th>
                  <th className="py-2.5 px-2 text-center">Funnel</th>
                  {/* Current Month B */}
                  <th className="py-2.5 px-2 text-right bg-indigo-50/40 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200">
                    {monthB} Demand (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-right bg-indigo-50/40 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200">
                    {monthB} Supplied (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-center bg-indigo-50/40 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200">
                    {monthB} FR %
                  </th>
                  <th className="py-2.5 px-2 text-right bg-rose-50/50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-200 font-extrabold">
                    {monthB} Gap (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-right bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 font-black">
                    Profit Gain (₹L)
                  </th>
                  {/* Last Month A */}
                  <th className="py-2.5 px-2 text-right text-slate-500 dark:text-slate-400">
                    {monthA} Demand (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-right text-slate-500 dark:text-slate-400">
                    {monthA} Supplied (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-center text-slate-500 dark:text-slate-400">
                    {monthA} FR %
                  </th>
                  <th className="py-2.5 px-2 text-right text-slate-500 dark:text-slate-400">
                    {monthA} Gap (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-right text-slate-500 dark:text-slate-400">
                    {monthA} Profit (₹L)
                  </th>
                  {/* MoM Variance */}
                  <th className="py-2.5 px-2 text-right text-slate-700 dark:text-slate-200 font-bold">
                    MoM Δ Gap (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-center text-slate-700 dark:text-slate-200 font-bold">
                    MoM Δ FR %
                  </th>
                  <th className="py-2.5 px-3 text-right text-emerald-700 dark:text-emerald-300 font-black">
                    MoM Δ Profit (₹L)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {sortedCategoryRows.map((r) => (
                  <tr key={r.key} className="hover:bg-indigo-50/30 dark:hover:bg-white/5 transition">
                    <td
                      onClick={() =>
                        setFunnelTarget({
                          type: "category",
                          key: r.key,
                          name: r.name,
                          row: r,
                        })
                      }
                      className="py-2 px-3 font-bold text-slate-900 dark:text-slate-100 sticky left-0 bg-white dark:bg-[#000d38] z-10 cursor-pointer hover:text-indigo-600 transition"
                    >
                      {r.name}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <button
                        onClick={() =>
                          setFunnelTarget({
                            type: "category",
                            key: r.key,
                            name: r.name,
                            row: r,
                          })
                        }
                        className="px-2 py-0.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold border border-indigo-200 dark:border-indigo-800 transition cursor-pointer"
                        title={`Open ${r.name} Funnel Breakdown`}
                      >
                        🌪️ Funnel
                      </button>
                    </td>
                    <td className="py-2 px-2 text-right font-semibold">₹{L2(r.bPoVal)}</td>
                    <td className="py-2 px-2 text-right text-slate-700 dark:text-slate-300">₹{L2(r.bGrnVal)}</td>
                    <td className="py-2 px-2 text-center">
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${frPill(r.bFr)}`}>
                        {r.bFr.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right font-bold text-rose-600 dark:text-rose-400">
                      ₹{L2(r.bGapVal)}
                    </td>
                    <td className="py-2 px-2 text-right font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/20">
                      +₹{L2(r.bProfitGain)}
                    </td>
                    <td className="py-2 px-2 text-right text-slate-500">₹{L2(r.aPoVal)}</td>
                    <td className="py-2 px-2 text-right text-slate-500">₹{L2(r.aGrnVal)}</td>
                    <td className="py-2 px-2 text-center text-slate-500 font-semibold">{r.aFr.toFixed(1)}%</td>
                    <td className="py-2 px-2 text-right text-slate-500">₹{L2(r.aGapVal)}</td>
                    <td className="py-2 px-2 text-right text-slate-500">₹{L2(r.aProfitGain)}</td>
                    <td
                      className={`py-2 px-2 text-right font-bold ${
                        r.deltaGapVal <= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {r.deltaGapVal <= 0 ? "📉 " : "📈 +"}₹{L2(Math.abs(r.deltaGapVal))}
                    </td>
                    <td
                      className={`py-2 px-2 text-center font-bold ${
                        r.deltaFR >= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {r.deltaFR >= 0 ? "+" : ""}
                      {r.deltaFR.toFixed(1)}%
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-bold ${
                        r.deltaProfitGain >= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {r.deltaProfitGain >= 0 ? "+" : ""}₹{L2(r.deltaProfitGain)}
                    </td>
                  </tr>
                ))}
                {/* Total Row */}
                <tr className="bg-slate-100/90 dark:bg-white/10 font-black border-t-2 border-slate-300 dark:border-white/20">
                  <td className="py-2.5 px-3 sticky left-0 bg-slate-100 dark:bg-[#000d38] z-10">
                    TOTAL ({sortedCategoryRows.length} Categories)
                  </td>
                  <td className="py-2.5 px-2 text-center">
                    <button
                      onClick={() =>
                        setFunnelTarget({
                          type: "overall",
                          key: "overall",
                          name: "All-India Overall Demand",
                          row: { key: "overall", name: "All-India Overall Demand", ...overallMetrics },
                        })
                      }
                      className="px-2 py-0.5 rounded-lg bg-purple-600 text-white text-[10px] font-bold"
                    >
                      🌪️ Funnel
                    </button>
                  </td>
                  <td className="py-2.5 px-2 text-right">₹{L2(overallMetrics.bPoVal)}</td>
                  <td className="py-2.5 px-2 text-right">₹{L2(overallMetrics.bGrnVal)}</td>
                  <td className="py-2.5 px-2 text-center text-indigo-700 dark:text-indigo-300">
                    {overallMetrics.bFr.toFixed(1)}%
                  </td>
                  <td className="py-2.5 px-2 text-right text-rose-600 dark:text-rose-400">
                    ₹{L2(overallMetrics.bGapVal)}
                  </td>
                  <td className="py-2.5 px-2 text-right text-emerald-600 dark:text-emerald-400 bg-emerald-100/50 dark:bg-emerald-950/40">
                    +₹{L2(overallMetrics.bProfitGain)}
                  </td>
                  <td className="py-2.5 px-2 text-right">₹{L2(overallMetrics.aPoVal)}</td>
                  <td className="py-2.5 px-2 text-right">₹{L2(overallMetrics.aGrnVal)}</td>
                  <td className="py-2.5 px-2 text-center">{overallMetrics.aFr.toFixed(1)}%</td>
                  <td className="py-2.5 px-2 text-right">₹{L2(overallMetrics.aGapVal)}</td>
                  <td className="py-2.5 px-2 text-right">₹{L2(overallMetrics.aProfitGain)}</td>
                  <td
                    className={`py-2.5 px-2 text-right ${
                      overallMetrics.deltaGapVal <= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {overallMetrics.deltaGapVal <= 0 ? "-" : "+"}₹{L2(Math.abs(overallMetrics.deltaGapVal))}
                  </td>
                  <td
                    className={`py-2.5 px-2 text-center ${
                      overallMetrics.deltaFR >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {overallMetrics.deltaFR >= 0 ? "+" : ""}
                    {overallMetrics.deltaFR.toFixed(1)}%
                  </td>
                  <td
                    className={`py-2.5 px-3 text-right ${
                      overallMetrics.deltaProfitGain >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {overallMetrics.deltaProfitGain >= 0 ? "+" : ""}₹{L2(overallMetrics.deltaProfitGain)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TABLE 2: CITY-WISE OPPORTUNITY ── */}
      {(activeTab === "overview" || activeTab === "city") && (
        <div className="bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between p-4 border-b border-slate-200 dark:border-white/10 gap-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🏙️</span>
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  City-wise Opportunity Matrix
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Identify city distribution bottlenecks and recover local demand gaps for maximum profit.
                </p>
              </div>
            </div>
            <button
              onClick={() => exportToExcel("City_Opportunity", sortedCityRows)}
              className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-xs font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 transition cursor-pointer"
            >
              Export City Table 📥
            </button>
          </div>

          <div className="overflow-x-auto max-h-[500px] custom-scrollbar">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="sticky top-0 z-20 shadow-xs">
                <tr className="bg-slate-50 dark:bg-[#000d38] text-[11px] font-bold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-white/10">
                  <th className="py-2.5 px-3 sticky left-0 bg-slate-50 dark:bg-[#000d38] z-30 min-w-[130px]">
                    City
                  </th>
                  <th className="py-2.5 px-2 text-center">Funnel</th>
                  <th className="py-2.5 px-2">Region</th>
                  <th className="py-2.5 px-2 text-right bg-indigo-50/40 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200">
                    {monthB} Demand (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-right bg-indigo-50/40 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200">
                    {monthB} Supplied (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-center bg-indigo-50/40 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200">
                    {monthB} FR %
                  </th>
                  <th className="py-2.5 px-2 text-right bg-rose-50/50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-200 font-extrabold">
                    {monthB} Gap (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-right bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 font-black">
                    Profit Gain (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-right text-slate-500 dark:text-slate-400">
                    {monthA} Demand (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-right text-slate-500 dark:text-slate-400">
                    {monthA} Supplied (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-center text-slate-500 dark:text-slate-400">
                    {monthA} FR %
                  </th>
                  <th className="py-2.5 px-2 text-right text-slate-500 dark:text-slate-400">
                    {monthA} Gap (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-right text-slate-500 dark:text-slate-400">
                    {monthA} Profit (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-right text-slate-700 dark:text-slate-200 font-bold">
                    MoM Δ Gap (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-center text-slate-700 dark:text-slate-200 font-bold">
                    MoM Δ FR %
                  </th>
                  <th className="py-2.5 px-3 text-right text-emerald-700 dark:text-emerald-300 font-black">
                    MoM Δ Profit (₹L)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {sortedCityRows.map((r) => (
                  <tr key={r.key} className="hover:bg-indigo-50/30 dark:hover:bg-white/5 transition">
                    <td
                      onClick={() =>
                        setFunnelTarget({
                          type: "city",
                          key: r.key,
                          name: r.name,
                          region: r.region,
                          row: r,
                        })
                      }
                      className="py-2 px-3 font-bold text-slate-900 dark:text-slate-100 sticky left-0 bg-white dark:bg-[#000d38] z-10 cursor-pointer hover:text-indigo-600 transition"
                    >
                      {r.name}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <button
                        onClick={() =>
                          setFunnelTarget({
                            type: "city",
                            key: r.key,
                            name: r.name,
                            region: r.region,
                            row: r,
                          })
                        }
                        className="px-2 py-0.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold border border-indigo-200 dark:border-indigo-800 transition cursor-pointer"
                        title={`Open ${r.name} Funnel Breakdown`}
                      >
                        🌪️ Funnel
                      </button>
                    </td>
                    <td className="py-2 px-2 text-slate-500">{r.region}</td>
                    <td className="py-2 px-2 text-right font-semibold">₹{L2(r.bPoVal)}</td>
                    <td className="py-2 px-2 text-right text-slate-700 dark:text-slate-300">₹{L2(r.bGrnVal)}</td>
                    <td className="py-2 px-2 text-center">
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${frPill(r.bFr)}`}>
                        {r.bFr.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right font-bold text-rose-600 dark:text-rose-400">
                      ₹{L2(r.bGapVal)}
                    </td>
                    <td className="py-2 px-2 text-right font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/20">
                      +₹{L2(r.bProfitGain)}
                    </td>
                    <td className="py-2 px-2 text-right text-slate-500">₹{L2(r.aPoVal)}</td>
                    <td className="py-2 px-2 text-right text-slate-500">₹{L2(r.aGrnVal)}</td>
                    <td className="py-2 px-2 text-center text-slate-500 font-semibold">{r.aFr.toFixed(1)}%</td>
                    <td className="py-2 px-2 text-right text-slate-500">₹{L2(r.aGapVal)}</td>
                    <td className="py-2 px-2 text-right text-slate-500">₹{L2(r.aProfitGain)}</td>
                    <td
                      className={`py-2 px-2 text-right font-bold ${
                        r.deltaGapVal <= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {r.deltaGapVal <= 0 ? "📉 " : "📈 +"}₹{L2(Math.abs(r.deltaGapVal))}
                    </td>
                    <td
                      className={`py-2 px-2 text-center font-bold ${
                        r.deltaFR >= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {r.deltaFR >= 0 ? "+" : ""}
                      {r.deltaFR.toFixed(1)}%
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-bold ${
                        r.deltaProfitGain >= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {r.deltaProfitGain >= 0 ? "+" : ""}₹{L2(r.deltaProfitGain)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TABLE 3: REGION-WISE OPPORTUNITY ── */}
      {(activeTab === "overview" || activeTab === "region") && (
        <div className="bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between p-4 border-b border-slate-200 dark:border-white/10 gap-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🗺️</span>
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  Region-wise Opportunity Matrix
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Regional summary and allocation of gap volume and incremental profit opportunities.
                </p>
              </div>
            </div>
            <button
              onClick={() => exportToExcel("Region_Opportunity", sortedRegionRows)}
              className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-xs font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 transition cursor-pointer"
            >
              Export Region Table 📥
            </button>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-white/5 text-[11px] font-bold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-white/10">
                  <th className="py-2.5 px-3 font-bold sticky left-0 bg-slate-50 dark:bg-[#000d38] z-10 min-w-[140px]">
                    Region
                  </th>
                  <th className="py-2.5 px-2 text-center">Funnel</th>
                  <th className="py-2.5 px-2 text-right bg-indigo-50/40 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200">
                    {monthB} Demand (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-right bg-indigo-50/40 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200">
                    {monthB} Supplied (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-center bg-indigo-50/40 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200">
                    {monthB} FR %
                  </th>
                  <th className="py-2.5 px-2 text-right bg-rose-50/50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-200 font-extrabold">
                    {monthB} Gap (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-right bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 font-black">
                    Profit Gain (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-right text-slate-500 dark:text-slate-400">
                    {monthA} Demand (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-right text-slate-500 dark:text-slate-400">
                    {monthA} Supplied (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-center text-slate-500 dark:text-slate-400">
                    {monthA} FR %
                  </th>
                  <th className="py-2.5 px-2 text-right text-slate-500 dark:text-slate-400">
                    {monthA} Gap (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-right text-slate-500 dark:text-slate-400">
                    {monthA} Profit (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-right text-slate-700 dark:text-slate-200 font-bold">
                    MoM Δ Gap (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-center text-slate-700 dark:text-slate-200 font-bold">
                    MoM Δ FR %
                  </th>
                  <th className="py-2.5 px-3 text-right text-emerald-700 dark:text-emerald-300 font-black">
                    MoM Δ Profit (₹L)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {sortedRegionRows.map((r) => (
                  <tr key={r.key} className="hover:bg-indigo-50/30 dark:hover:bg-white/5 transition">
                    <td
                      onClick={() =>
                        setFunnelTarget({
                          type: "region",
                          key: r.key,
                          name: r.name,
                          row: r,
                        })
                      }
                      className="py-2 px-3 font-bold text-slate-900 dark:text-slate-100 sticky left-0 bg-white dark:bg-[#000d38] z-10 cursor-pointer hover:text-indigo-600 transition"
                    >
                      {r.name}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <button
                        onClick={() =>
                          setFunnelTarget({
                            type: "region",
                            key: r.key,
                            name: r.name,
                            row: r,
                          })
                        }
                        className="px-2 py-0.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold border border-indigo-200 dark:border-indigo-800 transition cursor-pointer"
                        title={`Open ${r.name} Funnel Breakdown`}
                      >
                        🌪️ Funnel
                      </button>
                    </td>
                    <td className="py-2 px-2 text-right font-semibold">₹{L2(r.bPoVal)}</td>
                    <td className="py-2 px-2 text-right text-slate-700 dark:text-slate-300">₹{L2(r.bGrnVal)}</td>
                    <td className="py-2 px-2 text-center">
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${frPill(r.bFr)}`}>
                        {r.bFr.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right font-bold text-rose-600 dark:text-rose-400">
                      ₹{L2(r.bGapVal)}
                    </td>
                    <td className="py-2 px-2 text-right font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/20">
                      +₹{L2(r.bProfitGain)}
                    </td>
                    <td className="py-2 px-2 text-right text-slate-500">₹{L2(r.aPoVal)}</td>
                    <td className="py-2 px-2 text-right text-slate-500">₹{L2(r.aGrnVal)}</td>
                    <td className="py-2 px-2 text-center text-slate-500 font-semibold">{r.aFr.toFixed(1)}%</td>
                    <td className="py-2 px-2 text-right text-slate-500">₹{L2(r.aGapVal)}</td>
                    <td className="py-2 px-2 text-right text-slate-500">₹{L2(r.aProfitGain)}</td>
                    <td
                      className={`py-2 px-2 text-right font-bold ${
                        r.deltaGapVal <= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {r.deltaGapVal <= 0 ? "📉 " : "📈 +"}₹{L2(Math.abs(r.deltaGapVal))}
                    </td>
                    <td
                      className={`py-2 px-2 text-center font-bold ${
                        r.deltaFR >= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {r.deltaFR >= 0 ? "+" : ""}
                      {r.deltaFR.toFixed(1)}%
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-bold ${
                        r.deltaProfitGain >= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {r.deltaProfitGain >= 0 ? "+" : ""}₹{L2(r.deltaProfitGain)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TABLE 4: SKU-WISE OPPORTUNITY ── */}
      {(activeTab === "overview" || activeTab === "sku") && (
        <div className="bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between p-4 border-b border-slate-200 dark:border-white/10 gap-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">📦</span>
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  SKU-wise Opportunity Matrix ({sortedSkuRows.length} SKUs)
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Granular SKU level analysis with thumbnail popups, quantity gaps, and side-by-side MoM recovery metrics.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => exportToExcel("SKU_Opportunity", sortedSkuRows)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-xs font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 transition cursor-pointer"
              >
                Export SKU Table 📥
              </button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="sticky top-0 z-20 shadow-xs">
                <tr className="bg-slate-50 dark:bg-[#000d38] text-[11px] font-bold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-white/10">
                  <th className="py-2.5 px-3 sticky left-0 bg-slate-50 dark:bg-[#000d38] z-30 min-w-[220px]">
                    SKU Name & Code
                  </th>
                  <th className="py-2.5 px-2 text-center">Funnel</th>
                  <th className="py-2.5 px-2">Category</th>
                  <th className="py-2.5 px-2 text-right">PO Qty</th>
                  <th className="py-2.5 px-2 text-right">GRN Qty</th>
                  <th className="py-2.5 px-2 text-right text-rose-600">Gap Qty</th>
                  <th className="py-2.5 px-2 text-right bg-indigo-50/40 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200">
                    {monthB} Demand (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-right bg-indigo-50/40 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200">
                    {monthB} Supplied (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-center bg-indigo-50/40 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200">
                    {monthB} FR %
                  </th>
                  <th className="py-2.5 px-2 text-right bg-rose-50/50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-200 font-extrabold">
                    {monthB} Gap (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-right bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 font-black">
                    Profit Gain (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-right text-slate-500 dark:text-slate-400">
                    {monthA} Demand (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-right text-slate-500 dark:text-slate-400">
                    {monthA} Supplied (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-center text-slate-500 dark:text-slate-400">
                    {monthA} FR %
                  </th>
                  <th className="py-2.5 px-2 text-right text-slate-500 dark:text-slate-400">
                    {monthA} Gap (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-right text-slate-700 dark:text-slate-200 font-bold">
                    MoM Δ Gap (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-center text-slate-700 dark:text-slate-200 font-bold">
                    MoM Δ FR %
                  </th>
                  <th className="py-2.5 px-3 text-right text-emerald-700 dark:text-emerald-300 font-black">
                    MoM Δ Profit (₹L)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {paginatedSkuRows.map((r) => (
                  <tr
                    key={r.key}
                    className="hover:bg-indigo-50/40 dark:hover:bg-white/5 transition group"
                  >
                    <td className="py-2 px-3 sticky left-0 bg-white dark:bg-[#000d38] z-10">
                      <div className="flex items-center gap-2">
                        <div
                          onClick={() => openSkuLightbox(r)}
                          className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-white/10 border border-slate-200 dark:border-white/10 grid place-items-center shrink-0 overflow-hidden group-hover:scale-105 transition cursor-pointer"
                        >
                          {r.icon ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.icon} alt="" className="max-w-full max-h-full object-contain" />
                          ) : (
                            <span className="text-xs">🥛</span>
                          )}
                        </div>
                        <div
                          onClick={() =>
                            setFunnelTarget({
                              type: "sku",
                              key: r.key,
                              name: r.name,
                              code: r.code,
                              category: r.category,
                              row: r,
                            })
                          }
                          className="min-w-0 cursor-pointer"
                        >
                          <div className="font-bold text-slate-900 dark:text-slate-100 truncate group-hover:text-indigo-600 transition" title={r.name}>
                            {r.name}
                          </div>
                          {r.code && <div className="text-[10px] text-slate-400 font-mono">{r.code}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center">
                      <button
                        onClick={() =>
                          setFunnelTarget({
                            type: "sku",
                            key: r.key,
                            name: r.name,
                            code: r.code,
                            category: r.category,
                            row: r,
                          })
                        }
                        className="px-2 py-0.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold border border-indigo-200 dark:border-indigo-800 transition cursor-pointer"
                        title={`Open ${r.name} Funnel Breakdown`}
                      >
                        🌪️ Funnel
                      </button>
                    </td>
                    <td className="py-2 px-2 text-slate-500">{r.category}</td>
                    <td className="py-2 px-2 text-right font-medium">{L(r.bPoQty, 0)}</td>
                    <td className="py-2 px-2 text-right text-slate-600 dark:text-slate-400">{L(r.bGrnQty, 0)}</td>
                    <td className="py-2 px-2 text-right font-bold text-rose-500">{L(r.bGapQty, 0)}</td>
                    <td className="py-2 px-2 text-right font-semibold">₹{L2(r.bPoVal)}</td>
                    <td className="py-2 px-2 text-right text-slate-700 dark:text-slate-300">₹{L2(r.bGrnVal)}</td>
                    <td className="py-2 px-2 text-center">
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${frPill(r.bFr)}`}>
                        {r.bFr.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right font-bold text-rose-600 dark:text-rose-400">
                      ₹{L2(r.bGapVal)}
                    </td>
                    <td className="py-2 px-2 text-right font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/20">
                      +₹{L2(r.bProfitGain)}
                    </td>
                    <td className="py-2 px-2 text-right text-slate-500">₹{L2(r.aPoVal)}</td>
                    <td className="py-2 px-2 text-right text-slate-500">₹{L2(r.aGrnVal)}</td>
                    <td className="py-2 px-2 text-center text-slate-500 font-semibold">{r.aFr.toFixed(1)}%</td>
                    <td className="py-2 px-2 text-right text-slate-500">₹{L2(r.aGapVal)}</td>
                    <td
                      className={`py-2 px-2 text-right font-bold ${
                        r.deltaGapVal <= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {r.deltaGapVal <= 0 ? "📉 " : "📈 +"}₹{L2(Math.abs(r.deltaGapVal))}
                    </td>
                    <td
                      className={`py-2 px-2 text-center font-bold ${
                        r.deltaFR >= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {r.deltaFR >= 0 ? "+" : ""}
                      {r.deltaFR.toFixed(1)}%
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-bold ${
                        r.deltaProfitGain >= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {r.deltaProfitGain >= 0 ? "+" : ""}₹{L2(r.deltaProfitGain)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* SKU Pagination Footer */}
          <div className="flex flex-wrap items-center justify-between p-3 border-t border-slate-200 dark:border-white/10 text-xs text-slate-500 bg-slate-50/50 dark:bg-white/5">
            <div className="flex items-center gap-2">
              <span>Showing {((skuPage - 1) * skuPageSize) + 1}–{Math.min(skuPage * skuPageSize, sortedSkuRows.length)} of {sortedSkuRows.length} SKUs</span>
              <select
                value={skuPageSize}
                onChange={(e) => {
                  setSkuPageSize(+e.target.value);
                  setSkuPage(1);
                }}
                className="bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1 text-xs"
              >
                <option value="15">15 per page</option>
                <option value="25">25 per page</option>
                <option value="50">50 per page</option>
                <option value="100">100 per page</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setSkuPage((p) => Math.max(1, p - 1))}
                disabled={skuPage <= 1}
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 font-bold disabled:opacity-40"
              >
                Previous
              </button>
              <span className="px-2 font-bold text-slate-700 dark:text-slate-300">
                Page {skuPage} of {totalSkuPages}
              </span>
              <button
                onClick={() => setSkuPage((p) => Math.min(totalSkuPages, p + 1))}
                disabled={skuPage >= totalSkuPages}
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 font-bold disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TABLE 5: DAY-WISE OPPORTUNITY ── */}
      {(activeTab === "overview" || activeTab === "day") && (
        <div className="bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between p-4 border-b border-slate-200 dark:border-white/10 gap-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">📅</span>
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  Day-wise Opportunity & Gap Progression (Daily MoM Comparison)
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Track day-by-day gap generation and profit recovery potential compared to the same day last month.
                </p>
              </div>
            </div>
            <button
              onClick={() => exportToExcel("Day_Wise_Opportunity", sortedDayRows)}
              className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-xs font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 transition cursor-pointer"
            >
              Export Day-wise Table 📥
            </button>
          </div>

          <div className="overflow-x-auto max-h-[550px] custom-scrollbar">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="sticky top-0 z-20 shadow-xs">
                <tr className="bg-slate-50 dark:bg-[#000d38] text-[11px] font-bold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-white/10">
                  <th className="py-2.5 px-3 sticky left-0 bg-slate-50 dark:bg-[#000d38] z-30 min-w-[120px]">
                    Day of Month
                  </th>
                  <th className="py-2.5 px-2 text-center">Funnel</th>
                  <th className="py-2.5 px-2">Date ({monthB})</th>
                  <th className="py-2.5 px-2 text-right">PO Count</th>
                  <th className="py-2.5 px-2 text-right bg-indigo-50/40 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200">
                    {monthB} Demand (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-right bg-indigo-50/40 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200">
                    {monthB} Supplied (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-center bg-indigo-50/40 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200">
                    {monthB} FR %
                  </th>
                  <th className="py-2.5 px-2 text-right bg-rose-50/50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-200 font-extrabold">
                    {monthB} Daily Gap (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-right bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 font-black">
                    Profit Gain (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-right text-slate-500 dark:text-slate-400">
                    {monthA} Demand (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-right text-slate-500 dark:text-slate-400">
                    {monthA} Supplied (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-center text-slate-500 dark:text-slate-400">
                    {monthA} FR %
                  </th>
                  <th className="py-2.5 px-2 text-right text-slate-500 dark:text-slate-400">
                    {monthA} Gap (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-right text-slate-700 dark:text-slate-200 font-bold">
                    MoM Δ Gap (₹L)
                  </th>
                  <th className="py-2.5 px-2 text-center text-slate-700 dark:text-slate-200 font-bold">
                    MoM Δ FR %
                  </th>
                  <th className="py-2.5 px-3 text-right text-emerald-700 dark:text-emerald-300 font-black">
                    MoM Δ Profit (₹L)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {sortedDayRows.map((r) => (
                  <tr key={r.key} className="hover:bg-indigo-50/30 dark:hover:bg-white/5 transition">
                    <td
                      onClick={() =>
                        setFunnelTarget({
                          type: "day",
                          key: `Day ${r.dayNum}`,
                          name: `Day ${r.dayNum} (${r.dateB ? r.dateB.slice(5) : monthB.slice(0, 3)})`,
                          row: r,
                        })
                      }
                      className="py-2 px-3 font-bold text-slate-900 dark:text-slate-100 sticky left-0 bg-white dark:bg-[#000d38] z-10 cursor-pointer hover:text-indigo-600 transition"
                    >
                      Day {r.dayNum}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <button
                        onClick={() =>
                          setFunnelTarget({
                            type: "day",
                            key: `Day ${r.dayNum}`,
                            name: `Day ${r.dayNum} (${r.dateB ? r.dateB.slice(5) : monthB.slice(0, 3)})`,
                            row: r,
                          })
                        }
                        className="px-2 py-0.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold border border-indigo-200 dark:border-indigo-800 transition cursor-pointer"
                        title={`Open Day ${r.dayNum} Funnel Breakdown`}
                      >
                        🌪️ Funnel
                      </button>
                    </td>
                    <td className="py-2 px-2 text-slate-500 font-mono text-[11px]">{r.dateB || "—"}</td>
                    <td className="py-2 px-2 text-right font-medium">{r.poCountB || 0}</td>
                    <td className="py-2 px-2 text-right font-semibold">₹{L2(r.bPoVal)}</td>
                    <td className="py-2 px-2 text-right text-slate-700 dark:text-slate-300">₹{L2(r.bGrnVal)}</td>
                    <td className="py-2 px-2 text-center">
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${frPill(r.bFr)}`}>
                        {r.bFr.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right font-bold text-rose-600 dark:text-rose-400">
                      ₹{L2(r.bGapVal)}
                    </td>
                    <td className="py-2 px-2 text-right font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/20">
                      +₹{L2(r.bProfitGain)}
                    </td>
                    <td className="py-2 px-2 text-right text-slate-500">₹{L2(r.aPoVal)}</td>
                    <td className="py-2 px-2 text-right text-slate-500">₹{L2(r.aGrnVal)}</td>
                    <td className="py-2 px-2 text-center text-slate-500 font-semibold">{r.aFr.toFixed(1)}%</td>
                    <td className="py-2 px-2 text-right text-slate-500">₹{L2(r.aGapVal)}</td>
                    <td
                      className={`py-2 px-2 text-right font-bold ${
                        r.deltaGapVal <= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {r.deltaGapVal <= 0 ? "📉 " : "📈 +"}₹{L2(Math.abs(r.deltaGapVal))}
                    </td>
                    <td
                      className={`py-2 px-2 text-center font-bold ${
                        r.deltaFR >= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {r.deltaFR >= 0 ? "+" : ""}
                      {r.deltaFR.toFixed(1)}%
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-bold ${
                        r.deltaProfitGain >= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {r.deltaProfitGain >= 0 ? "+" : ""}₹{L2(r.deltaProfitGain)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── INTERACTIVE OPPORTUNITY FUNNEL MODAL ── */}
      {funnelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/15 rounded-3xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-white/5">
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-xl bg-purple-600 text-white text-lg">🌪️</span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base md:text-lg font-black text-slate-900 dark:text-white">
                      Demand & Fulfillment Funnel Breakdown
                    </h2>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200 border border-purple-200 dark:border-purple-800">
                      {funnelTarget.type}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                    {funnelTarget.name} {funnelTarget.code && `(${funnelTarget.code})`} • {monthB} vs {monthA}
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

            {/* Modal Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-6 custom-scrollbar">
              {/* Top Row: 4-Stage Visual Funnel */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <span>🔻</span> 4-Stage Demand & Fulfillment Funnel
                  </h3>
                  <span className="text-xs text-slate-400 font-semibold">
                    Target FR Goal: <strong className="text-purple-600">{targetFillRatePct}%</strong>
                  </span>
                </div>

                {/* Funnel Visual Stages Container */}
                <div className="space-y-2.5 max-w-2xl mx-auto py-2">
                  {/* Stage 1: Gross Demand */}
                  <div className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-3.5 text-white shadow-md text-center">
                    <div className="text-[10px] uppercase font-bold tracking-widest text-blue-100">
                      Stage 1 • Gross PO Demand (100%)
                    </div>
                    <div className="text-2xl font-black mt-0.5">
                      ₹{L2(funnelTarget.row.bPoVal)} Lakhs
                    </div>
                    <div className="text-[11px] text-blue-100">
                      Total Ordered: {L(funnelTarget.row.bPoQty, 0)} Units (Baseline 100% Demand)
                    </div>
                  </div>

                  {/* Connector 1 */}
                  <div className="flex items-center justify-between px-8 text-[11px] font-bold text-slate-500">
                    <span className="flex items-center gap-1">
                      ↓ <span className={frColor(funnelTarget.row.bFr)}>{funnelTarget.row.bFr.toFixed(1)}% Supplied</span>
                    </span>
                    <span className="text-rose-500">
                      {(100 - funnelTarget.row.bFr).toFixed(1)}% Unfulfilled Drop-off
                    </span>
                  </div>

                  {/* Stage 2: Supplied */}
                  <div
                    className="mx-auto bg-gradient-to-r from-teal-500 to-emerald-600 rounded-2xl p-3 text-white shadow-md text-center transition-all duration-300"
                    style={{ width: `${Math.max(65, Math.min(95, funnelTarget.row.bFr))}%` }}
                  >
                    <div className="text-[10px] uppercase font-bold tracking-widest text-emerald-100">
                      Stage 2 • Supplied & Accepted (GRN)
                    </div>
                    <div className="text-xl font-black mt-0.5">
                      ₹{L2(funnelTarget.row.bGrnVal)} Lakhs
                    </div>
                    <div className="text-[11px] text-emerald-100">
                      Delivered: {L(funnelTarget.row.bGrnQty, 0)} Units ({funnelTarget.row.bFr.toFixed(1)}% FR)
                    </div>
                  </div>

                  {/* Connector 2 */}
                  <div className="flex items-center justify-between px-12 text-[11px] font-bold text-slate-500">
                    <span>↓ Unfulfilled Gap Extraction</span>
                    <span className="text-rose-600 font-extrabold">
                      ₹{L2(funnelTarget.row.bGapVal)} L Lost Demand
                    </span>
                  </div>

                  {/* Stage 3: Unfulfilled Gap */}
                  <div
                    className="mx-auto bg-gradient-to-r from-rose-500 to-pink-600 rounded-2xl p-3 text-white shadow-md text-center transition-all duration-300"
                    style={{ width: `${Math.max(50, Math.min(85, ((funnelTarget.row.bGapVal / (funnelTarget.row.bPoVal || 1)) * 100) + 30))}%` }}
                  >
                    <div className="text-[10px] uppercase font-bold tracking-widest text-rose-100">
                      Stage 3 • Unfulfilled Demand Gap (Shortage)
                    </div>
                    <div className="text-xl font-black mt-0.5">
                      ₹{L2(funnelTarget.row.bGapVal)} Lakhs
                    </div>
                    <div className="text-[11px] text-rose-100">
                      Shortage: {L(funnelTarget.row.bGapQty, 0)} Units ({((funnelTarget.row.bGapVal / (funnelTarget.row.bPoVal || 1)) * 100).toFixed(1)}% of Demand)
                    </div>
                  </div>

                  {/* Connector 3 */}
                  <div className="flex items-center justify-between px-16 text-[11px] font-bold text-slate-500">
                    <span>↓ Target Fill Rate Filter ({targetFillRatePct}%)</span>
                    <span className="text-purple-600 font-extrabold">
                      Recoverable: ₹{L2(funnelTarget.row.bRecoverableVal)} L
                    </span>
                  </div>

                  {/* Stage 4: Recoverable Revenue */}
                  <div
                    className="mx-auto bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-3.5 text-white shadow-md text-center transition-all duration-300"
                    style={{ width: `${Math.max(40, Math.min(75, ((funnelTarget.row.bRecoverableVal / (funnelTarget.row.bPoVal || 1)) * 100) + 20))}%` }}
                  >
                    <div className="text-[10px] uppercase font-bold tracking-widest text-purple-100">
                      Stage 4 • Target Recoverable Demand / Opportunity
                    </div>
                    <div className="text-2xl font-black mt-0.5">
                      ₹{L2(funnelTarget.row.bRecoverableVal)} Lakhs
                    </div>
                    <div className="text-[11px] text-purple-100">
                      Bridgeable Pipeline to Reach {targetFillRatePct}% Target Fill Rate
                    </div>
                  </div>
                </div>
              </div>

              {/* Stage Metrics Comparison Table */}
              <div className="bg-slate-50 dark:bg-white/5 rounded-2xl p-4 border border-slate-200 dark:border-white/10 space-y-2">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Side-by-Side Funnel Conversion Stages ({monthB} vs {monthA})
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-white/10 text-slate-500 font-bold">
                        <th className="py-2">Funnel Stage</th>
                        <th className="py-2 text-right">{monthB} (Current)</th>
                        <th className="py-2 text-right">{monthA} (Baseline)</th>
                        <th className="py-2 text-right">MoM Variance (Δ)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/60 dark:divide-white/5">
                      <tr>
                        <td className="py-2 font-semibold">Stage 1: Gross PO Demand</td>
                        <td className="py-2 text-right font-bold">₹{L2(funnelTarget.row.bPoVal)} L <span className="text-[10px] text-slate-400 font-normal">({L(funnelTarget.row.bPoQty, 0)} Qty)</span></td>
                        <td className="py-2 text-right text-slate-500">₹{L2(funnelTarget.row.aPoVal)} L <span className="text-[10px] text-slate-400 font-normal">({L(funnelTarget.row.aPoQty, 0)} Qty)</span></td>
                        <td className="py-2 text-right font-bold text-indigo-600">
                          {funnelTarget.row.bPoVal >= funnelTarget.row.aPoVal ? "+" : ""}
                          ₹{L2(funnelTarget.row.bPoVal - funnelTarget.row.aPoVal)} L
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 font-semibold">Stage 2: Supplied GRN</td>
                        <td className="py-2 text-right font-bold text-emerald-600">₹{L2(funnelTarget.row.bGrnVal)} L <span className="text-[10px] text-slate-400 font-normal">({L(funnelTarget.row.bGrnQty, 0)} Qty)</span></td>
                        <td className="py-2 text-right text-slate-500">₹{L2(funnelTarget.row.aGrnVal)} L <span className="text-[10px] text-slate-400 font-normal">({L(funnelTarget.row.aGrnQty, 0)} Qty)</span></td>
                        <td className={`py-2 text-right font-bold ${funnelTarget.row.deltaFR >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          {funnelTarget.row.deltaFR >= 0 ? "+" : ""}{funnelTarget.row.deltaFR.toFixed(1)}% FR
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 font-semibold">Stage 3: Unfulfilled Gap</td>
                        <td className="py-2 text-right font-bold text-rose-600">₹{L2(funnelTarget.row.bGapVal)} L <span className="text-[10px] text-slate-400 font-normal">({L(funnelTarget.row.bGapQty, 0)} Qty)</span></td>
                        <td className="py-2 text-right text-slate-500">₹{L2(funnelTarget.row.aGapVal)} L <span className="text-[10px] text-slate-400 font-normal">({L(funnelTarget.row.aGapQty, 0)} Qty)</span></td>
                        <td className={`py-2 text-right font-bold ${funnelTarget.row.deltaGapVal <= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          {funnelTarget.row.deltaGapVal <= 0 ? "📉 " : "📈 +"}₹{L2(Math.abs(funnelTarget.row.deltaGapVal))} L
                        </td>
                      </tr>
                      <tr className="bg-purple-500/10 font-bold">
                        <td className="py-2 text-purple-700 dark:text-purple-300">Stage 4: Target Recoverable Demand ({targetFillRatePct}% FR)</td>
                        <td className="py-2 text-right text-purple-600 dark:text-purple-400 font-black">₹{L2(funnelTarget.row.bRecoverableVal)} L</td>
                        <td className="py-2 text-right text-slate-500">₹{L2(funnelTarget.row.aRecoverableVal)} L</td>
                        <td className="py-2 text-right font-black text-purple-600">
                          {funnelTarget.row.bRecoverableVal >= funnelTarget.row.aRecoverableVal ? "+" : ""}
                          ₹{L2(funnelTarget.row.bRecoverableVal - funnelTarget.row.aRecoverableVal)} L
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Contextual Drill-Down Cards */}
              {funnelDrillDown && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Top SKUs Contributing to Gap */}
                  {funnelDrillDown.topSkus.length > 0 && (
                    <div className="bg-slate-50 dark:bg-white/5 rounded-2xl p-4 border border-slate-200 dark:border-white/10 space-y-3">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                        <span>📦 Top Gaps by SKU</span>
                        <span className="text-slate-400">Demand Deficit</span>
                      </div>
                      <div className="space-y-2">
                        {funnelDrillDown.topSkus.map((sku) => (
                          <div key={sku.name} className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-white dark:bg-white/5 border border-slate-200/60 dark:border-white/5">
                            <div className="min-w-0 pr-2">
                              <div className="font-bold text-slate-800 dark:text-slate-200 truncate">{sku.name}</div>
                              <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                                <span>{sku.category}</span>
                                <span>•</span>
                                <span className={frColor(sku.fr)}>{sku.fr.toFixed(0)}% FR</span>
                                <span>•</span>
                                <span>PO: ₹{L2(sku.poVal)}L</span>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-black text-rose-600 dark:text-rose-400">₹{L2(sku.gapVal)}L Gap</div>
                              <div className="text-[10px] text-slate-400 font-semibold">{L(sku.gapQty, 0)} units lost</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Top Cities Contributing to Gap */}
                  {funnelDrillDown.topCities.length > 0 && (
                    <div className="bg-slate-50 dark:bg-white/5 rounded-2xl p-4 border border-slate-200 dark:border-white/10 space-y-3">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                        <span>🏙️ Top Gaps by City</span>
                        <span className="text-slate-400">Demand Deficit</span>
                      </div>
                      <div className="space-y-2">
                        {funnelDrillDown.topCities.map((city) => (
                          <div key={city.city} className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-white dark:bg-white/5 border border-slate-200/60 dark:border-white/5">
                            <div className="min-w-0 pr-2">
                              <div className="font-bold text-slate-800 dark:text-slate-200 truncate">{city.city}</div>
                              <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                                <span>{city.region}</span>
                                <span>•</span>
                                <span className={frColor(city.fr)}>{city.fr.toFixed(0)}% FR</span>
                                <span>•</span>
                                <span>PO: ₹{L2(city.poVal)}L</span>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-black text-rose-600 dark:text-rose-400">₹{L2(city.gapVal)}L Gap</div>
                              <div className="text-[10px] text-slate-400 font-semibold">{L(city.gapQty, 0)} units lost</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-xs">
              <span className="text-slate-500">
                Target Fulfillment Goal: <strong className="text-purple-600 font-bold">{targetFillRatePct}% Target Fill Rate</strong>
              </span>
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

      {/* ── SKU IMAGE LIGHTBOX POPUP ── */}
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
