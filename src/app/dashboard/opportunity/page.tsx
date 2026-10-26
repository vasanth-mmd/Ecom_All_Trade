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

type TabKey = "overview" | "citysku" | "sku" | "city" | "citytrend" | "category" | "region" | "linechart" | "day" | "visuals";

const CITY_PALETTE = [
  "#6366f1", // Indigo
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#f43f5e", // Rose
  "#06b6d4", // Cyan
  "#a855f7", // Purple
  "#f97316", // Orange
  "#ec4899", // Pink
];

type SkuPopupState = {
  icon: string | null;
  name: string;
  stats: SkuStat[];
} | null;

export interface OpportunityRow {
  key: string;
  name: string;
  code?: string;
  category?: string;
  icon?: string | null;
  region?: string;
  city?: string;
  depot?: string;
  severity?: "zero" | "severe" | "moderate" | "healthy";
  poQty: number;
  grnQty: number;
  poVal: number;
  grnVal: number;
  fr: number;
  gapQty: number;
  gapVal: number;
  poCount?: number;
  date?: string;
  dayNum?: number;
}

type FunnelTarget = {
  type: "category" | "city" | "region" | "sku" | "citysku" | "day" | "overall";
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

  // Single Selected Month
  const [selectedMonth, setSelectedMonth] = useState<string>("");

  // Synced Day Range (1..31)
  const [dayFrom, setDayFrom] = useState<number>(1);
  const [dayTo, setDayTo] = useState<number>(31);
  const [activePreset, setActivePreset] = useState<string>("full");

  // Dimension Filters
  const [selTrades, setSelTrades] = useState<string[]>([]);
  const [selRegions, setSelRegions] = useState<string[]>([]);
  const [selCities, setSelCities] = useState<string[]>([]);
  const [selCategories, setSelCategories] = useState<string[]>([]);
  const [selStatuses, setSelStatuses] = useState<string[]>([]);
  const [globalSearch, setGlobalSearch] = useState("");
  const [skuFilterType, setSkuFilterType] = useState<"all" | "zero-supply" | "severe-gap">("all");

  // Multi-select open state
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Lightbox SKU Popup
  const [skuPopup, setSkuPopup] = useState<SkuPopupState>(null);

  // Funnel Drill-down Modal State
  const [funnelTarget, setFunnelTarget] = useState<FunnelTarget>(null);

  // Sorting per table
  const [sortCategory, setSortCategory] = useState<{ col: keyof OpportunityRow; dir: 1 | -1 }>({
    col: "gapVal",
    dir: -1,
  });
  const [sortCity, setSortCity] = useState<{ col: keyof OpportunityRow; dir: 1 | -1 }>({
    col: "gapVal",
    dir: -1,
  });
  const [sortRegion, setSortRegion] = useState<{ col: keyof OpportunityRow; dir: 1 | -1 }>({
    col: "gapVal",
    dir: -1,
  });
  const [sortSku, setSortSku] = useState<{ col: keyof OpportunityRow; dir: 1 | -1 }>({
    col: "gapVal",
    dir: -1,
  });
  const [sortCitySku, setSortCitySku] = useState<{ col: keyof OpportunityRow; dir: 1 | -1 }>({
    col: "gapVal",
    dir: -1,
  });
  const [sortDay, setSortDay] = useState<{ col: keyof OpportunityRow; dir: 1 | -1 }>({
    col: "dayNum",
    dir: 1,
  });

  // City & SKU specific state
  const [citySkuPage, setCitySkuPage] = useState<number>(1);
  const [citySkuPageSize, setCitySkuPageSize] = useState<number>(25);
  const [citySkuLossFilter, setCitySkuLossFilter] = useState<"all" | "gaps-only" | "zero-supply" | "severe-gap">("gaps-only");
  const [citySkuSearch, setCitySkuSearch] = useState<string>("");

  // Multi-Metric Line Chart State
  const [chartViewMode, setChartViewMode] = useState<"all" | "value" | "qty" | "fr">("all");
  const [showPoVal, setShowPoVal] = useState<boolean>(true);
  const [showGrnVal, setShowGrnVal] = useState<boolean>(true);
  const [showGapVal, setShowGapVal] = useState<boolean>(true);
  const [showPoQty, setShowPoQty] = useState<boolean>(true);
  const [showGrnQty, setShowGrnQty] = useState<boolean>(true);
  const [showGapQty, setShowGapQty] = useState<boolean>(true);
  const [showFrLine, setShowFrLine] = useState<boolean>(true);
  const [hoveredDayIdx, setHoveredDayIdx] = useState<number | null>(null);
  const [chartMousePos, setChartMousePos] = useState<{ x: number; y: number } | null>(null);
  const lineChartSvgRef = useRef<SVGSVGElement | null>(null);

  // City-Wise Trend Specific State
  const [selectedTrendCity, setSelectedTrendCity] = useState<string>("");
  const [cityTrendViewMode, setCityTrendViewMode] = useState<"all" | "value" | "fr" | "compare">("all");
  const [compareCities, setCompareCities] = useState<string[]>([]);
  const [hoveredCityDayIdx, setHoveredCityDayIdx] = useState<number | null>(null);
  const [cityChartMousePos, setCityChartMousePos] = useState<{ x: number; y: number } | null>(null);
  const cityLineChartSvgRef = useRef<SVGSVGElement | null>(null);
  const [citySearchTerm, setCitySearchTerm] = useState<string>("");

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
          setSelectedMonth(mList[mList.length - 1]); // Latest month default
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

  /* ── Helper to calculate Opportunity Gap ── */
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

  /* ── Aggregated Data Collections ── */

  // 1. Overall Summary Totals
  const overallMetrics = useMemo(() => {
    if (!d || !selectedMonth) {
      return {
        poVal: 0,
        grnVal: 0,
        poQty: 0,
        grnQty: 0,
        ...computeOpportunity(0, 0, 0, 0),
        poCount: 0,
      };
    }

    let poVal = 0,
      grnVal = 0,
      poQty = 0,
      grnQty = 0,
      poCount = 0;

    for (const r of d.rows) {
      const mName = d.dims.month[r[0]];
      if (mName === selectedMonth && rowMatchesFilters(r, true)) {
        poQty += r[7];
        poVal += r[8];
        grnQty += r[9];
        grnVal += r[10];
        poCount++;
      }
    }

    const opp = computeOpportunity(poVal, grnVal, poQty, grnQty);

    return {
      poVal,
      grnVal,
      poQty,
      grnQty,
      poCount,
      ...opp,
    };
  }, [d, selectedMonth, dayFrom, dayTo, tradeFilterSet, regionFilterSet, cityFilterSet, categoryFilterSet, statusFilterSet]);

  // 2. Category Opportunity Breakdown
  const categoryRows = useMemo(() => {
    if (!d || !selectedMonth) return [];

    type Acc = {
      poVal: number;
      grnVal: number;
      poQty: number;
      grnQty: number;
    };
    const map = new Map<string, Acc>();

    for (const r of d.rows) {
      const mName = d.dims.month[r[0]];
      if (mName !== selectedMonth) continue;
      if (!rowMatchesFilters(r, true)) continue;

      const catName = d.dims.category[r[4]] || "Other";
      let entry = map.get(catName);
      if (!entry) {
        entry = { poVal: 0, grnVal: 0, poQty: 0, grnQty: 0 };
        map.set(catName, entry);
      }

      entry.poQty += r[7];
      entry.poVal += r[8];
      entry.grnQty += r[9];
      entry.grnVal += r[10];
    }

    const list: OpportunityRow[] = [];
    map.forEach((acc, catName) => {
      const opp = computeOpportunity(acc.poVal, acc.grnVal, acc.poQty, acc.grnQty);
      list.push({
        key: catName,
        name: catName,
        category: catName,
        ...acc,
        ...opp,
      });
    });

    if (globalSearch.trim()) {
      const q = globalSearch.toLowerCase();
      return list.filter((x) => x.name.toLowerCase().includes(q));
    }

    return list;
  }, [d, selectedMonth, dayFrom, dayTo, tradeFilterSet, regionFilterSet, cityFilterSet, categoryFilterSet, statusFilterSet, globalSearch]);

  // 3. City Opportunity Breakdown
  const cityRows = useMemo(() => {
    if (!d || !selectedMonth) return [];

    type Acc = {
      poVal: number;
      grnVal: number;
      poQty: number;
      grnQty: number;
      region: string;
      depot: string;
    };
    const map = new Map<string, Acc>();

    for (const r of d.rows) {
      const mName = d.dims.month[r[0]];
      if (mName !== selectedMonth) continue;
      if (!rowMatchesFilters(r, true)) continue;

      const cityName = d.dims.city[r[3]] || "Unknown City";
      const regionName = d.dims.region[r[2]] || "Other";
      const depoInfo = lookupDepoByCity(cityName);
      const depotName = depoInfo ? depoInfo.depo : "—";

      let entry = map.get(cityName);
      if (!entry) {
        entry = {
          poVal: 0,
          grnVal: 0,
          poQty: 0,
          grnQty: 0,
          region: regionName,
          depot: depotName,
        };
        map.set(cityName, entry);
      }

      entry.poQty += r[7];
      entry.poVal += r[8];
      entry.grnQty += r[9];
      entry.grnVal += r[10];
    }

    const list: OpportunityRow[] = [];
    map.forEach((acc, cityName) => {
      const opp = computeOpportunity(acc.poVal, acc.grnVal, acc.poQty, acc.grnQty);
      list.push({
        key: cityName,
        name: cityName,
        city: cityName,
        depot: acc.depot,
        region: acc.region,
        poVal: acc.poVal,
        grnVal: acc.grnVal,
        poQty: acc.poQty,
        grnQty: acc.grnQty,
        ...opp,
      });
    });

    if (globalSearch.trim()) {
      const q = globalSearch.toLowerCase();
      return list.filter((x) => x.name.toLowerCase().includes(q) || (x.region && x.region.toLowerCase().includes(q)));
    }

    return list;
  }, [d, selectedMonth, dayFrom, dayTo, tradeFilterSet, regionFilterSet, cityFilterSet, categoryFilterSet, statusFilterSet, globalSearch]);

  // 4. Region Opportunity Breakdown
  const regionRows = useMemo(() => {
    if (!d || !selectedMonth) return [];

    type Acc = {
      poVal: number;
      grnVal: number;
      poQty: number;
      grnQty: number;
    };
    const map = new Map<string, Acc>();

    for (const r of d.rows) {
      const mName = d.dims.month[r[0]];
      if (mName !== selectedMonth) continue;
      if (!rowMatchesFilters(r, true)) continue;

      const regName = d.dims.region[r[2]] || "Other";
      let entry = map.get(regName);
      if (!entry) {
        entry = { poVal: 0, grnVal: 0, poQty: 0, grnQty: 0 };
        map.set(regName, entry);
      }

      entry.poQty += r[7];
      entry.poVal += r[8];
      entry.grnQty += r[9];
      entry.grnVal += r[10];
    }

    const list: OpportunityRow[] = [];
    map.forEach((acc, regName) => {
      const opp = computeOpportunity(acc.poVal, acc.grnVal, acc.poQty, acc.grnQty);
      list.push({
        key: regName,
        name: regName,
        region: regName,
        ...acc,
        ...opp,
      });
    });

    if (globalSearch.trim()) {
      const q = globalSearch.toLowerCase();
      return list.filter((x) => x.name.toLowerCase().includes(q));
    }

    return list;
  }, [d, selectedMonth, dayFrom, dayTo, tradeFilterSet, regionFilterSet, cityFilterSet, categoryFilterSet, statusFilterSet, globalSearch]);

  // 5. Granular SKU Opportunity Breakdown
  const skuRows = useMemo(() => {
    if (!d || !selectedMonth) return [];

    type Acc = {
      poVal: number;
      grnVal: number;
      poQty: number;
      grnQty: number;
      category: string;
      rawSku: string;
      name: string;
      code: string;
    };
    const map = new Map<string, Acc>();

    for (const r of d.rows) {
      const mName = d.dims.month[r[0]];
      if (mName !== selectedMonth) continue;
      if (!rowMatchesFilters(r, true)) continue;

      const rawSku = d.dims.sku[r[6]] || "Unknown SKU";
      const cat = d.dims.category[r[4]] || "General";
      const mmd = mmdGroup(rawSku);
      const groupKey = mmd.key;

      let entry = map.get(groupKey);
      if (!entry) {
        entry = {
          poVal: 0,
          grnVal: 0,
          poQty: 0,
          grnQty: 0,
          category: cat,
          rawSku,
          name: mmd.name || rawSku,
          code: mmd.code || "",
        };
        map.set(groupKey, entry);
      }

      entry.poQty += r[7];
      entry.poVal += r[8];
      entry.grnQty += r[9];
      entry.grnVal += r[10];
    }

    const list: OpportunityRow[] = [];
    map.forEach((acc, groupKey) => {
      const opp = computeOpportunity(acc.poVal, acc.grnVal, acc.poQty, acc.grnQty);
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
      filtered = filtered.filter((x) => x.grnVal === 0 && x.poVal > 0);
    } else if (skuFilterType === "severe-gap") {
      filtered = filtered.filter((x) => x.fr < 60 && x.gapVal > 0.1);
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
  }, [d, selectedMonth, dayFrom, dayTo, tradeFilterSet, regionFilterSet, cityFilterSet, categoryFilterSet, statusFilterSet, skuFilterType, globalSearch]);

  // 6. City & SKU Opportunity Breakdown
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
      if (!rowMatchesFilters(r, true)) continue;

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

    const list: OpportunityRow[] = [];
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
        name: acc.name || acc.rawSku,
        code: acc.code || "",
        ...opp,
        severity,
      });
    });

    let filtered = list;
    if (citySkuLossFilter === "gaps-only") {
      filtered = filtered.filter((x) => x.gapVal > 0.001 || x.gapQty > 0);
    } else if (citySkuLossFilter === "zero-supply") {
      filtered = filtered.filter((x) => x.grnVal === 0 && x.poVal > 0);
    } else if (citySkuLossFilter === "severe-gap") {
      filtered = filtered.filter((x) => x.fr < 60 && x.gapVal > 0.01);
    }

    if (citySkuSearch.trim()) {
      const q = citySkuSearch.toLowerCase();
      filtered = filtered.filter(
        (x) =>
          x.name.toLowerCase().includes(q) ||
          (x.city && x.city.toLowerCase().includes(q)) ||
          (x.depot && x.depot.toLowerCase().includes(q)) ||
          (x.code && x.code.toLowerCase().includes(q)) ||
          (x.category && x.category.toLowerCase().includes(q))
      );
    }

    if (globalSearch.trim()) {
      const q = globalSearch.toLowerCase();
      filtered = filtered.filter(
        (x) =>
          x.name.toLowerCase().includes(q) ||
          (x.city && x.city.toLowerCase().includes(q)) ||
          (x.code && x.code.toLowerCase().includes(q)) ||
          (x.category && x.category.toLowerCase().includes(q))
      );
    }

    return filtered;
  }, [d, selectedMonth, dayFrom, dayTo, tradeFilterSet, regionFilterSet, cityFilterSet, categoryFilterSet, statusFilterSet, citySkuLossFilter, citySkuSearch, globalSearch]);

  // 7. Day-wise Opportunity Breakdown
  const dailyRows = useMemo(() => {
    if (!d || !selectedMonth) return [];

    type Acc = {
      poVal: number;
      grnVal: number;
      poQty: number;
      grnQty: number;
      dateStr: string;
      poCount: number;
    };
    const dayMap = new Map<number, Acc>();

    for (const r of d.rows) {
      const mName = d.dims.month[r[0]];
      if (mName !== selectedMonth) continue;
      if (!rowMatchesFilters(r, false)) continue; // Day range not filtered here

      const ymd = r[11];
      const dayNum = ymd > 0 ? ymd % 100 : 0;
      if (dayNum < 1 || dayNum > 31) continue;

      let entry = dayMap.get(dayNum);
      if (!entry) {
        entry = {
          poVal: 0,
          grnVal: 0,
          poQty: 0,
          grnQty: 0,
          dateStr: ymdToStr(ymd),
          poCount: 0,
        };
        dayMap.set(dayNum, entry);
      }

      entry.poQty += r[7];
      entry.poVal += r[8];
      entry.grnQty += r[9];
      entry.grnVal += r[10];
      entry.poCount++;
    }

    const list: OpportunityRow[] = [];
    dayMap.forEach((acc, dayNum) => {
      const opp = computeOpportunity(acc.poVal, acc.grnVal, acc.poQty, acc.grnQty);
      list.push({
        key: `day-${dayNum}`,
        name: `Day ${dayNum}`,
        dayNum,
        date: acc.dateStr,
        ...acc,
        ...opp,
      });
    });

    return list.sort((a, b) => (a.dayNum || 0) - (b.dayNum || 0));
  }, [d, selectedMonth, tradeFilterSet, regionFilterSet, cityFilterSet, categoryFilterSet, statusFilterSet]);

  // 8. Daily Curves for SVG Line Chart
  const chartDays = useMemo(() => {
    if (!d || !selectedMonth) return [];

    const map = new Map<number, { dayNum: number; date: string; poVal: number; grnVal: number; gapVal: number; poQty: number; grnQty: number; gapQty: number; fr: number }>();

    for (let day = dayFrom; day <= dayTo; day++) {
      map.set(day, {
        dayNum: day,
        date: "",
        poVal: 0,
        grnVal: 0,
        gapVal: 0,
        poQty: 0,
        grnQty: 0,
        gapQty: 0,
        fr: 0,
      });
    }

    for (const r of d.rows) {
      const mName = d.dims.month[r[0]];
      if (mName !== selectedMonth) continue;
      if (!rowMatchesFilters(r, true)) continue;

      const ymd = r[11];
      const dayNum = ymd > 0 ? ymd % 100 : 0;
      if (dayNum < dayFrom || dayNum > dayTo) continue;

      const cur = map.get(dayNum);
      if (!cur) continue;

      cur.poQty += r[7];
      cur.poVal += r[8];
      cur.grnQty += r[9];
      cur.grnVal += r[10];
      if (!cur.date && ymd > 0) cur.date = ymdToStr(ymd);
    }

    const result = Array.from(map.values()).map((d) => {
      const opp = computeOpportunity(d.poVal, d.grnVal, d.poQty, d.grnQty);
      return {
        ...d,
        gapVal: opp.gapVal,
        gapQty: opp.gapQty,
        fr: opp.fr,
      };
    });

    return result.sort((a, b) => a.dayNum - b.dayNum);
  }, [d, selectedMonth, dayFrom, dayTo, tradeFilterSet, regionFilterSet, cityFilterSet, categoryFilterSet, statusFilterSet]);

  // Chart coordinate geometry
  const chartWidth = 1000;
  const chartHeight = 390;
  const chartPad = { top: 35, right: 65, bottom: 45, left: 65 };
  const innerW = chartWidth - chartPad.left - chartPad.right;
  const innerH = chartHeight - chartPad.top - chartPad.bottom;

  const { maxChartVal, maxChartQty } = useMemo(() => {
    let maxV = 1;
    let maxQ = 10;
    for (const pt of chartDays) {
      if (pt.poVal > maxV) maxV = pt.poVal;
      if (pt.grnVal > maxV) maxV = pt.grnVal;
      if (pt.gapVal > maxV) maxV = pt.gapVal;
      if (pt.poQty > maxQ) maxQ = pt.poQty;
      if (pt.grnQty > maxQ) maxQ = pt.grnQty;
      if (pt.gapQty > maxQ) maxQ = pt.gapQty;
    }
    return {
      maxChartVal: Math.max(1, maxV * 1.15),
      maxChartQty: Math.max(10, maxQ * 1.15),
    };
  }, [chartDays]);

  const chartPoints = useMemo(() => {
    if (chartDays.length === 0) return [];
    const stepX = chartDays.length > 1 ? innerW / (chartDays.length - 1) : innerW / 2;

    return chartDays.map((d, i) => {
      const x = chartPad.left + i * stepX;
      const yPoVal = chartPad.top + innerH - (d.poVal / maxChartVal) * innerH;
      const yGrnVal = chartPad.top + innerH - (d.grnVal / maxChartVal) * innerH;
      const yGapVal = chartPad.top + innerH - (d.gapVal / maxChartVal) * innerH;

      const yPoQty = chartPad.top + innerH - (d.poQty / maxChartQty) * innerH;
      const yGrnQty = chartPad.top + innerH - (d.grnQty / maxChartQty) * innerH;
      const yGapQty = chartPad.top + innerH - (d.gapQty / maxChartQty) * innerH;

      const yFr = chartPad.top + innerH - (Math.min(100, Math.max(0, d.fr)) / 100) * innerH;

      return {
        ...d,
        x,
        yPoVal,
        yGrnVal,
        yGapVal,
        yPoQty,
        yGrnQty,
        yGapQty,
        yFr,
      };
    });
  }, [chartDays, maxChartVal, maxChartQty, innerW, innerH, chartPad.left, chartPad.top]);

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

  /* ── 9. City-Wise Trend Calculations & Geometry ── */

  // Auto-set selected trend city
  useEffect(() => {
    if (cityRows.length > 0) {
      if (!selectedTrendCity || !cityRows.some((c) => (c.city || c.name) === selectedTrendCity)) {
        const top = [...cityRows].sort((a, b) => b.gapVal - a.gapVal)[0];
        if (top) {
          setSelectedTrendCity(top.city || top.name);
        }
      }
      if (compareCities.length === 0) {
        const top5 = [...cityRows]
          .sort((a, b) => b.gapVal - a.gapVal)
          .slice(0, 5)
          .map((c) => c.city || c.name);
        setCompareCities(top5);
      }
    }
  }, [cityRows, selectedTrendCity, compareCities]);

  // Selected City Summary Row
  const activeCityRow = useMemo(() => {
    return cityRows.find((c) => (c.city || c.name) === selectedTrendCity) || null;
  }, [cityRows, selectedTrendCity]);

  // Daily curves for the selected City
  const activeCityDailyList = useMemo(() => {
    if (!d || !selectedMonth || !selectedTrendCity) return [];

    const map = new Map<
      number,
      {
        dayNum: number;
        date: string;
        poVal: number;
        grnVal: number;
        gapVal: number;
        poQty: number;
        grnQty: number;
        gapQty: number;
        fr: number;
      }
    >();

    for (let day = dayFrom; day <= dayTo; day++) {
      map.set(day, {
        dayNum: day,
        date: "",
        poVal: 0,
        grnVal: 0,
        gapVal: 0,
        poQty: 0,
        grnQty: 0,
        gapQty: 0,
        fr: 0,
      });
    }

    for (const r of d.rows) {
      const mName = d.dims.month[r[0]];
      if (mName !== selectedMonth) continue;
      const cityName = d.dims.city[r[3]] || "Unknown City";
      if (cityName !== selectedTrendCity) continue;
      if (!rowMatchesFilters(r, true)) continue;

      const ymd = r[11];
      const dayNum = ymd > 0 ? ymd % 100 : 0;
      if (dayNum < dayFrom || dayNum > dayTo) continue;

      const cur = map.get(dayNum);
      if (!cur) continue;

      cur.poQty += r[7];
      cur.poVal += r[8];
      cur.grnQty += r[9];
      cur.grnVal += r[10];
      if (!cur.date && ymd > 0) cur.date = ymdToStr(ymd);
    }

    const result = Array.from(map.values()).map((item) => {
      const opp = computeOpportunity(item.poVal, item.grnVal, item.poQty, item.grnQty);
      return {
        ...item,
        gapVal: opp.gapVal,
        gapQty: opp.gapQty,
        fr: opp.fr,
      };
    });

    return result.sort((a, b) => a.dayNum - b.dayNum);
  }, [d, selectedMonth, selectedTrendCity, dayFrom, dayTo, tradeFilterSet, regionFilterSet, categoryFilterSet, statusFilterSet]);

  // Selected City Stats (Worst Day, Peak Demand Day)
  const cityDayInsights = useMemo(() => {
    if (activeCityDailyList.length === 0) return { peakDay: null, worstDay: null };
    let peakDay = activeCityDailyList[0];
    let worstDay = activeCityDailyList[0];

    for (const day of activeCityDailyList) {
      if (day.poVal > peakDay.poVal) peakDay = day;
      if (day.poVal > 0 && (day.fr < worstDay.fr || worstDay.poVal === 0)) {
        worstDay = day;
      }
    }
    return { peakDay, worstDay };
  }, [activeCityDailyList]);

  // Max value for City Chart
  const { maxCityChartVal } = useMemo(() => {
    let maxV = 1;
    for (const pt of activeCityDailyList) {
      if (pt.poVal > maxV) maxV = pt.poVal;
      if (pt.grnVal > maxV) maxV = pt.grnVal;
      if (pt.gapVal > maxV) maxV = pt.gapVal;
    }
    return {
      maxCityChartVal: Math.max(1, maxV * 1.15),
    };
  }, [activeCityDailyList]);

  // Coordinates for Selected City Line Chart
  const cityChartPoints = useMemo(() => {
    if (activeCityDailyList.length === 0) return [];
    const stepX = activeCityDailyList.length > 1 ? innerW / (activeCityDailyList.length - 1) : innerW / 2;

    return activeCityDailyList.map((d, i) => {
      const x = chartPad.left + i * stepX;
      const yPoVal = chartPad.top + innerH - (d.poVal / maxCityChartVal) * innerH;
      const yGrnVal = chartPad.top + innerH - (d.grnVal / maxCityChartVal) * innerH;
      const yGapVal = chartPad.top + innerH - (d.gapVal / maxCityChartVal) * innerH;
      const yFr = chartPad.top + innerH - (Math.min(100, Math.max(0, d.fr)) / 100) * innerH;

      return {
        ...d,
        x,
        yPoVal,
        yGrnVal,
        yGapVal,
        yFr,
      };
    });
  }, [activeCityDailyList, maxCityChartVal, innerW, innerH, chartPad.left, chartPad.top]);

  const makeCityLinePath = (key: keyof (typeof cityChartPoints)[0]) => {
    if (cityChartPoints.length === 0) return "";
    if (cityChartPoints.length === 1) return `M ${cityChartPoints[0].x} ${cityChartPoints[0][key]}`;

    let path = `M ${cityChartPoints[0].x} ${cityChartPoints[0][key]}`;
    for (let i = 0; i < cityChartPoints.length - 1; i++) {
      const curr = cityChartPoints[i];
      const next = cityChartPoints[i + 1];
      const cpX1 = curr.x + (next.x - curr.x) / 2;
      const cpY1 = curr[key] as number;
      const cpX2 = curr.x + (next.x - curr.x) / 2;
      const cpY2 = next[key] as number;
      path += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${next.x} ${next[key]}`;
    }
    return path;
  };

  const handleCityChartMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!cityLineChartSvgRef.current || cityChartPoints.length === 0) return;
    const rect = cityLineChartSvgRef.current.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * chartWidth;
    const mouseY = ((e.clientY - rect.top) / rect.height) * chartHeight;

    let closestIdx = 0;
    let minDiff = Infinity;
    cityChartPoints.forEach((p, idx) => {
      const diff = Math.abs(p.x - mouseX);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });

    setHoveredCityDayIdx(closestIdx);
    setCityChartMousePos({ x: cityChartPoints[closestIdx].x, y: mouseY });
  };

  // Multi-City Comparison Data across days
  const multiCityCurves = useMemo(() => {
    if (!d || !selectedMonth || compareCities.length === 0) return { list: [], maxGap: 1 };

    const cityMap = new Map<string, Map<number, { poVal: number; grnVal: number }>>();
    for (const city of compareCities) {
      const dayMap = new Map<number, { poVal: number; grnVal: number }>();
      for (let day = dayFrom; day <= dayTo; day++) {
        dayMap.set(day, { poVal: 0, grnVal: 0 });
      }
      cityMap.set(city, dayMap);
    }

    for (const r of d.rows) {
      const mName = d.dims.month[r[0]];
      if (mName !== selectedMonth) continue;
      const cityName = d.dims.city[r[3]] || "Unknown City";
      const dayMap = cityMap.get(cityName);
      if (!dayMap) continue;
      if (!rowMatchesFilters(r, true)) continue;

      const ymd = r[11];
      const dayNum = ymd > 0 ? ymd % 100 : 0;
      if (dayNum < dayFrom || dayNum > dayTo) continue;

      const cur = dayMap.get(dayNum);
      if (!cur) continue;

      cur.poVal += r[8];
      cur.grnVal += r[10];
    }

    const stepX = (dayTo - dayFrom) > 0 ? innerW / (dayTo - dayFrom) : innerW / 2;

    const list: {
      city: string;
      color: string;
      points: { dayNum: number; poVal: number; grnVal: number; gapVal: number; fr: number; x: number; yFr: number; yGap: number }[];
      totalGapVal: number;
      avgFr: number;
    }[] = [];

    let maxMultiGap = 1;

    compareCities.forEach((city, cityIdx) => {
      const dayMap = cityMap.get(city);
      if (!dayMap) return;

      let sumPo = 0;
      let sumGrn = 0;

      const pts = Array.from(dayMap.entries()).map(([dayNum, vals], idx) => {
        sumPo += vals.poVal;
        sumGrn += vals.grnVal;
        const opp = computeOpportunity(vals.poVal, vals.grnVal, 0, 0);
        if (opp.gapVal > maxMultiGap) maxMultiGap = opp.gapVal;
        return {
          dayNum,
          poVal: vals.poVal,
          grnVal: vals.grnVal,
          gapVal: opp.gapVal,
          fr: opp.fr,
          x: chartPad.left + idx * stepX,
          yFr: 0,
          yGap: 0,
        };
      });

      const avgFr = sumPo > 0 ? (sumGrn / sumPo) * 100 : 0;
      const totalGap = Math.max(0, sumPo - sumGrn);
      const color = CITY_PALETTE[cityIdx % CITY_PALETTE.length];

      list.push({
        city,
        color,
        points: pts,
        totalGapVal: totalGap,
        avgFr,
      });
    });

    const scaledMaxGap = Math.max(1, maxMultiGap * 1.15);

    list.forEach((cityObj) => {
      cityObj.points.forEach((pt) => {
        pt.yFr = chartPad.top + innerH - (Math.min(100, Math.max(0, pt.fr)) / 100) * innerH;
        pt.yGap = chartPad.top + innerH - (pt.gapVal / scaledMaxGap) * innerH;
      });
    });

    return { list, maxGap: scaledMaxGap };
  }, [d, selectedMonth, compareCities, dayFrom, dayTo, tradeFilterSet, regionFilterSet, categoryFilterSet, statusFilterSet, innerW, innerH, chartPad.left, chartPad.top]);

  // Generic Sorter
  const sortList = (list: OpportunityRow[], sortState: { col: keyof OpportunityRow; dir: 1 | -1 }) => {
    const arr = [...list];
    arr.sort((a, b) => {
      const aVal = a[sortState.col] ?? 0;
      const bVal = b[sortState.col] ?? 0;
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortState.dir === 1 ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortState.dir === 1 ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return arr;
  };

  const sortedCategoryRows = useMemo(() => sortList(categoryRows, sortCategory), [categoryRows, sortCategory]);
  const sortedCityRows = useMemo(() => sortList(cityRows, sortCity), [cityRows, sortCity]);
  const sortedRegionRows = useMemo(() => sortList(regionRows, sortRegion), [regionRows, sortRegion]);
  const sortedSkuRows = useMemo(() => sortList(skuRows, sortSku), [skuRows, sortSku]);
  const sortedCitySkuRows = useMemo(() => sortList(citySkuRows, sortCitySku), [citySkuRows, sortCitySku]);
  const sortedDayRows = useMemo(() => sortList(dailyRows, sortDay), [dailyRows, sortDay]);

  const paginatedSkuRows = useMemo(() => {
    const start = (skuPage - 1) * skuPageSize;
    return sortedSkuRows.slice(start, start + skuPageSize);
  }, [sortedSkuRows, skuPage, skuPageSize]);

  const paginatedCitySkuRows = useMemo(() => {
    const start = (citySkuPage - 1) * citySkuPageSize;
    return sortedCitySkuRows.slice(start, start + citySkuPageSize);
  }, [sortedCitySkuRows, citySkuPage, citySkuPageSize]);

  /* ── Excel Export Functions ── */
  const exportTableToExcel = (tableName: string, dataRows: OpportunityRow[]) => {
    const sheetData = dataRows.map((r, idx) => ({
      "S.No": idx + 1,
      "Name": r.name,
      "City": r.city || "",
      "Depot": r.depot || "—",
      "Category": r.category || "",
      "Region": r.region || "",
      "Month": selectedMonth,
      "Demand Qty (Units)": Math.round(r.poQty),
      "Demand Value (₹L)": +r.poVal.toFixed(2),
      "Supplied Qty (Units)": Math.round(r.grnQty),
      "Supplied Value (₹L)": +r.grnVal.toFixed(2),
      "Fill Rate %": +r.fr.toFixed(1),
      "Opportunity Loss Gap Qty (Units)": Math.round(r.gapQty),
      "Opportunity Loss Gap Value (₹L)": +r.gapVal.toFixed(2),
    }));

    const ws = XLSX.utils.json_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tableName.slice(0, 30));
    XLSX.writeFile(wb, `Opportunity_${tableName}_${selectedMonth}.xlsx`);
  };

  const exportCitySkuToExcel = (dataRows: OpportunityRow[]) => {
    const sheetData = dataRows.map((r, idx) => ({
      "S.No": idx + 1,
      "City": r.city || "",
      "Depot": r.depot || "—",
      "Region": r.region || "",
      "Category": r.category || "",
      "SKU Code": r.code || "—",
      "SKU Name": r.name,
      "Month": selectedMonth,
      "Demand Qty (Units)": Math.round(r.poQty),
      "Demand Value (₹L)": +r.poVal.toFixed(2),
      "Supplied Qty (Units)": Math.round(r.grnQty),
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
    XLSX.writeFile(wb, `City_SKU_Opportunity_Loss_${selectedMonth}.xlsx`);
  };

  const exportAllTables = () => {
    const wb = XLSX.utils.book_new();

    const addSheet = (title: string, dataRows: OpportunityRow[]) => {
      const sheetData = dataRows.map((r, idx) => ({
        "S.No": idx + 1,
        "Name": r.name,
        "City": r.city || "",
        "Depot": r.depot || "—",
        "Category": r.category || "",
        "Region": r.region || "",
        "Month": selectedMonth,
        "Demand Qty": Math.round(r.poQty),
        "Demand Value (₹L)": +r.poVal.toFixed(2),
        "Supplied Qty": Math.round(r.grnQty),
        "Supplied Value (₹L)": +r.grnVal.toFixed(2),
        "Fill Rate %": +r.fr.toFixed(1),
        "Opportunity Loss Gap (₹L)": +r.gapVal.toFixed(2),
      }));
      const ws = XLSX.utils.json_to_sheet(sheetData);
      XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31));
    };

    addSheet("Category Opportunity", sortedCategoryRows);
    addSheet("City Opportunity", sortedCityRows);
    addSheet("Region Opportunity", sortedRegionRows);
    addSheet("SKU Opportunity", sortedSkuRows);
    addSheet("City & SKU Opportunity Loss", sortedCitySkuRows);
    addSheet("Day-wise Opportunity", sortedDayRows);

    XLSX.writeFile(wb, `Full_Opportunity_Report_${selectedMonth}.xlsx`);
  };

  const exportCityTrendToExcel = () => {
    if (!selectedTrendCity || activeCityDailyList.length === 0) return;
    const sheetData = activeCityDailyList.map((r, idx) => ({
      "S.No": idx + 1,
      "City": selectedTrendCity,
      "Depot": activeCityRow?.depot || "—",
      "Region": activeCityRow?.region || "—",
      "Month": selectedMonth,
      "Day": `Day ${r.dayNum}`,
      "Date": r.date || "",
      "PO Demand Qty (Units)": Math.round(r.poQty),
      "PO Demand Value (₹L)": +r.poVal.toFixed(2),
      "Supplied GRN Qty (Units)": Math.round(r.grnQty),
      "Supplied GRN Value (₹L)": +r.grnVal.toFixed(2),
      "Fill Rate %": +r.fr.toFixed(1),
      "Opportunity Loss Qty (Units)": Math.round(r.gapQty),
      "Opportunity Loss Gap Value (₹L)": +r.gapVal.toFixed(2),
      "Loss Status":
        r.fr === 0 && r.poVal > 0
          ? "Zero Supply (100% Loss)"
          : r.fr < 60
          ? "Severe Gap (<60% FR)"
          : r.fr < 90
          ? "Moderate Gap (60-89% FR)"
          : "Healthy (>=90% FR)",
    }));

    const ws = XLSX.utils.json_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${selectedTrendCity.slice(0, 25)}_Trend`);
    XLSX.writeFile(wb, `City_Trend_${selectedTrendCity}_${selectedMonth}.xlsx`);
  };

  /* ── Open SKU Lightbox ── */
  const openSkuLightbox = (row: OpportunityRow) => {
    const stats: SkuStat[] = [
      { label: "Category", value: row.category || "General" },
      { label: `${selectedMonth} Demand`, value: `₹${L2(row.poVal)} L (${L(row.poQty, 0)} U)` },
      { label: `${selectedMonth} Supplied`, value: `₹${L2(row.grnVal)} L (${L(row.grnQty, 0)} U)` },
      { label: `${selectedMonth} Fill Rate`, value: `${row.fr.toFixed(1)}%`, cls: frColor(row.fr) },
      { label: "Opportunity Loss Gap", value: `₹${L2(row.gapVal)} L (${L(row.gapQty, 0)} U)`, cls: "text-rose-600 font-bold" },
    ];

    setSkuPopup({
      icon: row.icon || null,
      name: row.name,
      stats,
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-slate-500">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm font-bold">Loading Opportunity Dashboard...</span>
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
          className="px-4 py-2 bg-rose-600 text-white font-bold rounded-xl text-xs hover:bg-rose-700 transition cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1750px] mx-auto text-slate-900 dark:text-slate-100">
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
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800">
                  {selectedMonth}
                </span>
              </h1>
              <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Analyze unfulfilled demand deficits across City &amp; SKU pairs, Categories, and Regions to recover lost revenue.
              </p>
            </div>
          </div>
        </div>

        {/* Global actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard/opportunity/city-sku"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 hover:bg-rose-100 text-xs font-bold shadow-xs transition active:scale-95"
            title="Open Dedicated City & SKU Loss Excel Page"
          >
            <span>🏙️</span>
            <span>City &amp; SKU Loss Page ↗</span>
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

      {/* ── INTERACTIVE CONTROLS BAR ── */}
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
                onChange={(e) => setSelectedMonth(e.target.value)}
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
                  className="absolute right-2.5 top-1.5 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
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
            onChange={(s) => setSelTrades(s)}
            open={openDropdown === "trade"}
            onToggle={() => setOpenDropdown(openDropdown === "trade" ? null : "trade")}
            onClose={() => setOpenDropdown(null)}
          />

          <MultiSelectDropdown
            label="Region"
            options={allRegions.map((r) => ({ key: r, label: r }))}
            selected={selRegions}
            onChange={(s) => setSelRegions(s)}
            open={openDropdown === "region"}
            onToggle={() => setOpenDropdown(openDropdown === "region" ? null : "region")}
            onClose={() => setOpenDropdown(null)}
          />

          <MultiSelectDropdown
            label="City"
            options={allCities.map((c) => ({ key: c, label: c }))}
            selected={selCities}
            onChange={(s) => setSelCities(s)}
            open={openDropdown === "city"}
            onToggle={() => setOpenDropdown(openDropdown === "city" ? null : "city")}
            onClose={() => setOpenDropdown(null)}
          />

          <MultiSelectDropdown
            label="Category"
            options={allCategories.map((c) => ({ key: c, label: c }))}
            selected={selCategories}
            onChange={(s) => setSelCategories(s)}
            open={openDropdown === "category"}
            onToggle={() => setOpenDropdown(openDropdown === "category" ? null : "category")}
            onClose={() => setOpenDropdown(null)}
          />

          <MultiSelectDropdown
            label="Status"
            options={allStatuses.map((s) => ({ key: s, label: s }))}
            selected={selStatuses}
            onChange={(s) => setSelStatuses(s)}
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
              className="px-2.5 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition cursor-pointer"
            >
              Reset Filters ↺
            </button>
          )}
        </div>
      </div>

      {/* ── KPI SUMMARY CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Demand (PO Value) */}
        <div className="relative overflow-hidden bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent dark:from-blue-950/40 dark:via-blue-950/10 p-5 rounded-2xl border border-blue-500/20 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
              📦 Demand (PO Value)
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-600 text-white font-bold">
              Total Ordered
            </span>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-blue-600 dark:text-blue-400">
              ₹{L2(overallMetrics.poVal)} <span className="text-xs font-bold">Lakhs</span>
            </div>
            <div className="text-xs text-slate-500 mt-1 font-semibold">
              {L(overallMetrics.poQty, 0)} Ordered Units ({overallMetrics.poCount} POs)
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 border-t border-blue-500/10 pt-2">
            <span>Month:</span>
            <span className="font-bold text-slate-700 dark:text-slate-300">{selectedMonth}</span>
          </div>
        </div>

        {/* Card 2: Supplied Volume (GRN) */}
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent dark:from-emerald-950/40 dark:via-emerald-950/10 p-5 rounded-2xl border border-emerald-500/20 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              🚚 Supplied Volume (GRN)
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-600 text-white font-bold">
              Fulfilled
            </span>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
              ₹{L2(overallMetrics.grnVal)} <span className="text-xs font-bold">Lakhs</span>
            </div>
            <div className="text-xs text-slate-500 mt-1 font-semibold">
              {L(overallMetrics.grnQty, 0)} Delivered Units
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 border-t border-emerald-500/10 pt-2">
            <span>Fulfillment Ratio:</span>
            <span className="font-bold text-emerald-600">{overallMetrics.fr.toFixed(1)}%</span>
          </div>
        </div>

        {/* Card 3: Total Opportunity Loss Gap */}
        <div className="relative overflow-hidden bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-transparent dark:from-rose-950/40 dark:via-rose-950/10 p-5 rounded-2xl border border-rose-500/20 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
              ⚠️ Total Opportunity Loss
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-600 text-white font-bold">
              Unfulfilled Gap
            </span>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-rose-600 dark:text-rose-400">
              ₹{L2(overallMetrics.gapVal)} <span className="text-xs font-bold">Lakhs</span>
            </div>
            <div className="text-xs text-slate-500 mt-1 font-semibold">
              {L(overallMetrics.gapQty, 0)} Shortfall Units
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 border-t border-rose-500/10 pt-2">
            <span>Shortage %:</span>
            <span className="font-bold text-rose-600">{(100 - overallMetrics.fr).toFixed(1)}% Gap</span>
          </div>
        </div>

        {/* Card 4: Overall Fill Rate */}
        <div className="relative overflow-hidden bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-transparent dark:from-indigo-950/40 dark:via-indigo-950/10 p-5 rounded-2xl border border-indigo-500/20 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
              🎯 Overall Fill Rate
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${frPill(overallMetrics.fr)}`}>
              {overallMetrics.fr.toFixed(1)}%
            </span>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-indigo-700 dark:text-indigo-300">
              {overallMetrics.fr.toFixed(1)}%
            </div>
            <div className="text-xs text-slate-500 mt-1 font-semibold">
              Delivered vs Ordered ratio
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 border-t border-indigo-500/10 pt-2">
            <span>Benchmark:</span>
            <span className="font-bold text-indigo-600">≥ 90% Target</span>
          </div>
        </div>
      </div>

      {/* ── NAVIGATION TABS ── */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200 dark:border-white/10 text-xs font-bold scrollbar-none">
        {[
          { id: "overview", label: "🌟 Overview", icon: "🌟" },
          { id: "citysku", label: `🏙️📦 City & SKU Loss (${citySkuRows.length})`, icon: "🏙️" },
          { id: "sku", label: `📦 SKU Opportunity (${skuRows.length})`, icon: "📦" },
          { id: "city", label: `🏙️ City Opportunity (${cityRows.length})`, icon: "🏙️" },
          { id: "citytrend", label: `🏙️📈 City-Wise Trend`, icon: "🏙️" },
          { id: "category", label: `🏷️ Category Opportunity (${categoryRows.length})`, icon: "🏷️" },
          { id: "region", label: `🗺️ Region Opportunity (${regionRows.length})`, icon: "🗺️" },
          { id: "linechart", label: "📈 Multi-Metric Trends", icon: "📈" },
          { id: "day", label: `📅 Daily Tracker (${dailyRows.length})`, icon: "📅" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabKey)}
            className={`px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === tab.id
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
            }`}
          >
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── TAB 1: OVERVIEW ── */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Top 5 Loss SKUs */}
            <div className="bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                  <span>📦</span> Top Opportunity Loss SKUs
                </h3>
                <button
                  onClick={() => setActiveTab("sku")}
                  className="text-[11px] font-bold text-indigo-600 hover:underline"
                >
                  View All →
                </button>
              </div>
              <div className="space-y-2.5">
                {sortedSkuRows.slice(0, 5).map((r, idx) => (
                  <div
                    key={r.key}
                    onClick={() => openSkuLightbox(r)}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 flex items-center justify-between gap-3 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/30 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200 font-black text-[10px] grid place-items-center shrink-0">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{r.name}</div>
                        <div className="text-[10px] text-slate-400">{r.category} • FR: <span className={frColor(r.fr)}>{r.fr.toFixed(1)}%</span></div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-black text-rose-600">₹{L2(r.gapVal)}L Gap</div>
                      <div className="text-[10px] text-slate-400 font-medium">{L(r.gapQty, 0)} units</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top 5 Loss Cities */}
            <div className="bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                  <span>🏙️</span> Top Opportunity Loss Cities
                </h3>
                <button
                  onClick={() => setActiveTab("city")}
                  className="text-[11px] font-bold text-indigo-600 hover:underline"
                >
                  View All →
                </button>
              </div>
              <div className="space-y-2.5">
                {sortedCityRows.slice(0, 5).map((r, idx) => (
                  <div
                    key={r.key}
                    onClick={() => {
                      setSelectedTrendCity(r.city || r.name);
                      setActiveTab("citytrend");
                    }}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 flex items-center justify-between gap-3 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/30 transition cursor-pointer"
                    title={`Click to view ${r.city} Day-wise Opportunity Trend`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200 font-black text-[10px] grid place-items-center shrink-0">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate flex items-center gap-1.5">
                          <span>{r.name}</span>
                          <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold">📈 Trend</span>
                        </div>
                        <div className="text-[10px] text-slate-400">{r.region} • Depot: {r.depot}</div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-black text-rose-600">₹{L2(r.gapVal)}L Gap</div>
                      <div className="text-[10px] text-slate-400 font-medium">FR: <span className={frColor(r.fr)}>{r.fr.toFixed(1)}%</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Categories by Loss */}
            <div className="bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                  <span>🏷️</span> Categories by Opportunity Loss
                </h3>
                <button
                  onClick={() => setActiveTab("category")}
                  className="text-[11px] font-bold text-indigo-600 hover:underline"
                >
                  View All →
                </button>
              </div>
              <div className="space-y-2.5">
                {sortedCategoryRows.slice(0, 5).map((r, idx) => (
                  <div
                    key={r.key}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200 font-black text-[10px] grid place-items-center shrink-0">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{r.name}</div>
                        <div className="text-[10px] text-slate-400">PO: ₹{L2(r.poVal)}L • FR: <span className={frColor(r.fr)}>{r.fr.toFixed(1)}%</span></div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-black text-rose-600">₹{L2(r.gapVal)}L Gap</div>
                      <div className="text-[10px] text-slate-400 font-medium">{L(r.gapQty, 0)} units</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: CITY & SKU LOSS MASTER TABLE ── */}
      {activeTab === "citysku" && (
        <div className="bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden space-y-3">
          <div className="flex flex-wrap items-center justify-between p-4 border-b border-slate-200 dark:border-white/10 gap-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🏙️📦</span>
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                  City &amp; SKU Opportunity Loss Matrix
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300 font-bold">
                    {sortedCitySkuRows.length} Pairs
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Detailed unfulfilled demand and revenue shortages by City and SKU combination.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Filter City/SKU..."
                value={citySkuSearch}
                onChange={(e) => {
                  setCitySkuSearch(e.target.value);
                  setCitySkuPage(1);
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-xs text-slate-800 dark:text-slate-200 w-44"
              />
              <button
                onClick={() => exportCitySkuToExcel(sortedCitySkuRows)}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <span>Export City &amp; SKU (.xlsx) 📥</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="sticky top-0 z-20 shadow-xs">
                <tr className="bg-slate-50 dark:bg-[#000d38] text-[11px] font-bold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-white/10 select-none">
                  <th
                    onClick={() => setSortCitySku((p) => ({ col: "city", dir: p.col === "city" ? (p.dir === 1 ? -1 : 1) : -1 }))}
                    className="py-2.5 px-3 sticky left-0 bg-slate-50 dark:bg-[#000d38] z-30 min-w-[130px] cursor-pointer hover:text-indigo-600"
                  >
                    City &amp; Depot {sortCitySku.col === "city" ? (sortCitySku.dir === 1 ? "▲" : "▼") : ""}
                  </th>
                  <th
                    onClick={() => setSortCitySku((p) => ({ col: "name", dir: p.col === "name" ? (p.dir === 1 ? -1 : 1) : -1 }))}
                    className="py-2.5 px-3 sticky left-[130px] bg-slate-50 dark:bg-[#000d38] z-30 min-w-[190px] cursor-pointer hover:text-indigo-600"
                  >
                    SKU Name &amp; Code {sortCitySku.col === "name" ? (sortCitySku.dir === 1 ? "▲" : "▼") : ""}
                  </th>
                  <th onClick={() => setSortCitySku((p) => ({ col: "region", dir: p.col === "region" ? (p.dir === 1 ? -1 : 1) : -1 }))} className="py-2.5 px-2 cursor-pointer hover:text-indigo-600">
                    Region {sortCitySku.col === "region" ? (sortCitySku.dir === 1 ? "▲" : "▼") : ""}
                  </th>
                  <th onClick={() => setSortCitySku((p) => ({ col: "category", dir: p.col === "category" ? (p.dir === 1 ? -1 : 1) : -1 }))} className="py-2.5 px-2 cursor-pointer hover:text-indigo-600">
                    Category {sortCitySku.col === "category" ? (sortCitySku.dir === 1 ? "▲" : "▼") : ""}
                  </th>
                  <th onClick={() => setSortCitySku((p) => ({ col: "poQty", dir: p.col === "poQty" ? (p.dir === 1 ? -1 : 1) : -1 }))} className="py-2.5 px-2 text-right cursor-pointer hover:text-indigo-600">
                    Demand Qty {sortCitySku.col === "poQty" ? (sortCitySku.dir === 1 ? "▲" : "▼") : ""}
                  </th>
                  <th onClick={() => setSortCitySku((p) => ({ col: "grnQty", dir: p.col === "grnQty" ? (p.dir === 1 ? -1 : 1) : -1 }))} className="py-2.5 px-2 text-right cursor-pointer hover:text-indigo-600">
                    Supplied Qty {sortCitySku.col === "grnQty" ? (sortCitySku.dir === 1 ? "▲" : "▼") : ""}
                  </th>
                  <th onClick={() => setSortCitySku((p) => ({ col: "gapQty", dir: p.col === "gapQty" ? (p.dir === 1 ? -1 : 1) : -1 }))} className="py-2.5 px-2 text-right text-rose-600 cursor-pointer hover:text-rose-700">
                    Gap Qty {sortCitySku.col === "gapQty" ? (sortCitySku.dir === 1 ? "▲" : "▼") : ""}
                  </th>
                  <th onClick={() => setSortCitySku((p) => ({ col: "poVal", dir: p.col === "poVal" ? (p.dir === 1 ? -1 : 1) : -1 }))} className="py-2.5 px-2 text-right bg-indigo-50/40 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200 cursor-pointer hover:text-indigo-600">
                    Demand Value (₹L) {sortCitySku.col === "poVal" ? (sortCitySku.dir === 1 ? "▲" : "▼") : ""}
                  </th>
                  <th onClick={() => setSortCitySku((p) => ({ col: "grnVal", dir: p.col === "grnVal" ? (p.dir === 1 ? -1 : 1) : -1 }))} className="py-2.5 px-2 text-right bg-indigo-50/40 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200 cursor-pointer hover:text-indigo-600">
                    Supplied (₹L) {sortCitySku.col === "grnVal" ? (sortCitySku.dir === 1 ? "▲" : "▼") : ""}
                  </th>
                  <th onClick={() => setSortCitySku((p) => ({ col: "fr", dir: p.col === "fr" ? (p.dir === 1 ? -1 : 1) : -1 }))} className="py-2.5 px-2 text-center bg-indigo-50/40 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200 cursor-pointer hover:text-indigo-600">
                    Fill Rate % {sortCitySku.col === "fr" ? (sortCitySku.dir === 1 ? "▲" : "▼") : ""}
                  </th>
                  <th onClick={() => setSortCitySku((p) => ({ col: "gapVal", dir: p.col === "gapVal" ? (p.dir === 1 ? -1 : 1) : -1 }))} className="py-2.5 px-2 text-right bg-rose-50/60 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 font-black cursor-pointer hover:text-rose-600">
                    Opportunity Loss (₹L) {sortCitySku.col === "gapVal" ? (sortCitySku.dir === 1 ? "▲" : "▼") : ""}
                  </th>
                  <th className="py-2.5 px-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {paginatedCitySkuRows.map((r) => (
                  <tr key={r.key} className="hover:bg-indigo-50/40 dark:hover:bg-white/5 transition group">
                    <td className="py-2 px-3 sticky left-0 bg-white dark:bg-[#000d38] z-10 font-bold text-slate-900 dark:text-slate-100">
                      <div>{r.city}</div>
                      <div className="text-[10px] text-slate-400 font-normal">{r.depot}</div>
                    </td>
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
                          <div className="font-bold text-slate-900 dark:text-slate-100 truncate">{r.name}</div>
                          {r.code && <div className="text-[10px] text-slate-400 font-mono">{r.code}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-slate-500">{r.region}</td>
                    <td className="py-2 px-2 text-slate-500">{r.category}</td>
                    <td className="py-2 px-2 text-right font-medium">{L(r.poQty, 0)}</td>
                    <td className="py-2 px-2 text-right text-slate-600 dark:text-slate-400">{L(r.grnQty, 0)}</td>
                    <td className="py-2 px-2 text-right font-bold text-rose-500">{L(r.gapQty, 0)}</td>
                    <td className="py-2 px-2 text-right font-semibold">₹{L2(r.poVal)}</td>
                    <td className="py-2 px-2 text-right text-slate-700 dark:text-slate-300">₹{L2(r.grnVal)}</td>
                    <td className="py-2 px-2 text-center">
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${frPill(r.fr)}`}>
                        {r.fr.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right font-black text-rose-600 dark:text-rose-400 bg-rose-50/30 dark:bg-rose-950/20">
                      ₹{L2(r.gapVal)}
                    </td>
                    <td className="py-2 px-2 text-center">
                      {r.severity === "zero" && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-600 text-white">
                          Zero Supply
                        </span>
                      )}
                      {r.severity === "severe" && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
                          Severe
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
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between p-3 border-t border-slate-200 dark:border-white/10 text-xs text-slate-500">
            <div>
              Showing {sortedCitySkuRows.length > 0 ? (citySkuPage - 1) * citySkuPageSize + 1 : 0}–
              {Math.min(citySkuPage * citySkuPageSize, sortedCitySkuRows.length)} of {sortedCitySkuRows.length} Pairs
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCitySkuPage((p) => Math.max(1, p - 1))}
                disabled={citySkuPage <= 1}
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 font-bold disabled:opacity-40"
              >
                Prev
              </button>
              <button
                onClick={() => setCitySkuPage((p) => p + 1)}
                disabled={citySkuPage * citySkuPageSize >= sortedCitySkuRows.length}
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 font-bold disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: SKU TABLE ── */}
      {activeTab === "sku" && (
        <div className="bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between p-4 border-b border-slate-200 dark:border-white/10 gap-3">
            <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span>📦</span> SKU Opportunity Loss Breakdown ({sortedSkuRows.length} SKUs)
            </h3>
            <button
              onClick={() => exportTableToExcel("SKU_Opportunity", sortedSkuRows)}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              Export SKU Table (.xlsx) 📥
            </button>
          </div>
          <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="sticky top-0 z-20 shadow-xs">
                <tr className="bg-slate-50 dark:bg-[#000d38] text-[11px] font-bold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-white/10">
                  <th className="py-2.5 px-3">SKU Name &amp; Code</th>
                  <th className="py-2.5 px-2">Category</th>
                  <th className="py-2.5 px-2 text-right">PO Demand (₹L)</th>
                  <th className="py-2.5 px-2 text-right">Supplied (₹L)</th>
                  <th className="py-2.5 px-2 text-center">Fill Rate %</th>
                  <th className="py-2.5 px-2 text-right text-rose-600">Opportunity Loss (₹L)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {paginatedSkuRows.map((r) => (
                  <tr key={r.key} className="hover:bg-indigo-50/40 dark:hover:bg-white/5 transition">
                    <td className="py-2 px-3 font-bold text-slate-900 dark:text-slate-100">
                      <div>{r.name}</div>
                      {r.code && <div className="text-[10px] text-slate-400 font-mono">{r.code}</div>}
                    </td>
                    <td className="py-2 px-2 text-slate-500">{r.category}</td>
                    <td className="py-2 px-2 text-right font-semibold">₹{L2(r.poVal)}</td>
                    <td className="py-2 px-2 text-right text-slate-700 dark:text-slate-300">₹{L2(r.grnVal)}</td>
                    <td className="py-2 px-2 text-center">
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${frPill(r.fr)}`}>{r.fr.toFixed(1)}%</span>
                    </td>
                    <td className="py-2 px-2 text-right font-black text-rose-600 bg-rose-50/30 dark:bg-rose-950/20">₹{L2(r.gapVal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 4: CITY TABLE ── */}
      {activeTab === "city" && (
        <div className="bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between p-4 border-b border-slate-200 dark:border-white/10 gap-3">
            <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span>🏙️</span> City Opportunity Loss Breakdown ({sortedCityRows.length} Cities)
            </h3>
            <button
              onClick={() => exportTableToExcel("City_Opportunity", sortedCityRows)}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              Export City Table (.xlsx) 📥
            </button>
          </div>
          <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="sticky top-0 z-20 shadow-xs">
                <tr className="bg-slate-50 dark:bg-[#000d38] text-[11px] font-bold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-white/10">
                  <th className="py-2.5 px-3">City &amp; Depot</th>
                  <th className="py-2.5 px-2">Region</th>
                  <th className="py-2.5 px-2 text-right">PO Demand (₹L)</th>
                  <th className="py-2.5 px-2 text-right">Supplied (₹L)</th>
                  <th className="py-2.5 px-2 text-center">Fill Rate %</th>
                  <th className="py-2.5 px-2 text-right text-rose-600">Opportunity Loss (₹L)</th>
                  <th className="py-2.5 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {sortedCityRows.map((r) => (
                  <tr key={r.key} className="hover:bg-indigo-50/40 dark:hover:bg-white/5 transition">
                    <td className="py-2 px-3 font-bold text-slate-900 dark:text-slate-100">
                      <div>{r.city}</div>
                      <div className="text-[10px] text-slate-400 font-normal">{r.depot}</div>
                    </td>
                    <td className="py-2 px-2 text-slate-500">{r.region}</td>
                    <td className="py-2 px-2 text-right font-semibold">₹{L2(r.poVal)}</td>
                    <td className="py-2 px-2 text-right text-slate-700 dark:text-slate-300">₹{L2(r.grnVal)}</td>
                    <td className="py-2 px-2 text-center">
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${frPill(r.fr)}`}>{r.fr.toFixed(1)}%</span>
                    </td>
                    <td className="py-2 px-2 text-right font-black text-rose-600 bg-rose-50/30 dark:bg-rose-950/20">₹{L2(r.gapVal)}</td>
                    <td className="py-2 px-3 text-center">
                      <button
                        onClick={() => {
                          setSelectedTrendCity(r.city || r.name);
                          setActiveTab("citytrend");
                        }}
                        className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/80 dark:text-indigo-300 text-[11px] font-bold transition inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                        title={`View Day-wise Opportunity Trend for ${r.city}`}
                      >
                        <span>📈</span> View Trend
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB: CITY-WISE TREND ── */}
      {activeTab === "citytrend" && (
        <div className="space-y-6">
          {/* Controls & City Switcher Bar */}
          <div className="bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <span>🏙️📈</span> City-Wise Opportunity &amp; Fulfillment Trends ({selectedMonth})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Inspect day-by-day supply shortfalls, lost demand gaps, and fill rates for individual cities or compare top cities.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setCityTrendViewMode("all")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer ${
                    cityTrendViewMode === "all" ? "bg-indigo-600 text-white shadow-xs" : "bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10"
                  }`}
                >
                  📈 Single City Overview
                </button>
                <button
                  onClick={() => setCityTrendViewMode("compare")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer ${
                    cityTrendViewMode === "compare" ? "bg-indigo-600 text-white shadow-xs" : "bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10"
                  }`}
                >
                  📊 Compare Top Cities
                </button>
                <button
                  onClick={() => setCityTrendViewMode("value")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer ${
                    cityTrendViewMode === "value" ? "bg-indigo-600 text-white shadow-xs" : "bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10"
                  }`}
                >
                  💰 Value Curves (₹L)
                </button>
                <button
                  onClick={() => setCityTrendViewMode("fr")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer ${
                    cityTrendViewMode === "fr" ? "bg-indigo-600 text-white shadow-xs" : "bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10"
                  }`}
                >
                  🎯 Fill Rate %
                </button>
                <button
                  onClick={exportCityTrendToExcel}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer ml-auto"
                >
                  Export City Trend (.xlsx) 📥
                </button>
              </div>
            </div>

            {/* Quick Select City Pills & Search Dropdown */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-white/10">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Top Cities:
                </span>
                {cityRows.slice(0, 7).map((c) => {
                  const cityName = c.city || c.name;
                  const isSelected = selectedTrendCity === cityName;
                  return (
                    <button
                      key={c.key}
                      onClick={() => {
                        setSelectedTrendCity(cityName);
                        if (cityTrendViewMode === "compare") setCityTrendViewMode("all");
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                        isSelected
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                          : "bg-slate-50 dark:bg-white/5 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10"
                      }`}
                    >
                      <span>🏙️ {cityName}</span>
                      <span className={`px-1.5 py-0.2 rounded-md text-[10px] ${isSelected ? "bg-indigo-700 text-indigo-100" : "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 font-mono"}`}>
                        ₹{L2(c.gapVal)}L
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* City Dropdown Select */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">All Cities:</span>
                <select
                  value={selectedTrendCity}
                  onChange={(e) => {
                    setSelectedTrendCity(e.target.value);
                    if (cityTrendViewMode === "compare") setCityTrendViewMode("all");
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  {cityRows.map((c) => (
                    <option key={c.key} value={c.city || c.name} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                      {c.city || c.name} (Gap: ₹{L2(c.gapVal)}L | FR: {c.fr.toFixed(1)}%)
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* KPI Summary Cards for Selected City */}
          {activeCityRow && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* City & Depot Badge */}
              <div className="p-4 rounded-2xl bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Selected City</span>
                <div className="text-lg font-black text-slate-900 dark:text-white truncate" title={selectedTrendCity}>
                  {selectedTrendCity}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
                  <span>Depot:</span> <span className="font-bold text-indigo-600 dark:text-indigo-400">{activeCityRow.depot || "—"}</span>
                </div>
              </div>

              {/* PO Demand */}
              <div className="p-4 rounded-2xl bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500">PO Demand</span>
                <div className="text-lg font-black text-blue-600 dark:text-blue-400">
                  ₹{L2(activeCityRow.poVal)} <span className="text-[10px] font-bold">L</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {L(activeCityRow.poQty, 0)} Units
                </div>
              </div>

              {/* Supplied GRN */}
              <div className="p-4 rounded-2xl bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">Supplied GRN</span>
                <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                  ₹{L2(activeCityRow.grnVal)} <span className="text-[10px] font-bold">L</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {L(activeCityRow.grnQty, 0)} Units
                </div>
              </div>

              {/* Fill Rate */}
              <div className="p-4 rounded-2xl bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Fill Rate %</span>
                <div className="text-lg font-black text-indigo-600 dark:text-indigo-400">
                  {activeCityRow.fr.toFixed(1)}%
                </div>
                <div className="w-full bg-slate-100 dark:bg-white/10 h-1.5 rounded-full overflow-hidden mt-1.5">
                  <div className={`h-full ${activeCityRow.fr >= 90 ? "bg-emerald-500" : activeCityRow.fr >= 75 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${Math.min(100, Math.max(5, activeCityRow.fr))}%` }} />
                </div>
              </div>

              {/* Opportunity Loss Gap */}
              <div className="p-4 rounded-2xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">Opportunity Loss</span>
                <div className="text-lg font-black text-rose-600 dark:text-rose-400">
                  ₹{L2(activeCityRow.gapVal)} <span className="text-[10px] font-bold">L</span>
                </div>
                <div className="text-[11px] text-rose-500 dark:text-rose-400 mt-1 font-semibold">
                  {L(activeCityRow.gapQty, 0)} Units Lost
                </div>
              </div>
            </div>
          )}

          {/* SVG Line Chart for City Trend */}
          <div className="bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <span>📈</span>
                  {cityTrendViewMode === "compare"
                    ? `Top Cities Fill Rate & Gap Comparison (${selectedMonth})`
                    : `${selectedTrendCity} Day-by-Day Opportunity Loss Curve (${selectedMonth})`}
                </h4>
                <p className="text-[11px] text-slate-500">
                  {cityTrendViewMode === "compare"
                    ? "Comparing daily fill rate curves across selected top cities."
                    : "Tracking daily Demand, Supplied GRN, and Opportunity Loss Gaps."}
                </p>
              </div>

              {/* Chart Legend */}
              {cityTrendViewMode !== "compare" ? (
                <div className="flex flex-wrap items-center gap-4 text-xs font-bold">
                  <div className="flex items-center gap-1.5 text-blue-600">
                    <span className="w-3 h-1 bg-blue-500 rounded-full" /> PO Demand (₹L)
                  </div>
                  <div className="flex items-center gap-1.5 text-emerald-600">
                    <span className="w-3 h-1 bg-emerald-500 rounded-full" /> Supplied GRN (₹L)
                  </div>
                  <div className="flex items-center gap-1.5 text-rose-600">
                    <span className="w-3 h-1 bg-rose-500 rounded-full border-b border-dashed border-rose-600" /> Loss Gap (₹L)
                  </div>
                  <div className="flex items-center gap-1.5 text-purple-600">
                    <span className="w-3 h-1 bg-purple-500 rounded-full" /> Fill Rate %
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3 text-xs font-bold">
                  {multiCityCurves.list.map((c) => (
                    <div key={c.city} className="flex items-center gap-1.5" style={{ color: c.color }}>
                      <span className="w-3 h-1 rounded-full" style={{ backgroundColor: c.color }} />
                      <span>{c.city} ({c.avgFr.toFixed(0)}% | ₹{L2(c.totalGapVal)}L)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* SVG Visual Canvas */}
            <div className="relative w-full overflow-hidden">
              <svg
                ref={cityLineChartSvgRef}
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                className="w-full h-auto cursor-crosshair select-none"
                onMouseMove={handleCityChartMouseMove}
                onMouseLeave={() => {
                  setHoveredCityDayIdx(null);
                  setCityChartMousePos(null);
                }}
              >
                {/* Grid Lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
                  const y = chartPad.top + innerH * (1 - p);
                  return (
                    <g key={i}>
                      <line x1={chartPad.left} y1={y} x2={chartWidth - chartPad.right} y2={y} stroke="currentColor" strokeDasharray="3 3" className="text-slate-200 dark:text-white/10" />
                      <text x={chartPad.left - 8} y={y + 4} textAnchor="end" className="text-[10px] fill-slate-400 font-mono">
                        ₹{((maxCityChartVal * p)).toFixed(1)}L
                      </text>
                      <text x={chartWidth - chartPad.right + 8} y={y + 4} textAnchor="start" className="text-[10px] fill-indigo-400 font-mono">
                        {(p * 100).toFixed(0)}%
                      </text>
                    </g>
                  );
                })}

                {/* Single City View Lines */}
                {cityTrendViewMode !== "compare" && (
                  <>
                    {/* PO Demand (Blue) */}
                    {(cityTrendViewMode === "all" || cityTrendViewMode === "value") && (
                      <path d={makeCityLinePath("yPoVal")} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" />
                    )}

                    {/* Supplied GRN (Emerald) */}
                    {(cityTrendViewMode === "all" || cityTrendViewMode === "value") && (
                      <path d={makeCityLinePath("yGrnVal")} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />
                    )}

                    {/* Gap Value Line (Rose Dashed) */}
                    {(cityTrendViewMode === "all" || cityTrendViewMode === "value") && (
                      <path d={makeCityLinePath("yGapVal")} fill="none" stroke="#f43f5e" strokeWidth="2.5" strokeDasharray="4 2" strokeLinecap="round" />
                    )}

                    {/* Fill Rate % Line (Purple) */}
                    {(cityTrendViewMode === "all" || cityTrendViewMode === "fr") && (
                      <path d={makeCityLinePath("yFr")} fill="none" stroke="#8b5cf6" strokeWidth="3" strokeLinecap="round" />
                    )}
                  </>
                )}

                {/* Multi-City Comparison Lines */}
                {cityTrendViewMode === "compare" && (
                  <>
                    {multiCityCurves.list.map((c) => {
                      if (c.points.length === 0) return null;
                      let path = `M ${c.points[0].x} ${c.points[0].yFr}`;
                      for (let i = 0; i < c.points.length - 1; i++) {
                        const curr = c.points[i];
                        const next = c.points[i + 1];
                        const cpX1 = curr.x + (next.x - curr.x) / 2;
                        const cpY1 = curr.yFr;
                        const cpX2 = curr.x + (next.x - curr.x) / 2;
                        const cpY2 = next.yFr;
                        path += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${next.x} ${next.yFr}`;
                      }
                      return (
                        <path
                          key={c.city}
                          d={path}
                          fill="none"
                          stroke={c.color}
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        />
                      );
                    })}
                  </>
                )}

                {/* Hover Guide Line */}
                {hoveredCityDayIdx !== null && cityChartPoints[hoveredCityDayIdx] && (
                  <line
                    x1={cityChartPoints[hoveredCityDayIdx].x}
                    y1={chartPad.top}
                    x2={cityChartPoints[hoveredCityDayIdx].x}
                    y2={chartPad.top + innerH}
                    stroke="#6366f1"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                )}

                {/* Day Axis labels */}
                {cityChartPoints.map((pt, i) => (
                  <text key={i} x={pt.x} y={chartPad.top + innerH + 18} textAnchor="middle" className="text-[10px] fill-slate-400 font-bold">
                    {pt.dayNum}
                  </text>
                ))}
              </svg>

              {/* Hover Tooltip Floating Card */}
              {hoveredCityDayIdx !== null && cityChartPoints[hoveredCityDayIdx] && (
                <div className="mt-3 p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs flex flex-wrap items-center justify-between gap-3 shadow-sm">
                  <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-black">
                      Day {cityChartPoints[hoveredCityDayIdx].dayNum}
                    </span>
                    <span>{cityChartPoints[hoveredCityDayIdx].date || selectedMonth}</span>
                    <span className="text-slate-400 font-normal">| {selectedTrendCity}</span>
                  </div>

                  {cityTrendViewMode !== "compare" ? (
                    <div className="flex flex-wrap items-center gap-4 text-[11px]">
                      <span className="text-blue-600 font-bold">Demand: ₹{L2(cityChartPoints[hoveredCityDayIdx].poVal)}L ({L(cityChartPoints[hoveredCityDayIdx].poQty, 0)} U)</span>
                      <span className="text-emerald-600 font-bold">Supplied: ₹{L2(cityChartPoints[hoveredCityDayIdx].grnVal)}L ({L(cityChartPoints[hoveredCityDayIdx].grnQty, 0)} U)</span>
                      <span className="text-rose-600 font-bold">Gap: ₹{L2(cityChartPoints[hoveredCityDayIdx].gapVal)}L ({L(cityChartPoints[hoveredCityDayIdx].gapQty, 0)} U)</span>
                      <span className="text-purple-600 font-black">Fill Rate: {cityChartPoints[hoveredCityDayIdx].fr.toFixed(1)}%</span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3 text-[11px]">
                      {multiCityCurves.list.map((c) => {
                        const pt = c.points[hoveredCityDayIdx];
                        if (!pt) return null;
                        return (
                          <span key={c.city} style={{ color: c.color }} className="font-bold">
                            {c.city}: {pt.fr.toFixed(1)}% (Gap: ₹{L2(pt.gapVal)}L)
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Day-by-Day Table for Selected City */}
          <div className="bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex flex-wrap items-center justify-between p-4 border-b border-slate-200 dark:border-white/10 gap-3">
              <div>
                <h4 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <span>📅</span> {selectedTrendCity} Day-wise Breakdown ({activeCityDailyList.length} Days)
                </h4>
                <p className="text-[11px] text-slate-500">
                  Daily Demand, Supply fulfillment, and Opportunity Loss Gaps for {selectedTrendCity} in {selectedMonth}.
                </p>
              </div>
              <button
                onClick={exportCityTrendToExcel}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                Export Table (.xlsx) 📥
              </button>
            </div>

            <div className="overflow-x-auto max-h-[500px] custom-scrollbar">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="sticky top-0 z-20 shadow-xs">
                  <tr className="bg-slate-50 dark:bg-[#000d38] text-[11px] font-bold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-white/10">
                    <th className="py-2.5 px-3">Day &amp; Date</th>
                    <th className="py-2.5 px-2 text-right">Demand Qty</th>
                    <th className="py-2.5 px-2 text-right">PO Demand (₹L)</th>
                    <th className="py-2.5 px-2 text-right">Supplied Qty</th>
                    <th className="py-2.5 px-2 text-right">Supplied (₹L)</th>
                    <th className="py-2.5 px-2 text-center">Fill Rate %</th>
                    <th className="py-2.5 px-2 text-right text-rose-600">Opportunity Gap (₹L)</th>
                    <th className="py-2.5 px-3 text-center">Loss Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {activeCityDailyList.map((r) => {
                    const statusPill =
                      r.fr === 0 && r.poVal > 0
                        ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300"
                        : r.fr < 60
                        ? "bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300 border-orange-300"
                        : r.fr < 90
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300"
                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300";

                    const statusLabel =
                      r.fr === 0 && r.poVal > 0
                        ? "Zero Supply"
                        : r.fr < 60
                        ? "Severe Deficit"
                        : r.fr < 90
                        ? "Moderate Gap"
                        : "Healthy";

                    return (
                      <tr key={r.dayNum} className="hover:bg-indigo-50/40 dark:hover:bg-white/5 transition">
                        <td className="py-2 px-3 font-bold text-slate-900 dark:text-slate-100">
                          <div>Day {r.dayNum}</div>
                          {r.date && <div className="text-[10px] text-slate-400 font-mono">{r.date}</div>}
                        </td>
                        <td className="py-2 px-2 text-right text-slate-600 dark:text-slate-400">{L(r.poQty, 0)}</td>
                        <td className="py-2 px-2 text-right font-semibold text-blue-600 dark:text-blue-400">₹{L2(r.poVal)}</td>
                        <td className="py-2 px-2 text-right text-slate-600 dark:text-slate-400">{L(r.grnQty, 0)}</td>
                        <td className="py-2 px-2 text-right text-slate-700 dark:text-slate-300">₹{L2(r.grnVal)}</td>
                        <td className="py-2 px-2 text-center">
                          <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${frPill(r.fr)}`}>
                            {r.fr.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right font-black text-rose-600 bg-rose-50/30 dark:bg-rose-950/20">
                          ₹{L2(r.gapVal)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusPill}`}>
                            {statusLabel}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* All Cities Directory Matrix Grid */}
          <div className="bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <span>🏙️</span> All Cities Opportunity Directory ({cityRows.length} Cities)
                </h4>
                <p className="text-[11px] text-slate-500">
                  Click any city card below to immediately load its day-by-day opportunity loss graph above.
                </p>
              </div>
              <div className="w-64">
                <input
                  type="text"
                  placeholder="Filter cities..."
                  value={citySearchTerm}
                  onChange={(e) => setCitySearchTerm(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
              {cityRows
                .filter((c) => !citySearchTerm.trim() || (c.city || c.name).toLowerCase().includes(citySearchTerm.toLowerCase()))
                .map((c) => {
                  const cityName = c.city || c.name;
                  const isSelected = selectedTrendCity === cityName;
                  return (
                    <div
                      key={c.key}
                      onClick={() => {
                        setSelectedTrendCity(cityName);
                        if (cityTrendViewMode === "compare") setCityTrendViewMode("all");
                      }}
                      className={`p-3.5 rounded-xl border transition cursor-pointer flex flex-col justify-between gap-2 ${
                        isSelected
                          ? "bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-500 shadow-xs"
                          : "bg-slate-50/50 dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-indigo-300 dark:hover:border-indigo-700"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-xs text-slate-900 dark:text-slate-100">{cityName}</div>
                          <div className="text-[10px] text-slate-400">{c.depot || "—"} &bull; {c.region || "Other"}</div>
                        </div>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${frPill(c.fr)}`}>
                          {c.fr.toFixed(1)}%
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-100 dark:border-white/5">
                        <span className="text-slate-500">Loss Gap:</span>
                        <span className="font-black text-rose-600">₹{L2(c.gapVal)}L</span>
                      </div>

                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-500">Demand PO:</span>
                        <span className="font-bold text-blue-600">₹{L2(c.poVal)}L</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 5: CATEGORY TABLE ── */}
      {activeTab === "category" && (
        <div className="bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between p-4 border-b border-slate-200 dark:border-white/10 gap-3">
            <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span>🏷️</span> Category Opportunity Loss Breakdown ({sortedCategoryRows.length} Categories)
            </h3>
            <button
              onClick={() => exportTableToExcel("Category_Opportunity", sortedCategoryRows)}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              Export Category Table (.xlsx) 📥
            </button>
          </div>
          <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="sticky top-0 z-20 shadow-xs">
                <tr className="bg-slate-50 dark:bg-[#000d38] text-[11px] font-bold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-white/10">
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-2 text-right">PO Demand (₹L)</th>
                  <th className="py-2.5 px-2 text-right">Supplied (₹L)</th>
                  <th className="py-2.5 px-2 text-center">Fill Rate %</th>
                  <th className="py-2.5 px-2 text-right text-rose-600">Opportunity Loss (₹L)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {sortedCategoryRows.map((r) => (
                  <tr key={r.key} className="hover:bg-indigo-50/40 dark:hover:bg-white/5 transition">
                    <td className="py-2 px-3 font-bold text-slate-900 dark:text-slate-100">{r.category}</td>
                    <td className="py-2 px-2 text-right font-semibold">₹{L2(r.poVal)}</td>
                    <td className="py-2 px-2 text-right text-slate-700 dark:text-slate-300">₹{L2(r.grnVal)}</td>
                    <td className="py-2 px-2 text-center">
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${frPill(r.fr)}`}>{r.fr.toFixed(1)}%</span>
                    </td>
                    <td className="py-2 px-2 text-right font-black text-rose-600 bg-rose-50/30 dark:bg-rose-950/20">₹{L2(r.gapVal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 6: REGION TABLE ── */}
      {activeTab === "region" && (
        <div className="bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between p-4 border-b border-slate-200 dark:border-white/10 gap-3">
            <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span>🗺️</span> Region Opportunity Loss Breakdown ({sortedRegionRows.length} Regions)
            </h3>
            <button
              onClick={() => exportTableToExcel("Region_Opportunity", sortedRegionRows)}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              Export Region Table (.xlsx) 📥
            </button>
          </div>
          <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="sticky top-0 z-20 shadow-xs">
                <tr className="bg-slate-50 dark:bg-[#000d38] text-[11px] font-bold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-white/10">
                  <th className="py-2.5 px-3">Region</th>
                  <th className="py-2.5 px-2 text-right">PO Demand (₹L)</th>
                  <th className="py-2.5 px-2 text-right">Supplied (₹L)</th>
                  <th className="py-2.5 px-2 text-center">Fill Rate %</th>
                  <th className="py-2.5 px-2 text-right text-rose-600">Opportunity Loss (₹L)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {sortedRegionRows.map((r) => (
                  <tr key={r.key} className="hover:bg-indigo-50/40 dark:hover:bg-white/5 transition">
                    <td className="py-2 px-3 font-bold text-slate-900 dark:text-slate-100">{r.region}</td>
                    <td className="py-2 px-2 text-right font-semibold">₹{L2(r.poVal)}</td>
                    <td className="py-2 px-2 text-right text-slate-700 dark:text-slate-300">₹{L2(r.grnVal)}</td>
                    <td className="py-2 px-2 text-center">
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${frPill(r.fr)}`}>{r.fr.toFixed(1)}%</span>
                    </td>
                    <td className="py-2 px-2 text-right font-black text-rose-600 bg-rose-50/30 dark:bg-rose-950/20">₹{L2(r.gapVal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 7: LINE CHART ── */}
      {activeTab === "linechart" && (
        <div className="bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span>📈</span> Daily Opportunity &amp; Fulfillment Trends ({selectedMonth})
              </h3>
              <p className="text-[11px] text-slate-500">
                Daily timeline tracking PO Demand, GRN fulfillment, and Opportunity Loss Gaps.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setChartViewMode("all")}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg ${chartViewMode === "all" ? "bg-indigo-600 text-white" : "bg-slate-100 dark:bg-white/5"}`}
              >
                All Metrics
              </button>
              <button
                onClick={() => setChartViewMode("value")}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg ${chartViewMode === "value" ? "bg-indigo-600 text-white" : "bg-slate-100 dark:bg-white/5"}`}
              >
                Value (₹L)
              </button>
              <button
                onClick={() => setChartViewMode("fr")}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg ${chartViewMode === "fr" ? "bg-indigo-600 text-white" : "bg-slate-100 dark:bg-white/5"}`}
              >
                Fill Rate %
              </button>
            </div>
          </div>

          <div className="relative w-full overflow-hidden">
            <svg
              ref={lineChartSvgRef}
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="w-full h-auto cursor-crosshair select-none"
              onMouseMove={handleChartMouseMove}
              onMouseLeave={() => {
                setHoveredDayIdx(null);
                setChartMousePos(null);
              }}
            >
              {/* Grid Lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
                const y = chartPad.top + innerH * (1 - p);
                return (
                  <g key={i}>
                    <line x1={chartPad.left} y1={y} x2={chartWidth - chartPad.right} y2={y} stroke="currentColor" strokeDasharray="3 3" className="text-slate-200 dark:text-white/10" />
                    <text x={chartPad.left - 8} y={y + 4} textAnchor="end" className="text-[10px] fill-slate-400 font-mono">
                      ₹{((maxChartVal * p)).toFixed(1)}L
                    </text>
                    <text x={chartWidth - chartPad.right + 8} y={y + 4} textAnchor="start" className="text-[10px] fill-indigo-400 font-mono">
                      {(p * 100).toFixed(0)}%
                    </text>
                  </g>
                );
              })}

              {/* PO Demand Value Line (Blue) */}
              {(chartViewMode === "all" || chartViewMode === "value") && showPoVal && (
                <path d={makeLinePath("yPoVal")} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" />
              )}

              {/* GRN Supplied Value Line (Emerald) */}
              {(chartViewMode === "all" || chartViewMode === "value") && showGrnVal && (
                <path d={makeLinePath("yGrnVal")} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />
              )}

              {/* Gap Value Line (Rose) */}
              {(chartViewMode === "all" || chartViewMode === "value") && showGapVal && (
                <path d={makeLinePath("yGapVal")} fill="none" stroke="#f43f5e" strokeWidth="2.5" strokeDasharray="4 2" strokeLinecap="round" />
              )}

              {/* Fill Rate % Line (Purple) */}
              {(chartViewMode === "all" || chartViewMode === "fr") && showFrLine && (
                <path d={makeLinePath("yFr")} fill="none" stroke="#8b5cf6" strokeWidth="3" strokeLinecap="round" />
              )}

              {/* Hover Guide Line */}
              {hoveredDayIdx !== null && chartPoints[hoveredDayIdx] && (
                <line
                  x1={chartPoints[hoveredDayIdx].x}
                  y1={chartPad.top}
                  x2={chartPoints[hoveredDayIdx].x}
                  y2={chartPad.top + innerH}
                  stroke="#6366f1"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
              )}

              {/* Day Axis labels */}
              {chartPoints.map((pt, i) => (
                <text key={i} x={pt.x} y={chartPad.top + innerH + 18} textAnchor="middle" className="text-[10px] fill-slate-400 font-bold">
                  {pt.dayNum}
                </text>
              ))}
            </svg>

            {/* Hover Tooltip Card */}
            {hoveredDayIdx !== null && chartPoints[hoveredDayIdx] && (
              <div className="mt-3 p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs flex flex-wrap items-center justify-between gap-3">
                <div className="font-bold text-slate-800 dark:text-slate-100">
                  Day {chartPoints[hoveredDayIdx].dayNum} ({chartPoints[hoveredDayIdx].date || selectedMonth})
                </div>
                <div className="flex items-center gap-4 text-[11px]">
                  <span className="text-blue-600 font-bold">Demand: ₹{L2(chartPoints[hoveredDayIdx].poVal)}L ({L(chartPoints[hoveredDayIdx].poQty, 0)} U)</span>
                  <span className="text-emerald-600 font-bold">Supplied: ₹{L2(chartPoints[hoveredDayIdx].grnVal)}L ({L(chartPoints[hoveredDayIdx].grnQty, 0)} U)</span>
                  <span className="text-rose-600 font-bold">Gap: ₹{L2(chartPoints[hoveredDayIdx].gapVal)}L ({L(chartPoints[hoveredDayIdx].gapQty, 0)} U)</span>
                  <span className="text-purple-600 font-black">Fill Rate: {chartPoints[hoveredDayIdx].fr.toFixed(1)}%</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 8: DAILY TRACKER TABLE ── */}
      {activeTab === "day" && (
        <div className="bg-white dark:bg-[#000d38] border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between p-4 border-b border-slate-200 dark:border-white/10 gap-3">
            <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span>📅</span> Day-wise Opportunity Breakdown ({sortedDayRows.length} Days)
            </h3>
            <button
              onClick={() => exportTableToExcel("Daily_Opportunity", sortedDayRows)}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              Export Daily Table (.xlsx) 📥
            </button>
          </div>
          <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="sticky top-0 z-20 shadow-xs">
                <tr className="bg-slate-50 dark:bg-[#000d38] text-[11px] font-bold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-white/10">
                  <th className="py-2.5 px-3">Day &amp; Date</th>
                  <th className="py-2.5 px-2 text-right">PO Demand (₹L)</th>
                  <th className="py-2.5 px-2 text-right">Supplied (₹L)</th>
                  <th className="py-2.5 px-2 text-center">Fill Rate %</th>
                  <th className="py-2.5 px-2 text-right text-rose-600">Opportunity Loss (₹L)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {sortedDayRows.map((r) => (
                  <tr key={r.key} className="hover:bg-indigo-50/40 dark:hover:bg-white/5 transition">
                    <td className="py-2 px-3 font-bold text-slate-900 dark:text-slate-100">
                      <div>Day {r.dayNum}</div>
                      {r.date && <div className="text-[10px] text-slate-400 font-mono">{r.date}</div>}
                    </td>
                    <td className="py-2 px-2 text-right font-semibold">₹{L2(r.poVal)}</td>
                    <td className="py-2 px-2 text-right text-slate-700 dark:text-slate-300">₹{L2(r.grnVal)}</td>
                    <td className="py-2 px-2 text-center">
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${frPill(r.fr)}`}>{r.fr.toFixed(1)}%</span>
                    </td>
                    <td className="py-2 px-2 text-right font-black text-rose-600 bg-rose-50/30 dark:bg-rose-950/20">₹{L2(r.gapVal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
