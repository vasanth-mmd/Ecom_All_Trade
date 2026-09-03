"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import UploadButton from "../upload-button";
import SyncStatus from "../sync-status";
import { mmdGroup } from "@/lib/mmd-mapping";
import { matchSkuIcon } from "@/lib/sku-icon";
import { lookupDepoByCity } from "@/lib/depo-mapping";
import SkuImagePopup from "../sku-image-popup";
import { broadcastTickerSync } from "@/lib/ticker-sync";

/* Row shape:
   [month, trade, region, city, category, status, sku,
    poQty, poVal, grnQty, grnVal, dateYYYYMMDD, poId, expiryYYYYMMDD] */

type Data = {
  meta: any;
  dims: Record<string, string[]>;
  rows: number[][];
};

const L = (n: number, d = 1) =>
  n.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: 0 });
const L2 = (n: number) =>
  n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

const frPill = (fr: number) => {
  if (fr >= 90) return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (fr >= 75) return "bg-amber-100 text-amber-800 border-amber-200";
  if (fr > 0) return "bg-orange-100 text-orange-800 border-orange-200";
  return "bg-rose-100 text-rose-800 border-rose-200 font-bold";
};

const DATE_PRESETS = [
  { label: "Today", days: 1 },
  { label: "7 Days", days: 7 },
  { label: "14 Days", days: 14 },
  { label: "30 Days", days: 30 },
  { label: "MTD", days: 0 },
  { label: "All Dates", days: -1 },
];

const dateToYmd = (s: string) => (s ? +s.replaceAll("-", "") : 0);

/* ── Reusable Multi-Select Checkbox Dropdown ── */
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
                  className="text-rose-600 hover:text-rose-800 hover:underline cursor-pointer"
                >
                  Clear
                </button>
              </div>
              <span className="text-slate-400">
                {selected.length}/{options.length}
              </span>
            </div>

            <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
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

type SkuRow = {
  skuKey: string;
  skuName: string;
  category: string;
  mmdCode: string;
  mmdName: string;
  icon: string | null;
  poQty: number;
  poVal: number;
  grnQty: number;
  grnVal: number;
  gapQty: number;
  gapVal: number;
  frVal: number;
  frQty: number;
  poCount: number;
};

type CityGroup = {
  city: string;
  region: string;
  depo: string;
  state: string;
  delLocation: string;
  poCount: number;
  poQty: number;
  poVal: number;
  grnQty: number;
  grnVal: number;
  gapQty: number;
  gapVal: number;
  frVal: number;
  frQty: number;
  skus: SkuRow[];
};

type SkuSortKey =
  | "skuName"
  | "category"
  | "poQty"
  | "poVal"
  | "grnQty"
  | "grnVal"
  | "gapQty"
  | "gapVal"
  | "frVal"
  | "frQty";

type CitySortKey = "city" | "poVal" | "grnVal" | "gapVal" | "frVal" | "skuCount" | "poCount";

