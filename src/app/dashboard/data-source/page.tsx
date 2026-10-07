"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import SyncStatus from "../sync-status";
import { CITY_DEPO_MAPPING, lookupDepoByCity } from "@/lib/depo-mapping";
import { mmdGroup } from "@/lib/mmd-mapping";
import UploadButton from "../upload-button";

type Data = {
  meta: {
    rows: number;
    generated: string;
    value_unit: string;
    po_count: number;
    date_min: string;
    date_max: string;
  };
  dims: Record<string, string[]>;
  rows: number[][];
};

const L = (n: number, d = 1) =>
  n.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: 0 });
const L2 = (n: number) =>
  n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

const fmtYMD = (n: number) => {
  const s = String(n);
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : "—";
};

const dateToYmd = (s: string) => (s ? +s.replaceAll("-", "") : 0);

const DATE_PRESETS = [
  { label: "Today", days: 1 },
  { label: "7 Days", days: 7 },
  { label: "14 Days", days: 14 },
  { label: "30 Days", days: 30 },
  { label: "MTD", days: 0 },
  { label: "All Dates", days: -1 },
];

/* ── Reusable Multi-Select Checkbox Dropdown Component ── */
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
            ? "border-indigo-500 bg-indigo-50/70 text-indigo-900 ring-1 ring-indigo-400 font-bold"
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
            className="absolute left-0 top-full mt-1.5 z-50 w-72 max-w-[90vw] bg-white border border-indigo-200 rounded-2xl shadow-2xl p-3 space-y-2 animate-in fade-in zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative">
              <input
                autoFocus
                type="text"
                placeholder={`Search ${label.toLowerCase()}...`}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                  className="text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
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
                          ? "bg-indigo-50 text-indigo-900 font-bold"
                          : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleItem(opt.key)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 accent-indigo-600 cursor-pointer shrink-0"
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

