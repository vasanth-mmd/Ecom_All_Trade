"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import { lookupMmd } from "@/lib/mmd-mapping";
import { matchSkuIcon } from "@/lib/sku-icon";

interface MonthlyDataPoint {
  monthIndex: number;
  monthName: string;
  demandVal: number;
  suppliedVal: number;
  poQty: number;
  grnQty: number;
  fr: number;
  gapVal: number;
  poCount: number;
}

interface SkuTrendRow {
  skuName: string;
  code: string;
  category: string;
  icon: string | null;
  monthlyStats: Record<string, { demandVal: number; suppliedVal: number; fr: number; gapVal: number }>;
  overallGrowthPct: number;
  avgFr: number;
  latestFr: number;
  trendStatus: "ACCELERATING" | "STABLE" | "DECLINING";
}

const MONTH_ORDER: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

function getMonthSortWeight(name: string): number {
  const clean = name.trim().toLowerCase();
  return MONTH_ORDER[clean] || 99;
}

/* ── Searchable Multi-Select Checkbox Dropdown ── */
interface MultiSelectProps {
  label: string;
  options: { key: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  searchPlaceholder?: string;
}

function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  open,
  onToggle,
  onClose,
  searchPlaceholder,
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

  const selectAll = () => {
    onChange(options.map((o) => o.key));
  };

