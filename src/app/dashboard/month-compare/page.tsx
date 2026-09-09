"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import UploadButton from "../upload-button";
import SyncStatus from "../sync-status";
import { mmdGroup } from "@/lib/mmd-mapping";
import { matchSkuIcon } from "@/lib/sku-icon";
import SkuImagePopup, { SkuStat } from "../sku-image-popup";
import { lookupDepoByCity } from "@/lib/depo-mapping";

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
  n.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: 0 });

const L2 = (n: number) =>
  n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

const frPill = (fr: number) =>
  "px-2.5 py-0.5 rounded-full text-xs font-bold " +
  (fr >= 90
    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700"
    : fr >= 75
    ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-700"
    : "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-700");

const frColor = (fr: number) =>
  fr >= 90 ? "text-emerald-500" : fr >= 75 ? "text-amber-500" : "text-rose-500";

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
        className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-700/60 bg-slate-900/80 text-slate-200 hover:bg-slate-800 transition min-w-[130px] shadow-sm"
      >
        <span className="truncate">
          <span className="text-slate-400 font-normal mr-1">{label}:</span>
          <span className="text-indigo-300 font-medium">{buttonLabel}</span>
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
          <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
          <div className="absolute left-0 top-full mt-1.5 w-64 rounded-xl shadow-2xl bg-slate-900 border border-slate-700 p-2 z-50 text-xs backdrop-blur-xl">
            <div className="flex items-center justify-between px-2 py-1 mb-1.5 border-b border-slate-800">
              <span className="font-semibold text-slate-300">{label} Filter</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onChange(options.map((o) => o.key))}
                  className="text-[11px] text-indigo-400 hover:underline"
                >
                  All
                </button>
                <span className="text-slate-600">|</span>
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="text-[11px] text-slate-400 hover:underline"
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
                className="w-full px-2 py-1 rounded bg-slate-950/80 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="max-h-52 overflow-y-auto space-y-0.5 pr-1 custom-scrollbar">
              {filteredOptions.length === 0 ? (
                <div className="text-slate-500 text-center py-2">No matches</div>
              ) : (
                filteredOptions.map((o) => {
                  const checked = selSet.has(o.key);
                  return (
                    <label
                      key={o.key}
                      onClick={() => toggleItem(o.key)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition select-none ${
                        checked ? "bg-indigo-950/50 text-indigo-200 font-medium" : "text-slate-300 hover:bg-slate-800/60"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {}}
                        className="rounded border-slate-700 text-indigo-600 focus:ring-0 focus:ring-offset-0 bg-slate-950"
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

type TabKey = "deep-dive" | "sku-compare" | "matrix";
type DimensionKey = "trade" | "category" | "city" | "depo" | "region";

type SkuPopupState = {
  icon: string | null;
  name: string;
  stats: SkuStat[];
} | null;

export default function MonthComparePage() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [metric, setMetric] = useState<"val" | "qty">("val");
  const [activeTab, setActiveTab] = useState<TabKey>("deep-dive");
  const [selectedDim, setSelectedDim] = useState<DimensionKey>("trade");

  // Selected Months for Comparison
  const [monthA, setMonthA] = useState<string>("");
  const [monthB, setMonthB] = useState<string>("");

  // Dimension Filters
  const [selTrades, setSelTrades] = useState<string[]>([]);
  const [selRegions, setSelRegions] = useState<string[]>([]);
  const [selCities, setSelCities] = useState<string[]>([]);
  const [selCategories, setSelCategories] = useState<string[]>([]);
  const [selStatuses, setSelStatuses] = useState<string[]>([]);
  const [skuSearch, setSkuSearch] = useState("");
  const [skuFilterType, setSkuFilterType] = useState<"all" | "gainers" | "droppers" | "growth" | "gap">("all");

  // Multi-select open state tracker
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Popup Image State
  const [skuPopup, setSkuPopup] = useState<SkuPopupState>(null);

  // Sorting
  const [sortCol, setSortCol] = useState<string>("bPo");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  // Matrix entity selector
  const [matrixDim, setMatrixDim] = useState<DimensionKey>("trade");

  useEffect(() => {
    fetch("/api/data")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
      .then((data: Data) => {
        setD(data);
        if (data?.dims?.month && data.dims.month.length > 0) {
          const mList = data.dims.month;
          if (mList.length >= 2) {
            setMonthA(mList[mList.length - 2]); // Previous month
            setMonthB(mList[mList.length - 1]); // Latest month
          } else {
            setMonthA(mList[0]);
            setMonthB(mList[0]);
          }
        }
      })
      .catch((e) => setErr(String(e.message || e)));
  }, []);

  const months = useMemo(() => d?.dims?.month || [], [d]);
  const allTrades = useMemo(() => d?.dims?.trade || [], [d]);
  const allRegions = useMemo(() => d?.dims?.region || [], [d]);
  const allCities = useMemo(() => d?.dims?.city || [], [d]);
  const allCategories = useMemo(() => d?.dims?.category || [], [d]);
  const allStatuses = useMemo(() => d?.dims?.status || [], [d]);

  // Metric index mappings
  const PO_IDX = metric === "val" ? 8 : 7;
  const GRN_IDX = metric === "val" ? 10 : 9;
  const unitLabel = metric === "val" ? "₹ Lakhs" : "Units";
  const unitSymbol = metric === "val" ? "₹L" : "U";

  // Filter options mapping
  const tradeOptions = useMemo(() => allTrades.map((t) => ({ key: t, label: t })), [allTrades]);
  const regionOptions = useMemo(() => allRegions.map((r) => ({ key: r, label: r })), [allRegions]);
  const cityOptions = useMemo(() => allCities.map((c) => ({ key: c, label: c })), [allCities]);
  const catOptions = useMemo(() => allCategories.map((c) => ({ key: c, label: c })), [allCategories]);
  const statusOptions = useMemo(() => allStatuses.map((s) => ({ key: s, label: s })), [allStatuses]);

  // Active filter sets
  const tradeSet = useMemo(() => (selTrades.length ? new Set(selTrades) : null), [selTrades]);
  const regionSet = useMemo(() => (selRegions.length ? new Set(selRegions) : null), [selRegions]);
  const citySet = useMemo(() => (selCities.length ? new Set(selCities) : null), [selCities]);
  const catSet = useMemo(() => (selCategories.length ? new Set(selCategories) : null), [selCategories]);
  const statusSet = useMemo(() => (selStatuses.length ? new Set(selStatuses) : null), [selStatuses]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    if (!d) return [];
    return d.rows.filter((r) => {
      const tradeName = d.dims.trade[r[1]];
      const regionName = d.dims.region[r[2]];
      const cityName = d.dims.city[r[3]];
      const catName = d.dims.category[r[4]];
      const statusName = d.dims.status[r[5]];
      const skuName = d.dims.sku[r[6]];

      if (tradeSet && !tradeSet.has(tradeName)) return false;
      if (regionSet && !regionSet.has(regionName)) return false;
      if (citySet && !citySet.has(cityName)) return false;
      if (catSet && !catSet.has(catName)) return false;
      if (statusSet && !statusSet.has(statusName)) return false;
      if (skuSearch.trim()) {
        const q = skuSearch.toLowerCase();
        if (!skuName.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [d, tradeSet, regionSet, citySet, catSet, statusSet, skuSearch]);

  // Aggregate stats by month
  const statsByMonth = useMemo(() => {
    if (!d) return new Map<string, { po: number; grn: number; gap: number; fr: number; poCount: Set<number>; skus: Set<number>; cities: Set<number> }>();
    const map = new Map<string, { po: number; grn: number; gap: number; fr: number; poCount: Set<number>; skus: Set<number>; cities: Set<number> }>();

    for (const m of d.dims.month) {
      map.set(m, { po: 0, grn: 0, gap: 0, fr: 0, poCount: new Set(), skus: new Set(), cities: new Set() });
    }

    for (const r of filteredRows) {
      const m = d.dims.month[r[0]];
      if (!map.has(m)) {
        map.set(m, { po: 0, grn: 0, gap: 0, fr: 0, poCount: new Set(), skus: new Set(), cities: new Set() });
      }
      const st = map.get(m)!;
      const poVal = r[PO_IDX];
      const grnVal = r[GRN_IDX];
      st.po += poVal;
      st.grn += grnVal;
      st.poCount.add(r[12]);
      st.skus.add(r[6]);
      st.cities.add(r[3]);
    }

    map.forEach((st) => {
      st.gap = Math.max(0, st.po - st.grn);
      st.fr = st.po > 0 ? (st.grn / st.po) * 100 : 0;
    });

    return map;
  }, [d, filteredRows, PO_IDX, GRN_IDX]);

  const statsA = statsByMonth.get(monthA) || { po: 0, grn: 0, gap: 0, fr: 0, poCount: new Set(), skus: new Set(), cities: new Set() };
  const statsB = statsByMonth.get(monthB) || { po: 0, grn: 0, gap: 0, fr: 0, poCount: new Set(), skus: new Set(), cities: new Set() };

  // Differences between Month A and Month B
  const diffPo = statsB.po - statsA.po;
  const diffPoPct = statsA.po > 0 ? (diffPo / statsA.po) * 100 : 0;
  const diffGrn = statsB.grn - statsA.grn;
  const diffGrnPct = statsA.grn > 0 ? (diffGrn / statsA.grn) * 100 : 0;
  const diffFr = statsB.fr - statsA.fr; // percentage points
  const diffGap = statsB.gap - statsA.gap;
  const diffPoCount = statsB.poCount.size - statsA.poCount.size;

  // Comparison by Dimension (Trade, Category, City, Depo, Region)
  const dimensionData = useMemo(() => {
    if (!d) return [];

    type Agg = {
      key: string;
      name: string;
      subName?: string;
      aPo: number;
      aGrn: number;
      aGap: number;
      aFr: number;
      bPo: number;
      bGrn: number;
      bGap: number;
      bFr: number;
      diffPo: number;
      diffPoPct: number;
      diffGrn: number;
      diffFr: number;
      diffGap: number;
    };

    const map = new Map<string, Agg>();

    const getDimKey = (r: number[]): { key: string; name: string; subName?: string } => {
      if (selectedDim === "trade") {
        const t = d.dims.trade[r[1]];
        return { key: t, name: t };
      }
      if (selectedDim === "category") {
        const c = d.dims.category[r[4]];
        return { key: c, name: c };
      }
      if (selectedDim === "city") {
        const c = d.dims.city[r[3]];
        const reg = d.dims.region[r[2]];
        return { key: c, name: c, subName: reg };
      }
      if (selectedDim === "depo") {
        const c = d.dims.city[r[3]];
        const depoEntry = lookupDepoByCity(c);
        const depo = depoEntry?.depo || `${c} (Direct)`;
        return { key: depo, name: depo };
      }
      if (selectedDim === "region") {
        const reg = d.dims.region[r[2]];
        return { key: reg, name: reg };
      }
      return { key: "all", name: "All" };
    };

    for (const r of filteredRows) {
      const m = d.dims.month[r[0]];
      if (m !== monthA && m !== monthB) continue;

      const { key, name, subName } = getDimKey(r);
      if (!map.has(key)) {
        map.set(key, {
          key,
          name,
          subName,
          aPo: 0,
          aGrn: 0,
          aGap: 0,
          aFr: 0,
          bPo: 0,
          bGrn: 0,
          bGap: 0,
          bFr: 0,
          diffPo: 0,
          diffPoPct: 0,
          diffGrn: 0,
          diffFr: 0,
          diffGap: 0,
        });
      }

      const item = map.get(key)!;
      const poVal = r[PO_IDX];
      const grnVal = r[GRN_IDX];

      if (m === monthA) {
        item.aPo += poVal;
        item.aGrn += grnVal;
      }
      if (m === monthB) {
        item.bPo += poVal;
        item.bGrn += grnVal;
      }
    }

    const res: Agg[] = Array.from(map.values()).map((it) => {
      const aFr = it.aPo > 0 ? (it.aGrn / it.aPo) * 100 : 0;
      const bFr = it.bPo > 0 ? (it.bGrn / it.bPo) * 100 : 0;
      const aGap = Math.max(0, it.aPo - it.aGrn);
      const bGap = Math.max(0, it.bPo - it.bGrn);
      const diffPo = it.bPo - it.aPo;
      const diffPoPct = it.aPo > 0 ? (diffPo / it.aPo) * 100 : 0;
      const diffGrn = it.bGrn - it.aGrn;
      const diffFr = bFr - aFr;
      const diffGap = bGap - aGap;

      return {
        ...it,
        aFr,
        bFr,
        aGap,
        bGap,
        diffPo,
        diffPoPct,
        diffGrn,
        diffFr,
        diffGap,
      };
    });

    // Sorting
    return res.sort((a, b) => {
      let vA = 0;
      let vB = 0;
      if (sortCol === "name") {
        return sortDir === 1 ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      if (sortCol === "aPo") { vA = a.aPo; vB = b.aPo; }
      else if (sortCol === "bPo") { vA = a.bPo; vB = b.bPo; }
      else if (sortCol === "aFr") { vA = a.aFr; vB = b.aFr; }
      else if (sortCol === "bFr") { vA = a.bFr; vB = b.bFr; }
      else if (sortCol === "diffFr") { vA = a.diffFr; vB = b.diffFr; }
      else if (sortCol === "diffPo") { vA = a.diffPo; vB = b.diffPo; }
      else if (sortCol === "diffPoPct") { vA = a.diffPoPct; vB = b.diffPoPct; }
      else if (sortCol === "bGap") { vA = a.bGap; vB = b.bGap; }
      else { vA = a.bPo; vB = b.bPo; }

      return sortDir === 1 ? vA - vB : vB - vA;
    });
  }, [d, filteredRows, selectedDim, monthA, monthB, PO_IDX, GRN_IDX, sortCol, sortDir]);

  // SKU Comparison List
  const skuComparisonData = useMemo(() => {
    if (!d) return [];

    type SkuAgg = {
      skuId: number;
      skuName: string;
      category: string;
      icon: string | null;
      mmd: { code: string; name: string };
      aPo: number;
      aGrn: number;
      aFr: number;
      aGap: number;
      bPo: number;
      bGrn: number;
      bFr: number;
      bGap: number;
      diffPo: number;
      diffPoPct: number;
      diffFr: number;
      diffGap: number;
      statusA: string;
      statusB: string;
    };

    const map = new Map<number, SkuAgg>();

    for (const r of filteredRows) {
      const m = d.dims.month[r[0]];
      if (m !== monthA && m !== monthB) continue;

      const skuId = r[6];
      if (!map.has(skuId)) {
        const skuName = d.dims.sku[skuId] || "Unknown SKU";
        const cat = d.dims.category[r[4]] || "General";
        const icon = matchSkuIcon(skuName);
        const mmd = mmdGroup(skuName);

        map.set(skuId, {
          skuId,
          skuName,
          category: cat,
          icon,
          mmd,
          aPo: 0,
          aGrn: 0,
          aFr: 0,
          aGap: 0,
          bPo: 0,
          bGrn: 0,
          bFr: 0,
          bGap: 0,
          diffPo: 0,
          diffPoPct: 0,
          diffFr: 0,
          diffGap: 0,
          statusA: "None",
          statusB: "None",
        });
      }

      const item = map.get(skuId)!;
      const poVal = r[PO_IDX];
      const grnVal = r[GRN_IDX];

      if (m === monthA) {
        item.aPo += poVal;
        item.aGrn += grnVal;
      }
      if (m === monthB) {
        item.bPo += poVal;
        item.bGrn += grnVal;
      }
    }

    const items = Array.from(map.values()).map((it) => {
      const aFr = it.aPo > 0 ? (it.aGrn / it.aPo) * 100 : 0;
      const bFr = it.bPo > 0 ? (it.bGrn / it.bPo) * 100 : 0;
      const aGap = Math.max(0, it.aPo - it.aGrn);
      const bGap = Math.max(0, it.bPo - it.bGrn);
      const diffPo = it.bPo - it.aPo;
      const diffPoPct = it.aPo > 0 ? (diffPo / it.aPo) * 100 : 0;
      const diffFr = bFr - aFr;
      const diffGap = bGap - aGap;

      return {
        ...it,
        aFr,
        bFr,
        aGap,
        bGap,
        diffPo,
        diffPoPct,
        diffFr,
        diffGap,
      };
    });

    // Filter by type
    let filtered = items;
    if (skuFilterType === "gainers") {
      filtered = filtered.filter((s) => s.aPo > 0 && s.bPo > 0 && s.diffFr > 2);
    } else if (skuFilterType === "droppers") {
      filtered = filtered.filter((s) => s.aPo > 0 && s.bPo > 0 && s.diffFr < -2);
    } else if (skuFilterType === "growth") {
      filtered = filtered.filter((s) => s.diffPo > 0);
    } else if (skuFilterType === "gap") {
      filtered = filtered.filter((s) => s.bGap > 0);
    }

    return filtered.sort((a, b) => {
      if (skuFilterType === "gainers") return b.diffFr - a.diffFr;
      if (skuFilterType === "droppers") return a.diffFr - b.diffFr;
      if (skuFilterType === "gap") return b.bGap - a.bGap;
      if (skuFilterType === "growth") return b.diffPo - a.diffPo;
      return b.bPo - a.bPo;
    });
  }, [d, filteredRows, monthA, monthB, PO_IDX, GRN_IDX, skuFilterType]);

  // Master Pivot Matrix Data (All Months Side-by-Side)
  const matrixData = useMemo(() => {
    if (!d || !d.dims.month) return { headers: [], rows: [] };

    const monthList = d.dims.month;
    const map = new Map<string, { name: string; category?: string; months: Record<string, { po: number; grn: number; gap: number; fr: number }> }>();

    for (const r of filteredRows) {
      const m = d.dims.month[r[0]];
      let key = "";
      let name = "";
      let cat = "";

      if (matrixDim === "trade") {
        key = d.dims.trade[r[1]];
        name = key;
      } else if (matrixDim === "category") {
        key = d.dims.category[r[4]];
        name = key;
      } else if (matrixDim === "city") {
        key = d.dims.city[r[3]];
        name = key;
        cat = d.dims.region[r[2]];
      } else if (matrixDim === "depo") {
        const depoEntry = lookupDepoByCity(d.dims.city[r[3]]);
        key = depoEntry?.depo || `${d.dims.city[r[3]]} (Direct)`;
        name = key;
      } else if (matrixDim === "region") {
        key = d.dims.region[r[2]];
        name = key;
      }

      if (!map.has(key)) {
        const monthsObj: Record<string, { po: number; grn: number; gap: number; fr: number }> = {};
        for (const mon of monthList) {
          monthsObj[mon] = { po: 0, grn: 0, gap: 0, fr: 0 };
        }
        map.set(key, { name, category: cat, months: monthsObj });
      }

      const item = map.get(key)!;
      const poVal = r[PO_IDX];
      const grnVal = r[GRN_IDX];

      if (item.months[m]) {
        item.months[m].po += poVal;
        item.months[m].grn += grnVal;
      }
    }

    const rows = Array.from(map.values()).map((row) => {
      let totalPo = 0;
      let totalGrn = 0;
      for (const m of monthList) {
        const mData = row.months[m];
        mData.gap = Math.max(0, mData.po - mData.grn);
        mData.fr = mData.po > 0 ? (mData.grn / mData.po) * 100 : 0;
        totalPo += mData.po;
        totalGrn += mData.grn;
      }
      const overallFr = totalPo > 0 ? (totalGrn / totalPo) * 100 : 0;
      return {
        ...row,
        totalPo,
        totalGrn,
        overallFr,
      };
    });

    // Sort by total PO descending
    rows.sort((a, b) => b.totalPo - a.totalPo);

    return {
      headers: monthList,
      rows,
    };
  }, [d, filteredRows, matrixDim, PO_IDX, GRN_IDX]);

  // Top Movers and Key Insights
  const topInsights = useMemo(() => {
    if (dimensionData.length === 0) return null;

    // Highest improving dimension entity
    const validGainers = [...dimensionData].filter((d) => d.aPo > 0 && d.bPo > 0 && d.diffFr > 0).sort((a, b) => b.diffFr - a.diffFr);
    const topGainer = validGainers[0];

    // Worst dropping dimension entity
    const validDroppers = [...dimensionData].filter((d) => d.aPo > 0 && d.bPo > 0 && d.diffFr < 0).sort((a, b) => a.diffFr - b.diffFr);
    const topDropper = validDroppers[0];

    // Highest PO growth
    const poGrowers = [...dimensionData].sort((a, b) => b.diffPo - a.diffPo);
    const topDemand = poGrowers[0];

    // Biggest Gap contributor in Month B
    const gapLeaders = [...dimensionData].sort((a, b) => b.bGap - a.bGap);
    const topGap = gapLeaders[0];

    return {
      topGainer,
      topDropper,
      topDemand,
      topGap,
    };
  }, [dimensionData]);

  // Quick switch between consecutive months
  const setConsecutivePair = (idx: number) => {
    if (idx >= 0 && idx < months.length - 1) {
      setMonthA(months[idx]);
      setMonthB(months[idx + 1]);
    }
  };

  // Export comparison table to CSV
  const handleExportCSV = () => {
    if (dimensionData.length === 0) return;
    const header = [
      "Entity",
      `${monthA} PO (${unitLabel})`,
      `${monthA} GRN (${unitLabel})`,
      `${monthA} FR %`,
      `${monthB} PO (${unitLabel})`,
      `${monthB} GRN (${unitLabel})`,
      `${monthB} FR %`,
      `Diff PO (${unitLabel})`,
      "Diff PO %",
      "Diff FR % pts",
      `${monthB} Gap (${unitLabel})`,
    ];

    const rows = dimensionData.map((d) => [
      `"${d.name.replace(/"/g, '""')}"`,
      d.aPo.toFixed(2),
      d.aGrn.toFixed(2),
      d.aFr.toFixed(1),
      d.bPo.toFixed(2),
      d.bGrn.toFixed(2),
      d.bFr.toFixed(1),
      d.diffPo.toFixed(2),
      d.diffPoPct.toFixed(1) + "%",
      (d.diffFr > 0 ? "+" : "") + d.diffFr.toFixed(1) + "%",
      d.bGap.toFixed(2),
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [header.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `MoM_Comparison_${monthA}_vs_${monthB}_${selectedDim}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir((prev) => (prev === 1 ? -1 : 1));
    } else {
      setSortCol(col);
      setSortDir(-1);
    }
  };

  const openSkuLightbox = (sku: (typeof skuComparisonData)[number]) => {
    setSkuPopup({
      icon: sku.icon,
      name: sku.skuName,
      stats: [
        { label: "Category", value: sku.category },
        { label: `${monthA} PO Demand`, value: `${unitSymbol} ${L(sku.aPo)}` },
        { label: `${monthA} FR %`, value: `${sku.aFr.toFixed(1)}%`, cls: frColor(sku.aFr) },
        { label: `${monthB} PO Demand`, value: `${unitSymbol} ${L(sku.bPo)}` },
        { label: `${monthB} FR %`, value: `${sku.bFr.toFixed(1)}%`, cls: frColor(sku.bFr) },
        {
          label: "MoM Fill Rate Δ",
          value: `${sku.diffFr >= 0 ? "+" : ""}${sku.diffFr.toFixed(1)}% pts`,
          cls: sku.diffFr >= 0 ? "text-emerald-600 font-bold" : "text-rose-600 font-bold",
        },
      ],
    });
  };

  return (
    <div className="min-h-screen bg-[#00072D] text-slate-100 pb-20 selection:bg-indigo-500 selection:text-white">
      {/* ── HEADER BANNER ── */}
      <div className="border-b border-white/10 bg-[#000c40]/80 backdrop-blur-xl sticky top-0 z-30 shadow-lg">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">⚖️</span>
                <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight bg-gradient-to-r from-white via-indigo-200 to-sky-300 bg-clip-text text-transparent">
                  Month-on-Month Comparison Dashboard
                </h1>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Side-by-Side Analytics
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                Analyze growth, supply shifts, demand variations, and fill rate performance across months
              </p>
            </div>

            {/* Top action bar: metric toggle + sync + upload */}
            <div className="flex items-center flex-wrap gap-2.5">
              {/* Metric Toggle */}
              <div className="bg-slate-900/90 p-1 rounded-xl border border-white/10 flex items-center shadow-inner">
                <button
                  onClick={() => setMetric("val")}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                    metric === "val"
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  ₹ Value (Lakhs)
                </button>
                <button
                  onClick={() => setMetric("qty")}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                    metric === "qty"
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Quantity (Units)
                </button>
              </div>

              {/* Sync Status & Upload */}
              <SyncStatus />
              <UploadButton />

              {/* CSV Export */}
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10 text-slate-200 transition shadow-sm"
                title="Download current comparison table as CSV"
              >
                <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export CSV
              </button>
            </div>
          </div>

          {/* ── MONTH SELECTION BAR ── */}
          <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Compare Side-by-Side:
              </span>

              {/* Month A Selector */}
              <div className="flex items-center gap-2 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-sky-500/30 shadow-sm">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-pulse" />
                <span className="text-xs text-slate-400 font-medium">Base Month:</span>
                <select
                  value={monthA}
                  onChange={(e) => setMonthA(e.target.value)}
                  className="bg-transparent text-sm font-bold text-sky-300 focus:outline-none cursor-pointer"
                >
                  {months.map((m) => (
                    <option key={`a-${m}`} value={m} className="bg-slate-900 text-slate-100">
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <span className="text-base font-extrabold text-slate-500">VS</span>

              {/* Month B Selector */}
              <div className="flex items-center gap-2 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-emerald-500/30 shadow-sm">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-slate-400 font-medium">Comparison Month:</span>
                <select
                  value={monthB}
                  onChange={(e) => setMonthB(e.target.value)}
                  className="bg-transparent text-sm font-bold text-emerald-300 focus:outline-none cursor-pointer"
                >
                  {months.map((m) => (
                    <option key={`b-${m}`} value={m} className="bg-slate-900 text-slate-100">
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              {/* Quick pair jumpers */}
              {months.length > 2 && (
                <div className="hidden lg:flex items-center gap-1 ml-2 bg-white/5 p-1 rounded-lg border border-white/5 text-xs">
                  <span className="text-slate-400 px-1.5 text-[11px]">Quick Pairs:</span>
                  {months.slice(0, -1).map((m, i) => (
                    <button
                      key={`pair-${i}`}
                      onClick={() => setConsecutivePair(i)}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                        monthA === m && monthB === months[i + 1]
                          ? "bg-indigo-600 text-white font-bold"
                          : "text-slate-300 hover:bg-white/10"
                      }`}
                    >
                      {m.slice(0, 3)} vs {months[i + 1].slice(0, 3)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Swap Button */}
            <button
              onClick={() => {
                const temp = monthA;
                setMonthA(monthB);
                setMonthB(temp);
              }}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition flex items-center gap-1.5"
              title="Swap Base and Comparison Months"
            >
              <svg className="w-3.5 h-3.5 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              Swap Months
            </button>
          </div>
        </div>
      </div>

      {/* ── FILTER TOOLBAR ── */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 mt-4 relative z-30">
        <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-3.5 backdrop-blur-md shadow-xl flex flex-wrap items-center justify-between gap-3 relative z-30">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5 mr-1">
              <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Filters:
            </span>

            {/* Trade Filter */}
            <MultiSelectDropdown
              label="Trade"
              options={tradeOptions}
              selected={selTrades}
              onChange={setSelTrades}
              open={openDropdown === "trade"}
              onToggle={() => setOpenDropdown(openDropdown === "trade" ? null : "trade")}
              onClose={() => setOpenDropdown(null)}
            />

            {/* Region Filter */}
            <MultiSelectDropdown
              label="Region"
              options={regionOptions}
              selected={selRegions}
              onChange={setSelRegions}
              open={openDropdown === "region"}
              onToggle={() => setOpenDropdown(openDropdown === "region" ? null : "region")}
              onClose={() => setOpenDropdown(null)}
            />

            {/* City Filter */}
            <MultiSelectDropdown
              label="City"
              options={cityOptions}
              selected={selCities}
              onChange={setSelCities}
              open={openDropdown === "city"}
              onToggle={() => setOpenDropdown(openDropdown === "city" ? null : "city")}
              onClose={() => setOpenDropdown(null)}
            />

            {/* Category Filter */}
            <MultiSelectDropdown
              label="Category"
              options={catOptions}
              selected={selCategories}
              onChange={setSelCategories}
              open={openDropdown === "category"}
              onToggle={() => setOpenDropdown(openDropdown === "category" ? null : "category")}
              onClose={() => setOpenDropdown(null)}
            />

            {/* Status Filter */}
            <MultiSelectDropdown
              label="Status"
              options={statusOptions}
              selected={selStatuses}
              onChange={setSelStatuses}
              open={openDropdown === "status"}
              onToggle={() => setOpenDropdown(openDropdown === "status" ? null : "status")}
              onClose={() => setOpenDropdown(null)}
            />

            {/* SKU Search */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search SKU..."
                value={skuSearch}
                onChange={(e) => setSkuSearch(e.target.value)}
                className="px-3 py-1.5 pl-7 text-xs rounded-lg border border-slate-700/60 bg-slate-900/80 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-36 sm:w-44 shadow-sm"
              />
              <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {skuSearch && (
                <button
                  onClick={() => setSkuSearch("")}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-200"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {/* Reset Filters */}
          {(selTrades.length > 0 || selRegions.length > 0 || selCities.length > 0 || selCategories.length > 0 || selStatuses.length > 0 || skuSearch) && (
            <button
              onClick={() => {
                setSelTrades([]);
                setSelRegions([]);
                setSelCities([]);
                setSelCategories([]);
                setSelStatuses([]);
                setSkuSearch("");
              }}
              className="text-xs text-rose-400 hover:text-rose-300 font-semibold flex items-center gap-1 transition px-2 py-1 rounded bg-rose-950/40 border border-rose-800/40"
            >
              Reset All Filters
            </button>
          )}
        </div>
      </div>

      {/* ── TOP KPI COMPARISON CARDS ── */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 mt-6 relative z-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: PO Demand */}
          <div className="bg-slate-900/70 border border-white/10 rounded-2xl p-4 shadow-xl backdrop-blur-md relative overflow-hidden group hover:border-indigo-500/40 transition">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total PO Demand</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-white/5">
                {unitLabel}
              </span>
            </div>

            <div className="flex items-baseline justify-between mt-1">
              <div>
                <span className="text-[11px] text-sky-400 font-semibold block">{monthA}</span>
                <span className="text-lg sm:text-xl font-black text-slate-200">
                  {unitSymbol} {L(statsA.po)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-emerald-400 font-semibold block">{monthB}</span>
                <span className="text-lg sm:text-xl font-black text-white">
                  {unitSymbol} {L(statsB.po)}
                </span>
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">MoM Variance:</span>
              <span
                className={`font-bold flex items-center gap-1 ${
                  diffPo >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {diffPo >= 0 ? "▲ +" : "▼ "}
                {unitSymbol} {L(Math.abs(diffPo))} ({diffPoPct >= 0 ? "+" : ""}
                {diffPoPct.toFixed(1)}%)
              </span>
            </div>
          </div>

          {/* Card 2: Supplied GRN */}
          <div className="bg-slate-900/70 border border-white/10 rounded-2xl p-4 shadow-xl backdrop-blur-md relative overflow-hidden group hover:border-emerald-500/40 transition">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Supplied Value (GRN)</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-white/5">
                {unitLabel}
              </span>
            </div>

            <div className="flex items-baseline justify-between mt-1">
              <div>
                <span className="text-[11px] text-sky-400 font-semibold block">{monthA}</span>
                <span className="text-lg sm:text-xl font-black text-slate-200">
                  {unitSymbol} {L(statsA.grn)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-emerald-400 font-semibold block">{monthB}</span>
                <span className="text-lg sm:text-xl font-black text-white">
                  {unitSymbol} {L(statsB.grn)}
                </span>
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Supply Growth:</span>
              <span
                className={`font-bold flex items-center gap-1 ${
                  diffGrn >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {diffGrn >= 0 ? "▲ +" : "▼ "}
                {unitSymbol} {L(Math.abs(diffGrn))} ({diffGrnPct >= 0 ? "+" : ""}
                {diffGrnPct.toFixed(1)}%)
              </span>
            </div>
          </div>

          {/* Card 3: Overall Fill Rate % */}
          <div className="bg-slate-900/70 border border-white/10 rounded-2xl p-4 shadow-xl backdrop-blur-md relative overflow-hidden group hover:border-amber-500/40 transition">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Fill Rate (FR %)</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Target 90%
              </span>
            </div>

            <div className="flex items-baseline justify-between mt-1">
              <div>
                <span className="text-[11px] text-sky-400 font-semibold block">{monthA}</span>
                <span className={`text-lg sm:text-xl font-black ${frColor(statsA.fr)}`}>
                  {statsA.fr.toFixed(1)}%
                </span>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-emerald-400 font-semibold block">{monthB}</span>
                <span className={`text-lg sm:text-xl font-black ${frColor(statsB.fr)}`}>
                  {statsB.fr.toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">FR Change:</span>
              <span
                className={`font-bold px-2 py-0.5 rounded-full text-xs ${
                  diffFr >= 0
                    ? "bg-emerald-950/80 text-emerald-300 border border-emerald-700/50"
                    : "bg-rose-950/80 text-rose-300 border border-rose-700/50"
                }`}
              >
                {diffFr >= 0 ? "▲ +" : "▼ "}
                {diffFr.toFixed(1)}% pts
              </span>
            </div>
          </div>

          {/* Card 4: Unsupplied Gap & Orders */}
          <div className="bg-slate-900/70 border border-white/10 rounded-2xl p-4 shadow-xl backdrop-blur-md relative overflow-hidden group hover:border-rose-500/40 transition">
            <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 rounded-full blur-2xl group-hover:bg-rose-500/20 transition" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Unsupplied Gap</span>
              <span className="text-xs font-semibold text-slate-400">
                {statsB.poCount.size} POs ({diffPoCount >= 0 ? `+${diffPoCount}` : diffPoCount})
              </span>
            </div>

            <div className="flex items-baseline justify-between mt-1">
              <div>
                <span className="text-[11px] text-sky-400 font-semibold block">{monthA} Gap</span>
                <span className="text-lg sm:text-xl font-black text-rose-300">
                  {unitSymbol} {L(statsA.gap)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-emerald-400 font-semibold block">{monthB} Gap</span>
                <span className="text-lg sm:text-xl font-black text-rose-400">
                  {unitSymbol} {L(statsB.gap)}
                </span>
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Gap Delta:</span>
              <span
                className={`font-bold ${
                  diffGap <= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {diffGap <= 0 ? "▼ Reduced by " : "▲ Increased by "}
                {unitSymbol} {L(Math.abs(diffGap))}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── KEY INSIGHTS STRIP ── */}
      {topInsights && (
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 mt-4">
          <div className="bg-gradient-to-r from-indigo-950/60 via-slate-900/80 to-slate-900/60 border border-indigo-500/20 rounded-2xl p-3 shadow-lg flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-base">💡</span>
              <span className="font-bold text-indigo-300 uppercase tracking-wide">
                Key MoM Movers ({monthA} → {monthB}):
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {topInsights.topGainer && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-700/40 text-emerald-200">
                  <span className="text-emerald-400 font-bold">Top Gainer:</span>
                  <span className="font-semibold text-white">{topInsights.topGainer.name}</span>
                  <span className="text-emerald-400 font-extrabold">+{topInsights.topGainer.diffFr.toFixed(1)}% FR</span>
                </div>
              )}

              {topInsights.topDropper && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-950/60 border border-rose-700/40 text-rose-200">
                  <span className="text-rose-400 font-bold">Top Drop:</span>
                  <span className="font-semibold text-white">{topInsights.topDropper.name}</span>
                  <span className="text-rose-400 font-extrabold">{topInsights.topDropper.diffFr.toFixed(1)}% FR</span>
                </div>
              )}

              {topInsights.topDemand && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-950/60 border border-indigo-700/40 text-indigo-200">
                  <span className="text-indigo-400 font-bold">Demand Leader:</span>
                  <span className="font-semibold text-white">{topInsights.topDemand.name}</span>
                  <span className="text-indigo-300 font-extrabold">
                    {topInsights.topDemand.diffPo >= 0 ? "+" : ""}{unitSymbol} {L(topInsights.topDemand.diffPo)}
                  </span>
                </div>
              )}

              {topInsights.topGap && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-950/60 border border-amber-700/40 text-amber-200">
                  <span className="text-amber-400 font-bold">Max Gap in {monthB}:</span>
                  <span className="font-semibold text-white">{topInsights.topGap.name}</span>
                  <span className="text-amber-300 font-extrabold">{unitSymbol} {L(topInsights.topGap.bGap)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN TABS NAVIGATOR ── */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 mt-6">
        <div className="border-b border-white/10 flex items-center justify-between flex-wrap gap-3 pb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("deep-dive")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition ${
                activeTab === "deep-dive"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              <span>📊</span>
              Dimension Comparator
            </button>

            <button
              onClick={() => setActiveTab("sku-compare")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition ${
                activeTab === "sku-compare"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              <span>📦</span>
              SKU-Level Movers
            </button>

            <button
              onClick={() => setActiveTab("matrix")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition ${
                activeTab === "matrix"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              <span>🗓️</span>
              Multi-Month Matrix Heatmap
            </button>
          </div>

          {/* Dimension Selector when in Deep Dive Tab */}
          {activeTab === "deep-dive" && (
            <div className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-white/10">
              <span className="text-xs text-slate-400 px-2 font-medium">Group by:</span>
              {(["trade", "category", "city", "depo", "region"] as DimensionKey[]).map((dim) => (
                <button
                  key={dim}
                  onClick={() => setSelectedDim(dim)}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg capitalize transition ${
                    selectedDim === dim
                      ? "bg-indigo-500/30 text-indigo-200 border border-indigo-500/40"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {dim}
                </button>
              ))}
            </div>
          )}

          {/* Matrix Dimension Selector */}
          {activeTab === "matrix" && (
            <div className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-white/10">
              <span className="text-xs text-slate-400 px-2 font-medium">Matrix Rows:</span>
              {(["trade", "category", "city", "depo", "region"] as DimensionKey[]).map((dim) => (
                <button
                  key={`matrix-${dim}`}
                  onClick={() => setMatrixDim(dim)}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg capitalize transition ${
                    matrixDim === dim
                      ? "bg-indigo-500/30 text-indigo-200 border border-indigo-500/40"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {dim}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── TAB CONTENT 1: DIMENSION COMPARATOR ── */}
      {activeTab === "deep-dive" && (
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 mt-4">
          <div className="bg-slate-900/70 border border-white/10 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">
            <div className="px-5 py-3.5 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 bg-slate-950/40">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-200 capitalize">
                  {selectedDim}-wise Side-by-Side Comparison
                </span>
                <span className="text-xs text-slate-400">
                  ({dimensionData.length} records)
                </span>
              </div>

              <div className="text-xs text-slate-400 flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
                  {monthA} (Base)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  {monthB} (Compare)
                </span>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950/80 border-b border-white/10 text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                    <th
                      onClick={() => handleSort("name")}
                      className="py-3 px-4 cursor-pointer hover:text-white transition"
                    >
                      <div className="flex items-center gap-1">
                        <span className="capitalize">{selectedDim} Name</span>
                        {sortCol === "name" && (sortDir === 1 ? "▲" : "▼")}
                      </div>
                    </th>

                    {/* Month A group */}
                    <th
                      onClick={() => handleSort("aPo")}
                      className="py-3 px-3 text-right bg-sky-950/30 text-sky-300 cursor-pointer hover:text-white transition"
                    >
                      {monthA} PO ({unitSymbol})
                    </th>
                    <th className="py-3 px-3 text-right bg-sky-950/30 text-sky-300">
                      {monthA} GRN ({unitSymbol})
                    </th>
                    <th
                      onClick={() => handleSort("aFr")}
                      className="py-3 px-3 text-center bg-sky-950/30 text-sky-300 cursor-pointer hover:text-white transition border-r border-white/10"
                    >
                      {monthA} FR %
                    </th>

                    {/* Month B group */}
                    <th
                      onClick={() => handleSort("bPo")}
                      className="py-3 px-3 text-right bg-emerald-950/30 text-emerald-300 cursor-pointer hover:text-white transition"
                    >
                      {monthB} PO ({unitSymbol})
                    </th>
                    <th className="py-3 px-3 text-right bg-emerald-950/30 text-emerald-300">
                      {monthB} GRN ({unitSymbol})
                    </th>
                    <th
                      onClick={() => handleSort("bFr")}
                      className="py-3 px-3 text-center bg-emerald-950/30 text-emerald-300 cursor-pointer hover:text-white transition border-r border-white/10"
                    >
                      {monthB} FR %
                    </th>

                    {/* Variance group */}
                    <th
                      onClick={() => handleSort("diffPo")}
                      className="py-3 px-3 text-right cursor-pointer hover:text-white transition"
                    >
                      Δ PO Demand
                    </th>
                    <th
                      onClick={() => handleSort("diffFr")}
                      className="py-3 px-3 text-center cursor-pointer hover:text-white transition"
                    >
                      Δ FR % (pts)
                    </th>
                    <th
                      onClick={() => handleSort("bGap")}
                      className="py-3 px-3 text-right cursor-pointer hover:text-white transition"
                    >
                      {monthB} Gap
                    </th>
                    <th className="py-3 px-4 text-left w-52">
                      Side-by-Side Visual
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-white/5 font-medium">
                  {dimensionData.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-slate-500">
                        No records match the selected filters.
                      </td>
                    </tr>
                  ) : (
                    dimensionData.map((row) => {
                      const maxPo = Math.max(row.aPo, row.bPo, 0.001);
                      const barA = (row.aPo / maxPo) * 100;
                      const barB = (row.bPo / maxPo) * 100;

                      return (
                        <tr
                          key={row.key}
                          className="hover:bg-white/[0.03] transition-colors group"
                        >
                          <td className="py-3 px-4 text-slate-200 font-bold">
                            <div className="flex flex-col">
                              <span>{row.name}</span>
                              {row.subName && (
                                <span className="text-[10px] text-slate-400 font-normal">
                                  {row.subName}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Month A Values */}
                          <td className="py-3 px-3 text-right font-mono bg-sky-950/10 text-slate-300">
                            {L(row.aPo)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono bg-sky-950/10 text-slate-300">
                            {L(row.aGrn)}
                          </td>
                          <td className="py-3 px-3 text-center bg-sky-950/10 border-r border-white/10">
                            <span className={frPill(row.aFr)}>{row.aFr.toFixed(1)}%</span>
                          </td>

                          {/* Month B Values */}
                          <td className="py-3 px-3 text-right font-mono bg-emerald-950/10 text-white font-bold">
                            {L(row.bPo)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono bg-emerald-950/10 text-slate-200">
                            {L(row.bGrn)}
                          </td>
                          <td className="py-3 px-3 text-center bg-emerald-950/10 border-r border-white/10">
                            <span className={frPill(row.bFr)}>{row.bFr.toFixed(1)}%</span>
                          </td>

                          {/* Variance */}
                          <td className="py-3 px-3 text-right font-mono">
                            <span
                              className={
                                row.diffPo >= 0 ? "text-emerald-400" : "text-rose-400"
                              }
                            >
                              {row.diffPo >= 0 ? "+" : ""}
                              {L(row.diffPo)}
                              <span className="text-[10px] text-slate-400 ml-1">
                                ({row.diffPoPct >= 0 ? "+" : ""}
                                {row.diffPoPct.toFixed(0)}%)
                              </span>
                            </span>
                          </td>

                          <td className="py-3 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-bold ${
                                row.diffFr >= 0
                                  ? "bg-emerald-950/70 text-emerald-300 border border-emerald-700/40"
                                  : "bg-rose-950/70 text-rose-300 border border-rose-700/40"
                              }`}
                            >
                              {row.diffFr >= 0 ? "▲ +" : "▼ "}
                              {row.diffFr.toFixed(1)}%
                            </span>
                          </td>

                          <td className="py-3 px-3 text-right font-mono text-rose-300">
                            {row.bGap > 0 ? L(row.bGap) : "—"}
                          </td>

                          {/* Visual Comparison Bar */}
                          <td className="py-3 px-4">
                            <div className="space-y-1.5 w-44">
                              <div className="flex items-center gap-1.5 text-[10px]">
                                <span className="w-5 text-sky-400 shrink-0">{monthA.slice(0, 3)}</span>
                                <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className="bg-sky-400 h-full rounded-full transition-all"
                                    style={{ width: `${barA}%` }}
                                  />
                                </div>
                                <span className="font-mono text-slate-400 w-8 text-right">
                                  {row.aFr.toFixed(0)}%
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 text-[10px]">
                                <span className="w-5 text-emerald-400 shrink-0">{monthB.slice(0, 3)}</span>
                                <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className="bg-emerald-400 h-full rounded-full transition-all"
                                    style={{ width: `${barB}%` }}
                                  />
                                </div>
                                <span className="font-mono text-slate-300 font-bold w-8 text-right">
                                  {row.bFr.toFixed(0)}%
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB CONTENT 2: SKU-LEVEL MOVERS ── */}
      {activeTab === "sku-compare" && (
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 mt-4">
          <div className="bg-slate-900/70 border border-white/10 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">
            {/* Toolbar for SKUs */}
            <div className="px-5 py-3.5 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 bg-slate-950/40">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-200">
                  SKU Month-on-Month Performance Comparator
                </span>
                <span className="text-xs text-slate-400">
                  ({skuComparisonData.length} SKUs displayed)
                </span>
              </div>

              {/* SKU Filter Segmented Buttons */}
              <div className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-white/10 text-xs">
                <button
                  onClick={() => setSkuFilterType("all")}
                  className={`px-3 py-1 rounded-lg font-semibold transition ${
                    skuFilterType === "all"
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  All SKUs
                </button>
                <button
                  onClick={() => setSkuFilterType("gainers")}
                  className={`px-3 py-1 rounded-lg font-semibold transition ${
                    skuFilterType === "gainers"
                      ? "bg-emerald-600 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Top Gainers (FR ↑)
                </button>
                <button
                  onClick={() => setSkuFilterType("droppers")}
                  className={`px-3 py-1 rounded-lg font-semibold transition ${
                    skuFilterType === "droppers"
                      ? "bg-rose-600 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Top Droppers (FR ↓)
                </button>
                <button
                  onClick={() => setSkuFilterType("growth")}
                  className={`px-3 py-1 rounded-lg font-semibold transition ${
                    skuFilterType === "growth"
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  High Growth (PO ↑)
                </button>
                <button
                  onClick={() => setSkuFilterType("gap")}
                  className={`px-3 py-1 rounded-lg font-semibold transition ${
                    skuFilterType === "gap"
                      ? "bg-amber-600 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  High Gap in {monthB}
                </button>
              </div>
            </div>

            {/* SKU Table */}
            <div className="overflow-x-auto custom-scrollbar max-h-[700px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-slate-950 border-b border-white/10 text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4 w-12 text-center">Image</th>
                    <th className="py-3 px-4">SKU Name & Category</th>
                    <th className="py-3 px-3 text-right bg-sky-950/40 text-sky-300">
                      {monthA} PO ({unitSymbol})
                    </th>
                    <th className="py-3 px-3 text-center bg-sky-950/40 text-sky-300 border-r border-white/10">
                      {monthA} FR %
                    </th>
                    <th className="py-3 px-3 text-right bg-emerald-950/40 text-emerald-300">
                      {monthB} PO ({unitSymbol})
                    </th>
                    <th className="py-3 px-3 text-center bg-emerald-950/40 text-emerald-300 border-r border-white/10">
                      {monthB} FR %
                    </th>
                    <th className="py-3 px-3 text-right">Δ PO Demand</th>
                    <th className="py-3 px-3 text-center">Δ FR % pts</th>
                    <th className="py-3 px-3 text-right">{monthB} Gap ({unitSymbol})</th>
                    <th className="py-3 px-4">Status & Action</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-white/5 font-medium">
                  {skuComparisonData.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-500">
                        No SKUs found for the current search and filter settings.
                      </td>
                    </tr>
                  ) : (
                    skuComparisonData.slice(0, 100).map((sku) => (
                      <tr
                        key={sku.skuId}
                        className="hover:bg-white/[0.03] transition-colors group"
                      >
                        {/* Image Thumbnail */}
                        <td className="py-2.5 px-4 text-center">
                          <button
                            onClick={() => openSkuLightbox(sku)}
                            className="w-8 h-8 rounded-lg bg-slate-800 border border-white/10 hover:border-indigo-400 grid place-items-center transition text-sm shadow-sm overflow-hidden"
                            title="Click to preview SKU image"
                          >
                            {sku.icon ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={sku.icon} alt="" className="w-full h-full object-contain" />
                            ) : (
                              <span>📦</span>
                            )}
                          </button>
                        </td>

                        {/* SKU Name & Info */}
                        <td className="py-2.5 px-4 max-w-sm">
                          <div className="flex flex-col">
                            <span
                              onClick={() => openSkuLightbox(sku)}
                              className="font-bold text-slate-200 hover:text-indigo-300 cursor-pointer truncate"
                              title={sku.skuName}
                            >
                              {sku.skuName}
                            </span>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-800/40">
                                {sku.category}
                              </span>
                              {sku.mmd?.code && (
                                <span className="text-[10px] text-slate-400 font-mono">
                                  MMD: {sku.mmd.code}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Month A PO & FR */}
                        <td className="py-2.5 px-3 text-right font-mono bg-sky-950/10 text-slate-300">
                          {L(sku.aPo)}
                        </td>
                        <td className="py-2.5 px-3 text-center bg-sky-950/10 border-r border-white/10">
                          <span className={frPill(sku.aFr)}>{sku.aFr.toFixed(1)}%</span>
                        </td>

                        {/* Month B PO & FR */}
                        <td className="py-2.5 px-3 text-right font-mono bg-emerald-950/10 text-white font-bold">
                          {L(sku.bPo)}
                        </td>
                        <td className="py-2.5 px-3 text-center bg-emerald-950/10 border-r border-white/10">
                          <span className={frPill(sku.bFr)}>{sku.bFr.toFixed(1)}%</span>
                        </td>

                        {/* Delta PO */}
                        <td className="py-2.5 px-3 text-right font-mono">
                          <span
                            className={
                              sku.diffPo >= 0 ? "text-emerald-400" : "text-rose-400"
                            }
                          >
                            {sku.diffPo >= 0 ? "+" : ""}
                            {L(sku.diffPo)}
                          </span>
                        </td>

                        {/* Delta FR */}
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-bold ${
                              sku.diffFr >= 0
                                ? "bg-emerald-950/70 text-emerald-300 border border-emerald-700/40"
                                : "bg-rose-950/70 text-rose-300 border border-rose-700/40"
                            }`}
                          >
                            {sku.diffFr >= 0 ? "▲ +" : "▼ "}
                            {sku.diffFr.toFixed(1)}%
                          </span>
                        </td>

                        {/* Month B Gap */}
                        <td className="py-2.5 px-3 text-right font-mono text-rose-300">
                          {sku.bGap > 0 ? L(sku.bGap) : "—"}
                        </td>

                        {/* Status / Quick Tag */}
                        <td className="py-2.5 px-4">
                          {sku.aPo === 0 && sku.bPo > 0 && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-950 text-sky-300 border border-sky-800">
                              NEW in {monthB}
                            </span>
                          )}
                          {sku.aPo > 0 && sku.bPo === 0 && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-white/10">
                              Dropped in {monthB}
                            </span>
                          )}
                          {sku.bFr === 100 && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800/40">
                              100% Fulfilled
                            </span>
                          )}
                          {sku.bPo > 0 && sku.bFr === 0 && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950/90 text-rose-300 border border-rose-800/50">
                              Zero Supply Alert
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {skuComparisonData.length > 100 && (
              <div className="p-3 text-center text-xs text-slate-400 border-t border-white/10 bg-slate-950/60">
                Showing top 100 of {skuComparisonData.length} SKUs. Use the search bar to find specific products.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB CONTENT 3: MASTER MULTI-MONTH MATRIX ── */}
      {activeTab === "matrix" && (
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 mt-4">
          <div className="bg-slate-900/70 border border-white/10 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">
            <div className="px-5 py-3.5 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 bg-slate-950/40">
              <div>
                <span className="font-bold text-slate-200 capitalize">
                  All Months Side-by-Side Matrix ({matrixDim.toUpperCase()})
                </span>
                <p className="text-xs text-slate-400 mt-0.5">
                  Complete view across all available reporting months in chronological order
                </p>
              </div>

              {/* Heatmap Legend */}
              <div className="flex items-center gap-3 text-xs">
                <span className="text-slate-400 font-semibold">FR % Legend:</span>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700">
                  ≥ 90% (Good)
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-950 text-amber-300 border border-amber-700">
                  75 - 89% (Medium)
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-950 text-rose-300 border border-rose-700">
                  &lt; 75% (Critical)
                </span>
              </div>
            </div>

            {/* Matrix Table */}
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950 border-b border-white/10 text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4 sticky left-0 bg-slate-950 z-10 border-r border-white/10 capitalize">
                      {matrixDim} Name
                    </th>

                    {/* Month Columns */}
                    {matrixData.headers.map((m) => (
                      <th
                        key={`col-${m}`}
                        colSpan={2}
                        className="py-3 px-3 text-center border-r border-white/10 bg-slate-900/80"
                      >
                        <span className="font-extrabold text-indigo-300">{m}</span>
                      </th>
                    ))}

                    <th className="py-3 px-4 text-right">
                      Total PO ({unitSymbol})
                    </th>
                    <th className="py-3 px-4 text-center">
                      Overall FR %
                    </th>
                  </tr>

                  <tr className="bg-slate-950/90 border-b border-white/10 text-[10px] text-slate-400 font-semibold uppercase">
                    <th className="py-1 px-4 sticky left-0 bg-slate-950 z-10 border-r border-white/10" />
                    {matrixData.headers.map((m) => (
                      <th key={`subcol-${m}`} colSpan={2} className="py-1 px-2 border-r border-white/10">
                        <div className="flex justify-between px-2">
                          <span>PO ({unitSymbol})</span>
                          <span>FR %</span>
                        </div>
                      </th>
                    ))}
                    <th className="py-1 px-4 text-right" />
                    <th className="py-1 px-4 text-center" />
                  </tr>
                </thead>

                <tbody className="divide-y divide-white/5 font-medium">
                  {matrixData.rows.length === 0 ? (
                    <tr>
                      <td colSpan={matrixData.headers.length * 2 + 3} className="py-12 text-center text-slate-500">
                        No matrix data available.
                      </td>
                    </tr>
                  ) : (
                    matrixData.rows.map((row) => (
                      <tr
                        key={row.name}
                        className="hover:bg-white/[0.03] transition-colors"
                      >
                        <td className="py-3 px-4 font-bold text-slate-200 sticky left-0 bg-slate-900/90 backdrop-blur-md z-10 border-r border-white/10">
                          {row.name}
                          {row.category && (
                            <span className="block text-[10px] text-slate-400 font-normal">
                              {row.category}
                            </span>
                          )}
                        </td>

                        {/* Month Data Cells */}
                        {matrixData.headers.map((m) => {
                          const mData = row.months[m] || { po: 0, grn: 0, gap: 0, fr: 0 };
                          return (
                            <td
                              key={`cell-${row.name}-${m}`}
                              colSpan={2}
                              className="py-2.5 px-3 border-r border-white/10"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-slate-300">
                                  {mData.po > 0 ? L(mData.po) : "—"}
                                </span>
                                {mData.po > 0 ? (
                                  <span className={frPill(mData.fr)}>
                                    {mData.fr.toFixed(0)}%
                                  </span>
                                ) : (
                                  <span className="text-slate-600 text-[11px]">—</span>
                                )}
                              </div>
                            </td>
                          );
                        })}

                        {/* Total Summary */}
                        <td className="py-3 px-4 text-right font-mono font-bold text-white">
                          {L(row.totalPo)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={frPill(row.overallFr)}>
                            {row.overallFr.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── SKU Image Preview Modal ── */}
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