const DICTIONARY_FIELDS = [
  {
    name: "PO Number (PO ID)",
    type: "String / ID",
    source: "Google Sheet Column: PO Number",
    description: "Unique identifier for each Purchase Order issued by quick-commerce platforms.",
    rules: "Trimmed and deduplicated into integer dimension array for ultra-fast query performance.",
  },
  {
    name: "Trade / Platform",
    type: "Categorical",
    source: "Google Sheet Column: Trade",
    description: "Quick-commerce trade platform e.g. Zepto, Blinkit, Swiggy Instamart, Amazon, BigBasket.",
    rules: "Standardized casing and grouped.",
  },
  {
    name: "Month",
    type: "Categorical",
    source: "Google Sheet Column: Month",
    description: "Calendar month of the purchase order record (January to December).",
    rules: "Ordered chronologically.",
  },
  {
    name: "Region / State",
    type: "Categorical",
    source: "Google Sheet Column: Region",
    description: "State or operational territory (e.g. Karnataka, Tamil Nadu, Maharashtra, Telangana).",
    rules: "Standardized title case.",
  },
  {
    name: "City",
    type: "Categorical",
    source: "Google Sheet Column: City",
    description: "Destination fulfillment city e.g. Bengaluru, Chennai, Mumbai, Hyderabad, Pune.",
    rules: "Title-cased. Mapped to physical supply depots via Depo-Mapping master.",
  },
  {
    name: "Depo / Del Location",
    type: "Reference Master",
    source: "Depo-Mapping.xlsx Reference File",
    description: "Assigned supply depot e.g. HO Depo, Sunethra Depo, Taloja Depo, Hyderabad Depo.",
    rules: "Derived on the fly from City using normalized city lookup.",
  },
  {
    name: "Category",
    type: "Categorical",
    source: "Google Sheet Column: Category",
    description: "Product family e.g. Paneer, Curd, Cheese, Butter, Ghee, Milk, Sweets.",
    rules: "Grouped by dairy product line.",
  },
  {
    name: "SKU Name / MMD Code",
    type: "String / Master",
    source: "Google Sheet Column: SKU Name + MMD_SKU.xlsx",
    description: "Product description and Milky Mist Master Item Code (e.g. #100248 Paneer 200g).",
    rules: "Normalized via mmdGroup to match exact SAP/ERP item master.",
  },
  {
    name: "PO Qty & PO Value",
    type: "Numeric (Qty in Units, Value in ₹ Lakh)",
    source: "Google Sheet Columns: PO Qty, Po Value",
    description: "Quantity of units ordered and total monetary value in ₹ Lakhs (1 Lakh = 100,000 INR).",
    rules: "Stored with decimal precision; sums pre-calculated.",
  },
  {
    name: "GRN Qty & GRN Value",
    type: "Numeric (Qty in Units, Value in ₹ Lakh)",
    source: "Google Sheet Columns: GRN Qty, GRN Value",
    description: "Goods Received Note: quantity and monetary value fulfilled & accepted at warehouse.",
    rules: "Treated as 0 if blank or unsupplied.",
  },
  {
    name: "Gap (Deficit)",
    type: "Derived Metric",
    source: "Formula: Math.max(0, PO Value - GRN Value)",
    description: "Unfulfilled order value / shortage in ₹ Lakhs and unfulfilled units.",
    rules: "Represents lost revenue / supply deficit.",
  },
  {
    name: "Fill Rate % (FR %)",
    type: "Derived Metric",
    source: "Formula: (GRN Value / PO Value) * 100",
    description: "Fulfillment percentage by value and by quantity.",
    rules: "Color-coded: ≥90% Emerald (Good), 75-89% Amber (Medium), <75% Rose (Critical).",
  },
  {
    name: "PO Date",
    type: "Date (YYYY-MM-DD)",
    source: "Google Sheet Column: Po Date",
    description: "Issuance date of the purchase order.",
    rules: "Parsed in UTC day arithmetic to prevent timezone shift.",
  },
  {
    name: "PO Status",
    type: "Categorical",
    source: "Google Sheet Column: PO Status",
    description: "Order lifecycle state e.g. Fully Supplied, Partially Supplied, Zero Supply, Expired.",
    rules: "Normalized into standard fulfillment state buckets.",
  },
  {
    name: "PO Expiry Date",
    type: "Date (YYYY-MM-DD)",
    source: "Google Sheet Column: Po Expiry Date",
    description: "Contractual fulfillment expiry deadline for the purchase order.",
    rules: "Used to compute urgency countdown (Expired, Today, ≤2 Days left, Safe).",
  },
];