  const clearAll = () => {
    onChange([]);
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
    <div className={`relative ${open ? "z-50" : "z-10"}`} ref={dropdownRef}>
      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-800 mb-1">
        {label}
      </label>
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center justify-between gap-2 rounded-xl border-2 px-3 py-1.5 text-xs font-black text-left transition-all cursor-pointer shadow-xs ${
          isFiltered
            ? "border-sky-600 bg-sky-100 text-black ring-1 ring-sky-500"
            : "border-sky-400 bg-white text-black hover:bg-sky-50"
        }`}
      >
        <span className="truncate max-w-[140px] sm:max-w-[170px]">{buttonLabel}</span>
        <span className="text-xs text-black shrink-0">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} />
          <div
            className="absolute left-0 top-full mt-1.5 z-50 w-72 max-w-[90vw] bg-white border-2 border-sky-400 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.35)] p-3 space-y-2 animate-in fade-in zoom-in-95 duration-100 text-black"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative">
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={searchPlaceholder || `Search ${label.toLowerCase()}...`}
                className="w-full pl-8 pr-7 py-1.5 rounded-xl border border-slate-300 text-xs text-black font-bold focus:outline-none focus:border-sky-500 bg-slate-50"
                autoFocus
              />
              <span className="absolute left-2.5 top-1.5 text-xs text-slate-400">🔍</span>
              {q && (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  className="absolute right-2.5 top-1.5 text-xs font-bold text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center justify-between px-1 text-[11px] font-bold border-b border-slate-100 pb-1.5">
              <button
                type="button"
                onClick={selectAll}
                className="text-sky-700 hover:underline cursor-pointer"
              >
                Select All ({options.length})
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="text-rose-700 hover:underline cursor-pointer"
              >
                Clear
              </button>
            </div>

            <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
              {filteredOptions.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-400 font-bold">
                  No matching options
                </div>
              ) : (
                filteredOptions.map((opt) => {
                  const checked = selSet.has(opt.key);
                  return (
                    <label
                      key={opt.key}
                      onClick={() => toggleItem(opt.key)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                        checked
                          ? "bg-sky-100 text-black font-black"
                          : "hover:bg-slate-100 text-slate-800"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {}}
                        className="w-3.5 h-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
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

export default function TrendingAnalysisDashboard() {
  const [rawDataset, setRawDataset] = useState<{ dims: Record<string, string[]>; rows: number[][] } | null>(null);
  
  // From - To Month Range selection
  const [fromMonth, setFromMonth] = useState<string>("");
  const [toMonth, setToMonth] = useState<string>("");

  // Multi-Selection Filter State
  const [selectedTrades, setSelectedTrades] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedSkus, setSelectedSkus] = useState<string[]>([]);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeMetricView, setActiveMetricView] = useState<"ALL" | "FR" | "DEMAND_SUPPLY" | "GAP">("ALL");

  // Chart Series Visibility Toggles
  const [showDemand, setShowDemand] = useState<boolean>(true);
  const [showSupplied, setShowSupplied] = useState<boolean>(true);
  const [showFr, setShowFr] = useState<boolean>(true);
  const [showGap, setShowGap] = useState<boolean>(true);

  // Hover Tooltip State
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Load Data
  useEffect(() => {
    fetch("/api/data")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.dims && Array.isArray(d.rows)) {
          setRawDataset(d);
        }
      })
      .catch(() => {});
  }, []);

  const dims = rawDataset?.dims;
  const rows = rawDataset?.rows || [];

  // Available Filter Dimensions
  const availableTrades = useMemo(() => {
    if (!dims?.trade) return ["Zepto"];
    const set = new Set<string>();
    rows.forEach((r) => {
      const t = dims.trade[r[1]];
      if (t) set.add(t);
    });
    return Array.from(set);
  }, [dims, rows]);

  const availableCategories = useMemo(() => {
    if (!dims?.category) return [];
    const set = new Set<string>();
    rows.forEach((r) => {
      const c = dims.category[r[4]];
      if (c) set.add(c);
    });
    return Array.from(set);
  }, [dims, rows]);

  const availableCities = useMemo(() => {
    if (!dims?.city) return [];
    const set = new Set<string>();
    rows.forEach((r) => {
      const c = dims.city[r[3]];
      if (c) set.add(c);
    });
    return Array.from(set).sort();
  }, [dims, rows]);

  const availableSkus = useMemo(() => {
    if (!dims?.sku) return [];
    const set = new Set<string>();
    rows.forEach((r) => {
      const s = dims.sku[r[6]];
      if (s) set.add(s);
    });
    return Array.from(set).sort();
  }, [dims, rows]);

  // All chronological months in dataset
  const allAvailableMonths = useMemo(() => {
    if (!dims?.month) return ["August", "September"];
    const set = new Set<string>();
    rows.forEach((r) => {
      const m = dims.month[r[0]];
      if (m) set.add(m);
    });
    return Array.from(set).sort((a, b) => getMonthSortWeight(a) - getMonthSortWeight(b));
  }, [dims, rows]);

  // Filtered months window based on From - To
  const filteredMonths = useMemo(() => {
    if (allAvailableMonths.length === 0) return [];
    const fromIdx = fromMonth ? allAvailableMonths.indexOf(fromMonth) : 0;
    const toIdx = toMonth ? allAvailableMonths.indexOf(toMonth) : allAvailableMonths.length - 1;

    const start = fromIdx >= 0 ? fromIdx : 0;
    const end = toIdx >= 0 ? toIdx : allAvailableMonths.length - 1;

    if (start <= end) {
      return allAvailableMonths.slice(start, end + 1);
    } else {
      return allAvailableMonths.slice(end, start + 1);
    }
  }, [allAvailableMonths, fromMonth, toMonth]);

  // Reset all filters
  const handleResetFilters = () => {
    setFromMonth("");
    setToMonth("");
    setSelectedTrades([]);
    setSelectedCategories([]);
    setSelectedCities([]);
    setSelectedSkus([]);
    setSearchQuery("");
    setOpenDropdown(null);
  };

  // Aggregate Monthly Trend Points
  const monthlyTrends: MonthlyDataPoint[] = useMemo(() => {
    if (!dims?.month || filteredMonths.length === 0) return [];

    const monthMap = new Map<string, {
      demandVal: number;
      suppliedVal: number;
      poQty: number;
      grnQty: number;
      poIds: Set<number>;
    }>();

    filteredMonths.forEach((m) => {
      monthMap.set(m, { demandVal: 0, suppliedVal: 0, poQty: 0, grnQty: 0, poIds: new Set<number>() });
    });

    rows.forEach((r) => {
      const mName = dims.month[r[0]];
      const tName = dims.trade ? dims.trade[r[1]] : "";
      const catName = dims.category ? dims.category[r[4]] : "";
      const cityName = dims.city ? dims.city[r[3]] : "";
      const skuName = dims.sku ? dims.sku[r[6]] : "";

      if (!mName || !monthMap.has(mName)) return;
      if (selectedTrades.length > 0 && !selectedTrades.includes(tName)) return;
      if (selectedCategories.length > 0 && !selectedCategories.includes(catName)) return;
      if (selectedCities.length > 0 && !selectedCities.includes(cityName)) return;
      if (selectedSkus.length > 0 && !selectedSkus.includes(skuName)) return;

      const poVal = r[8] < 1000 ? r[8] * 100000 : r[8];
      const grnVal = r[10] < 1000 ? r[10] * 100000 : r[10];
      const poQty = r[7] || 0;
      const grnQty = r[9] || 0;
      const poId = r[12];

      const entry = monthMap.get(mName)!;
      entry.demandVal += poVal;
      entry.suppliedVal += grnVal;
      entry.poQty += poQty;
      entry.grnQty += grnQty;
      if (poId !== undefined) entry.poIds.add(poId);
    });

    return filteredMonths.map((mName, idx) => {
      const data = monthMap.get(mName) || { demandVal: 0, suppliedVal: 0, poQty: 0, grnQty: 0, poIds: new Set<number>() };
      const fr = data.demandVal > 0 ? +((data.suppliedVal / data.demandVal) * 100).toFixed(1) : 0;
      const gapVal = Math.max(0, data.demandVal - data.suppliedVal);

      return {
        monthIndex: idx,
        monthName: mName,
        demandVal: Math.round(data.demandVal),
        suppliedVal: Math.round(data.suppliedVal),
        poQty: Math.round(data.poQty),
        grnQty: Math.round(data.grnQty),
        fr,
        gapVal: Math.round(gapVal),
        poCount: data.poIds.size,
      };
    });
  }, [dims, rows, filteredMonths, selectedTrades, selectedCategories, selectedCities, selectedSkus]);

  // SKU Trend Performance Rows
  const skuTrendRows: SkuTrendRow[] = useMemo(() => {
    if (!dims?.sku) return [];

    const skuMap = new Map<string, {
      category: string;
      monthly: Record<string, { demandVal: number; suppliedVal: number; poQty: number; grnQty: number }>;
    }>();

    rows.forEach((r) => {
      const sName = dims.sku[r[6]];
      const mName = dims.month ? dims.month[r[0]] : "";
      const tName = dims.trade ? dims.trade[r[1]] : "";
      const catName = dims.category ? dims.category[r[4]] : "Dairy";
      const cityName = dims.city ? dims.city[r[3]] : "";

      if (!sName || !mName) return;
      if (selectedTrades.length > 0 && !selectedTrades.includes(tName)) return;
      if (selectedCategories.length > 0 && !selectedCategories.includes(catName)) return;
      if (selectedCities.length > 0 && !selectedCities.includes(cityName)) return;
      if (selectedSkus.length > 0 && !selectedSkus.includes(sName)) return;

      const poVal = r[8] < 1000 ? r[8] * 100000 : r[8];
      const grnVal = r[10] < 1000 ? r[10] * 100000 : r[10];

      if (!skuMap.has(sName)) {
        skuMap.set(sName, { category: catName, monthly: {} });
      }

      const item = skuMap.get(sName)!;
      if (!item.monthly[mName]) {
        item.monthly[mName] = { demandVal: 0, suppliedVal: 0, poQty: 0, grnQty: 0 };
      }
      item.monthly[mName].demandVal += poVal;
      item.monthly[mName].suppliedVal += grnVal;
    });

    const result: SkuTrendRow[] = [];

    skuMap.forEach((val, skuName) => {
      const mmd = lookupMmd(skuName);
      const code = mmd ? mmd.code : "SKU";
      const officialName = mmd ? mmd.name : skuName;
      const icon = matchSkuIcon(officialName || skuName);

      const stats: Record<string, { demandVal: number; suppliedVal: number; fr: number; gapVal: number }> = {};
      let totalFr = 0;
      let count = 0;
      let firstMonthVal = 0;
      let lastMonthVal = 0;

      filteredMonths.forEach((mName, idx) => {
        const mData = val.monthly[mName] || { demandVal: 0, suppliedVal: 0 };
        const fr = mData.demandVal > 0 ? +((mData.suppliedVal / mData.demandVal) * 100).toFixed(1) : 0;
        const gapVal = Math.max(0, mData.demandVal - mData.suppliedVal);

        stats[mName] = { demandVal: mData.demandVal, suppliedVal: mData.suppliedVal, fr, gapVal };
        if (mData.demandVal > 0) {
          totalFr += fr;
          count++;
          if (idx === 0) firstMonthVal = mData.demandVal;
          if (idx === filteredMonths.length - 1) lastMonthVal = mData.demandVal;
        }
      });

      const avgFr = count > 0 ? +(totalFr / count).toFixed(1) : 0;
      const latestMonthName = filteredMonths[filteredMonths.length - 1] || "";
      const latestFr = stats[latestMonthName]?.fr || avgFr;

      let growthPct = 0;
      if (firstMonthVal > 0 && lastMonthVal > 0) {
        growthPct = +(((lastMonthVal - firstMonthVal) / firstMonthVal) * 100).toFixed(1);
      }

      let trendStatus: "ACCELERATING" | "STABLE" | "DECLINING" = "STABLE";
      if (growthPct > 15 || latestFr >= 92) trendStatus = "ACCELERATING";
      else if (growthPct < -15 || latestFr < 75) trendStatus = "DECLINING";

      result.push({
        skuName: officialName,
        code,
        category: val.category,
        icon,
        monthlyStats: stats,
        overallGrowthPct: growthPct,
        avgFr,
        latestFr,
        trendStatus,
      });
    });

    // Apply search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return result.filter(
        (it) =>
          it.skuName.toLowerCase().includes(q) ||
          it.code.toLowerCase().includes(q) ||
          it.category.toLowerCase().includes(q)
      );
    }

    return result.sort((a, b) => b.latestFr - a.latestFr);
  }, [dims, rows, filteredMonths, selectedTrades, selectedCategories, selectedCities, selectedSkus, searchQuery]);

  // Aggregate KPI Highlights
  const kpiSummary = useMemo(() => {
    if (monthlyTrends.length === 0) {
      return {
        totalDemandLakhs: 0,
        totalSuppliedLakhs: 0,
        avgFr: 0,
        totalGapLakhs: 0,
        peakMonth: "-",
        growthPct: 0,
        bestSku: "-",
      };
    }

    let totDem = 0;
    let totSup = 0;
    let peakDem = 0;
    let peakMonth = monthlyTrends[0].monthName;

    monthlyTrends.forEach((m) => {
      totDem += m.demandVal;
      totSup += m.suppliedVal;
      if (m.demandVal > peakDem) {
        peakDem = m.demandVal;
        peakMonth = m.monthName;
      }
    });

    const avgFr = totDem > 0 ? +((totSup / totDem) * 100).toFixed(1) : 0;
    const totalGap = Math.max(0, totDem - totSup);

    let growthPct = 0;
    if (monthlyTrends.length >= 2) {
      const first = monthlyTrends[0].demandVal;
      const last = monthlyTrends[monthlyTrends.length - 1].demandVal;
      if (first > 0) {
        growthPct = +(((last - first) / first) * 100).toFixed(1);
      }
    }

    const bestSku = skuTrendRows[0]?.skuName || "MILKY MIST PANEER";

    return {
      totalDemandLakhs: +(totDem / 100000).toFixed(1),
      totalSuppliedLakhs: +(totSup / 100000).toFixed(1),
      avgFr,
      totalGapLakhs: +(totalGap / 100000).toFixed(1),
      peakMonth,
      growthPct,
      bestSku,
    };
  }, [monthlyTrends, skuTrendRows]);

  // SVG Chart Geometry Calculations
  const chartWidth = 900;
  const chartHeight = 360;
  const padding = { top: 40, right: 60, bottom: 50, left: 75 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  const maxVal = useMemo(() => {
    let max = 100000;
    monthlyTrends.forEach((p) => {
      if (p.demandVal > max) max = p.demandVal;
      if (p.suppliedVal > max) max = p.suppliedVal;
      if (p.gapVal > max) max = p.gapVal;
    });
    return max * 1.15; // 15% headroom
  }, [monthlyTrends]);

  // Coordinates mapping
  const pointsData = useMemo(() => {
    if (monthlyTrends.length === 0) return [];
    const stepX = monthlyTrends.length > 1 ? innerWidth / (monthlyTrends.length - 1) : innerWidth / 2;

    return monthlyTrends.map((p, i) => {
      const x = padding.left + i * stepX;
      const yDemand = padding.top + innerHeight - (p.demandVal / maxVal) * innerHeight;
      const ySupplied = padding.top + innerHeight - (p.suppliedVal / maxVal) * innerHeight;
      const yFr = padding.top + innerHeight - (p.fr / 100) * innerHeight;
      const yGap = padding.top + innerHeight - (p.gapVal / maxVal) * innerHeight;

      return {
        ...p,
        x,
        yDemand,
        ySupplied,
        yFr,
        yGap,
      };
    });
  }, [monthlyTrends, maxVal, innerWidth, innerHeight, padding.left, padding.top]);

  // Generate SVG Path String with smooth curves
  const makePath = (key: "yDemand" | "ySupplied" | "yFr" | "yGap") => {
    if (pointsData.length === 0) return "";
    if (pointsData.length === 1) return `M ${pointsData[0].x} ${pointsData[0][key]}`;

    let path = `M ${pointsData[0].x} ${pointsData[0][key]}`;
    for (let i = 0; i < pointsData.length - 1; i++) {
      const curr = pointsData[i];
      const next = pointsData[i + 1];
      const cpX1 = curr.x + (next.x - curr.x) / 2;
      const cpY1 = curr[key];
      const cpX2 = curr.x + (next.x - curr.x) / 2;
      const cpY2 = next[key];
      path += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${next.x} ${next[key]}`;
    }
    return path;
  };

  const makeAreaPath = (key: "yDemand" | "ySupplied" | "yGap") => {
    if (pointsData.length === 0) return "";
    const linePath = makePath(key);
    const bottomY = padding.top + innerHeight;
    const firstX = pointsData[0].x;
    const lastX = pointsData[pointsData.length - 1].x;
    return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || pointsData.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * chartWidth;
    const mouseY = ((e.clientY - rect.top) / rect.height) * chartHeight;

    let closestIdx = 0;
    let minDiff = Infinity;
    pointsData.forEach((p, idx) => {
      const diff = Math.abs(p.x - mouseX);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });

    setHoveredPointIndex(closestIdx);
    setMousePos({ x: pointsData[closestIdx].x, y: mouseY });
  };

  const handleExportCsv = () => {
    const headers = "Month,Demand Value (INR),Supplied Value (INR),Fill Rate %,Unsupplied Gap (INR),PO Units,GRN Units,PO Count\n";
    const rowsCsv = monthlyTrends
      .map(
        (m) =>
          `"${m.monthName}",${m.demandVal},${m.suppliedVal},${m.fr},${m.gapVal},${m.poQty},${m.grnQty},${m.poCount}`
      )
      .join("\n");
    const blob = new Blob([headers + rowsCsv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `MilkyMist_Trending_Analysis_Dashboard.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeHoveredPoint = hoveredPointIndex !== null ? pointsData[hoveredPointIndex] : null;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto selection:bg-sky-500 selection:text-black">
      {/* ── Top Header Stream with Title & Telemetry ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b-2 border-sky-400 pb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-2xl">📈</span>
            <h1 className="text-xl sm:text-2xl font-black text-black tracking-tight font-mono">
              Trending Analysis Dashboard
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-black bg-sky-200 text-black border-2 border-sky-400 shadow-xs">
              MONTH-OVER-MONTH LINE CHART
            </span>
          </div>
          <p className="text-xs sm:text-sm text-black font-bold mt-1 font-mono">
            Longitudinal trend telemetry · Demand vs. Supplied progression & SKU velocity across months
          </p>
        </div>

        {/* View Switchers & Export */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="bg-sky-100 p-1 rounded-xl border-2 border-sky-400 flex items-center text-xs font-mono">
            {[
              { key: "ALL", label: "ALL TRENDS" },
              { key: "FR", label: "FILL RATE %" },
              { key: "DEMAND_SUPPLY", label: "DEMAND VS GRN" },
              { key: "GAP", label: "SHORTFALL GAP" },
            ].map((v) => (
              <button
                key={v.key}
                onClick={() => {
                  setActiveMetricView(v.key as any);
                  if (v.key === "FR") {
                    setShowDemand(false);
                    setShowSupplied(false);
                    setShowFr(true);
                    setShowGap(false);
                  } else if (v.key === "DEMAND_SUPPLY") {
                    setShowDemand(true);
                    setShowSupplied(true);
                    setShowFr(false);
                    setShowGap(false);
                  } else if (v.key === "GAP") {
                    setShowDemand(false);
                    setShowSupplied(false);
                    setShowFr(false);
                    setShowGap(true);
                  } else {
                    setShowDemand(true);
                    setShowSupplied(true);
                    setShowFr(true);
                    setShowGap(true);
                  }
                }}
                className={`px-2.5 py-1 rounded-lg transition ${
                  activeMetricView === v.key
                    ? "bg-black text-white font-black shadow"
                    : "text-black hover:text-slate-900 font-bold"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          {/* Cross Navigation Links */}
          <Link
            href="/dashboard/opportunity"
            className="px-3 py-1.5 rounded-xl bg-purple-100 hover:bg-purple-200 border-2 border-purple-400 text-purple-950 text-xs font-mono font-black transition flex items-center gap-1 shadow-xs"
            title="Open Opportunity & Profit Recovery Dashboard"
          >
            <span>🎯</span> OPPORTUNITY
          </Link>
          <Link
            href="/dashboard/heatmap"
            className="px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 border-2 border-amber-400 text-amber-950 text-xs font-mono font-black transition flex items-center gap-1 shadow-xs"
            title="Open Heatmap Matrix Dashboard"
          >
            <span>🔥</span> HEATMAP
          </Link>
          <Link
            href="/dashboard/month-compare"
            className="px-3 py-1.5 rounded-xl bg-indigo-100 hover:bg-indigo-200 border-2 border-indigo-400 text-indigo-950 text-xs font-mono font-black transition flex items-center gap-1 shadow-xs"
            title="Open Month Comparison"
          >
            <span>🗓️</span> MOM COMPARE
          </Link>

          {/* Export CSV */}
          <button
            onClick={handleExportCsv}
            className="px-3 py-1.5 rounded-xl bg-sky-100 hover:bg-sky-200 border-2 border-sky-400 text-black text-xs font-mono font-black transition flex items-center gap-1.5 shadow-xs"
          >
            <span>📥</span> EXPORT TREND CSV
          </button>
        </div>
      </div>

      {/* ── Advanced Filter Toolbar (From-To Month Range & Multi-Selection Filters) ── */}
      <div className={`relative ${openDropdown ? "z-50" : "z-20"} bg-gradient-to-r from-sky-200/90 via-sky-100/95 to-sky-200/90 p-4 rounded-3xl border-2 border-sky-400 shadow-[0_6px_25px_rgba(2,132,199,0.15)] space-y-3.5 text-black`}>
        <div className="flex items-center justify-between flex-wrap gap-2 border-b border-sky-300 pb-2">
          <span className="text-xs font-mono font-black uppercase tracking-wider text-black flex items-center gap-1.5">
            <span>⚙️</span> FILTER OPTIONS & TIMELINE RANGE
          </span>
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono font-bold text-slate-800">
              Active: {filteredMonths.length} Months · {skuTrendRows.length} SKUs
            </span>
            <button
              onClick={handleResetFilters}
              className="px-3 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-700 text-xs font-black transition flex items-center gap-1 cursor-pointer shadow-xs"
            >
              <span>✕</span> Reset Filters
            </button>
          </div>
        </div>

        {/* Row 1: Month Selection From - To & Multi-Select Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 items-end">
          {/* 1. Month Selection Filter (From - To Option) */}
          <div className="lg:col-span-1 bg-white p-2 rounded-2xl border-2 border-sky-400 shadow-xs">
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-800 mb-1">
              🗓️ MONTH RANGE (FROM - TO)
            </label>
            <div className="flex items-center gap-1.5">
              <select
                value={fromMonth}
                onChange={(e) => setFromMonth(e.target.value)}
                className="w-1/2 bg-sky-50 text-black font-black text-xs border border-sky-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-sky-500 cursor-pointer truncate"
              >
                <option value="">{allAvailableMonths[0] || "Start"}</option>
                {allAvailableMonths.map((m) => (
                  <option key={`from-${m}`} value={m}>
                    {m}
                  </option>
                ))}
              </select>

              <span className="text-black font-black text-xs shrink-0">→</span>

              <select
                value={toMonth}
                onChange={(e) => setToMonth(e.target.value)}
                className="w-1/2 bg-sky-50 text-black font-black text-xs border border-sky-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-sky-500 cursor-pointer truncate"
              >
                <option value="">{allAvailableMonths[allAvailableMonths.length - 1] || "End"}</option>
                {allAvailableMonths.map((m) => (
                  <option key={`to-${m}`} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 2. Channel Multi-Selection */}
          <div>
            <MultiSelectDropdown
              label="CHANNEL (TRADE)"
              options={availableTrades.map((t) => ({ key: t, label: t }))}
              selected={selectedTrades}
              onChange={(s) => setSelectedTrades(s)}
              open={openDropdown === "trade"}
              onToggle={() => setOpenDropdown(openDropdown === "trade" ? null : "trade")}
              onClose={() => setOpenDropdown(null)}
              searchPlaceholder="Search channel..."
            />
          </div>

          {/* 3. Category Multi-Selection */}
          <div>
            <MultiSelectDropdown
              label="CATEGORY"
              options={availableCategories.map((c) => ({ key: c, label: c }))}
              selected={selectedCategories}
              onChange={(s) => setSelectedCategories(s)}
              open={openDropdown === "category"}
              onToggle={() => setOpenDropdown(openDropdown === "category" ? null : "category")}
              onClose={() => setOpenDropdown(null)}
              searchPlaceholder="Search category..."
            />
          </div>

          {/* 4. City Multi-Selection */}
          <div>
            <MultiSelectDropdown
              label="CITY / REGION"
              options={availableCities.map((c) => ({ key: c, label: c }))}
              selected={selectedCities}
              onChange={(s) => setSelectedCities(s)}
              open={openDropdown === "city"}
              onToggle={() => setOpenDropdown(openDropdown === "city" ? null : "city")}
              onClose={() => setOpenDropdown(null)}
              searchPlaceholder="Search city..."
            />
          </div>

          {/* 5. SKU Multi-Selection */}
          <div>
            <MultiSelectDropdown
              label="SPECIFIC SKU"
              options={availableSkus.map((s) => {
                const m = lookupMmd(s);
                return {
                  key: s,
                  label: m ? `${m.name} (${m.code})` : s,
                };
              })}
              selected={selectedSkus}
              onChange={(s) => setSelectedSkus(s)}
              open={openDropdown === "sku"}
              onToggle={() => setOpenDropdown(openDropdown === "sku" ? null : "sku")}
              onClose={() => setOpenDropdown(null)}
              searchPlaceholder="Search SKU product..."
            />
          </div>
        </div>

        {/* Row 2: Series Line Visibility Toggles */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-sky-300 text-xs font-mono">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-black font-black">TOGGLE CHART LINES:</span>
            <button
              onClick={() => setShowDemand((prev) => !prev)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-black border-2 transition ${
                showDemand
                  ? "bg-blue-600 text-white border-blue-700 shadow-xs"
                  : "bg-sky-100 text-black border-sky-400 opacity-60"
              }`}
            >
              📈 DEMAND (PO)
            </button>
            <button
              onClick={() => setShowSupplied((prev) => !prev)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-black border-2 transition ${
                showSupplied
                  ? "bg-emerald-600 text-white border-emerald-700 shadow-xs"
                  : "bg-sky-100 text-black border-sky-400 opacity-60"
              }`}
            >
              📊 SUPPLIED (GRN)
            </button>
            <button
              onClick={() => setShowFr((prev) => !prev)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-black border-2 transition ${
                showFr
                  ? "bg-purple-600 text-white border-purple-700 shadow-xs"
                  : "bg-sky-100 text-black border-sky-400 opacity-60"
              }`}
            >
              🎯 FILL RATE %
            </button>
            <button
              onClick={() => setShowGap((prev) => !prev)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-black border-2 transition ${
                showGap
                  ? "bg-red-700 text-white border-red-800 shadow-xs"
                  : "bg-sky-100 text-black border-sky-400 opacity-60"
              }`}
            >
              ⚠️ SUPPLY GAP
            </button>
          </div>

          <span className="text-[11px] font-bold text-slate-700">
            {filteredMonths.join(" → ")}
          </span>
        </div>
      </div>

      {/* ── 4 Top KPI Trajectory Stat Cards ── */}
      <div className="relative z-10 grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {/* Cumulative Demand Trend */}
        <div className="bg-gradient-to-br from-sky-100/95 via-sky-50/90 to-sky-200/90 p-4 rounded-2xl border-2 border-sky-400 shadow-[0_6px_25px_rgba(2,132,199,0.12)] backdrop-blur-xl hover:border-sky-600 transition">
          <div className="flex items-center justify-between text-[11px] font-mono font-black text-black uppercase">
            <span>TOTAL DEMAND PIPELINE</span>
            <span className="text-[10px] text-black font-black bg-sky-300 px-1.5 py-0.2 rounded border border-sky-500">
              {filteredMonths.length} MONTHS
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-base md:text-xl font-black text-black font-mono">
              ₹{kpiSummary.totalDemandLakhs} L
            </span>
          </div>
          <div className={`text-xs font-black mt-1 font-mono flex items-center gap-1 ${
            kpiSummary.growthPct >= 0 ? "text-emerald-800" : "text-red-700"
          }`}>
            <span>{kpiSummary.growthPct >= 0 ? "▲ +" : "▼ "}{kpiSummary.growthPct}%</span>
            <span className="text-black font-bold">Longitudinal Trajectory</span>
          </div>
        </div>

        {/* Supplied Cumulative */}
        <div className="bg-gradient-to-br from-sky-100/95 via-sky-50/90 to-sky-200/90 p-4 rounded-2xl border-2 border-sky-400 shadow-[0_6px_25px_rgba(2,132,199,0.12)] backdrop-blur-xl hover:border-sky-600 transition">
          <div className="text-[11px] font-mono font-black text-black uppercase">
            TOTAL SUPPLIED GRN
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-base md:text-xl font-black text-black font-mono">
              ₹{kpiSummary.totalSuppliedLakhs} L
            </span>
          </div>
          <div className="text-xs text-black font-black mt-1 font-mono">
            Recorded Inward Fulfillment
          </div>
        </div>

        {/* Average Fill Rate % Across Timeline */}
        <div className="bg-gradient-to-br from-sky-100/95 via-sky-50/90 to-sky-200/90 p-4 rounded-2xl border-2 border-sky-400 shadow-[0_6px_25px_rgba(2,132,199,0.12)] backdrop-blur-xl hover:border-sky-600 transition">
          <div className="text-[11px] font-mono font-black text-black uppercase">
            AVERAGE FILL RATE (FR %)
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className={`text-base md:text-xl font-black font-mono ${
              kpiSummary.avgFr >= 85 ? "text-emerald-900" : "text-red-700"
            }`}>
              {kpiSummary.avgFr}%
            </span>
          </div>
          <div className="text-xs text-black font-bold mt-1 font-mono">
            Target Benchmark: <strong className="text-black font-black">85.0% / 95.0%</strong>
          </div>
        </div>

        {/* Unsupplied Gap Value */}
        <div className="bg-gradient-to-br from-sky-100/95 via-sky-50/90 to-sky-200/90 p-4 rounded-2xl border-2 border-sky-400 shadow-[0_6px_25px_rgba(2,132,199,0.12)] backdrop-blur-xl hover:border-sky-600 transition">
          <div className="text-[11px] font-mono font-black text-black uppercase">
            CUMULATIVE UNSUPPLIED GAP
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-base md:text-xl font-black text-red-700 font-mono">
              ₹{kpiSummary.totalGapLakhs} L
            </span>
          </div>
          <div className="text-xs text-red-700 font-black mt-1 font-mono">
            Unfulfilled Demand Opportunity
          </div>
        </div>
      </div>

      {/* ── Main Multi-Month Interactive SVG Line Chart Container ── */}
      <div className="relative z-0 bg-gradient-to-b from-sky-100/95 via-sky-50/90 to-sky-200/90 rounded-2xl p-4 sm:p-5 border-2 border-sky-400 shadow-[0_8px_30px_rgba(2,132,199,0.15)] backdrop-blur-xl flex flex-col text-black">
        <div className="flex items-center justify-between pb-3 border-b-2 border-sky-400 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">📉</span>
            <h2 className="font-mono font-black text-sm md:text-base uppercase tracking-wide text-black">
              Multi-Month Fulfillment Velocity Curve (Line Chart)
            </h2>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono font-bold flex-wrap">
            <span className="flex items-center gap-1.5 text-blue-800 font-black">
              <span className="w-3 h-1 bg-blue-600 rounded-full inline-block" /> Demand (PO ₹)
            </span>
            <span className="flex items-center gap-1.5 text-emerald-800 font-black">
              <span className="w-3 h-1 bg-emerald-600 rounded-full inline-block" /> Supplied (GRN ₹)
            </span>
            <span className="flex items-center gap-1.5 text-purple-800 font-black">
              <span className="w-3 h-1 bg-purple-600 rounded-full inline-block" /> Fill Rate %
            </span>
            <span className="flex items-center gap-1.5 text-red-700 font-black">
              <span className="w-3 h-1 bg-red-600 rounded-full inline-block" /> Unsupplied Gap ₹
            </span>
          </div>
        </div>

        {/* SVG Canvas Area */}
        <div className="relative w-full overflow-x-auto pt-3">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="w-full h-auto max-h-[440px] select-none cursor-crosshair"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => {
              setHoveredPointIndex(null);
              setMousePos(null);
            }}
          >
            <defs>
              {/* Demand Linear Gradient */}
              <linearGradient id="demandGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
              </linearGradient>

              {/* Supplied Linear Gradient */}
              <linearGradient id="suppliedGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#059669" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#059669" stopOpacity="0.0" />
              </linearGradient>

              {/* Gap Linear Gradient */}
              <linearGradient id="gapGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#dc2626" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#dc2626" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Grid Horizontal Guide Lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
              const y = padding.top + innerHeight * pct;
              const val = Math.round((maxVal * (1 - pct)) / 100000);
              const frPct = Math.round(100 * (1 - pct));

              return (
                <g key={pct}>
                  <line
                    x1={padding.left}
                    y1={y}
                    x2={chartWidth - padding.right}
                    y2={y}
                    stroke="#93c5fd"
                    strokeWidth="1"
                    strokeDasharray={pct === 1 ? "none" : "3 3"}
                    opacity="0.8"
                  />
                  {/* Left Axis: INR Lakhs */}
                  <text
                    x={padding.left - 10}
                    y={y + 4}
                    textAnchor="end"
                    fill="#000000"
                    fontSize="10"
                    fontFamily="monospace"
                    fontWeight="900"
                  >
                    ₹{val}L
                  </text>
                  {/* Right Axis: FR % */}
                  <text
                    x={chartWidth - padding.right + 10}
                    y={y + 4}
                    textAnchor="start"
                    fill="#000000"
                    fontSize="10"
                    fontFamily="monospace"
                    fontWeight="900"
                  >
                    {frPct}%
                  </text>
                </g>
              );
            })}

            {/* 85% SLA Benchmark Target Horizontal Line */}
            {showFr && (
              <g>
                <line
                  x1={padding.left}
                  y1={padding.top + innerHeight - (85 / 100) * innerHeight}
                  x2={chartWidth - padding.right}
                  y2={padding.top + innerHeight - (85 / 100) * innerHeight}
                  stroke="#7c3aed"
                  strokeWidth="2"
                  strokeDasharray="6 4"
                  opacity="0.9"
                />
                <text
                  x={chartWidth - padding.right - 10}
                  y={padding.top + innerHeight - (85 / 100) * innerHeight - 6}
                  textAnchor="end"
                  fill="#7c3aed"
                  fontSize="10"
                  fontFamily="monospace"
                  fontWeight="900"
                >
                  Target SLA: 85.0%
                </text>
              </g>
            )}

            {/* Area Fills under Lines */}
            {showDemand && <path d={makeAreaPath("yDemand")} fill="url(#demandGrad)" />}
            {showSupplied && <path d={makeAreaPath("ySupplied")} fill="url(#suppliedGrad)" />}
            {showGap && <path d={makeAreaPath("yGap")} fill="url(#gapGrad)" />}

            {/* Main Lines */}
            {showDemand && (
              <path
                d={makePath("yDemand")}
                fill="none"
                stroke="#2563eb"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {showSupplied && (
              <path
                d={makePath("ySupplied")}
                fill="none"
                stroke="#059669"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {showGap && (
              <path
                d={makePath("yGap")}
                fill="none"
                stroke="#dc2626"
                strokeWidth="2.5"
                strokeDasharray="5 3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {showFr && (
              <path
                d={makePath("yFr")}
                fill="none"
                stroke="#9333ea"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Hover Cursor Vertical Line */}
            {hoveredPointIndex !== null && mousePos && (
              <g>
                <line
                  x1={mousePos.x}
                  y1={padding.top}
                  x2={mousePos.x}
                  y2={chartHeight - padding.bottom}
                  stroke="#000000"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                />
              </g>
            )}

            {/* Data Point Nodes on Curves */}
            {pointsData.map((p, idx) => {
              const isHovered = hoveredPointIndex === idx;

              return (
                <g key={p.monthName}>
                  {/* Demand Dot */}
                  {showDemand && (
                    <circle
                      cx={p.x}
                      cy={p.yDemand}
                      r={isHovered ? 7 : 5}
                      fill="#2563eb"
                      stroke="#ffffff"
                      strokeWidth="2"
                      className="transition-all duration-150 shadow"
                    />
                  )}

                  {/* Supplied Dot */}
                  {showSupplied && (
                    <circle
                      cx={p.x}
                      cy={p.ySupplied}
                      r={isHovered ? 7 : 5}
                      fill="#059669"
                      stroke="#ffffff"
                      strokeWidth="2"
                      className="transition-all duration-150 shadow"
                    />
                  )}

                  {/* Gap Dot */}
                  {showGap && (
                    <circle
                      cx={p.x}
                      cy={p.yGap}
                      r={isHovered ? 6 : 4}
                      fill="#dc2626"
                      stroke="#ffffff"
                      strokeWidth="2"
                      className="transition-all duration-150 shadow"
                    />
                  )}

                  {/* FR % Dot */}
                  {showFr && (
                    <circle
                      cx={p.x}
                      cy={p.yFr}
                      r={isHovered ? 8 : 6}
                      fill="#9333ea"
                      stroke="#ffffff"
                      strokeWidth="2.5"
                      className="transition-all duration-150 shadow"
                    />
                  )}

                  {/* X-Axis Month Name Label */}
                  <text
                    x={p.x}
                    y={chartHeight - padding.bottom + 22}
                    textAnchor="middle"
                    fill="#000000"
                    fontSize="12"
                    fontFamily="monospace"
                    fontWeight="900"
                  >
                    {p.monthName.toUpperCase()}
                  </text>

                  {/* Top Fill Rate % Badge Label */}
                  {showFr && (
                    <text
                      x={p.x}
                      y={p.yFr - 12}
                      textAnchor="middle"
                      fill="#000000"
                      fontSize="11"
                      fontFamily="monospace"
                      fontWeight="900"
                      className="drop-shadow-xs"
                    >
                      {p.fr}%
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Interactive Floating Telemetry Tooltip */}
          {activeHoveredPoint && (
            <div
              className="absolute z-30 pointer-events-none bg-sky-50/95 text-black p-3 rounded-xl border-2 border-sky-400 shadow-[0_10px_30px_rgba(0,0,0,0.2)] backdrop-blur-xl font-mono text-xs space-y-1.5 transition-all duration-150 min-w-[210px]"
              style={{
                left: `${Math.min(Math.max(activeHoveredPoint.x - 105, 10), chartWidth - 230)}px`,
                top: `${padding.top + 10}px`,
              }}
            >
              <div className="flex items-center justify-between border-b-2 border-sky-300 pb-1 font-black text-black">
                <span className="text-sm">🗓️ {activeHoveredPoint.monthName.toUpperCase()}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                  activeHoveredPoint.fr >= 85 ? "bg-emerald-200 text-emerald-950 border border-emerald-400" : "bg-red-100 text-red-800 border border-red-400"
                }`}>
                  FR: {activeHoveredPoint.fr}%
                </span>
              </div>

              <div className="flex items-center justify-between text-black font-bold">
                <span className="text-blue-700">Demand (PO):</span>
                <span className="text-black font-black">₹{activeHoveredPoint.demandVal.toLocaleString("en-IN")}</span>
              </div>

              <div className="flex items-center justify-between text-black font-bold">
                <span className="text-emerald-700">Supplied (GRN):</span>
                <span className="text-black font-black">₹{activeHoveredPoint.suppliedVal.toLocaleString("en-IN")}</span>
              </div>

              <div className="flex items-center justify-between text-black font-bold">
                <span className="text-red-700">Unsupplied Gap:</span>
                <span className="text-red-700 font-black">₹{activeHoveredPoint.gapVal.toLocaleString("en-IN")}</span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-black pt-1 border-t border-sky-200">
                <span>Total POs: <strong>{activeHoveredPoint.poCount}</strong></span>
                <span>Units: <strong>{activeHoveredPoint.poQty.toLocaleString("en-IN")}</strong></span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Section: SKU-Level Trend Performance Matrix ── */}
      <div className="bg-gradient-to-b from-sky-100/95 via-sky-50/90 to-sky-200/90 rounded-2xl p-5 border-2 border-sky-400 shadow-[0_8px_30px_rgba(2,132,199,0.15)] backdrop-blur-xl flex flex-col text-black">
        {/* Table Header & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b-2 border-sky-400">
          <div>
            <h2 className="text-base font-black text-black flex items-center gap-2 font-mono">
              <span>📊</span> SKU Longitudinal Trend Breakdown ({skuTrendRows.length} Items)
            </h2>
            <div className="text-xs text-black font-bold mt-0.5">
              Comparative fill rates and demand trajectory by individual product.
            </div>
          </div>

          <div className="relative w-full sm:w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search SKU name, code, category..."
              className="w-full bg-sky-50 border-2 border-sky-400 rounded-xl px-3 py-1.5 text-xs text-black placeholder-slate-600 font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-black font-mono shadow-inner"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-black hover:text-red-700 font-black"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* SKU Trend Matrix Table */}
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-left font-mono text-xs divide-y-2 divide-sky-300">
            <thead>
              <tr className="text-black font-black text-[11px] uppercase bg-sky-200/80">
                <th className="py-2.5 px-3">SKU & Code</th>
                <th className="py-2.5 px-3">Category</th>
                {filteredMonths.map((m) => (
                  <th key={m} className="py-2.5 px-3 text-center">
                    {m} (FR%)
                  </th>
                ))}
                <th className="py-2.5 px-3 text-center">Average FR%</th>
                <th className="py-2.5 px-3 text-center">Growth Trajectory</th>
                <th className="py-2.5 px-3 text-right">Trend Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sky-300/70">
              {skuTrendRows.slice(0, 50).map((row, idx) => {
                return (
                  <tr key={idx} className="hover:bg-sky-200/50 transition">
                    {/* SKU Name & Icon */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2.5 min-w-[200px]">
                        <div className="w-8 h-8 rounded-lg bg-sky-100 p-0.5 flex items-center justify-center shrink-0 border border-sky-300 shadow-xs">
                          {row.icon ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={row.icon} alt={row.skuName} className="max-h-full max-w-full object-contain" />
                          ) : (
                            <span className="text-base">🥛</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-black text-black truncate">{row.skuName}</div>
                          <div className="text-[10px] text-black font-bold">{row.code}</div>
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-3 px-3 font-bold text-black">{row.category}</td>

                    {/* Monthly FR% Columns */}
                    {filteredMonths.map((m) => {
                      const stat = row.monthlyStats[m];
                      const fr = stat?.fr || 0;
                      return (
                        <td key={m} className="py-3 px-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded font-black text-[11px] ${
                              fr >= 85
                                ? "bg-emerald-200 text-emerald-950 border border-emerald-400"
                                : fr > 0
                                ? "bg-red-100 text-red-700 border border-red-400"
                                : "text-slate-500 font-normal"
                            }`}
                          >
                            {fr > 0 ? `${fr}%` : "—"}
                          </span>
                        </td>
                      );
                    })}

                    {/* Average FR */}
                    <td className="py-3 px-3 text-center font-black text-black">
                      {row.avgFr}%
                    </td>

                    {/* Overall Growth */}
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`font-black ${
                          row.overallGrowthPct >= 0 ? "text-emerald-800" : "text-red-700"
                        }`}
                      >
                        {row.overallGrowthPct >= 0 ? "▲ +" : "▼ "}
                        {row.overallGrowthPct}%
                      </span>
                    </td>

                    {/* Status Badge */}
                    <td className="py-3 px-3 text-right">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black ${
                          row.trendStatus === "ACCELERATING"
                            ? "bg-emerald-200 text-emerald-950 border border-emerald-500 shadow-xs"
                            : row.trendStatus === "DECLINING"
                            ? "bg-red-100 text-red-800 border border-red-400 shadow-xs"
                            : "bg-sky-200 text-black border border-sky-400"
                        }`}
                      >
                        {row.trendStatus === "ACCELERATING"
                          ? "🚀 ACCELERATING"
                          : row.trendStatus === "DECLINING"
                          ? "🚨 DECLINING"
                          : "📈 STABLE"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