export default function CitySkuDashboardPage() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");

  // Global filters
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [selMonths, setSelMonths] = useState<string[]>([]);
  const [selTrades, setSelTrades] = useState<string[]>([]);
  const [selRegions, setSelRegions] = useState<string[]>([]);
  const [selCities, setSelCities] = useState<string[]>([]);
  const [selCategories, setSelCategories] = useState<string[]>([]);
  const [selStatuses, setSelStatuses] = useState<string[]>([]);
  const [globalSearch, setGlobalSearch] = useState("");
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // View Controls
  const [citySortBy, setCitySortBy] = useState<CitySortKey>("gapVal");
  const [citySortDir, setCitySortDir] = useState<"asc" | "desc">("desc");
  const [collapsedCities, setCollapsedCities] = useState<Record<string, boolean>>({});
  const [citySearchQueries, setCitySearchQueries] = useState<Record<string, string>>({});
  const [citySkuSorts, setCitySkuSorts] = useState<
    Record<string, { key: SkuSortKey; dir: "asc" | "desc" }>
  >({});
  const [focusedCity, setFocusedCity] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadingOne, setDownloadingOne] = useState(false);

  // Sku Lightbox popup
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
          const max = data.meta.date_max as string;
          setFFrom((prev) => prev || max.slice(0, 7) + "-01");
          setFTo((prev) => prev || max);
        }
        // Pre-select 3 finalized statuses by default if not set
        if (data?.dims?.status) {
          const coreStatuses = ["EXPIRED", "COMPLETED", "GRN_DONE"];
          const available = data.dims.status.filter((s: string) =>
            coreStatuses.includes(s.trim().toUpperCase())
          );
          if (available.length > 0) {
            setSelStatuses((prev) => (prev.length === 0 ? available : prev));
          }
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
    setSelStatuses([]);
    setGlobalSearch("");
    setFocusedCity(null);
    if (d?.meta?.date_max) {
      const max = d.meta.date_max as string;
      setFFrom(max.slice(0, 7) + "-01");
      setFTo(max);
    } else {
      setFFrom("");
      setFTo("");
    }
  }

  // Filter raw rows
  const filteredRows = useMemo(() => {
    if (!d || !d.rows) return [];
    const fromYmd = dateToYmd(fFrom);
    const toYmd = dateToYmd(fTo);

    const monthSet = new Set(selMonths);
    const tradeSet = new Set(selTrades);
    const regionSet = new Set(selRegions);
    const citySet = new Set(selCities);
    const categorySet = new Set(selCategories);
    const statusSet = new Set(selStatuses);

    return d.rows.filter((r) => {
      const rowMonth = d.dims.month?.[r[0]] || "";
      const rowTrade = d.dims.trade?.[r[1]] || "";
      const rowRegion = d.dims.region?.[r[2]] || "";
      const rowCity = d.dims.city?.[r[3]] || "";
      const rowCategory = d.dims.category?.[r[4]] || "";
      const rowStatus = d.dims.status?.[r[5]] || "";
      const rowSku = d.dims.sku?.[r[6]] || "";
      const rowPoDate = r[11] || 0;
      const rowPoNum = d.dims.po?.[r[12]] || "";

      if (monthSet.size > 0 && !monthSet.has(rowMonth)) return false;
      if (tradeSet.size > 0 && !tradeSet.has(rowTrade)) return false;
      if (regionSet.size > 0 && !regionSet.has(rowRegion)) return false;
      if (citySet.size > 0 && !citySet.has(rowCity)) return false;
      if (categorySet.size > 0 && !categorySet.has(rowCategory)) return false;
      if (statusSet.size > 0 && !statusSet.has(rowStatus)) return false;

      if (fromYmd && rowPoDate > 0 && rowPoDate < fromYmd) return false;
      if (toYmd && rowPoDate > 0 && rowPoDate > toYmd) return false;

      if (globalSearch.trim()) {
        const q = globalSearch.toLowerCase();
        const matches =
          rowCity.toLowerCase().includes(q) ||
          rowSku.toLowerCase().includes(q) ||
          rowCategory.toLowerCase().includes(q) ||
          rowPoNum.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [d, fFrom, fTo, selMonths, selTrades, selRegions, selCities, selCategories, selStatuses, globalSearch]);

  // Aggregate into City Groups with their respective SKU Performance tables
  const cityGroups = useMemo<CityGroup[]>(() => {
    if (!d) return [];

    type SkuBag = {
      skuKey: string;
      skuName: string;
      category: string;
      mmdCode: string;
      mmdName: string;
      poQty: number;
      poVal: number;
      grnQty: number;
      grnVal: number;
      pos: Set<number>;
    };

    type CityBag = {
      city: string;
      region: string;
      poQty: number;
      poVal: number;
      grnQty: number;
      grnVal: number;
      pos: Set<number>;
      skuMap: Map<string, SkuBag>;
    };

    const cityMap = new Map<string, CityBag>();

    for (const r of filteredRows) {
      const cityName = d.dims.city?.[r[3]] || "Unknown";
      const regionName = d.dims.region?.[r[2]] || "Unknown";
      const rawSku = d.dims.sku?.[r[6]] || "Unknown";
      const categoryName = d.dims.category?.[r[4]] || "General";
      const poQty = r[7] || 0;
      const poVal = r[8] || 0;
      const grnQty = r[9] || 0;
      const grnVal = r[10] || 0;
      const poId = r[12];

      const g = mmdGroup(rawSku);
      const skuKey = g.key || `sku:${rawSku}`;
      const skuName = g.name || rawSku;
      const mmdCode = g.code || "—";
      const mmdName = g.name || rawSku;

      let cb = cityMap.get(cityName);
      if (!cb) {
        cb = {
          city: cityName,
          region: regionName,
          poQty: 0,
          poVal: 0,
          grnQty: 0,
          grnVal: 0,
          pos: new Set<number>(),
          skuMap: new Map<string, SkuBag>(),
        };
        cityMap.set(cityName, cb);
      }

      cb.poQty += poQty;
      cb.poVal += poVal;
      cb.grnQty += grnQty;
      cb.grnVal += grnVal;
      cb.pos.add(poId);

      let sb = cb.skuMap.get(skuKey);
      if (!sb) {
        sb = {
          skuKey,
          skuName,
          category: categoryName,
          mmdCode,
          mmdName,
          poQty: 0,
          poVal: 0,
          grnQty: 0,
          grnVal: 0,
          pos: new Set<number>(),
        };
        cb.skuMap.set(skuKey, sb);
      }

      sb.poQty += poQty;
      sb.poVal += poVal;
      sb.grnQty += grnQty;
      sb.grnVal += grnVal;
      sb.pos.add(poId);
    }

    const groups: CityGroup[] = Array.from(cityMap.values()).map((cb) => {
      const depoInfo = lookupDepoByCity(cb.city);
      const skus: SkuRow[] = Array.from(cb.skuMap.values()).map((sb) => {
        const gapQty = Math.max(0, sb.poQty - sb.grnQty);
        const gapVal = Math.max(0, sb.poVal - sb.grnVal);
        const frVal = sb.poVal > 0 ? (sb.grnVal / sb.poVal) * 100 : 0;
        const frQty = sb.poQty > 0 ? (sb.grnQty / sb.poQty) * 100 : 0;
        const icon = matchSkuIcon(sb.skuName);

        return {
          skuKey: sb.skuKey,
          skuName: sb.skuName,
          category: sb.category,
          mmdCode: sb.mmdCode,
          mmdName: sb.mmdName,
          icon,
          poQty: sb.poQty,
          poVal: sb.poVal,
          grnQty: sb.grnQty,
          grnVal: sb.grnVal,
          gapQty,
          gapVal,
          frVal,
          frQty,
          poCount: sb.pos.size,
        };
      });

      const gapQty = Math.max(0, cb.poQty - cb.grnQty);
      const gapVal = Math.max(0, cb.poVal - cb.grnVal);
      const frVal = cb.poVal > 0 ? (cb.grnVal / cb.poVal) * 100 : 0;
      const frQty = cb.poQty > 0 ? (cb.grnQty / cb.poQty) * 100 : 0;

      return {
        city: cb.city,
        region: cb.region,
        depo: depoInfo?.depo || "—",
        state: depoInfo?.state || cb.region,
        delLocation: depoInfo?.delLocation || "—",
        poCount: cb.pos.size,
        poQty: cb.poQty,
        poVal: cb.poVal,
        grnQty: cb.grnQty,
        grnVal: cb.grnVal,
        gapQty,
        gapVal,
        frVal,
        frQty,
        skus,
      };
    });

    // Sort city groups based on chosen city sort criteria
    groups.sort((a, b) => {
      let diff = 0;
      if (citySortBy === "city") {
        diff = a.city.localeCompare(b.city);
      } else if (citySortBy === "poVal") {
        diff = a.poVal - b.poVal;
      } else if (citySortBy === "grnVal") {
        diff = a.grnVal - b.grnVal;
      } else if (citySortBy === "gapVal") {
        diff = a.gapVal - b.gapVal;
      } else if (citySortBy === "frVal") {
        diff = a.frVal - b.frVal;
      } else if (citySortBy === "skuCount") {
        diff = a.skus.length - b.skus.length;
      } else if (citySortBy === "poCount") {
        diff = a.poCount - b.poCount;
      }
      return citySortDir === "desc" ? -diff : diff;
    });

    return groups;
  }, [d, filteredRows, citySortBy, citySortDir]);

  // Overall KPIs
  const overallKpis = useMemo(() => {
    let poVal = 0,
      grnVal = 0,
      poQty = 0,
      grnQty = 0,
      poCount = 0;
    const poSet = new Set<number>();

    for (const r of filteredRows) {
      poQty += r[7];
      poVal += r[8];
      grnQty += r[9];
      grnVal += r[10];
      poSet.add(r[12]);
    }

    const gapVal = Math.max(0, poVal - grnVal);
    const gapQty = Math.max(0, poQty - grnQty);
    const frVal = poVal > 0 ? (grnVal / poVal) * 100 : 0;
    const frQty = poQty > 0 ? (grnQty / poQty) * 100 : 0;

    // Highest deficit city
    const worstCity =
      cityGroups.length > 0
        ? [...cityGroups].sort((a, b) => b.gapVal - a.gapVal)[0]
        : null;

    return {
      cityCount: cityGroups.length,
      poCount: poSet.size,
      rowCount: filteredRows.length,
      poQty,
      poVal,
      grnQty,
      grnVal,
      gapQty,
      gapVal,
      frVal,
      frQty,
      worstCity,
    };
  }, [filteredRows, cityGroups]);

  // Ticker broadcast sync
  useEffect(() => {
    if (!d) return;
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
      activeViewTitle: focusedCity ? `CITY: ${focusedCity.toUpperCase()}` : "CITY SKU PERFORMANCE",
      selectedStatuses: selStatuses,
      poVal: overallKpis.poVal,
      poQty: overallKpis.poQty,
      grnVal: overallKpis.grnVal,
      grnQty: overallKpis.grnQty,
      gapVal: overallKpis.gapVal,
      frVal: overallKpis.frVal,
      frQty: overallKpis.frQty,
      poCount: overallKpis.poCount,
      statusBreakdown,
      trades,
      cities,
    });
  }, [d, filteredRows, overallKpis, focusedCity, selStatuses]);

  // Toggle Collapse / Expand
  const toggleCollapse = (city: string) => {
    setCollapsedCities((prev) => ({
      ...prev,
      [city]: !prev[city],
    }));
  };

  const collapseAll = () => {
    const allCollapsed: Record<string, boolean> = {};
    cityGroups.forEach((cg) => {
      allCollapsed[cg.city] = true;
    });
    setCollapsedCities(allCollapsed);
  };

  const expandAll = () => {
    setCollapsedCities({});
  };

  // Toggle sort for SKU columns within a city table
  const toggleCitySkuSort = (city: string, key: SkuSortKey) => {
    setCitySkuSorts((prev) => {
      const cur = prev[city] || { key: "gapVal", dir: "desc" };
      if (cur.key === key) {
        return {
          ...prev,
          [city]: { key, dir: cur.dir === "asc" ? "desc" : "asc" },
        };
      }
      const defaultAsc = ["skuName", "category"].includes(key);
      return {
        ...prev,
        [city]: { key, dir: defaultAsc ? "asc" : "desc" },
      };
    });
  };

  // Export to Excel (All City Sheets + Consolidated Summary)
  async function downloadCitySkuExcel() {
    if (!d || cityGroups.length === 0) return;
    setDownloading(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();

      // Summary sheet across all cities
      const summaryRows = cityGroups.map((cg, idx) => ({
        "S.No": idx + 1,
        City: cg.city,
        State: cg.state,
        Depo: cg.depo,
        "Total SKUs": cg.skus.length,
        "Total POs": cg.poCount,
        "PO Value (₹L)": +cg.poVal.toFixed(2),
        "GRN Value (₹L)": +cg.grnVal.toFixed(2),
        "Gap Value (₹L)": +cg.gapVal.toFixed(2),
        "PO Qty": cg.poQty,
        "GRN Qty": cg.grnQty,
        "Gap Qty": cg.gapQty,
        "Fill Rate % (Val)": +cg.frVal.toFixed(1),
        "Fill Rate % (Qty)": +cg.frQty.toFixed(1),
      }));

      summaryRows.push({
        "S.No": 0,
        City: "TOTAL OVERALL",
        State: "ALL",
        Depo: "ALL",
        "Total SKUs": cityGroups.reduce((acc, c) => acc + c.skus.length, 0),
        "Total POs": overallKpis.poCount,
        "PO Value (₹L)": +overallKpis.poVal.toFixed(2),
        "GRN Value (₹L)": +overallKpis.grnVal.toFixed(2),
        "Gap Value (₹L)": +overallKpis.gapVal.toFixed(2),
        "PO Qty": overallKpis.poQty,
        "GRN Qty": overallKpis.grnQty,
        "Gap Qty": overallKpis.gapQty,
        "Fill Rate % (Val)": +overallKpis.frVal.toFixed(1),
        "Fill Rate % (Qty)": +overallKpis.frQty.toFixed(1),
      });

      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "City Summary");

      // Per-city individual sheets
      for (const cg of cityGroups) {
        const sanitizedSheetName = cg.city.slice(0, 30).replace(/[:\\\/\?\*\[\]]/g, "-");
        const sheetRows = cg.skus.map((s, i) => ({
          "S.No": i + 1,
          "SKU Name": s.skuName,
          Category: s.category,
          "MMD Code": s.mmdCode || "—",
          "MMD SKU Name": s.mmdName || s.skuName,
          "PO Qty": s.poQty,
          "PO Value (₹L)": +s.poVal.toFixed(2),
          "GRN Qty": s.grnQty,
          "GRN Value (₹L)": +s.grnVal.toFixed(2),
          "Gap Qty": s.gapQty,
          "Gap Value (₹L)": +s.gapVal.toFixed(2),
          "Fill Rate % (Val)": +s.frVal.toFixed(1),
          "Fill Rate % (Qty)": +s.frQty.toFixed(1),
          "Active POs": s.poCount,
        }));

        sheetRows.push({
          "S.No": 0,
          "SKU Name": `TOTAL (${cg.city.toUpperCase()})`,
          Category: "ALL",
          "MMD Code": "—",
          "MMD SKU Name": "—",
          "PO Qty": cg.poQty,
          "PO Value (₹L)": +cg.poVal.toFixed(2),
          "GRN Qty": cg.grnQty,
          "GRN Value (₹L)": +cg.grnVal.toFixed(2),
          "Gap Qty": cg.gapQty,
          "Gap Value (₹L)": +cg.gapVal.toFixed(2),
          "Fill Rate % (Val)": +cg.frVal.toFixed(1),
          "Fill Rate % (Qty)": +cg.frQty.toFixed(1),
          "Active POs": cg.poCount,
        });

        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetRows), sanitizedSheetName);
      }

      XLSX.writeFile(wb, "City_Wise_SKU_Performance_Full.xlsx");
    } finally {
      setDownloading(false);
    }
  }

  // Export to Single Sheet Consolidated Excel
  async function downloadSingleSheetExcel() {
    if (!d || cityGroups.length === 0) return;
    setDownloadingOne(true);
    try {
      const XLSX = await import("xlsx");
      const rowsOut: any[] = [];

      for (const cg of cityGroups) {
        for (const s of cg.skus) {
          rowsOut.push({
            City: cg.city,
            Region: cg.region,
            Depot: cg.depo,
            "SKU Name": s.skuName,
            Category: s.category,
            "MMD Code": s.mmdCode || "—",
            "PO Qty": s.poQty,
            "PO Value (₹L)": +s.poVal.toFixed(2),
            "GRN Qty": s.grnQty,
            "GRN Value (₹L)": +s.grnVal.toFixed(2),
            "Gap Qty": s.gapQty,
            "Gap Value (₹L)": +s.gapVal.toFixed(2),
            "Fill Rate % (Val)": +s.frVal.toFixed(1),
            "Fill Rate % (Qty)": +s.frQty.toFixed(1),
            "PO Count": s.poCount,
          });
        }

        // Subtotal row for city
        rowsOut.push({
          City: `${cg.city.toUpperCase()} SUBTOTAL`,
          Region: cg.region,
          Depot: cg.depo,
          "SKU Name": `Total (${cg.skus.length} SKUs)`,
          Category: "—",
          "MMD Code": "—",
          "PO Qty": cg.poQty,
          "PO Value (₹L)": +cg.poVal.toFixed(2),
          "GRN Qty": cg.grnQty,
          "GRN Value (₹L)": +cg.grnVal.toFixed(2),
          "Gap Qty": cg.gapQty,
          "Gap Value (₹L)": +cg.gapVal.toFixed(2),
          "Fill Rate % (Val)": +cg.frVal.toFixed(1),
          "Fill Rate % (Qty)": +cg.frQty.toFixed(1),
          "PO Count": cg.poCount,
        });
        rowsOut.push({}); // blank line
      }

      // Grand Total
      rowsOut.push({
        City: "GRAND TOTAL (ALL CITIES)",
        Region: "ALL",
        Depot: "ALL",
        "SKU Name": `All Cities Combined`,
        Category: "ALL",
        "MMD Code": "—",
        "PO Qty": overallKpis.poQty,
        "PO Value (₹L)": +overallKpis.poVal.toFixed(2),
        "GRN Qty": overallKpis.grnQty,
        "GRN Value (₹L)": +overallKpis.grnVal.toFixed(2),
        "Gap Qty": overallKpis.gapQty,
        "Gap Value (₹L)": +overallKpis.gapVal.toFixed(2),
        "Fill Rate % (Val)": +overallKpis.frVal.toFixed(1),
        "Fill Rate % (Qty)": +overallKpis.frQty.toFixed(1),
        "PO Count": overallKpis.poCount,
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rowsOut), "City SKU Consolidated");
      XLSX.writeFile(wb, "City_Wise_SKU_Performance_Consolidated.xlsx");
    } finally {
      setDownloadingOne(false);
    }
  }

  // Display groups: if user selected a focused city, show that, otherwise all
  const displayedCityGroups = useMemo(() => {
    if (focusedCity) {
      return cityGroups.filter((cg) => cg.city.toLowerCase() === focusedCity.toLowerCase());
    }
    return cityGroups;
  }, [cityGroups, focusedCity]);

  if (err) {
    return (
      <div className="p-8 text-sm text-rose-600 bg-rose-50 rounded-2xl border border-rose-200">
        Could not load data: {err}
      </div>
    );
  }

  if (!d) {
    return (
      <div className="p-12 text-center text-slate-500 font-semibold flex items-center justify-center gap-3">
        <span className="w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
        Loading City-wise SKU Performance…
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
      {/* ── Top Header Banner ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="px-3 py-1 rounded-xl bg-purple-100 text-purple-900 font-black text-xs uppercase tracking-wider">
              City × SKU Intelligence
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              City-wise SKU Performance
            </h1>
            <SyncStatus />
          </div>
          <p className="text-xs font-medium text-slate-500 mt-1">
            Dedicated separate tables for all {cityGroups.length} cities · Full PO, GRN, Gap & Fill Rate analytics
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <UploadButton variant="light" />
          <button
            onClick={downloadSingleSheetExcel}
            disabled={downloadingOne}
            className="px-3.5 py-2 rounded-xl bg-purple-900 hover:bg-purple-950 text-white font-bold text-xs shadow-md transition active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
          >
            <span>📊</span>
            {downloadingOne ? "Exporting…" : "Export Consolidated (1 Sheet)"}
          </button>
          <button
            onClick={downloadCitySkuExcel}
            disabled={downloading}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
          >
            <span>📑</span>
            {downloading ? "Exporting…" : "Export Multi-Sheet Excel"}
          </button>
        </div>
      </div>

      {/* ── Global KPI Strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Cities Active</div>
          <div className="text-2xl font-black text-purple-950 mt-1">{overallKpis.cityCount}</div>
          <div className="text-[11px] font-semibold text-slate-500 mt-0.5">{overallKpis.poCount} Total POs</div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Total PO Value</div>
          <div className="text-2xl font-black text-slate-900 mt-1">₹{L2(overallKpis.poVal)}L</div>
          <div className="text-[11px] font-semibold text-slate-500 mt-0.5">{L(overallKpis.poQty, 0)} Units</div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-600">Supplied (GRN)</div>
          <div className="text-2xl font-black text-emerald-700 mt-1">₹{L2(overallKpis.grnVal)}L</div>
          <div className="text-[11px] font-semibold text-emerald-600 mt-0.5">{L(overallKpis.grnQty, 0)} Units</div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-rose-200 bg-rose-50/30 shadow-sm">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-rose-600">Supply Gap (Deficit)</div>
          <div className="text-2xl font-black text-rose-700 mt-1">₹{L2(overallKpis.gapVal)}L</div>
          <div className="text-[11px] font-semibold text-rose-600 mt-0.5">-{L(overallKpis.gapQty, 0)} Units</div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Overall Fill Rate</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-2xl font-black text-slate-900">{overallKpis.frVal.toFixed(1)}%</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${frPill(overallKpis.frVal)}`}>
              {overallKpis.frVal >= 90 ? "Good" : overallKpis.frVal >= 75 ? "Medium" : "Critical"}
            </span>
          </div>
          <div className="text-[11px] font-semibold text-slate-500 mt-0.5">Qty FR: {overallKpis.frQty.toFixed(1)}%</div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-purple-200 bg-purple-50/40 shadow-sm">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-purple-800">Top Deficit City</div>
          <div className="text-base font-black text-purple-950 truncate mt-1">
            {overallKpis.worstCity ? overallKpis.worstCity.city : "—"}
          </div>
          <div className="text-[11px] font-bold text-rose-600 mt-0.5">
            {overallKpis.worstCity ? `₹${L2(overallKpis.worstCity.gapVal)}L Gap (${overallKpis.worstCity.frVal.toFixed(1)}%)` : "—"}
          </div>
        </div>
      </div>

      {/* ── Comprehensive Filter Bar ── */}
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
                min={d.meta.date_min}
                max={d.meta.date_max}
                className="w-1/2 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-semibold bg-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <span className="text-slate-400 text-xs font-bold">→</span>
              <input
                type="date"
                value={fTo}
                onChange={(e) => setFTo(e.target.value)}
                min={d.meta.date_min}
                max={d.meta.date_max}
                className="w-1/2 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-semibold bg-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          {/* Multi-Select Filters */}
          <MultiSelectDropdown
            label="Month"
            options={d.dims.month.map((m) => ({ key: m, label: m }))}
            selected={selMonths}
            onChange={setSelMonths}
            open={openDropdown === "month"}
            onToggle={() => setOpenDropdown(openDropdown === "month" ? null : "month")}
            onClose={() => setOpenDropdown(null)}
          />

          <MultiSelectDropdown
            label="Trade / Platform"
            options={d.dims.trade.map((t) => ({ key: t, label: t }))}
            selected={selTrades}
            onChange={setSelTrades}
            open={openDropdown === "trade"}
            onToggle={() => setOpenDropdown(openDropdown === "trade" ? null : "trade")}
            onClose={() => setOpenDropdown(null)}
          />

          <MultiSelectDropdown
            label="Region / State"
            options={d.dims.region.map((r) => ({ key: r, label: r }))}
            selected={selRegions}
            onChange={setSelRegions}
            open={openDropdown === "region"}
            onToggle={() => setOpenDropdown(openDropdown === "region" ? null : "region")}
            onClose={() => setOpenDropdown(null)}
          />

          <MultiSelectDropdown
            label="City"
            options={d.dims.city.map((c) => ({ key: c, label: c }))}
            selected={selCities}
            onChange={setSelCities}
            open={openDropdown === "city"}
            onToggle={() => setOpenDropdown(openDropdown === "city" ? null : "city")}
            onClose={() => setOpenDropdown(null)}
          />

          <MultiSelectDropdown
            label="Category"
            options={d.dims.category.map((c) => ({ key: c, label: c }))}
            selected={selCategories}
            onChange={setSelCategories}
            open={openDropdown === "category"}
            onToggle={() => setOpenDropdown(openDropdown === "category" ? null : "category")}
            onClose={() => setOpenDropdown(null)}
          />

          <MultiSelectDropdown
            label="PO Status"
            options={(d.dims.status || []).map((s) => ({ key: s, label: s }))}
            selected={selStatuses}
            onChange={setSelStatuses}
            open={openDropdown === "status"}
            onToggle={() => setOpenDropdown(openDropdown === "status" ? null : "status")}
            onClose={() => setOpenDropdown(null)}
          />
        </div>

        {/* Search Bar & Reset Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="relative w-full sm:w-96">
            <input
              type="text"
              placeholder="Search by SKU name, MMD item code, or city..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <span className="absolute left-3 top-2 text-slate-400 text-xs">🔍</span>
            {globalSearch && (
              <button
                onClick={() => setGlobalSearch("")}
                className="absolute right-3 top-2 text-xs font-bold text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              onClick={resetAllFilters}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700 text-slate-600 font-bold text-xs transition cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* ── City Quick Navigation Jump Pills & Sorting Controls ── */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-black uppercase tracking-wider text-slate-700">
              City Navigation & Quick Switcher:
            </span>
            <button
              onClick={() => setFocusedCity(null)}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${
                focusedCity === null
                  ? "bg-purple-900 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Show All Cities ({cityGroups.length})
            </button>
            <div className="flex items-center gap-1.5 ml-2">
              <button
                onClick={expandAll}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold border border-slate-200 text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                Expand All
              </button>
              <button
                onClick={collapseAll}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold border border-slate-200 text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                Collapse All
              </button>
            </div>
          </div>

          {/* City Table Sort By Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Sort Cities By:
            </span>
            <select
              value={citySortBy}
              onChange={(e) => setCitySortBy(e.target.value as CitySortKey)}
              className="border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold bg-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
            >
              <option value="gapVal">Highest Gap / Deficit (₹L)</option>
              <option value="frVal">Fill Rate % (Lowest/Highest)</option>
              <option value="poVal">Total PO Value (₹L)</option>
              <option value="grnVal">Total Supplied Value (₹L)</option>
              <option value="city">City Name (Alphabetical)</option>
              <option value="skuCount">Total SKU Count</option>
              <option value="poCount">Total PO Count</option>
            </select>

            <button
              onClick={() => setCitySortDir((d) => (d === "asc" ? "desc" : "asc"))}
              className="px-2.5 py-1.5 rounded-xl border border-slate-300 bg-slate-50 hover:bg-purple-50 hover:border-purple-300 font-bold text-xs text-purple-900 transition cursor-pointer"
              title="Toggle Sort Direction"
            >
              {citySortDir === "desc" ? "↓ High to Low" : "↑ Low to High"}
            </button>
          </div>
        </div>

        {/* Scrollable City Pills Strip */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
          {cityGroups.map((cg) => {
            const isSelected = focusedCity === cg.city;
            return (
              <button
                key={cg.city}
                onClick={() => {
                  if (focusedCity === cg.city) {
                    setFocusedCity(null);
                  } else {
                    setFocusedCity(cg.city);
                    // Ensure it is expanded
                    setCollapsedCities((prev) => ({ ...prev, [cg.city]: false }));
                  }
                }}
                className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  isSelected
                    ? "bg-purple-900 text-white border-purple-900 shadow-md"
                    : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800"
                }`}
              >
                <span>📍 {cg.city}</span>
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] font-extrabold ${
                    isSelected ? "bg-white/20 text-white" : frPill(cg.frVal)
                  }`}
                >
                  {cg.frVal.toFixed(0)}%
                </span>
                <span
                  className={`text-[10px] font-bold ${
                    isSelected ? "text-rose-200" : "text-rose-600"
                  }`}
                >
                  {cg.gapVal > 0 ? `₹${L2(cg.gapVal)}L` : "0 Gap"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Separate City Tables ── */}
      <div className="space-y-6">
        {displayedCityGroups.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center text-slate-400 border border-slate-200 shadow-sm">
            <span className="text-4xl block mb-2">🏙️</span>
            <p className="text-base font-bold text-slate-700">No City Data Matching Selection</p>
            <p className="text-xs text-slate-400 mt-1">Try resetting or adjusting the filter criteria above.</p>
          </div>
        ) : (
          displayedCityGroups.map((cg) => {
            const isCollapsed = Boolean(collapsedCities[cg.city]);
            const citySearch = citySearchQueries[cg.city] || "";
            const skuSort = citySkuSorts[cg.city] || { key: "gapVal", dir: "desc" };

            // Filter & sort SKUs for this city
            let citySkus = [...cg.skus];
            if (citySearch.trim()) {
              const q = citySearch.toLowerCase();
              citySkus = citySkus.filter(
                (s) =>
                  s.skuName.toLowerCase().includes(q) ||
                  s.category.toLowerCase().includes(q) ||
                  s.mmdCode.toLowerCase().includes(q)
              );
            }

            citySkus.sort((a, b) => {
              let diff = 0;
              if (skuSort.key === "skuName") {
                diff = a.skuName.localeCompare(b.skuName);
              } else if (skuSort.key === "category") {
                diff = a.category.localeCompare(b.category);
              } else {
                diff = (a[skuSort.key] as number) - (b[skuSort.key] as number);
              }
              return skuSort.dir === "desc" ? -diff : diff;
            });

            return (
              <div
                key={cg.city}
                id={`city-table-${cg.city}`}
                className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden transition-all"
              >
                {/* ── City Card Header ── */}
                <div className="p-4 sm:p-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-purple-50/30">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* City Title & Depo Info */}
                    <div className="flex items-start sm:items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-purple-100 border border-purple-200 grid place-items-center text-xl shrink-0">
                        📍
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                            {cg.city}
                          </h2>
                          <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-bold text-xs">
                            {cg.region}
                          </span>
                          {cg.depo && cg.depo !== "—" && (
                            <span className="px-2 py-0.5 rounded-lg bg-purple-50 text-purple-900 border border-purple-200 font-semibold text-xs">
                              🏢 {cg.depo}
                            </span>
                          )}
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-black border ${frPill(
                              cg.frVal
                            )}`}
                          >
                            Fill Rate: {cg.frVal.toFixed(1)}%
                          </span>
                        </div>
                        <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
                          {cg.skus.length} Active SKUs · {cg.poCount} Orders (POs) · Del: {cg.delLocation}
                        </p>
                      </div>
                    </div>

                    {/* City KPI Badges */}
                    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                      <div className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-right">
                        <div className="text-[10px] font-extrabold uppercase text-slate-400">PO Value</div>
                        <div className="text-xs sm:text-sm font-black text-purple-950">₹{L2(cg.poVal)}L</div>
                        <div className="text-[10px] font-semibold text-slate-500">{L(cg.poQty, 0)} Units</div>
                      </div>

                      <div className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-right">
                        <div className="text-[10px] font-extrabold uppercase text-emerald-600">Supplied</div>
                        <div className="text-xs sm:text-sm font-black text-emerald-700">₹{L2(cg.grnVal)}L</div>
                        <div className="text-[10px] font-semibold text-emerald-600">{L(cg.grnQty, 0)} Units</div>
                      </div>

                      <div className="px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-right">
                        <div className="text-[10px] font-extrabold uppercase text-rose-600">Gap (Deficit)</div>
                        <div className="text-xs sm:text-sm font-black text-rose-700">₹{L2(cg.gapVal)}L</div>
                        <div className="text-[10px] font-bold text-rose-600">-{L(cg.gapQty, 0)} Units</div>
                      </div>

                      <button
                        onClick={() => toggleCollapse(cg.city)}
                        className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer flex items-center gap-1 shrink-0"
                      >
                        <span>{isCollapsed ? "▼ Expand" : "▲ Collapse"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Search within this City table */}
                  {!isCollapsed && (
                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                      <div className="relative w-full sm:w-72">
                        <input
                          type="text"
                          placeholder={`Search SKUs in ${cg.city}...`}
                          value={citySearch}
                          onChange={(e) =>
                            setCitySearchQueries((prev) => ({
                              ...prev,
                              [cg.city]: e.target.value,
                            }))
                          }
                          className="w-full pl-8 pr-7 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        <span className="absolute left-2.5 top-1.5 text-xs text-slate-400">🔍</span>
                        {citySearch && (
                          <button
                            onClick={() =>
                              setCitySearchQueries((prev) => ({
                                ...prev,
                                [cg.city]: "",
                              }))
                            }
                            className="absolute right-2.5 top-1.5 text-xs font-bold text-slate-400 hover:text-slate-600"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      <div className="text-[11px] font-semibold text-slate-500">
                        Showing {citySkus.length} of {cg.skus.length} SKUs for {cg.city}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── City SKU Table Content ── */}
                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[900px]">
                      <thead>
                        <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-black uppercase tracking-wider text-slate-500">
                          <th className="py-3 px-3 w-10 text-center">#</th>
                          <th
                            className="py-3 px-4 cursor-pointer hover:text-purple-700 transition"
                            onClick={() => toggleCitySkuSort(cg.city, "skuName")}
                          >
                            <div className="flex items-center gap-1">
                              <span>SKU Name / Product</span>
                              {skuSort.key === "skuName" && (
                                <span>{skuSort.dir === "asc" ? "▲" : "▼"}</span>
                              )}
                            </div>
                          </th>
                          <th
                            className="py-3 px-3 cursor-pointer hover:text-purple-700 transition"
                            onClick={() => toggleCitySkuSort(cg.city, "category")}
                          >
                            <div className="flex items-center gap-1">
                              <span>Category</span>
                              {skuSort.key === "category" && (
                                <span>{skuSort.dir === "asc" ? "▲" : "▼"}</span>
                              )}
                            </div>
                          </th>
                          <th
                            className="py-3 px-3 text-right cursor-pointer hover:text-purple-700 transition"
                            onClick={() => toggleCitySkuSort(cg.city, "poQty")}
                          >
                            <div className="flex items-center justify-end gap-1">
                              <span>PO Qty</span>
                              {skuSort.key === "poQty" && (
                                <span>{skuSort.dir === "asc" ? "▲" : "▼"}</span>
                              )}
                            </div>
                          </th>
                          <th
                            className="py-3 px-3 text-right cursor-pointer hover:text-purple-700 transition"
                            onClick={() => toggleCitySkuSort(cg.city, "poVal")}
                          >
                            <div className="flex items-center justify-end gap-1">
                              <span>PO Val (₹L)</span>
                              {skuSort.key === "poVal" && (
                                <span>{skuSort.dir === "asc" ? "▲" : "▼"}</span>
                              )}
                            </div>
                          </th>
                          <th
                            className="py-3 px-3 text-right cursor-pointer hover:text-emerald-700 transition"
                            onClick={() => toggleCitySkuSort(cg.city, "grnQty")}
                          >
                            <div className="flex items-center justify-end gap-1">
                              <span>GRN Qty</span>
                              {skuSort.key === "grnQty" && (
                                <span>{skuSort.dir === "asc" ? "▲" : "▼"}</span>
                              )}
                            </div>
                          </th>
                          <th
                            className="py-3 px-3 text-right cursor-pointer hover:text-emerald-700 transition"
                            onClick={() => toggleCitySkuSort(cg.city, "grnVal")}
                          >
                            <div className="flex items-center justify-end gap-1">
                              <span>GRN Val (₹L)</span>
                              {skuSort.key === "grnVal" && (
                                <span>{skuSort.dir === "asc" ? "▲" : "▼"}</span>
                              )}
                            </div>
                          </th>
                          <th
                            className="py-3 px-3 text-right cursor-pointer hover:text-rose-700 transition"
                            onClick={() => toggleCitySkuSort(cg.city, "gapQty")}
                          >
                            <div className="flex items-center justify-end gap-1 text-rose-600">
                              <span>Gap Qty</span>
                              {skuSort.key === "gapQty" && (
                                <span>{skuSort.dir === "asc" ? "▲" : "▼"}</span>
                              )}
                            </div>
                          </th>
                          <th
                            className="py-3 px-3 text-right cursor-pointer hover:text-rose-700 transition"
                            onClick={() => toggleCitySkuSort(cg.city, "gapVal")}
                          >
                            <div className="flex items-center justify-end gap-1 text-rose-600">
                              <span>Gap Val (₹L)</span>
                              {skuSort.key === "gapVal" && (
                                <span>{skuSort.dir === "asc" ? "▲" : "▼"}</span>
                              )}
                            </div>
                          </th>
                          <th
                            className="py-3 px-4 text-center cursor-pointer hover:text-purple-700 transition"
                            onClick={() => toggleCitySkuSort(cg.city, "frVal")}
                          >
                            <div className="flex items-center justify-center gap-1">
                              <span>Fill Rate %</span>
                              {skuSort.key === "frVal" && (
                                <span>{skuSort.dir === "asc" ? "▲" : "▼"}</span>
                              )}
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {citySkus.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="py-8 text-center text-slate-400 font-semibold">
                              No matching SKUs in this city
                            </td>
                          </tr>
                        ) : (
                          citySkus.map((s, idx) => {
                            const hasGap = s.gapVal > 0;
                            return (
                              <tr
                                key={s.skuKey}
                                className={`hover:bg-purple-50/40 transition-colors ${
                                  hasGap ? "" : "opacity-90"
                                }`}
                              >
                                <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                                  {idx + 1}
                                </td>

                                {/* SKU Name & Icon */}
                                <td className="py-2.5 px-4 font-semibold text-slate-900">
                                  <div className="flex items-center gap-2.5">
                                    <div
                                      onClick={() =>
                                        setSkuPopup({
                                          icon: s.icon,
                                          name: s.skuName,
                                          stats: [
                                            { label: "City", value: cg.city },
                                            { label: "Category", value: s.category },
                                            { label: "MMD Code", value: s.mmdCode || "—" },
                                            { label: "PO Qty", value: L(s.poQty, 0) },
                                            { label: "PO Value", value: `₹${L2(s.poVal)}L` },
                                            { label: "GRN Qty", value: L(s.grnQty, 0) },
                                            { label: "GRN Value", value: `₹${L2(s.grnVal)}L` },
                                            {
                                              label: "Gap (Deficit)",
                                              value: `-${L(s.gapQty, 0)} (₹${L2(s.gapVal)}L)`,
                                              cls: "text-rose-600 font-bold",
                                            },
                                            { label: "Fill Rate", value: `${s.frVal.toFixed(1)}%` },
                                          ],
                                        })
                                      }
                                      className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 grid place-items-center shrink-0 overflow-hidden cursor-pointer hover:scale-110 transition-transform"
                                    >
                                      {s.icon ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={s.icon} alt="" className="max-w-full max-h-full object-contain" />
                                      ) : (
                                        <span className="text-sm">🥛</span>
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <div
                                        onClick={() =>
                                          setSkuPopup({
                                            icon: s.icon,
                                            name: s.skuName,
                                            stats: [
                                              { label: "City", value: cg.city },
                                              { label: "Category", value: s.category },
                                              { label: "MMD Code", value: s.mmdCode || "—" },
                                              { label: "PO Qty", value: L(s.poQty, 0) },
                                              { label: "PO Value", value: `₹${L2(s.poVal)}L` },
                                              { label: "GRN Qty", value: L(s.grnQty, 0) },
                                              { label: "GRN Value", value: `₹${L2(s.grnVal)}L` },
                                              {
                                                label: "Gap (Deficit)",
                                                value: `-${L(s.gapQty, 0)} (₹${L2(s.gapVal)}L)`,
                                                cls: "text-rose-600 font-bold",
                                              },
                                              { label: "Fill Rate", value: `${s.frVal.toFixed(1)}%` },
                                            ],
                                          })
                                        }
                                        className="hover:text-purple-700 transition cursor-pointer font-bold truncate max-w-xs"
                                        title={s.skuName}
                                      >
                                        {s.skuName}
                                      </div>
                                      {s.mmdCode && (
                                        <div className="text-[10px] font-mono text-slate-400">
                                          #{s.mmdCode}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>

                                {/* Category */}
                                <td className="py-2.5 px-3 text-slate-600 font-medium">
                                  <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[11px] font-semibold">
                                    {s.category}
                                  </span>
                                </td>

                                {/* PO Qty */}
                                <td className="py-2.5 px-3 text-right font-medium text-slate-700">
                                  {L(s.poQty, 0)}
                                </td>

                                {/* PO Value */}
                                <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                                  ₹{L2(s.poVal)}
                                </td>

                                {/* GRN Qty */}
                                <td className="py-2.5 px-3 text-right font-medium text-emerald-700">
                                  {L(s.grnQty, 0)}
                                </td>

                                {/* GRN Value */}
                                <td className="py-2.5 px-3 text-right font-bold text-emerald-700">
                                  ₹{L2(s.grnVal)}
                                </td>

                                {/* Gap Qty */}
                                <td className="py-2.5 px-3 text-right font-bold text-rose-600">
                                  {s.gapQty > 0 ? `-${L(s.gapQty, 0)}` : "0"}
                                </td>

                                {/* Gap Value */}
                                <td className="py-2.5 px-3 text-right font-black text-rose-700">
                                  {s.gapVal > 0 ? `₹${L2(s.gapVal)}L` : "₹0.00"}
                                </td>

                                {/* Fill Rate % Badge */}
                                <td className="py-2.5 px-4 text-center">
                                  <span
                                    className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${frPill(
                                      s.frVal
                                    )}`}
                                  >
                                    {s.frVal.toFixed(1)}%
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>

                      {/* City Table Subtotal Row */}
                      <tfoot>
                        <tr className="bg-slate-100/90 font-black border-t-2 border-slate-300 text-xs">
                          <td className="py-3 px-3 text-center text-slate-400">Σ</td>
                          <td className="py-3 px-4 text-purple-950 font-black" colSpan={2}>
                            {cg.city.toUpperCase()} TOTAL ({cg.skus.length} SKUs)
                          </td>
                          <td className="py-3 px-3 text-right text-slate-900 font-black">
                            {L(cg.poQty, 0)}
                          </td>
                          <td className="py-3 px-3 text-right text-purple-950 font-black">
                            ₹{L2(cg.poVal)}L
                          </td>
                          <td className="py-3 px-3 text-right text-emerald-800 font-black">
                            {L(cg.grnQty, 0)}
                          </td>
                          <td className="py-3 px-3 text-right text-emerald-800 font-black">
                            ₹{L2(cg.grnVal)}L
                          </td>
                          <td className="py-3 px-3 text-right text-rose-700 font-black">
                            {cg.gapQty > 0 ? `-${L(cg.gapQty, 0)}` : "0"}
                          </td>
                          <td className="py-3 px-3 text-right text-rose-800 font-black">
                            ₹{L2(cg.gapVal)}L
                          </td>
                          <td className="py-3 px-4 text-center font-black">
                            <span
                              className={`inline-block px-3 py-1 rounded-full text-xs font-black border shadow-sm ${frPill(
                                cg.frVal
                              )}`}
                            >
                              {cg.frVal.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── Lightbox Sku Image Popup ── */}
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