export default function DataSourcePage() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"raw" | "depo" | "sku" | "dictionary">("raw");

  // Date Range & Multi-Select Filters
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [selMonths, setSelMonths] = useState<string[]>([]);
  const [selTrades, setSelTrades] = useState<string[]>([]);
  const [selRegions, setSelRegions] = useState<string[]>([]);
  const [selCities, setSelCities] = useState<string[]>([]);
  const [selCategories, setSelCategories] = useState<string[]>([]);
  const [selStatuses, setSelStatuses] = useState<string[]>([]);
  const [searchQ, setSearchQ] = useState("");
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Depo master search
  const [depoSearch, setDepoSearch] = useState("");

  // SKU master search
  const [skuSearch, setSkuSearch] = useState("");

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
    setSelStatuses([]);
    setSearchQ("");
    setPage(1);
    if (d?.meta?.date_max) {
      const max = d.meta.date_max as string;
      setFFrom(max.slice(0, 7) + "-01");
      setFTo(max);
    } else {
      setFFrom("");
      setFTo("");
    }
  }

  // Filtered raw records
  const filteredRawRows = useMemo(() => {
    if (!d) return [];
    const fromYmd = dateToYmd(fFrom);
    const toYmd = dateToYmd(fTo);
    const q = searchQ.trim().toLowerCase();

    const monthSet = new Set(selMonths);
    const tradeSet = new Set(selTrades);
    const regionSet = new Set(selRegions);
    const citySet = new Set(selCities);
    const categorySet = new Set(selCategories);
    const statusSet = new Set(selStatuses);

    return d.rows.filter((r) => {
      const rowMonth = d.dims.month[r[0]] || "";
      const rowTrade = d.dims.trade[r[1]] || "";
      const rowRegion = d.dims.region[r[2]] || "";
      const rowCity = d.dims.city[r[3]] || "";
      const rowCategory = d.dims.category[r[4]] || "";
      const rowStatus = d.dims.status[r[5]] || "";
      const rowSku = d.dims.sku[r[6]] || "";
      const rowPoNum = d.dims.po[r[12]] || "";
      const rowPoDate = r[11];

      // Multi-Select Filters
      if (monthSet.size > 0 && !monthSet.has(rowMonth)) return false;
      if (tradeSet.size > 0 && !tradeSet.has(rowTrade)) return false;
      if (regionSet.size > 0 && !regionSet.has(rowRegion)) return false;
      if (citySet.size > 0 && !citySet.has(rowCity)) return false;
      if (categorySet.size > 0 && !categorySet.has(rowCategory)) return false;
      if (statusSet.size > 0 && !statusSet.has(rowStatus)) return false;

      // Date Range Filter
      if (fromYmd && rowPoDate > 0 && rowPoDate < fromYmd) return false;
      if (toYmd && rowPoDate > 0 && rowPoDate > toYmd) return false;

      // Free Search
      if (q) {
        const match =
          rowPoNum.toLowerCase().includes(q) ||
          rowSku.toLowerCase().includes(q) ||
          rowCity.toLowerCase().includes(q) ||
          rowTrade.toLowerCase().includes(q) ||
          rowStatus.toLowerCase().includes(q) ||
          rowCategory.toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [d, fFrom, fTo, selMonths, selTrades, selRegions, selCities, selCategories, selStatuses, searchQ]);

  // Aggregated KPIs for filtered records
  const filteredKpis = useMemo(() => {
    let poVal = 0,
      grnVal = 0,
      poQty = 0,
      grnQty = 0;
    const poSet = new Set<number>();

    for (const r of filteredRawRows) {
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

    return {
      rowCount: filteredRawRows.length,
      poCount: poSet.size,
      poQty,
      poVal,
      grnQty,
      grnVal,
      gapQty,
      gapVal,
      frVal,
      frQty,
    };
  }, [filteredRawRows]);

  const totalPages = Math.max(1, Math.ceil(filteredRawRows.length / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRawRows.slice(start, start + pageSize);
  }, [filteredRawRows, page, pageSize]);

  // Unique SKUs Master list
  const uniqueSkus = useMemo(() => {
    if (!d) return [];
    const map = new Map<string, { rawName: string; mmdCode: string; mmdName: string; category: string; count: number; poVal: number }>();

    for (const r of d.rows) {
      const rawName = d.dims.sku[r[6]] || "";
      const cat = d.dims.category[r[4]] || "General";
      const g = mmdGroup(rawName);

      let item = map.get(rawName);
      if (!item) {
        item = {
          rawName,
          mmdCode: g.code || "—",
          mmdName: g.name || rawName,
          category: cat,
          count: 0,
          poVal: 0,
        };
        map.set(rawName, item);
      }
      item.count++;
      item.poVal += r[8];
    }

    let arr = Array.from(map.values());
    if (skuSearch.trim()) {
      const sq = skuSearch.toLowerCase();
      arr = arr.filter(
        (s) =>
          s.rawName.toLowerCase().includes(sq) ||
          s.mmdCode.toLowerCase().includes(sq) ||
          s.mmdName.toLowerCase().includes(sq) ||
          s.category.toLowerCase().includes(sq)
      );
    }

    return arr.sort((a, b) => b.poVal - a.poVal);
  }, [d, skuSearch]);

  // Depo Mapping list
  const depoList = useMemo(() => {
    const entries = Object.entries(CITY_DEPO_MAPPING).map(([cityKey, info]) => ({
      city: cityKey.toUpperCase(),
      depo: info.depo,
      state: info.state,
      delLocation: info.delLocation,
    }));

    if (!depoSearch.trim()) return entries;
    const dq = depoSearch.toLowerCase();
    return entries.filter(
      (e) =>
        e.city.toLowerCase().includes(dq) ||
        e.depo.toLowerCase().includes(dq) ||
        e.state.toLowerCase().includes(dq) ||
        e.delLocation.toLowerCase().includes(dq)
    );
  }, [depoSearch]);

  // Export filtered raw data to CSV directly in browser
  function exportRawCsv() {
    if (!d || filteredRawRows.length === 0) return;
    const headers = [
      "PO Number",
      "Month",
      "Trade",
      "Region",
      "City",
      "Depot",
      "Category",
      "SKU Name",
      "MMD Item Code",
      "PO Qty",
      "PO Value (Lakhs)",
      "GRN Qty",
      "GRN Value (Lakhs)",
      "Gap Qty",
      "Gap Value (Lakhs)",
      "FR Value %",
      "PO Date",
      "PO Status",
      "PO Expiry Date",
    ];

    const csvRows = filteredRawRows.map((r) => {
      const city = d.dims.city[r[3]] || "";
      const depo = lookupDepoByCity(city)?.depo || "—";
      const sku = d.dims.sku[r[6]] || "";
      const g = mmdGroup(sku);
      const gapQty = Math.max(0, r[7] - r[9]);
      const gapVal = Math.max(0, r[8] - r[10]);
      const frVal = r[8] > 0 ? (r[10] / r[8]) * 100 : 0;

      return [
        `"${d.dims.po[r[12]] || ""}"`,
        `"${d.dims.month[r[0]] || ""}"`,
        `"${d.dims.trade[r[1]] || ""}"`,
        `"${d.dims.region[r[2]] || ""}"`,
        `"${city}"`,
        `"${depo}"`,
        `"${d.dims.category[r[4]] || ""}"`,
        `"${sku.replace(/"/g, '""')}"`,
        `"${g.code || "—"}"`,
        r[7],
        r[8].toFixed(2),
        r[9],
        r[10].toFixed(2),
        gapQty,
        gapVal.toFixed(2),
        frVal.toFixed(1),
        `"${fmtYMD(r[11])}"`,
        `"${d.dims.status[r[5]] || ""}"`,
        `"${fmtYMD(r[13])}"`,
      ].join(",");
    });

    const csvContent = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Trade_FR_Raw_Data_Filtered_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  if (err) {
    return (
      <div className="p-8 text-sm text-rose-600 bg-rose-50 rounded-2xl border border-rose-200">
        Could not load data source: {err}
      </div>
    );
  }

  if (!d) {
    return (
      <div className="p-12 text-center text-slate-500 font-semibold flex items-center justify-center gap-3">
        <span className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        Loading Data Source & Reference Architecture…
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
      {/* ── Top Header Banner ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="px-3 py-1 rounded-xl bg-indigo-100 text-indigo-900 font-black text-xs uppercase tracking-wider">
              Data Architecture
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Data Source & Reference Center
            </h1>
            <SyncStatus />
          </div>
          <p className="text-xs font-medium text-slate-500 mt-1">
            Live database records, Google Sheet connection, master reference files, and data dictionary
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <UploadButton variant="light" />

          <a
            href="/api/export"
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition active:scale-95 flex items-center gap-1.5"
            title="Download full live parsed dataset"
          >
            <span>⬇️</span> Download Raw Dataset (.xlsx)
          </a>

          <a
            href="/api/data-source/download?file=depo"
            className="px-3.5 py-2 rounded-xl bg-purple-900 hover:bg-purple-950 text-white font-bold text-xs shadow-md transition active:scale-95 flex items-center gap-1.5"
            title="Download Depo Mapping Excel reference file"
          >
            <span>🏢</span> Depo-Mapping.xlsx
          </a>

          <a
            href="/api/data-source/download?file=sku"
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-950 text-white font-bold text-xs shadow-md transition active:scale-95 flex items-center gap-1.5"
            title="Download MMD SKU item master Excel file"
          >
            <span>🥛</span> MMD_SKU.xlsx
          </a>
        </div>
      </div>

      {/* ── Architecture & Metadata KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-1">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
            Source Connection
          </div>
          <div className="text-base font-black text-indigo-950 flex items-center gap-2">
            <span>📊 Direct-Trade-Automation</span>
          </div>
          <div className="text-xs font-semibold text-slate-500">
            Google Sheets: <span className="text-indigo-700 font-bold">Raw Data Tab</span> (Auto-synced)
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-1">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
            Database Engine & Storage
          </div>
          <div className="text-base font-black text-slate-900 flex items-center gap-2">
            <span>⚡ Neon Serverless Postgres</span>
          </div>
          <div className="text-xs font-semibold text-slate-500">
            Fallback: <span className="font-mono text-slate-700">public/app/data.json</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-1">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
            Active Dataset Volume
          </div>
          <div className="text-base font-black text-slate-900">
            {L(d.meta.rows, 0)} Rows · {L(d.meta.po_count, 0)} POs
          </div>
          <div className="text-xs font-semibold text-slate-500">
            Date Coverage: {d.meta.date_min} to {d.meta.date_max}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-1">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
            Value Unit & Generated
          </div>
          <div className="text-base font-black text-purple-950">
            {d.meta.value_unit || "₹ Lakh (100k INR)"}
          </div>
          <div className="text-xs font-semibold text-slate-500 truncate" title={d.meta.generated}>
            Generated: {d.meta.generated}
          </div>
        </div>
      </div>

      {/* ── Navigation Tabs ── */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        {[
          { id: "raw", label: `📊 Live Raw Records (${L(filteredRawRows.length, 0)})` },
          { id: "depo", label: `🏢 Depo Mapping Master (${depoList.length} Cities)` },
          { id: "sku", label: `🥛 MMD SKU Master (${uniqueSkus.length} Items)` },
          { id: "dictionary", label: `📖 Data Field Dictionary (${DICTIONARY_FIELDS.length} Fields)` },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
              tab === t.id
                ? "bg-indigo-600 text-white shadow-md"
                : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB 1: LIVE RAW DATA EXPLORER WITH MULTI-SELECT & DATE RANGE ── */}
      {tab === "raw" && (
        <div className="space-y-4">
          {/* Multi-Select & Date Filter Bar */}
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
                        onClick={() => {
                          applyPreset(p.days);
                          setPage(1);
                        }}
                        className="px-1.5 py-0.5 rounded text-[10px] font-bold border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-800 transition cursor-pointer"
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
                    onChange={(e) => {
                      setFFrom(e.target.value);
                      setPage(1);
                    }}
                    min={d.meta.date_min}
                    max={d.meta.date_max}
                    className="w-1/2 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-semibold bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-slate-400 text-xs font-bold">→</span>
                  <input
                    type="date"
                    value={fTo}
                    onChange={(e) => {
                      setFTo(e.target.value);
                      setPage(1);
                    }}
                    min={d.meta.date_min}
                    max={d.meta.date_max}
                    className="w-1/2 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-semibold bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Multi-Select Filters */}
              <MultiSelectDropdown
                label="Month"
                options={d.dims.month.map((m) => ({ key: m, label: m }))}
                selected={selMonths}
                onChange={(s) => {
                  setSelMonths(s);
                  setPage(1);
                }}
                open={openDropdown === "month"}
                onToggle={() => setOpenDropdown(openDropdown === "month" ? null : "month")}
                onClose={() => setOpenDropdown(null)}
              />

              <MultiSelectDropdown
                label="Trade / Platform"
                options={d.dims.trade.map((t) => ({ key: t, label: t }))}
                selected={selTrades}
                onChange={(s) => {
                  setSelTrades(s);
                  setPage(1);
                }}
                open={openDropdown === "trade"}
                onToggle={() => setOpenDropdown(openDropdown === "trade" ? null : "trade")}
                onClose={() => setOpenDropdown(null)}
              />

              <MultiSelectDropdown
                label="Region / State"
                options={d.dims.region.map((r) => ({ key: r, label: r }))}
                selected={selRegions}
                onChange={(s) => {
                  setSelRegions(s);
                  setPage(1);
                }}
                open={openDropdown === "region"}
                onToggle={() => setOpenDropdown(openDropdown === "region" ? null : "region")}
                onClose={() => setOpenDropdown(null)}
              />

              <MultiSelectDropdown
                label="City"
                options={d.dims.city.map((c) => ({ key: c, label: c }))}
                selected={selCities}
                onChange={(s) => {
                  setSelCities(s);
                  setPage(1);
                }}
                open={openDropdown === "city"}
                onToggle={() => setOpenDropdown(openDropdown === "city" ? null : "city")}
                onClose={() => setOpenDropdown(null)}
              />

              <MultiSelectDropdown
                label="Category"
                options={d.dims.category.map((c) => ({ key: c, label: c }))}
                selected={selCategories}
                onChange={(s) => {
                  setSelCategories(s);
                  setPage(1);
                }}
                open={openDropdown === "category"}
                onToggle={() => setOpenDropdown(openDropdown === "category" ? null : "category")}
                onClose={() => setOpenDropdown(null)}
              />

              <MultiSelectDropdown
                label="PO Status"
                options={(d.dims.status || []).map((s) => ({ key: s, label: s }))}
                selected={selStatuses}
                onChange={(s) => {
                  setSelStatuses(s);
                  setPage(1);
                }}
                open={openDropdown === "status"}
                onToggle={() => setOpenDropdown(openDropdown === "status" ? null : "status")}
                onClose={() => setOpenDropdown(null)}
              />
            </div>

            {/* Search & Actions Strip */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <div className="relative w-full sm:w-96">
                <input
                  type="text"
                  placeholder="Search by PO Number, SKU name, City, Trade..."
                  value={searchQ}
                  onChange={(e) => {
                    setSearchQ(e.target.value);
                    setPage(1);
                  }}
                  className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="absolute left-3 top-2.5 text-xs text-slate-400">🔍</span>
                {searchQ && (
                  <button
                    onClick={() => {
                      setSearchQ("");
                      setPage(1);
                    }}
                    className="absolute right-3 top-2 text-xs font-bold text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                <button
                  onClick={resetFilters}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700 text-slate-600 font-bold text-xs transition cursor-pointer"
                >
                  Reset Filters
                </button>
                <button
                  onClick={exportRawCsv}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition active:scale-95 cursor-pointer flex items-center gap-1.5"
                  title="Export filtered records to CSV"
                >
                  <span>📥</span> Export Filtered CSV
                </button>
              </div>
            </div>
          </div>

          {/* Filtered Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-sm">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Filtered Records</div>
              <div className="text-lg font-black text-slate-900">{L(filteredKpis.rowCount, 0)}</div>
              <div className="text-[11px] font-semibold text-slate-500">{filteredKpis.poCount} Orders</div>
            </div>

            <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-sm">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Total PO Value</div>
              <div className="text-lg font-black text-slate-900">₹{L2(filteredKpis.poVal)}L</div>
              <div className="text-[11px] font-semibold text-slate-500">{L(filteredKpis.poQty, 0)} Units</div>
            </div>

            <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-sm">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600">Supplied GRN</div>
              <div className="text-lg font-black text-emerald-700">₹{L2(filteredKpis.grnVal)}L</div>
              <div className="text-[11px] font-semibold text-emerald-600">{L(filteredKpis.grnQty, 0)} Units</div>
            </div>

            <div className="bg-white rounded-2xl p-3.5 border border-rose-200 bg-rose-50/40 shadow-sm">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-rose-600">Supply Gap (Deficit)</div>
              <div className="text-lg font-black text-rose-700">₹{L2(filteredKpis.gapVal)}L</div>
              <div className="text-[11px] font-bold text-rose-600">-{L(filteredKpis.gapQty, 0)} Units</div>
            </div>

            <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-sm col-span-2 sm:col-span-1">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Fill Rate %</div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-black text-slate-900">{filteredKpis.frVal.toFixed(1)}%</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
                    filteredKpis.frVal >= 90
                      ? "bg-emerald-100 text-emerald-800"
                      : filteredKpis.frVal >= 75
                      ? "bg-amber-100 text-amber-800"
                      : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {filteredKpis.frVal >= 90 ? "Good" : filteredKpis.frVal >= 75 ? "Medium" : "Critical"}
                </span>
              </div>
              <div className="text-[11px] font-semibold text-slate-500">Qty FR: {filteredKpis.frQty.toFixed(1)}%</div>
            </div>
          </div>

          {/* Paginated Table Card */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>
                Showing {paginatedRows.length} records (Page {page} of {totalPages}) · Total Filtered:{" "}
                {L(filteredRawRows.length, 0)}
              </span>

              <div className="flex items-center gap-2">
                <span>Rows per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(+e.target.value);
                    setPage(1);
                  }}
                  className="border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold bg-white"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
              </div>
            </div>

            {/* Paginated Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-left border-collapse min-w-[1100px] text-xs">
                <thead>
                  <tr className="bg-slate-100 text-[11px] font-black uppercase tracking-wider text-slate-600 border-b border-slate-200">
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">PO Number</th>
                    <th className="py-2.5 px-3">Trade</th>
                    <th className="py-2.5 px-3">City</th>
                    <th className="py-2.5 px-3">Depot</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">SKU Name</th>
                    <th className="py-2.5 px-3">MMD Code</th>
                    <th className="py-2.5 px-3 text-right">PO Qty</th>
                    <th className="py-2.5 px-3 text-right">PO Val (₹L)</th>
                    <th className="py-2.5 px-3 text-right">GRN Qty</th>
                    <th className="py-2.5 px-3 text-right">GRN Val (₹L)</th>
                    <th className="py-2.5 px-3 text-right">Gap (₹L)</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3">PO Date</th>
                    <th className="py-2.5 px-3">Expiry Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td colSpan={16} className="py-8 text-center text-slate-400 font-semibold">
                        No records match the current filter criteria
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((r, i) => {
                      const rowIdx = (page - 1) * pageSize + i + 1;
                      const city = d.dims.city[r[3]] || "";
                      const depo = lookupDepoByCity(city)?.depo || "—";
                      const sku = d.dims.sku[r[6]] || "";
                      const g = mmdGroup(sku);
                      const gapVal = Math.max(0, r[8] - r[10]);

                      return (
                        <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">{rowIdx}</td>
                          <td className="py-2 px-3 font-mono font-bold text-slate-900">
                            {d.dims.po[r[12]] || "—"}
                          </td>
                          <td className="py-2 px-3 font-semibold text-slate-700">
                            {d.dims.trade[r[1]] || "—"}
                          </td>
                          <td className="py-2 px-3 font-medium text-slate-800">{city}</td>
                          <td className="py-2 px-3 text-slate-500 font-medium">{depo}</td>
                          <td className="py-2 px-3">
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-600">
                              {d.dims.category[r[4]] || "—"}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-semibold text-slate-900 max-w-xs truncate" title={sku}>
                            {sku}
                          </td>
                          <td className="py-2 px-3 font-mono text-purple-700 font-bold">{g.code || "—"}</td>
                          <td className="py-2 px-3 text-right font-mono">{L(r[7], 0)}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                            ₹{L2(r[8])}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-emerald-700">{L(r[9], 0)}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                            ₹{L2(r[10])}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-black text-rose-600">
                            {gapVal > 0 ? `₹${L2(gapVal)}L` : "0.00"}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                              {d.dims.status[r[5]] || "—"}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-slate-600 font-mono text-[11px]">{fmtYMD(r[11])}</td>
                          <td className="py-2 px-3 text-slate-500 font-mono text-[11px]">{fmtYMD(r[13])}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition"
              >
                ← Previous Page
              </button>

              <span className="text-xs font-bold text-slate-600">
                Page {page} of {totalPages}
              </span>

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition"
              >
                Next Page →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: DEPO MAPPING MASTER ── */}
      {tab === "depo" && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-slate-900">
                City to Supply Depot & Delivery Location Reference Master
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Extracted from <span className="font-mono text-purple-700 font-bold">Depo-Mapping.xlsx</span>.
                Used across dashboards to aggregate city fulfillment to physical dairy depots.
              </p>
            </div>

            <div className="relative w-full sm:w-72">
              <input
                type="text"
                placeholder="Search city, depot, state..."
                value={depoSearch}
                onChange={(e) => setDepoSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 bg-slate-50 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <span className="absolute left-2.5 top-2 text-xs text-slate-400">🔍</span>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-[11px] font-black uppercase tracking-wider text-slate-600 border-b border-slate-200">
                  <th className="py-2.5 px-4">#</th>
                  <th className="py-2.5 px-4">City</th>
                  <th className="py-2.5 px-4">Assigned Supply Depot</th>
                  <th className="py-2.5 px-4">State / Territory</th>
                  <th className="py-2.5 px-4">Representative Delivery Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {depoList.map((item, idx) => (
                  <tr key={item.city} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-4 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                    <td className="py-2.5 px-4 font-black text-slate-900 flex items-center gap-1.5">
                      <span>📍</span> {item.city}
                    </td>
                    <td className="py-2.5 px-4 font-bold text-purple-900">{item.depo}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-700">{item.state}</td>
                    <td className="py-2.5 px-4 font-mono text-[11px] text-slate-600">{item.delLocation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 3: MMD SKU MASTER ── */}
      {tab === "sku" && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-slate-900">
                MMD SKU Master & Item Code Catalog
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Standardizes quick-commerce trade product strings into official Milky Mist SAP Item Codes from{" "}
                <span className="font-mono text-purple-700 font-bold">MMD_SKU.xlsx</span>.
              </p>
            </div>

            <div className="relative w-full sm:w-72">
              <input
                type="text"
                placeholder="Search raw SKU or MMD code..."
                value={skuSearch}
                onChange={(e) => setSkuSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 bg-slate-50 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <span className="absolute left-2.5 top-2 text-xs text-slate-400">🔍</span>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-[11px] font-black uppercase tracking-wider text-slate-600 border-b border-slate-200">
                  <th className="py-2.5 px-4">#</th>
                  <th className="py-2.5 px-4">Trade Raw SKU Description</th>
                  <th className="py-2.5 px-4">MMD Item Code</th>
                  <th className="py-2.5 px-4">Standard Product Name</th>
                  <th className="py-2.5 px-4">Category</th>
                  <th className="py-2.5 px-4 text-right">PO Occurrences</th>
                  <th className="py-2.5 px-4 text-right">Total PO Val (₹L)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {uniqueSkus.slice(0, 150).map((s, idx) => (
                  <tr key={s.rawName} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-4 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                    <td className="py-2.5 px-4 font-semibold text-slate-900 max-w-sm truncate" title={s.rawName}>
                      {s.rawName}
                    </td>
                    <td className="py-2.5 px-4 font-mono font-bold text-purple-700">{s.mmdCode}</td>
                    <td className="py-2.5 px-4 font-bold text-slate-800">{s.mmdName}</td>
                    <td className="py-2.5 px-4">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[11px] font-semibold text-slate-700">
                        {s.category}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-slate-600">{s.count}</td>
                    <td className="py-2.5 px-4 text-right font-mono font-black text-slate-900">
                      ₹{L2(s.poVal)}L
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 4: DATA FIELD DICTIONARY ── */}
      {tab === "dictionary" && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div>
            <h3 className="text-base font-black text-slate-900">
              Data Dictionary & Pipeline Specification
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Comprehensive field descriptions, data types, normalization rules, and formulas used across all dashboards.
            </p>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-[11px] font-black uppercase tracking-wider text-slate-600 border-b border-slate-200">
                  <th className="py-2.5 px-4">Field Name</th>
                  <th className="py-2.5 px-4">Data Type</th>
                  <th className="py-2.5 px-4">Origin / Source Column</th>
                  <th className="py-2.5 px-4">Business Definition</th>
                  <th className="py-2.5 px-4">Processing & Transformation Rules</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {DICTIONARY_FIELDS.map((f) => (
                  <tr key={f.name} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-black text-slate-900">{f.name}</td>
                    <td className="py-3 px-4 font-mono text-[11px] text-purple-800 font-bold">{f.type}</td>
                    <td className="py-3 px-4 font-medium text-slate-700">{f.source}</td>
                    <td className="py-3 px-4 text-slate-800">{f.description}</td>
                    <td className="py-3 px-4 text-slate-500 text-[11px] leading-relaxed">{f.rules}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
