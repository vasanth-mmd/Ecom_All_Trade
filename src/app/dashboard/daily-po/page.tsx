"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import UploadButton from "../upload-button";
import SyncStatus from "../sync-status";
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
const ymdToUTC = (n: number) => {
  const s = String(n);
  return s.length === 8 ? Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)) : null;
};
const diffDays = (fromYmd: number, toYmd: number) => {
  const a = ymdToUTC(fromYmd),
    b = ymdToUTC(toYmd);
  if (a == null || b == null) return null;
  return Math.round((b - a) / 86400000);
};
const todayYmd = () => {
  const t = new Date();
  return t.getUTCFullYear() * 10000 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate();
};

const dateToYmd = (s: string) => (s ? +s.replaceAll("-", "") : 0);

const DATE_PRESETS = [
  { label: "Today", days: 1 },
  { label: "7 Days", days: 7 },
  { label: "14 Days", days: 14 },
  { label: "MTD", days: 0 },
  { label: "All Dates", days: -1 },
];

const URGENCY_OPTIONS = [
  { key: "expired", label: "Expired" },
  { key: "today", label: "Expires Today" },
  { key: "2d", label: "≤ 2 Days Left" },
  { key: "5d", label: "≤ 5 Days Left" },
  { key: "safe", label: "Safe (> 5 Days)" },
  { key: "nodate", label: "No Expiry Date" },
] as const;

type UrgencyKey = (typeof URGENCY_OPTIONS)[number]["key"];

function getExpiryStatus(daysLeft: number | null) {
  if (daysLeft === null)
    return { label: "No Expiry", cls: "bg-slate-100 text-slate-600 border-slate-200" };
  if (daysLeft < 0)
    return {
      label: `Expired ${Math.abs(daysLeft)}d ago`,
      cls: "bg-rose-100 text-rose-800 border-rose-200 font-bold",
    };
  if (daysLeft === 0)
    return {
      label: "Expires Today",
      cls: "bg-rose-100 text-rose-800 border-rose-300 font-bold animate-pulse",
    };
  if (daysLeft <= 2)
    return {
      label: `${daysLeft}d left`,
      cls: "bg-orange-100 text-orange-800 border-orange-200 font-bold",
    };
  if (daysLeft <= 5)
    return {
      label: `${daysLeft}d left`,
      cls: "bg-amber-100 text-amber-800 border-amber-200",
    };
  return {
    label: `${daysLeft}d left`,
    cls: "bg-emerald-100 text-emerald-800 border-emerald-200",
  };
}

function getFillRatePill(fr: number) {
  if (fr >= 98) return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (fr >= 80) return "bg-amber-100 text-amber-800 border-amber-200";
  if (fr > 0) return "bg-orange-100 text-orange-800 border-orange-200";
  return "bg-rose-100 text-rose-800 border-rose-200";
}

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

  const selectAll = () => {
    onChange(options.map((o) => o.key));
  };

  const clearAll = () => {
    onChange([]);
  };

  // Label display logic
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
        className={`w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm font-semibold text-left transition-all ${isFiltered
            ? "border-purple-500 bg-purple-50/70 text-purple-900 ring-1 ring-purple-400"
            : "border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100/80"
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
                  className="absolute right-2.5 top-1.5 text-xs text-slate-400 hover:text-slate-600 font-bold"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center justify-between px-1 text-[11px] font-bold text-slate-500 border-b border-slate-100 pb-1.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-purple-600 hover:text-purple-800 hover:underline cursor-pointer"
                >
                  Select All
                </button>
                <span>·</span>
                <button
                  type="button"
                  onClick={clearAll}
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
                      className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${isChecked
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

/* ── Popup Modal for Unfulfilled Items Breakdown ── */
interface UnfulfilledModalProps {
  data: {
    title: string;
    subtitle?: string;
    poNumber?: string;
    city?: string;
    region?: string;
    depo?: string;
    date?: string;
    poVal: number;
    grnVal: number;
    gapVal: number;
    frVal: number;
    skus: {
      name: string;
      category?: string;
      poQty: number;
      grnQty: number;
      gapQty: number;
      poVal: number;
      grnVal: number;
      gapVal: number;
      frVal: number;
      icon?: string | null;
    }[];
  };
  onClose: () => void;
  onOpenSkuLightbox: (sku: { icon: string | null; name: string; stats: any[] }) => void;
}

function UnfulfilledItemsModal({ data, onClose, onOpenSkuLightbox }: UnfulfilledModalProps) {
  const [modalSearch, setModalSearch] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filteredSkus = useMemo(() => {
    if (!modalSearch.trim()) return data.skus;
    const q = modalSearch.toLowerCase();
    return data.skus.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.category && s.category.toLowerCase().includes(q))
    );
  }, [data.skus, modalSearch]);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-950/60 transition-opacity" onClick={onClose} />
      <div className="fixed z-50 inset-0 flex items-center justify-center p-3 sm:p-6 pointer-events-none">
        <div className="pointer-events-auto bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
          {/* Modal Header */}
          <div className="p-5 sm:p-6 border-b border-slate-100 bg-gradient-to-r from-purple-50/70 via-white to-rose-50/50 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                {data.poNumber && (
                  <span className="px-2.5 py-1 rounded-lg bg-purple-100 text-purple-900 font-mono font-extrabold text-xs">
                    PO #{data.poNumber}
                  </span>
                )}
                {data.city && (
                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 font-extrabold text-xs">
                    📍 {data.city}
                  </span>
                )}
                {data.depo && (
                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 font-semibold text-xs">
                    🏢 {data.depo}
                  </span>
                )}
                {data.date && (
                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 font-semibold text-xs">
                    📅 {data.date}
                  </span>
                )}
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {data.title}
              </h2>
              {data.subtitle && (
                <p className="text-xs font-medium text-slate-500 mt-0.5">{data.subtitle}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="shrink-0 w-8 h-8 rounded-full bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 grid place-items-center font-bold transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Modal Summary KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50/80 border-b border-slate-100">
            <div className="bg-white p-3 rounded-2xl border border-slate-200">
              <div className="text-[10px] font-extrabold uppercase text-slate-400">Total PO Value</div>
              <div className="text-lg font-black text-purple-950">₹{L2(data.poVal)}L</div>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-slate-200">
              <div className="text-[10px] font-extrabold uppercase text-emerald-600">Filled GRN</div>
              <div className="text-lg font-black text-emerald-700">₹{L2(data.grnVal)}L</div>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-rose-200 bg-rose-50/30">
              <div className="text-[10px] font-extrabold uppercase text-rose-600">Remaining Gap</div>
              <div className="text-lg font-black text-rose-700">₹{L2(data.gapVal)}L</div>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-slate-200">
              <div className="text-[10px] font-extrabold uppercase text-slate-400">Fill Rate %</div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-black text-slate-900">{data.frVal.toFixed(1)}%</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${getFillRatePill(data.frVal)}`}>
                  {data.frVal >= 90 ? "Good" : data.frVal >= 75 ? "Medium" : "Critical"}
                </span>
              </div>
            </div>
          </div>

          {/* Search & Header for SKU list */}
          <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <div className="text-xs font-extrabold text-slate-700">
              Unfulfilled SKUs ({filteredSkus.length} of {data.skus.length})
            </div>
            <div className="relative w-64 max-w-full">
              <input
                type="text"
                placeholder="Search SKU name..."
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <span className="absolute left-2.5 top-1.5 text-xs text-slate-400">🔍</span>
            </div>
          </div>

          {/* SKU Items List */}
          <div className="p-4 overflow-y-auto space-y-3 flex-1">
            {filteredSkus.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <span className="text-3xl block mb-2">🎉</span>
                <p className="text-sm font-bold text-slate-600">No unfulfilled SKUs found</p>
                <p className="text-xs text-slate-400">All items in this selection are 100% fulfilled.</p>
              </div>
            ) : (
              filteredSkus.map((sku, i) => {
                const icon = sku.icon || matchSkuIcon(sku.name);
                return (
                  <div
                    key={i}
                    className="p-3.5 sm:p-4 rounded-2xl border border-slate-200 bg-white hover:border-purple-300 hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        onClick={() =>
                          onOpenSkuLightbox({
                            icon,
                            name: sku.name,
                            stats: [
                              { label: "Category", value: sku.category || "General" },
                              { label: "PO Qty", value: L(sku.poQty, 0) },
                              { label: "Filled Qty", value: L(sku.grnQty, 0) },
                              {
                                label: "Remaining Gap",
                                value: `${L(sku.gapQty, 0)} (₹${L2(sku.gapVal)}L)`,
                                cls: "text-rose-600 font-bold",
                              },
                              { label: "Fill Rate", value: `${sku.frVal.toFixed(1)}%` },
                            ],
                          })
                        }
                        className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 grid place-items-center shrink-0 overflow-hidden cursor-pointer group-hover:scale-105 transition-transform"
                      >
                        {icon ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={icon} alt="" className="max-w-full max-h-full object-contain" />
                        ) : (
                          <span className="text-xl">🥛</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div
                          onClick={() =>
                            onOpenSkuLightbox({
                              icon,
                              name: sku.name,
                              stats: [
                                { label: "Category", value: sku.category || "General" },
                                { label: "PO Qty", value: L(sku.poQty, 0) },
                                { label: "Filled Qty", value: L(sku.grnQty, 0) },
                                {
                                  label: "Remaining Gap",
                                  value: `${L(sku.gapQty, 0)} (₹${L2(sku.gapVal)}L)`,
                                  cls: "text-rose-600 font-bold",
                                },
                                { label: "Fill Rate", value: `${sku.frVal.toFixed(1)}%` },
                              ],
                            })
                          }
                          className="font-bold text-sm text-slate-900 group-hover:text-purple-700 transition cursor-pointer"
                        >
                          {sku.name}
                        </div>
                        {sku.category && (
                          <div className="text-[11px] font-semibold text-slate-400">
                            {sku.category}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="flex items-center gap-4 sm:gap-6 self-end sm:self-center shrink-0">
                      <div className="text-right">
                        <div className="text-[10px] font-bold uppercase text-slate-400">
                          Ordered / Filled
                        </div>
                        <div className="text-xs font-bold text-slate-800">
                          {L(sku.poQty, 0)} /{" "}
                          <span className="text-emerald-600">{L(sku.grnQty, 0)}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-[10px] font-bold uppercase text-rose-500">
                          Gap Qty & Val
                        </div>
                        <div className="text-xs font-extrabold text-rose-700">
                          -{L(sku.gapQty, 0)} (₹{L2(sku.gapVal)}L)
                        </div>
                      </div>

                      <div className="text-center min-w-[60px]">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold border ${getFillRatePill(
                            sku.frVal
                          )}`}
                        >
                          {sku.frVal.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Modal Footer */}
          <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
            <div className="text-xs font-semibold text-slate-500">
              Click any SKU thumbnail for product image & full metrics
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default function DailyPoTrackerPage() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");

  // Filters State - Multi-Select arrays
  const [selMonths, setSelMonths] = useState<string[]>([]);
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [selTrades, setSelTrades] = useState<string[]>([]);
  const [selRegions, setSelRegions] = useState<string[]>([]);
  const [selCities, setSelCities] = useState<string[]>([]);
  const [selCategories, setSelCategories] = useState<string[]>([]);
  const [selSkus, setSelSkus] = useState<string[]>([]);
  const [selUrgencies, setSelUrgencies] = useState<UrgencyKey[]>([]);
  const [selStatuses, setSelStatuses] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Focused single date from timeline
  const [focusedTimelineDate, setFocusedTimelineDate] = useState<string | null>(null);

  // Filter Dropdown Open Tracker
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Tabs & Views
  const [activeTab, setActiveTab] = useState<"daily-po" | "location-monitor">("daily-po");
  const [locationViewMode, setLocationViewMode] = useState<"by-po" | "by-city-summary">("by-po");
  const [timelinePanelTab, setTimelinePanelTab] = useState<"pos" | "skus">("pos");
  const [timelineSortKey, setTimelineSortKey] = useState<"date" | "poCount" | "poVal" | "grnVal" | "gapVal" | "frVal">("date");
  const [timelineSortDir, setTimelineSortDir] = useState<"asc" | "desc">("desc");

  const toggleTimelineSort = (key: "date" | "poCount" | "poVal" | "grnVal" | "gapVal" | "frVal") => {
    if (timelineSortKey === key) {
      setTimelineSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setTimelineSortKey(key);
      setTimelineSortDir("desc");
    }
  };

  // Pagination & Sorting
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [locPage, setLocPage] = useState(1);

  // Table 1 (Daily PO & SKU) In-Table Search & Sorting
  const [t1Search, setT1Search] = useState("");
  const [t1SortKey, setT1SortKey] = useState<string>("poDate");
  const [t1SortDir, setT1SortDir] = useState<"asc" | "desc">("desc");

  // Table 2 (Location Monitor) In-Table Search & Sorting
  const [t2Search, setT2Search] = useState("");
  const [t2SortKey, setT2SortKey] = useState<string>("date");
  const [t2SortDir, setT2SortDir] = useState<"asc" | "desc">("desc");

  const toggleT1Sort = (key: string) => {
    if (t1SortKey === key) {
      setT1SortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setT1SortKey(key);
      const defaultAsc = ["sku", "city", "poNum", "status"].includes(key);
      setT1SortDir(defaultAsc ? "asc" : "desc");
    }
    setPage(1);
  };

  const toggleT2Sort = (key: string) => {
    if (t2SortKey === key) {
      setT2SortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setT2SortKey(key);
      const defaultAsc = ["city", "region", "depo", "poNumber"].includes(key);
      setT2SortDir(defaultAsc ? "asc" : "desc");
    }
    setLocPage(1);
  };

  // Lightbox popup for single SKU details
  const [skuPopup, setSkuPopup] = useState<{
    icon: string | null;
    name: string;
    stats: { label: string; value: string; cls?: string }[];
  } | null>(null);

  // Rich popup for multiple unfulfilled SKUs
  const [unfulfilledPopup, setUnfulfilledPopup] = useState<any | null>(null);

  useEffect(() => {
    fetch("/api/data")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
      .then((data) => {
        setD(data);
        // Default to MTD for the latest date in data
        if (data?.meta?.date_max) {
          const max = data.meta.date_max as string;
          setFFrom(max.slice(0, 7) + "-01");
          setFTo(max);
        }
      })
      .catch((e) => setErr(String(e.message || e)));
  }, []);

  // Quick preset helper
  function applyDatePreset(days: number) {
    if (!d) return;
    setFocusedTimelineDate(null);
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

  // Reset all filters
  function resetAllFilters() {
    setSelMonths([]);
    setSelTrades([]);
    setSelRegions([]);
    setSelCities([]);
    setSelCategories([]);
    setSelSkus([]);
    setSelUrgencies([]);
    setSelStatuses([]);
    setSearchQuery("");
    setFocusedTimelineDate(null);
    if (d?.meta?.date_max) {
      const max = d.meta.date_max as string;
      setFFrom(max.slice(0, 7) + "-01");
      setFTo(max);
    } else {
      setFFrom("");
      setFTo("");
    }
  }

  // Filtered rows
  const filteredRows = useMemo(() => {
    if (!d) return [];
    const fromYmd = focusedTimelineDate
      ? dateToYmd(focusedTimelineDate)
      : dateToYmd(fFrom);
    const toYmd = focusedTimelineDate
      ? dateToYmd(focusedTimelineDate)
      : dateToYmd(fTo);
    const nowYmd = todayYmd();

    const monthSet = new Set(selMonths);
    const tradeSet = new Set(selTrades);
    const regionSet = new Set(selRegions);
    const citySet = new Set(selCities);
    const categorySet = new Set(selCategories);
    const skuSet = new Set(selSkus);
    const urgencySet = new Set(selUrgencies);
    const statusSet = new Set(selStatuses);

    return d.rows.filter((r) => {
      const rowMonth = d.dims.month[r[0]];
      const rowTrade = d.dims.trade[r[1]];
      const rowRegion = d.dims.region[r[2]];
      const rowCity = d.dims.city[r[3]];
      const rowCategory = d.dims.category[r[4]];
      const rowStatus = d.dims.status[r[5]];
      const rowSku = d.dims.sku[r[6]];
      const rowPoDate = r[11];
      const rowPoNumber = d.dims.po[r[12]] || "";
      const rowExpiryDate = r[13];

      // Multi-Select Filters
      if (monthSet.size > 0 && !monthSet.has(rowMonth)) return false;
      if (tradeSet.size > 0 && !tradeSet.has(rowTrade)) return false;
      if (regionSet.size > 0 && !regionSet.has(rowRegion)) return false;
      if (citySet.size > 0 && !citySet.has(rowCity)) return false;
      if (categorySet.size > 0 && !categorySet.has(rowCategory)) return false;
      if (skuSet.size > 0 && !skuSet.has(rowSku)) return false;
      if (statusSet.size > 0 && !statusSet.has(rowStatus)) return false;

      // Date Range filter
      if (fromYmd && rowPoDate < fromYmd) return false;
      if (toYmd && rowPoDate > toYmd) return false;

      // Expiry Urgency filter (multi-select)
      if (urgencySet.size > 0) {
        const daysLeft = rowExpiryDate > 0 ? diffDays(nowYmd, rowExpiryDate) : null;
        let matchesUrgency = false;

        if (urgencySet.has("expired") && daysLeft !== null && daysLeft < 0) matchesUrgency = true;
        if (urgencySet.has("today") && daysLeft === 0) matchesUrgency = true;
        if (urgencySet.has("2d") && daysLeft !== null && daysLeft > 0 && daysLeft <= 2)
          matchesUrgency = true;
        if (urgencySet.has("5d") && daysLeft !== null && daysLeft > 0 && daysLeft <= 5)
          matchesUrgency = true;
        if (urgencySet.has("safe") && daysLeft !== null && daysLeft > 5) matchesUrgency = true;
        if (urgencySet.has("nodate") && daysLeft === null) matchesUrgency = true;

        if (!matchesUrgency) return false;
      }

      // Free-text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          rowPoNumber.toLowerCase().includes(q) ||
          rowSku.toLowerCase().includes(q) ||
          rowCity.toLowerCase().includes(q) ||
          rowCategory.toLowerCase().includes(q) ||
          rowStatus.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [
    d,
    selMonths,
    fFrom,
    fTo,
    focusedTimelineDate,
    selTrades,
    selRegions,
    selCities,
    selCategories,
    selSkus,
    selUrgencies,
    selStatuses,
    searchQuery,
  ]);

  // Aggregated KPIs
  const kpis = useMemo(() => {
    let totalPoQty = 0;
    let totalPoVal = 0;
    let totalGrnQty = 0;
    let totalGrnVal = 0;
    const poSet = new Set<number>();
    let criticalExpiryCount = 0;
    const nowYmd = todayYmd();

    for (const r of filteredRows) {
      poSet.add(r[12]);
      totalPoQty += r[7];
      totalPoVal += r[8];
      totalGrnQty += r[9];
      totalGrnVal += r[10];

      const expiryYmd = r[13];
      if (expiryYmd > 0) {
        const days = diffDays(nowYmd, expiryYmd);
        if (days !== null && days <= 2) criticalExpiryCount++;
      }
    }

    const totalGapQty = Math.max(0, totalPoQty - totalGrnQty);
    const totalGapVal = Math.max(0, totalPoVal - totalGrnVal);
    const frQty = totalPoQty > 0 ? (totalGrnQty / totalPoQty) * 100 : 0;
    const frVal = totalPoVal > 0 ? (totalGrnVal / totalPoVal) * 100 : 0;

    return {
      poCount: poSet.size,
      rowCount: filteredRows.length,
      totalPoQty,
      totalPoVal,
      totalGrnQty,
      totalGrnVal,
      totalGapQty,
      totalGapVal,
      frQty,
      frVal,
      criticalExpiryCount,
    };
  }, [filteredRows]);

  // Sync ticker with daily-po active filtered selection
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
      activeViewTitle: selStatuses.length > 0 ? `${selStatuses.length} STATUSES ACTIVE` : "DAILY PO TRACKER",
      selectedStatuses: selStatuses,
      poVal: kpis.totalPoVal,
      poQty: kpis.totalPoQty,
      grnVal: kpis.totalGrnVal,
      grnQty: kpis.totalGrnQty,
      gapVal: kpis.totalGapVal,
      frVal: kpis.frVal,
      frQty: kpis.frQty,
      poCount: kpis.poCount,
      statusBreakdown,
      trades,
      cities,
    });
  }, [d, kpis, filteredRows, selStatuses]);

  // Day-wise Aggregation for Timeline (reflects all active dates in range)
  const dailySummary = useMemo(() => {
    if (!d) return [];
    const map = new Map<
      number,
      {
        date: number;
        poQty: number;
        poVal: number;
        grnQty: number;
        grnVal: number;
        gapQty: number;
        gapVal: number;
        poIds: Set<number>;
      }
    >();

    for (const r of filteredRows) {
      const dt = r[11];
      let item = map.get(dt);
      if (!item) {
        item = {
          date: dt,
          poQty: 0,
          poVal: 0,
          grnQty: 0,
          grnVal: 0,
          gapQty: 0,
          gapVal: 0,
          poIds: new Set(),
        };
        map.set(dt, item);
      }
      item.poQty += r[7];
      item.poVal += r[8];
      item.grnQty += r[9];
      item.grnVal += r[10];
      item.poIds.add(r[12]);
    }

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        gapQty: Math.max(0, item.poQty - item.grnQty),
        gapVal: Math.max(0, item.poVal - item.grnVal),
        frVal: item.poVal > 0 ? (item.grnVal / item.poVal) * 100 : 0,
        frQty: item.poQty > 0 ? (item.grnQty / item.poQty) * 100 : 0,
        poCount: item.poIds.size,
      }))
      .sort((a, b) => b.date - a.date);
  }, [d, filteredRows]);

  const sortedDailySummary = useMemo(() => {
    return [...dailySummary].sort((a, b) => {
      let diff = 0;
      if (timelineSortKey === "date") diff = a.date - b.date;
      else if (timelineSortKey === "poCount") diff = a.poCount - b.poCount;
      else if (timelineSortKey === "poVal") diff = a.poVal - b.poVal;
      else if (timelineSortKey === "grnVal") diff = a.grnVal - b.grnVal;
      else if (timelineSortKey === "gapVal") diff = a.gapVal - b.gapVal;
      else if (timelineSortKey === "frVal") diff = a.frVal - b.frVal;
      return timelineSortDir === "asc" ? diff : -diff;
    });
  }, [dailySummary, timelineSortKey, timelineSortDir]);

  const timelineTotals = useMemo(() => {
    let poCount = 0;
    let poQty = 0;
    let poVal = 0;
    let grnQty = 0;
    let grnVal = 0;
    let gapQty = 0;
    let gapVal = 0;

    for (const day of dailySummary) {
      poCount += day.poCount;
      poQty += day.poQty;
      poVal += day.poVal;
      grnQty += day.grnQty;
      grnVal += day.grnVal;
      gapQty += day.gapQty;
      gapVal += day.gapVal;
    }

    const frVal = poVal > 0 ? (grnVal / poVal) * 100 : 0;
    const frQty = poQty > 0 ? (grnQty / poQty) * 100 : 0;

    return { poCount, poQty, poVal, grnQty, grnVal, gapQty, gapVal, frVal, frQty };
  }, [dailySummary]);

  // PO-Wise details for focusedTimelineDate
  const activeFocusedPoList = useMemo(() => {
    if (!d || !focusedTimelineDate) return [];
    const activeYmd = dateToYmd(focusedTimelineDate);
    const nowYmd = todayYmd();

    const rowsForDate = filteredRows.filter((r) => r[11] === activeYmd);

    const poMap = new Map<
      string,
      {
        poNumber: string;
        city: string;
        region: string;
        depo: string;
        poQty: number;
        poVal: number;
        grnQty: number;
        grnVal: number;
        gapQty: number;
        gapVal: number;
        frVal: number;
        expiryDate: string;
        daysLeft: number | null;
        status: string;
        skus: {
          skuName: string;
          category: string;
          poQty: number;
          poVal: number;
          grnQty: number;
          grnVal: number;
          gapQty: number;
          gapVal: number;
          frVal: number;
        }[];
      }
    >();

    for (const r of rowsForDate) {
      const poNum = d.dims.po[r[12]] || "—";
      const city = d.dims.city[r[3]];
      const region = d.dims.region[r[2]];
      const category = d.dims.category[r[4]];
      const depoEntry = lookupDepoByCity(city);
      const depo = depoEntry?.depo || "—";
      const skuName = d.dims.sku[r[6]];
      const expiryDate = ymdToDate(r[13]);
      const daysLeft = r[13] > 0 ? diffDays(nowYmd, r[13]) : null;
      const status = d.dims.status[r[5]];

      let item = poMap.get(poNum);
      if (!item) {
        item = {
          poNumber: poNum,
          city,
          region,
          depo,
          poQty: 0,
          poVal: 0,
          grnQty: 0,
          grnVal: 0,
          gapQty: 0,
          gapVal: 0,
          frVal: 0,
          expiryDate,
          daysLeft,
          status,
          skus: [],
        };
        poMap.set(poNum, item);
      }

      item.poQty += r[7];
      item.poVal += r[8];
      item.grnQty += r[9];
      item.grnVal += r[10];

      const gapQty = Math.max(0, r[7] - r[9]);
      const gapVal = Math.max(0, r[8] - r[10]);
      const frVal = r[8] > 0 ? (r[10] / r[8]) * 100 : 0;

      item.skus.push({
        skuName,
        category,
        poQty: r[7],
        poVal: r[8],
        grnQty: r[9],
        grnVal: r[10],
        gapQty,
        gapVal,
        frVal,
      });
    }

    return Array.from(poMap.values())
      .map((p) => {
        const gapQty = Math.max(0, p.poQty - p.grnQty);
        const gapVal = Math.max(0, p.poVal - p.grnVal);
        const frVal = p.poVal > 0 ? (p.grnVal / p.poVal) * 100 : 0;
        return {
          ...p,
          gapQty,
          gapVal,
          frVal,
          gapSkus: p.skus.filter((s) => s.gapQty > 0 || s.gapVal > 0).sort((a, b) => b.gapVal - a.gapVal),
        };
      })
      .sort((a, b) => b.gapVal - a.gapVal || b.poVal - a.poVal);
  }, [d, filteredRows, focusedTimelineDate]);

  // SKU-Wise details for focusedTimelineDate
  const activeFocusedSkuList = useMemo(() => {
    if (!d || !focusedTimelineDate) return [];
    const activeYmd = dateToYmd(focusedTimelineDate);
    const rowsForDate = filteredRows.filter((r) => r[11] === activeYmd);

    const skuMap = new Map<
      string,
      {
        skuName: string;
        category: string;
        poQty: number;
        poVal: number;
        grnQty: number;
        grnVal: number;
        gapQty: number;
        gapVal: number;
        frVal: number;
        poCount: Set<string>;
      }
    >();

    for (const r of rowsForDate) {
      const skuName = d.dims.sku[r[6]];
      const category = d.dims.category[r[4]];
      const poNum = d.dims.po[r[12]] || "—";

      let item = skuMap.get(skuName);
      if (!item) {
        item = {
          skuName,
          category,
          poQty: 0,
          poVal: 0,
          grnQty: 0,
          grnVal: 0,
          gapQty: 0,
          gapVal: 0,
          frVal: 0,
          poCount: new Set(),
        };
        skuMap.set(skuName, item);
      }

      item.poQty += r[7];
      item.poVal += r[8];
      item.grnQty += r[9];
      item.grnVal += r[10];
      item.poCount.add(poNum);
    }

    return Array.from(skuMap.values())
      .map((s) => {
        const gapQty = Math.max(0, s.poQty - s.grnQty);
        const gapVal = Math.max(0, s.poVal - s.grnVal);
        const frVal = s.poVal > 0 ? (s.grnVal / s.poVal) * 100 : 0;
        return {
          ...s,
          gapQty,
          gapVal,
          frVal,
          numPos: s.poCount.size,
        };
      })
      .sort((a, b) => b.gapVal - a.gapVal);
  }, [d, filteredRows, focusedTimelineDate]);

  // Location Monitor: Grouped by Date + City + PO
  const locationMonitorData = useMemo(() => {
    if (!d) return [];
    const map = new Map<
      string,
      {
        date: number;
        city: string;
        region: string;
        depo: string;
        poNumber: string;
        poQty: number;
        poVal: number;
        grnQty: number;
        grnVal: number;
        gapQty: number;
        gapVal: number;
        skus: {
          name: string;
          category?: string;
          poQty: number;
          grnQty: number;
          gapQty: number;
          poVal: number;
          grnVal: number;
          gapVal: number;
          frVal: number;
        }[];
      }
    >();

    for (const r of filteredRows) {
      const dt = r[11];
      const city = d.dims.city[r[3]];
      const region = d.dims.region[r[2]];
      const category = d.dims.category[r[4]];
      const depoEntry = lookupDepoByCity(city);
      const depo = depoEntry?.depo || "—";
      const poNum = d.dims.po[r[12]] || "—";
      const skuName = d.dims.sku[r[6]];

      const key = `${dt}_${city}_${poNum}`;
      let entry = map.get(key);
      if (!entry) {
        entry = {
          date: dt,
          city,
          region,
          depo,
          poNumber: poNum,
          poQty: 0,
          poVal: 0,
          grnQty: 0,
          grnVal: 0,
          gapQty: 0,
          gapVal: 0,
          skus: [],
        };
        map.set(key, entry);
      }

      entry.poQty += r[7];
      entry.poVal += r[8];
      entry.grnQty += r[9];
      entry.grnVal += r[10];

      const skuGapQty = Math.max(0, r[7] - r[9]);
      const skuGapVal = Math.max(0, r[8] - r[10]);
      const skuFr = r[8] > 0 ? (r[10] / r[8]) * 100 : 0;

      if (skuGapQty > 0 || skuGapVal > 0) {
        entry.skus.push({
          name: skuName,
          category,
          poQty: r[7],
          grnQty: r[9],
          gapQty: skuGapQty,
          poVal: r[8],
          grnVal: r[10],
          gapVal: skuGapVal,
          frVal: skuFr,
        });
      }
    }

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        gapQty: Math.max(0, item.poQty - item.grnQty),
        gapVal: Math.max(0, item.poVal - item.grnVal),
        frVal: item.poVal > 0 ? (item.grnVal / item.poVal) * 100 : 0,
        frQty: item.poQty > 0 ? (item.grnQty / item.poQty) * 100 : 0,
        skus: item.skus.sort((a, b) => b.gapVal - a.gapVal),
      }))
      .sort((a, b) => b.date - a.date || b.gapVal - a.gapVal);
  }, [d, filteredRows]);

  // Location Aggregated City Daily Summary
  const cityDailySummary = useMemo(() => {
    if (!d) return [];
    const map = new Map<
      string,
      {
        date: number;
        city: string;
        region: string;
        depo: string;
        poCount: Set<string>;
        poQty: number;
        poVal: number;
        grnQty: number;
        grnVal: number;
        gapQty: number;
        gapVal: number;
        skusMap: Map<
          string,
          {
            name: string;
            category: string;
            poQty: number;
            grnQty: number;
            gapQty: number;
            poVal: number;
            grnVal: number;
            gapVal: number;
          }
        >;
      }
    >();

    for (const r of filteredRows) {
      const dt = r[11];
      const city = d.dims.city[r[3]];
      const region = d.dims.region[r[2]];
      const category = d.dims.category[r[4]];
      const depoEntry = lookupDepoByCity(city);
      const depo = depoEntry?.depo || "—";
      const poNum = d.dims.po[r[12]] || "—";
      const skuName = d.dims.sku[r[6]];

      const key = `${dt}_${city}`;
      let entry = map.get(key);
      if (!entry) {
        entry = {
          date: dt,
          city,
          region,
          depo,
          poCount: new Set(),
          poQty: 0,
          poVal: 0,
          grnQty: 0,
          grnVal: 0,
          gapQty: 0,
          gapVal: 0,
          skusMap: new Map(),
        };
        map.set(key, entry);
      }

      entry.poCount.add(poNum);
      entry.poQty += r[7];
      entry.poVal += r[8];
      entry.grnQty += r[9];
      entry.grnVal += r[10];

      const gapVal = Math.max(0, r[8] - r[10]);
      const gapQty = Math.max(0, r[7] - r[9]);
      if (gapVal > 0 || gapQty > 0) {
        const existing = entry.skusMap.get(skuName);
        if (!existing) {
          entry.skusMap.set(skuName, {
            name: skuName,
            category,
            poQty: r[7],
            grnQty: r[9],
            gapQty,
            poVal: r[8],
            grnVal: r[10],
            gapVal,
          });
        } else {
          existing.poQty += r[7];
          existing.grnQty += r[9];
          existing.gapQty += gapQty;
          existing.poVal += r[8];
          existing.grnVal += r[10];
          existing.gapVal += gapVal;
        }
      }
    }

    return Array.from(map.values())
      .map((item) => {
        const skusList = Array.from(item.skusMap.values())
          .map((s) => ({
            ...s,
            frVal: s.poVal > 0 ? (s.grnVal / s.poVal) * 100 : 0,
          }))
          .sort((a, b) => b.gapVal - a.gapVal);

        const topSkusSorted = skusList
          .slice(0, 3)
          .map((s) => `${s.name} (₹${L2(s.gapVal)}L)`);

        return {
          date: item.date,
          city: item.city,
          region: item.region,
          depo: item.depo,
          posCount: item.poCount.size,
          poQty: item.poQty,
          poVal: item.poVal,
          grnQty: item.grnQty,
          grnVal: item.grnVal,
          gapQty: Math.max(0, item.poQty - item.grnQty),
          gapVal: Math.max(0, item.poVal - item.grnVal),
          frVal: item.poVal > 0 ? (item.grnVal / item.poVal) * 100 : 0,
          frQty: item.poQty > 0 ? (item.grnQty / item.poQty) * 100 : 0,
          topGapSkusText: topSkusSorted.join(", ") || "None",
          skusList,
        };
      })
      .sort((a, b) => b.date - a.date || b.gapVal - a.gapVal);
  }, [d, filteredRows]);

  // Export to CSV
  function downloadCsv(mode: "daily-po" | "location-monitor") {
    if (!d) return;
    let headers: string[] = [];
    let csvRows: string[][] = [];
    const nowYmd = todayYmd();

    if (mode === "daily-po") {
      headers = [
        "PO Date",
        "PO Number",
        "Expiry Date",
        "Days Left",
        "Trade",
        "Region",
        "City",
        "Depo",
        "Category",
        "SKU Name",
        "PO Qty",
        "PO Value (Lakhs)",
        "Filled GRN Qty",
        "Filled GRN Value (Lakhs)",
        "Gap Qty",
        "Gap Value (Lakhs)",
        "Fill Rate %",
        "Status",
      ];
      csvRows = filteredRows.map((r) => {
        const daysLeft = r[13] > 0 ? diffDays(nowYmd, r[13]) : null;
        const depo = lookupDepoByCity(d.dims.city[r[3]])?.depo || "—";
        const gapQty = Math.max(0, r[7] - r[9]);
        const gapVal = Math.max(0, r[8] - r[10]);
        const frVal = r[8] > 0 ? ((r[10] / r[8]) * 100).toFixed(1) : "0";

        return [
          ymdToDate(r[11]),
          `"${d.dims.po[r[12]] || ""}"`,
          ymdToDate(r[13]),
          daysLeft !== null ? String(daysLeft) : "No Expiry",
          `"${d.dims.trade[r[1]]}"`,
          `"${d.dims.region[r[2]]}"`,
          `"${d.dims.city[r[3]]}"`,
          `"${depo}"`,
          `"${d.dims.category[r[4]]}"`,
          `"${d.dims.sku[r[6]]}"`,
          String(r[7]),
          r[8].toFixed(4),
          String(r[9]),
          r[10].toFixed(4),
          String(gapQty),
          gapVal.toFixed(4),
          frVal + "%",
          `"${d.dims.status[r[5]]}"`,
        ];
      });
    } else {
      headers = [
        "Date",
        "City / Location",
        "Region",
        "Depo",
        "PO Number",
        "PO Qty",
        "PO Value (Lakhs)",
        "Filled Qty",
        "Filled Value (Lakhs)",
        "Remaining Gap Qty",
        "Remaining Gap Value (Lakhs)",
        "Fill Rate %",
        "Top Gap SKUs",
      ];
      csvRows = locationMonitorData.map((item) => [
        ymdToDate(item.date),
        `"${item.city}"`,
        `"${item.region}"`,
        `"${item.depo}"`,
        `"${item.poNumber}"`,
        String(item.poQty),
        item.poVal.toFixed(4),
        String(item.grnQty),
        item.grnVal.toFixed(4),
        String(item.gapQty),
        item.gapVal.toFixed(4),
        item.frVal.toFixed(1) + "%",
        `"${item.skus.map((s) => `${s.name} (${s.gapQty} qty)`).join("; ")}"`,
      ]);
    }

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...csvRows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `daily-po-gap-report-${mode}-${fFrom || "start"}-to-${fTo || "end"}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Table 1 processed rows (In-Table Search + Column Sorting)
  const processedT1Rows = useMemo(() => {
    if (!d) return [];
    let rows = [...filteredRows];
    const nowYmd = todayYmd();

    // In-table search for Table 1
    if (t1Search.trim()) {
      const q = t1Search.toLowerCase().trim();
      rows = rows.filter((r) => {
        const poDate = ymdToDate(r[11]).toLowerCase();
        const poNum = (d.dims.po[r[12]] || "").toLowerCase();
        const expiryDate = ymdToDate(r[13]).toLowerCase();
        const daysLeft = r[13] > 0 ? diffDays(nowYmd, r[13]) : null;
        const expiryStatus = getExpiryStatus(daysLeft).label.toLowerCase();
        const skuName = (d.dims.sku[r[6]] || "").toLowerCase();
        const city = (d.dims.city[r[3]] || "").toLowerCase();
        const depo = (lookupDepoByCity(d.dims.city[r[3]])?.depo || "").toLowerCase();
        const category = (d.dims.category[r[4]] || "").toLowerCase();
        const status = (d.dims.status[r[5]] || "").toLowerCase();
        const trade = (d.dims.trade[r[1]] || "").toLowerCase();
        const region = (d.dims.region[r[2]] || "").toLowerCase();

        return (
          poDate.includes(q) ||
          poNum.includes(q) ||
          expiryDate.includes(q) ||
          expiryStatus.includes(q) ||
          skuName.includes(q) ||
          city.includes(q) ||
          depo.includes(q) ||
          category.includes(q) ||
          status.includes(q) ||
          trade.includes(q) ||
          region.includes(q)
        );
      });
    }

    // Sort Table 1
    if (t1SortKey) {
      rows.sort((a, b) => {
        let valA: any;
        let valB: any;

        switch (t1SortKey) {
          case "poDate":
            valA = a[11];
            valB = b[11];
            break;
          case "poNum":
            valA = d.dims.po[a[12]] || "";
            valB = d.dims.po[b[12]] || "";
            break;
          case "expiryDate":
            valA = a[13] || 0;
            valB = b[13] || 0;
            break;
          case "daysLeft": {
            const dlA = a[13] > 0 ? diffDays(nowYmd, a[13]) : null;
            const dlB = b[13] > 0 ? diffDays(nowYmd, b[13]) : null;
            valA = dlA !== null ? dlA : 99999;
            valB = dlB !== null ? dlB : 99999;
            break;
          }
          case "sku":
            valA = d.dims.sku[a[6]] || "";
            valB = d.dims.sku[b[6]] || "";
            break;
          case "city":
            valA = d.dims.city[a[3]] || "";
            valB = d.dims.city[b[3]] || "";
            break;
          case "poQty":
            valA = a[7];
            valB = b[7];
            break;
          case "poVal":
            valA = a[8];
            valB = b[8];
            break;
          case "grnQty":
            valA = a[9];
            valB = b[9];
            break;
          case "grnVal":
            valA = a[10];
            valB = b[10];
            break;
          case "gapQty":
            valA = Math.max(0, a[7] - a[9]);
            valB = Math.max(0, b[7] - b[9]);
            break;
          case "gapVal":
            valA = Math.max(0, a[8] - a[10]);
            valB = Math.max(0, b[8] - b[10]);
            break;
          case "frVal":
            valA = a[8] > 0 ? (a[10] / a[8]) * 100 : 0;
            valB = b[8] > 0 ? (b[10] / b[8]) * 100 : 0;
            break;
          case "status":
            valA = d.dims.status[a[5]] || "";
            valB = d.dims.status[b[5]] || "";
            break;
          default:
            return 0;
        }

        if (typeof valA === "string" && typeof valB === "string") {
          const comp = valA.localeCompare(valB);
          return t1SortDir === "asc" ? comp : -comp;
        }
        const numComp = (valA ?? 0) - (valB ?? 0);
        return t1SortDir === "asc" ? numComp : -numComp;
      });
    }

    return rows;
  }, [d, filteredRows, t1Search, t1SortKey, t1SortDir]);

  // Table 2 (By-PO Mode) processed (In-Table Search + Sorting)
  const processedLocByPo = useMemo(() => {
    let list = [...locationMonitorData];
    if (t2Search.trim()) {
      const q = t2Search.toLowerCase().trim();
      list = list.filter(
        (item) =>
          ymdToDate(item.date).toLowerCase().includes(q) ||
          item.city.toLowerCase().includes(q) ||
          item.region.toLowerCase().includes(q) ||
          item.depo.toLowerCase().includes(q) ||
          item.poNumber.toLowerCase().includes(q) ||
          item.skus.some((s) => s.name.toLowerCase().includes(q) || (s.category && s.category.toLowerCase().includes(q)))
      );
    }
    if (t2SortKey) {
      list.sort((a: any, b: any) => {
        let valA = a[t2SortKey];
        let valB = b[t2SortKey];
        if (t2SortKey === "skus") {
          valA = a.skus.length;
          valB = b.skus.length;
        }
        if (typeof valA === "string" && typeof valB === "string") {
          const comp = valA.localeCompare(valB);
          return t2SortDir === "asc" ? comp : -comp;
        }
        const numComp = (valA ?? 0) - (valB ?? 0);
        return t2SortDir === "asc" ? numComp : -numComp;
      });
    }
    return list;
  }, [locationMonitorData, t2Search, t2SortKey, t2SortDir]);

  // Table 2 (By-City Summary Mode) processed (In-Table Search + Sorting)
  const processedLocByCity = useMemo(() => {
    let list = [...cityDailySummary];
    if (t2Search.trim()) {
      const q = t2Search.toLowerCase().trim();
      list = list.filter(
        (item) =>
          ymdToDate(item.date).toLowerCase().includes(q) ||
          item.city.toLowerCase().includes(q) ||
          item.region.toLowerCase().includes(q) ||
          item.depo.toLowerCase().includes(q) ||
          item.topGapSkusText.toLowerCase().includes(q) ||
          item.skusList.some((s: any) => s.name.toLowerCase().includes(q))
      );
    }
    if (t2SortKey) {
      list.sort((a: any, b: any) => {
        let valA = a[t2SortKey];
        let valB = b[t2SortKey];
        if (t2SortKey === "skus") {
          valA = a.skusList?.length || 0;
          valB = b.skusList?.length || 0;
        }
        if (typeof valA === "string" && typeof valB === "string") {
          const comp = valA.localeCompare(valB);
          return t2SortDir === "asc" ? comp : -comp;
        }
        const numComp = (valA ?? 0) - (valB ?? 0);
        return t2SortDir === "asc" ? numComp : -numComp;
      });
    }
    return list;
  }, [cityDailySummary, t2Search, t2SortKey, t2SortDir]);

  // Paginated Rows for Table 1
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return processedT1Rows.slice(start, start + pageSize);
  }, [processedT1Rows, page, pageSize]);

  // Paginated Rows for Table 2
  const paginatedLocRows = useMemo(() => {
    const start = (locPage - 1) * pageSize;
    return locationViewMode === "by-po"
      ? processedLocByPo.slice(start, start + pageSize)
      : processedLocByCity.slice(start, start + pageSize);
  }, [processedLocByPo, processedLocByCity, locationViewMode, locPage, pageSize]);

  if (err) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700">
          Failed to load dataset: {err}
        </div>
      </div>
    );
  }

  if (!d) {
    return (
      <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
        <span className="font-semibold text-sm">Loading Daily PO & Gap Intelligence...</span>
      </div>
    );
  }

  const nowYmd = todayYmd();

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-6">
      {/* ── Top Header Bar ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-sm">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-50 border border-purple-200 text-purple-700 text-xs font-bold uppercase tracking-wider mb-2">
            <span className="h-2 w-2 rounded-full bg-purple-600 animate-ping" />
            Daily PO & Location Gap Tracker
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Daily PO Fulfilment & Gap Monitor
          </h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Track daily raised POs, expiry deadlines, filled vs remaining gap by SKU and city location.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <SyncStatus />
          <UploadButton variant="light" />
          <button
            onClick={() => downloadCsv(activeTab)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-sm shadow-md shadow-purple-900/10 active:scale-95 transition-all cursor-pointer"
          >
            <span>📥</span>
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* ── Filters & Slicers Bar (All Multi-Select Checkboxes) ── */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-extrabold text-slate-900">Multi-Select Filters</span>
            {(selMonths.length > 0 ||
              selCities.length > 0 ||
              selCategories.length > 0 ||
              selSkus.length > 0 ||
              selTrades.length > 0 ||
              selRegions.length > 0 ||
              selUrgencies.length > 0 ||
              selStatuses.length > 0 ||
              searchQuery ||
              focusedTimelineDate) && (
                <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 text-xs font-bold">
                  Filtered Active
                </span>
              )}
          </div>

          <button
            onClick={resetAllFilters}
            className="px-3 py-1 rounded-lg border border-rose-200 bg-rose-50/60 hover:bg-rose-100 text-rose-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
          >
            <span>✕</span>
            <span>Reset All Filters</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Month Slicer (Multi-Select) */}
          <MultiSelectDropdown
            label="Month"
            options={d.dims.month.map((m) => ({ key: m, label: m }))}
            selected={selMonths}
            onChange={(s) => setSelMonths(s)}
            open={openDropdown === "month"}
            onToggle={() => setOpenDropdown(openDropdown === "month" ? null : "month")}
            onClose={() => setOpenDropdown(null)}
          />

          {/* Date Range Inputs */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              From Date
            </label>
            <input
              type="date"
              value={fFrom}
              onChange={(e) => {
                setFFrom(e.target.value);
                setFocusedTimelineDate(null);
              }}
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              To Date
            </label>
            <input
              type="date"
              value={fTo}
              onChange={(e) => {
                setFTo(e.target.value);
                setFocusedTimelineDate(null);
              }}
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Location / City (Multi-Select) */}
          <MultiSelectDropdown
            label="Location / City"
            options={d.dims.city.map((c) => ({ key: c, label: c }))}
            selected={selCities}
            onChange={(s) => setSelCities(s)}
            open={openDropdown === "city"}
            onToggle={() => setOpenDropdown(openDropdown === "city" ? null : "city")}
            onClose={() => setOpenDropdown(null)}
          />

          {/* Category (Multi-Select) */}
          <MultiSelectDropdown
            label="Category"
            options={d.dims.category.map((cat) => ({ key: cat, label: cat }))}
            selected={selCategories}
            onChange={(s) => setSelCategories(s)}
            open={openDropdown === "category"}
            onToggle={() => setOpenDropdown(openDropdown === "category" ? null : "category")}
            onClose={() => setOpenDropdown(null)}
          />

          {/* Expiry Urgency (Multi-Select) */}
          <MultiSelectDropdown
            label="Expiry Deadline"
            options={URGENCY_OPTIONS.map((u) => ({ key: u.key, label: u.label }))}
            selected={selUrgencies}
            onChange={(s) => setSelUrgencies(s as UrgencyKey[])}
            open={openDropdown === "urgency"}
            onToggle={() => setOpenDropdown(openDropdown === "urgency" ? null : "urgency")}
            onClose={() => setOpenDropdown(null)}
          />
        </div>

        {/* Secondary filters row (Trade, Region, Status, SKU) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          <MultiSelectDropdown
            label="Trade / Channel"
            options={d.dims.trade.map((t) => ({ key: t, label: t }))}
            selected={selTrades}
            onChange={(s) => setSelTrades(s)}
            open={openDropdown === "trade"}
            onToggle={() => setOpenDropdown(openDropdown === "trade" ? null : "trade")}
            onClose={() => setOpenDropdown(null)}
          />

          <MultiSelectDropdown
            label="Region"
            options={d.dims.region.map((r) => ({ key: r, label: r }))}
            selected={selRegions}
            onChange={(s) => setSelRegions(s)}
            open={openDropdown === "region"}
            onToggle={() => setOpenDropdown(openDropdown === "region" ? null : "region")}
            onClose={() => setOpenDropdown(null)}
          />

          <MultiSelectDropdown
            label="PO Status"
            options={d.dims.status.map((st) => ({ key: st, label: st }))}
            selected={selStatuses}
            onChange={(s) => setSelStatuses(s)}
            open={openDropdown === "status"}
            onToggle={() => setOpenDropdown(openDropdown === "status" ? null : "status")}
            onClose={() => setOpenDropdown(null)}
          />

          <MultiSelectDropdown
            label="SKU / Product"
            options={d.dims.sku.map((sku) => ({ key: sku, label: sku }))}
            selected={selSkus}
            onChange={(s) => setSelSkus(s)}
            open={openDropdown === "sku"}
            onToggle={() => setOpenDropdown(openDropdown === "sku" ? null : "sku")}
            onClose={() => setOpenDropdown(null)}
          />
        </div>

        {/* Quick Date Presets & Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Presets:</span>
            {DATE_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => applyDatePreset(p.days)}
                className="px-3 py-1 text-xs font-bold rounded-lg border border-slate-200 bg-white hover:bg-purple-50 hover:border-purple-300 hover:text-purple-700 transition cursor-pointer"
              >
                {p.label}
              </button>
            ))}
            {focusedTimelineDate && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-100 text-purple-900 text-xs font-bold">
                <span>Focus Day: {focusedTimelineDate}</span>
                <button
                  onClick={() => setFocusedTimelineDate(null)}
                  className="hover:text-purple-600 ml-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          <div className="relative min-w-[260px]">
            <input
              type="text"
              placeholder="Search PO number, SKU, city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <span className="absolute left-3 top-2.5 text-slate-400 text-sm">🔍</span>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── KPI Summary Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Total POs */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
            Total POs Raised
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-black text-slate-900">
            {L(kpis.poCount, 0)}
          </div>
          <div className="mt-1 text-xs font-semibold text-purple-600">
            {L(kpis.rowCount, 0)} line items
          </div>
        </div>

        {/* PO Ordered Value */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
            Total PO Value
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-black text-purple-950">
            ₹{L2(kpis.totalPoVal)}L
          </div>
          <div className="mt-1 text-xs font-semibold text-slate-500">
            {L(kpis.totalPoQty, 0)} Qty ordered
          </div>
        </div>

        {/* Filled GRN Value */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-600">
            Total Filled (GRN)
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-black text-emerald-700">
            ₹{L2(kpis.totalGrnVal)}L
          </div>
          <div className="mt-1 text-xs font-semibold text-emerald-600">
            {L(kpis.totalGrnQty, 0)} Qty filled
          </div>
        </div>

        {/* Remaining Gap Value */}
        <div className="bg-white p-5 rounded-2xl border border-rose-200 bg-rose-50/20 shadow-sm">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-rose-600">
            Remaining Gap
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-black text-rose-700">
            ₹{L2(kpis.totalGapVal)}L
          </div>
          <div className="mt-1 text-xs font-semibold text-rose-600">
            {L(kpis.totalGapQty, 0)} Qty unfulfilled
          </div>
        </div>

        {/* Value Fill Rate % */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
            Fill Rate (Value)
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-black text-slate-900">
            {kpis.frVal.toFixed(1)}%
          </div>
          <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${kpis.frVal >= 90
                  ? "bg-emerald-500"
                  : kpis.frVal >= 75
                    ? "bg-amber-500"
                    : "bg-rose-500"
                }`}
              style={{ width: `${Math.min(100, Math.max(0, kpis.frVal))}%` }}
            />
          </div>
        </div>

        {/* Expiry Risk Alert */}
        <div className="bg-white p-5 rounded-2xl border border-orange-200 bg-orange-50/20 shadow-sm">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-orange-700">
            Expiry Alert (≤2d)
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-black text-orange-800">
            {kpis.criticalExpiryCount}
          </div>
          <div className="mt-1 text-xs font-bold text-orange-600">Requires urgent dispatch</div>
        </div>
      </div>

      {/* ── Daily Fulfilment Trend Timeline ── */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
        {/* Header Toolbar */}
        <div className="flex items-center justify-between flex-wrap gap-3 pb-2 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-extrabold text-slate-900">📅 Daily PO Activity & Gap Summary Table</h2>
              <span className="text-xs font-bold text-purple-700 bg-purple-50 px-3 py-1 rounded-full border border-purple-200">
                {dailySummary.length} Active Days
              </span>
            </div>
            <p className="text-xs font-medium text-slate-500 mt-0.5">
              Day-by-day comparison of raised POs vs fulfilled vs gap for the selected date range. Click any row to inspect POs & SKU breakdown.
            </p>
          </div>

          {focusedTimelineDate && (
            <button
              onClick={() => setFocusedTimelineDate(null)}
              className="text-xs font-bold text-purple-700 bg-purple-100 hover:bg-purple-200 px-3.5 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1"
            >
              <span>✕</span>
              <span>Clear Day Focus ({focusedTimelineDate})</span>
            </button>
          )}
        </div>

        {dailySummary.length === 0 ? (
          <div className="py-8 text-center text-slate-400 font-medium text-sm">
            No PO activity recorded for the selected date range and filter criteria.
          </div>
        ) : (
          /* ── FULL TABLE VIEW (No inner scrollbar / full range displayed) ── */
          <div className="space-y-4">
            <div className="overflow-x-auto border border-slate-200 rounded-2xl bg-white shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/95 text-slate-700 uppercase font-black tracking-wider border-b border-slate-200">
                  <tr>
                    <th
                      onClick={() => toggleTimelineSort("date")}
                      className="p-3 cursor-pointer hover:bg-slate-200/70 transition-colors select-none"
                    >
                      <div className="flex items-center gap-1">
                        <span>Date / Day</span>
                        <span className="text-[10px] text-purple-700">
                          {timelineSortKey === "date" ? (timelineSortDir === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </div>
                    </th>
                    <th
                      onClick={() => toggleTimelineSort("poCount")}
                      className="p-3 text-center cursor-pointer hover:bg-slate-200/70 transition-colors select-none"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>POs Raised</span>
                        <span className="text-[10px] text-purple-700">
                          {timelineSortKey === "poCount" ? (timelineSortDir === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </div>
                    </th>
                    <th
                      onClick={() => toggleTimelineSort("poVal")}
                      className="p-3 text-right cursor-pointer hover:bg-slate-200/70 transition-colors select-none"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>PO Value (₹L)</span>
                        <span className="text-[10px] text-purple-700">
                          {timelineSortKey === "poVal" ? (timelineSortDir === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </div>
                    </th>
                    <th
                      onClick={() => toggleTimelineSort("grnVal")}
                      className="p-3 text-right cursor-pointer hover:bg-slate-200/70 transition-colors select-none"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Fulfilled GRN (₹L)</span>
                        <span className="text-[10px] text-purple-700">
                          {timelineSortKey === "grnVal" ? (timelineSortDir === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </div>
                    </th>
                    <th
                      onClick={() => toggleTimelineSort("gapVal")}
                      className="p-3 text-right cursor-pointer hover:bg-slate-200/70 transition-colors select-none"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Remaining Gap (₹L)</span>
                        <span className="text-[10px] text-purple-700">
                          {timelineSortKey === "gapVal" ? (timelineSortDir === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </div>
                    </th>
                    <th
                      onClick={() => toggleTimelineSort("frVal")}
                      className="p-3 text-center cursor-pointer hover:bg-slate-200/70 transition-colors select-none min-w-[140px]"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Fill Rate (Value)</span>
                        <span className="text-[10px] text-purple-700">
                          {timelineSortKey === "frVal" ? (timelineSortDir === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </div>
                    </th>
                    <th className="p-3 text-center">Action / Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {sortedDailySummary.map((day) => {
                    const dateStr = ymdToDate(day.date);
                    const isSelected = focusedTimelineDate === dateStr;
                    const isCritical = day.frVal < 75;

                    let weekday = "";
                    const utcMs = ymdToUTC(day.date);
                    if (utcMs) {
                      weekday = new Date(utcMs).toLocaleDateString("en-US", { weekday: "short" });
                    }

                    return (
                      <tr
                        key={day.date}
                        onClick={() => {
                          if (focusedTimelineDate === dateStr) {
                            setFocusedTimelineDate(null);
                          } else {
                            setFocusedTimelineDate(dateStr);
                          }
                        }}
                        className={`transition-colors cursor-pointer select-none ${
                          isSelected
                            ? "bg-purple-100/70 font-bold border-l-4 border-l-purple-600"
                            : "hover:bg-purple-50/40"
                        }`}
                      >
                        {/* Date */}
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-slate-900 font-mono text-sm">
                              {dateStr}
                            </span>
                            {weekday && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                                {weekday}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* POs Raised */}
                        <td className="p-3 text-center">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-extrabold bg-purple-50 text-purple-800 border border-purple-200">
                            {day.poCount} POs
                          </span>
                        </td>

                        {/* PO Value & Qty */}
                        <td className="p-3 text-right">
                          <div className="font-black text-slate-900 text-sm">
                            ₹{L2(day.poVal)}L
                          </div>
                          <div className="text-[11px] text-slate-400 font-semibold">
                            {L(day.poQty, 0)} Qty
                          </div>
                        </td>

                        {/* GRN Value & Qty */}
                        <td className="p-3 text-right">
                          <div className="font-black text-emerald-700 text-sm">
                            ₹{L2(day.grnVal)}L
                          </div>
                          <div className="text-[11px] text-emerald-600/80 font-semibold">
                            {L(day.grnQty, 0)} Qty
                          </div>
                        </td>

                        {/* Gap Value & Qty */}
                        <td className="p-3 text-right">
                          <div
                            className={`font-black text-sm ${
                              isCritical ? "text-rose-600" : day.gapVal > 0 ? "text-rose-500" : "text-slate-400"
                            }`}
                          >
                            ₹{L2(day.gapVal)}L
                          </div>
                          <div className="text-[11px] text-slate-400 font-semibold">
                            {day.gapQty > 0 ? `${L(day.gapQty, 0)} Qty` : "—"}
                          </div>
                        </td>

                        {/* Fill Rate Progress & Pill */}
                        <td className="p-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span
                              className={`px-2 py-0.5 rounded-md font-black text-xs ${getFillRatePill(
                                day.frVal
                              )}`}
                            >
                              {day.frVal.toFixed(1)}%
                            </span>
                            <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  day.frVal >= 90
                                    ? "bg-emerald-500"
                                    : day.frVal >= 75
                                    ? "bg-amber-500"
                                    : "bg-rose-500"
                                }`}
                                style={{ width: `${Math.min(100, Math.max(0, day.frVal))}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Action Button */}
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (focusedTimelineDate === dateStr) {
                                setFocusedTimelineDate(null);
                              } else {
                                setFocusedTimelineDate(dateStr);
                              }
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer ${
                              isSelected
                                ? "bg-purple-700 text-white shadow-xs"
                                : "bg-white border border-purple-200 text-purple-700 hover:bg-purple-50"
                            }`}
                          >
                            {isSelected ? "Selected ✓" : "Inspect ➔"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50 font-bold border-t-2 border-slate-300 text-xs">
                  <tr>
                    <td className="p-3 text-slate-900 font-black">
                      Total ({dailySummary.length} Days)
                    </td>
                    <td className="p-3 text-center font-black text-purple-900">
                      {timelineTotals.poCount} POs
                    </td>
                    <td className="p-3 text-right">
                      <div className="font-black text-slate-900">
                        ₹{L2(timelineTotals.poVal)}L
                      </div>
                      <div className="text-[10px] text-slate-500 font-semibold">
                        {L(timelineTotals.poQty, 0)} Qty
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <div className="font-black text-emerald-700">
                        ₹{L2(timelineTotals.grnVal)}L
                      </div>
                      <div className="text-[10px] text-emerald-600/80 font-semibold">
                        {L(timelineTotals.grnQty, 0)} Qty
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <div className="font-black text-rose-600">
                        ₹{L2(timelineTotals.gapVal)}L
                      </div>
                      <div className="text-[10px] text-slate-500 font-semibold">
                        {L(timelineTotals.gapQty, 0)} Qty
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`px-2.5 py-0.5 rounded-md font-black text-xs ${getFillRatePill(
                          timelineTotals.frVal
                        )}`}
                      >
                        {timelineTotals.frVal.toFixed(1)}%
                      </span>
                    </td>
                    <td className="p-3 text-center text-slate-400 font-medium text-[11px]">
                      —
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* If a date is selected, show the focused details breakdown */}
            {focusedTimelineDate && (
              <div className="bg-slate-50/90 rounded-2xl border-2 border-purple-300 p-4 space-y-3 shadow-sm animate-in fade-in duration-200">
                <div className="flex items-center justify-between flex-wrap gap-2 pb-2.5 border-b border-slate-200">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-sm text-slate-900">
                        📅 Focused Date Breakdown: {focusedTimelineDate}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-purple-600 text-white text-xs font-extrabold">
                        {activeFocusedPoList.length} POs
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200">
                        {activeFocusedPoList.filter((p) => p.grnVal > 0 || p.grnQty > 0).length} GRNs Received
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-500 mt-0.5">
                      PO-wise details, GRN fulfillment & SKU gap breakdown for {focusedTimelineDate}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200 text-xs font-bold shadow-2xs">
                      <button
                        onClick={() => setTimelinePanelTab("pos")}
                        className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                          timelinePanelTab === "pos"
                            ? "bg-purple-700 text-white font-extrabold shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        📋 PO View ({activeFocusedPoList.length})
                      </button>
                      <button
                        onClick={() => setTimelinePanelTab("skus")}
                        className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                          timelinePanelTab === "skus"
                            ? "bg-purple-700 text-white font-extrabold shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        🥛 SKU View ({activeFocusedSkuList.length})
                      </button>
                    </div>

                    <button
                      onClick={() => setFocusedTimelineDate(null)}
                      className="text-xs font-bold text-slate-500 hover:text-slate-800 bg-white border border-slate-200 px-3 py-1.5 rounded-xl cursor-pointer"
                    >
                      Close Breakdown ✕
                    </button>
                  </div>
                </div>

                {/* Panel Content for Focused Date */}
                {timelinePanelTab === "pos" ? (
                  /* PO View Table */
                  <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100/90 text-slate-700 uppercase font-extrabold tracking-wider sticky top-0 z-10 border-b border-slate-200">
                        <tr>
                          <th className="p-2.5">PO Number</th>
                          <th className="p-2.5">Location / City</th>
                          <th className="p-2.5 text-center">PO Qty</th>
                          <th className="p-2.5 text-center">GRN Qty</th>
                          <th className="p-2.5 text-center">Gap Qty</th>
                          <th className="p-2.5 text-right">PO Val (₹L)</th>
                          <th className="p-2.5 text-right">GRN Val (₹L)</th>
                          <th className="p-2.5 text-right">Gap Val (₹L)</th>
                          <th className="p-2.5 text-center">FR %</th>
                          <th className="p-2.5">Gap SKUs</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {activeFocusedPoList.map((po) => (
                          <tr key={po.poNumber} className="hover:bg-purple-50/40 transition-colors">
                            <td className="p-2.5 font-black text-purple-900">{po.poNumber}</td>
                            <td className="p-2.5 font-bold text-slate-800">
                              {po.city} <span className="text-[10px] font-semibold text-slate-400">({po.depo})</span>
                            </td>
                            <td className="p-2.5 text-center font-semibold text-slate-700">{L(po.poQty, 0)}</td>
                            <td className="p-2.5 text-center font-bold text-emerald-700">{L(po.grnQty, 0)}</td>
                            <td className="p-2.5 text-center font-bold text-rose-600">{L(po.gapQty, 0)}</td>
                            <td className="p-2.5 text-right font-extrabold text-slate-900">₹{L2(po.poVal)}L</td>
                            <td className="p-2.5 text-right font-extrabold text-emerald-700">₹{L2(po.grnVal)}L</td>
                            <td className="p-2.5 text-right font-extrabold text-rose-600">₹{L2(po.gapVal)}L</td>
                            <td className="p-2.5 text-center">
                              <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${getFillRatePill(po.frVal)}`}>
                                {po.frVal.toFixed(0)}%
                              </span>
                            </td>
                            <td className="p-2.5 text-slate-600 max-w-[260px]">
                              {po.gapSkus.length === 0 ? (
                                <span className="text-emerald-600 font-bold text-[11px]">✓ Fully Supplied</span>
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  {po.gapSkus.slice(0, 3).map((s) => {
                                    const imgPath = matchSkuIcon(s.skuName);
                                    return (
                                      <span
                                        key={s.skuName}
                                        onClick={() =>
                                          setSkuPopup({
                                            icon: imgPath,
                                            name: s.skuName,
                                            stats: [
                                              { label: "Category", value: s.category || "General" },
                                              { label: "PO Qty", value: L(s.poQty, 0) },
                                              { label: "Filled Qty", value: L(s.grnQty, 0) },
                                              {
                                                label: "Remaining Gap",
                                                value: `${L(s.gapQty, 0)} (₹${L2(s.gapVal)}L)`,
                                                cls: "text-rose-600 font-bold",
                                              },
                                              { label: "Fill Rate", value: `${s.frVal.toFixed(1)}%` },
                                            ],
                                          })
                                        }
                                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-rose-50 border border-rose-200/90 hover:bg-rose-100 hover:border-rose-300 text-rose-800 text-[10px] font-semibold cursor-pointer transition-all active:scale-95 shadow-2xs"
                                        title={`Click to view product image & details for ${s.skuName}`}
                                      >
                                        {imgPath ? (
                                          <img
                                            src={imgPath}
                                            alt=""
                                            className="w-4 h-4 object-contain rounded bg-white shrink-0 border border-slate-200 p-0.5"
                                          />
                                        ) : (
                                          <span className="text-[10px]">📦</span>
                                        )}
                                        <span className="truncate max-w-[130px]">{s.skuName}</span>
                                        <span className="font-extrabold text-rose-700 text-[9px] bg-rose-100/90 px-1 py-0.2 rounded">
                                          ({s.gapQty})
                                        </span>
                                      </span>
                                    );
                                  })}
                                  {po.gapSkus.length > 3 && (
                                    <button
                                      onClick={() =>
                                        setUnfulfilledPopup({
                                          title: `PO #${po.poNumber} — Unfulfilled Gap SKUs`,
                                          subtitle: `${po.city} (${po.depo})`,
                                          date: focusedTimelineDate,
                                          poVal: po.poVal,
                                          grnVal: po.grnVal,
                                          gapVal: po.gapVal,
                                          frVal: po.frVal,
                                          skus: po.gapSkus.map((s) => ({
                                            name: s.skuName,
                                            category: s.category,
                                            poQty: s.poQty,
                                            grnQty: s.grnQty,
                                            gapQty: s.gapQty,
                                            poVal: s.poVal,
                                            grnVal: s.grnVal,
                                            gapVal: s.gapVal,
                                            frVal: s.frVal,
                                            icon: matchSkuIcon(s.skuName),
                                          })),
                                        })
                                      }
                                      className="text-[10px] font-extrabold text-rose-700 hover:text-rose-900 hover:bg-rose-100/80 px-2 py-1 rounded-lg border border-rose-300/80 bg-rose-50 self-center cursor-pointer transition-all active:scale-95 shadow-2xs"
                                    >
                                      +{po.gapSkus.length - 3} more
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  /* SKU View Table */
                  <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100/90 text-slate-700 uppercase font-extrabold tracking-wider sticky top-0 z-10 border-b border-slate-200">
                        <tr>
                          <th className="p-2.5">SKU Name</th>
                          <th className="p-2.5">Category</th>
                          <th className="p-2.5 text-center">POs Count</th>
                          <th className="p-2.5 text-right">PO Qty</th>
                          <th className="p-2.5 text-right">GRN Qty</th>
                          <th className="p-2.5 text-right">Gap Qty</th>
                          <th className="p-2.5 text-right">PO Value (₹L)</th>
                          <th className="p-2.5 text-right">GRN Value (₹L)</th>
                          <th className="p-2.5 text-right">Gap Value (₹L)</th>
                          <th className="p-2.5 text-center">FR %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {activeFocusedSkuList.map((sku) => {
                          const imgPath = matchSkuIcon(sku.skuName);
                          return (
                            <tr
                              key={sku.skuName}
                              onClick={() =>
                                setSkuPopup({
                                  icon: imgPath,
                                  name: sku.skuName,
                                  stats: [
                                    { label: "Category", value: sku.category || "General" },
                                    { label: "POs Count", value: `${sku.numPos} POs` },
                                    { label: "PO Qty", value: L(sku.poQty, 0) },
                                    { label: "Filled Qty", value: L(sku.grnQty, 0) },
                                    {
                                      label: "Remaining Gap",
                                      value: `${L(sku.gapQty, 0)} (₹${L2(sku.gapVal)}L)`,
                                      cls: "text-rose-600 font-bold",
                                    },
                                    { label: "Fill Rate", value: `${sku.frVal.toFixed(1)}%` },
                                  ],
                                })
                              }
                              className="hover:bg-purple-50/60 transition-colors cursor-pointer"
                            >
                              <td className="p-2.5 font-bold text-slate-900">
                                <div className="flex items-center gap-2">
                                  {imgPath ? (
                                    <img
                                      src={imgPath}
                                      alt=""
                                      className="w-7 h-7 object-contain rounded-md bg-white p-0.5 border border-slate-200 shadow-2xs shrink-0"
                                    />
                                  ) : (
                                    <div className="w-7 h-7 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-xs shrink-0">
                                      📦
                                    </div>
                                  )}
                                  <span className="truncate max-w-[220px]" title={sku.skuName}>
                                    {sku.skuName}
                                  </span>
                                </div>
                              </td>
                              <td className="p-2.5 text-slate-500 font-medium">{sku.category}</td>
                              <td className="p-2.5 text-center font-bold text-purple-900">
                                <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-800 text-[10px]">
                                  {sku.numPos} POs
                                </span>
                              </td>
                              <td className="p-2.5 text-right font-semibold text-slate-700">{L(sku.poQty, 0)}</td>
                              <td className="p-2.5 text-right font-semibold text-emerald-700">{L(sku.grnQty, 0)}</td>
                              <td className="p-2.5 text-right font-bold text-rose-600">{L(sku.gapQty, 0)}</td>
                              <td className="p-2.5 text-right font-extrabold text-slate-900">₹{L2(sku.poVal)}L</td>
                              <td className="p-2.5 text-right font-extrabold text-emerald-700">₹{L2(sku.grnVal)}L</td>
                              <td className="p-2.5 text-right font-extrabold text-rose-600">₹{L2(sku.gapVal)}L</td>
                              <td className="p-2.5 text-center">
                                <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${getFillRatePill(sku.frVal)}`}>
                                  {sku.frVal.toFixed(0)}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Table Mode Switcher Tabs ── */}
      <div className="flex items-center gap-3 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab("daily-po")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-sm transition-all cursor-pointer ${activeTab === "daily-po"
              ? "bg-purple-700 text-white shadow-md shadow-purple-900/10"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
        >
          <span>📋 Table 1: Daily PO & SKU Gap Explorer</span>
          <span
            className={`px-2 py-0.5 rounded-full text-xs ${activeTab === "daily-po"
                ? "bg-white/20 text-white"
                : "bg-slate-100 text-slate-700"
              }`}
          >
            {filteredRows.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("location-monitor")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-sm transition-all cursor-pointer ${activeTab === "location-monitor"
              ? "bg-purple-700 text-white shadow-md shadow-purple-900/10"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
        >
          <span>📍 Table 2: Daily Location PO & Gap Monitor</span>
          <span
            className={`px-2 py-0.5 rounded-full text-xs ${activeTab === "location-monitor"
                ? "bg-white/20 text-white"
                : "bg-slate-100 text-slate-700"
              }`}
          >
            {locationViewMode === "by-po"
              ? locationMonitorData.length
              : cityDailySummary.length}
          </span>
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          TAB 1: DAILY PO & SKU GAP EXPLORER
         ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "daily-po" && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
          <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="font-extrabold text-slate-900 text-lg">Daily PO & SKU Level Breakdown</h3>
              <p className="text-xs font-medium text-slate-500">
                Detailed listing of every PO raised by date with expiry status, SKU item, filled amount, and remaining gap.
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative min-w-[260px]">
                <input
                  type="text"
                  placeholder="Search in Table 1 (PO#, SKU, City, Status...)"
                  value={t1Search}
                  onChange={(e) => {
                    setT1Search(e.target.value);
                    setPage(1);
                  }}
                  className="w-full pl-8 pr-7 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <span className="absolute left-2.5 top-2 text-slate-400 text-xs">🔍</span>
                {t1Search && (
                  <button
                    onClick={() => {
                      setT1Search("");
                      setPage(1);
                    }}
                    className="absolute right-2.5 top-1.5 text-xs text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className="text-xs font-bold text-slate-500 whitespace-nowrap">
                Showing {processedT1Rows.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, processedT1Rows.length)} of{" "}
                {processedT1Rows.length} items
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-500 font-extrabold uppercase text-[11px] tracking-wider border-y border-slate-200 select-none">
                <tr>
                  <th
                    onClick={() => toggleT1Sort("poDate")}
                    className={`py-3.5 px-4 cursor-pointer hover:bg-slate-100 transition-colors ${t1SortKey === "poDate" ? "text-purple-900 bg-purple-50/60" : ""
                      }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>PO Date</span>
                      <span className="text-[10px] font-black text-purple-700">
                        {t1SortKey === "poDate" ? (t1SortDir === "asc" ? "▲" : "▼") : "⇅"}
                      </span>
                    </div>
                  </th>

                  <th
                    onClick={() => toggleT1Sort("poNum")}
                    className={`py-3.5 px-4 cursor-pointer hover:bg-slate-100 transition-colors ${t1SortKey === "poNum" ? "text-purple-900 bg-purple-50/60" : ""
                      }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>PO Number</span>
                      <span className="text-[10px] font-black text-purple-700">
                        {t1SortKey === "poNum" ? (t1SortDir === "asc" ? "▲" : "▼") : "⇅"}
                      </span>
                    </div>
                  </th>

                  <th
                    onClick={() => toggleT1Sort("expiryDate")}
                    className={`py-3.5 px-4 cursor-pointer hover:bg-slate-100 transition-colors ${t1SortKey === "expiryDate" ? "text-purple-900 bg-purple-50/60" : ""
                      }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Expiry Date</span>
                      <span className="text-[10px] font-black text-purple-700">
                        {t1SortKey === "expiryDate" ? (t1SortDir === "asc" ? "▲" : "▼") : "⇅"}
                      </span>
                    </div>
                  </th>

                  <th
                    onClick={() => toggleT1Sort("daysLeft")}
                    className={`py-3.5 px-4 cursor-pointer hover:bg-slate-100 transition-colors ${t1SortKey === "daysLeft" ? "text-purple-900 bg-purple-50/60" : ""
                      }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Expiry Status</span>
                      <span className="text-[10px] font-black text-purple-700">
                        {t1SortKey === "daysLeft" ? (t1SortDir === "asc" ? "▲" : "▼") : "⇅"}
                      </span>
                    </div>
                  </th>

                  <th
                    onClick={() => toggleT1Sort("sku")}
                    className={`py-3.5 px-4 cursor-pointer hover:bg-slate-100 transition-colors ${t1SortKey === "sku" ? "text-purple-900 bg-purple-50/60" : ""
                      }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>SKU Name</span>
                      <span className="text-[10px] font-black text-purple-700">
                        {t1SortKey === "sku" ? (t1SortDir === "asc" ? "▲" : "▼") : "⇅"}
                      </span>
                    </div>
                  </th>

                  <th
                    onClick={() => toggleT1Sort("city")}
                    className={`py-3.5 px-4 cursor-pointer hover:bg-slate-100 transition-colors ${t1SortKey === "city" ? "text-purple-900 bg-purple-50/60" : ""
                      }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Location (City)</span>
                      <span className="text-[10px] font-black text-purple-700">
                        {t1SortKey === "city" ? (t1SortDir === "asc" ? "▲" : "▼") : "⇅"}
                      </span>
                    </div>
                  </th>

                  <th
                    onClick={() => toggleT1Sort("poQty")}
                    className={`py-3.5 px-4 text-right cursor-pointer hover:bg-slate-100 transition-colors ${t1SortKey === "poQty" ? "text-purple-900 bg-purple-50/60" : ""
                      }`}
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>PO Qty</span>
                      <span className="text-[10px] font-black text-purple-700">
                        {t1SortKey === "poQty" ? (t1SortDir === "asc" ? "▲" : "▼") : "⇅"}
                      </span>
                    </div>
                  </th>

                  <th
                    onClick={() => toggleT1Sort("poVal")}
                    className={`py-3.5 px-4 text-right cursor-pointer hover:bg-slate-100 transition-colors ${t1SortKey === "poVal" ? "text-purple-900 bg-purple-50/60" : ""
                      }`}
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>PO Val (₹)</span>
                      <span className="text-[10px] font-black text-purple-700">
                        {t1SortKey === "poVal" ? (t1SortDir === "asc" ? "▲" : "▼") : "⇅"}
                      </span>
                    </div>
                  </th>

                  <th
                    onClick={() => toggleT1Sort("grnQty")}
                    className={`py-3.5 px-4 text-right cursor-pointer hover:bg-slate-100 transition-colors ${t1SortKey === "grnQty" ? "text-purple-900 bg-purple-50/60" : ""
                      }`}
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Filled Qty</span>
                      <span className="text-[10px] font-black text-purple-700">
                        {t1SortKey === "grnQty" ? (t1SortDir === "asc" ? "▲" : "▼") : "⇅"}
                      </span>
                    </div>
                  </th>

                  <th
                    onClick={() => toggleT1Sort("grnVal")}
                    className={`py-3.5 px-4 text-right cursor-pointer hover:bg-slate-100 transition-colors ${t1SortKey === "grnVal" ? "text-purple-900 bg-purple-50/60" : ""
                      }`}
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Filled Val (₹)</span>
                      <span className="text-[10px] font-black text-purple-700">
                        {t1SortKey === "grnVal" ? (t1SortDir === "asc" ? "▲" : "▼") : "⇅"}
                      </span>
                    </div>
                  </th>

                  <th
                    onClick={() => toggleT1Sort("gapQty")}
                    className={`py-3.5 px-4 text-right cursor-pointer hover:bg-slate-100 transition-colors ${t1SortKey === "gapQty" ? "text-purple-900 bg-purple-50/60" : ""
                      }`}
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Gap Qty</span>
                      <span className="text-[10px] font-black text-purple-700">
                        {t1SortKey === "gapQty" ? (t1SortDir === "asc" ? "▲" : "▼") : "⇅"}
                      </span>
                    </div>
                  </th>

                  <th
                    onClick={() => toggleT1Sort("gapVal")}
                    className={`py-3.5 px-4 text-right cursor-pointer hover:bg-slate-100 transition-colors ${t1SortKey === "gapVal" ? "text-purple-900 bg-purple-50/60" : ""
                      }`}
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Gap Val (₹)</span>
                      <span className="text-[10px] font-black text-purple-700">
                        {t1SortKey === "gapVal" ? (t1SortDir === "asc" ? "▲" : "▼") : "⇅"}
                      </span>
                    </div>
                  </th>

                  <th
                    onClick={() => toggleT1Sort("frVal")}
                    className={`py-3.5 px-4 text-center cursor-pointer hover:bg-slate-100 transition-colors ${t1SortKey === "frVal" ? "text-purple-900 bg-purple-50/60" : ""
                      }`}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span>Fill Rate %</span>
                      <span className="text-[10px] font-black text-purple-700">
                        {t1SortKey === "frVal" ? (t1SortDir === "asc" ? "▲" : "▼") : "⇅"}
                      </span>
                    </div>
                  </th>

                  <th
                    onClick={() => toggleT1Sort("status")}
                    className={`py-3.5 px-4 text-center cursor-pointer hover:bg-slate-100 transition-colors ${t1SortKey === "status" ? "text-purple-900 bg-purple-50/60" : ""
                      }`}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span>Status</span>
                      <span className="text-[10px] font-black text-purple-700">
                        {t1SortKey === "status" ? (t1SortDir === "asc" ? "▲" : "▼") : "⇅"}
                      </span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {paginatedRows.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="py-12 text-center text-slate-400">
                      <span className="text-3xl block mb-2">🔍</span>
                      <p className="text-sm font-bold text-slate-700">No matching records found</p>
                      <p className="text-xs text-slate-400">Try adjusting your table search query or filters.</p>
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((r, idx) => {
                    const poDate = ymdToDate(r[11]);
                    const poNum = d.dims.po[r[12]] || "—";
                    const expiryDate = ymdToDate(r[13]);
                    const daysLeft = r[13] > 0 ? diffDays(nowYmd, r[13]) : null;
                    const expiryStatus = getExpiryStatus(daysLeft);
                    const skuName = d.dims.sku[r[6]];
                    const city = d.dims.city[r[3]];
                    const category = d.dims.category[r[4]];
                    const status = d.dims.status[r[5]];
                    const poQty = r[7];
                    const poVal = r[8];
                    const grnQty = r[9];
                    const grnVal = r[10];
                    const gapQty = Math.max(0, poQty - grnQty);
                    const gapVal = Math.max(0, poVal - grnVal);
                    const frVal = poVal > 0 ? (grnVal / poVal) * 100 : 0;
                    const skuIcon = matchSkuIcon(skuName);

                    return (
                      <tr key={idx} className="hover:bg-purple-50/40 transition-colors">
                        {/* PO Date */}
                        <td className="py-3 px-4 font-bold text-slate-800">{poDate}</td>

                        {/* PO Number */}
                        <td className="py-3 px-4 font-mono font-bold text-purple-900 bg-purple-50/50 rounded-lg">
                          {poNum}
                        </td>

                        {/* Expiry Date */}
                        <td className="py-3 px-4 text-slate-600">{expiryDate}</td>

                        {/* Expiry Urgency Status */}
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex px-2.5 py-1 rounded-full text-xs border ${expiryStatus.cls}`}
                          >
                            {expiryStatus.label}
                          </span>
                        </td>

                        {/* SKU Name & Icon */}
                        <td className="py-3 px-4">
                          <div
                            onClick={() =>
                              setSkuPopup({
                                icon: skuIcon,
                                name: skuName,
                                stats: [
                                  { label: "Category", value: category },
                                  { label: "Location", value: city },
                                  { label: "PO Qty", value: L(poQty, 0) },
                                  { label: "Filled Qty", value: L(grnQty, 0) },
                                  {
                                    label: "Remaining Gap",
                                    value: `${L(gapQty, 0)} (${L2(gapVal)}L)`,
                                    cls: "text-rose-600 font-bold",
                                  },
                                  { label: "Fill Rate", value: `${frVal.toFixed(1)}%` },
                                ],
                              })
                            }
                            className="flex items-center gap-2.5 cursor-pointer group max-w-[280px]"
                          >
                            <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 grid place-items-center shrink-0 overflow-hidden group-hover:border-purple-300">
                              {skuIcon ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={skuIcon}
                                  alt=""
                                  className="max-w-full max-h-full object-contain"
                                />
                              ) : (
                                <span>🥛</span>
                              )}
                            </div>
                            <span className="truncate font-semibold text-slate-800 group-hover:text-purple-700 transition">
                              {skuName}
                            </span>
                          </div>
                        </td>

                        {/* Location (City) */}
                        <td className="py-3 px-4 font-semibold text-slate-700">{city}</td>

                        {/* PO Qty */}
                        <td className="py-3 px-4 text-right font-bold text-slate-800">{L(poQty, 0)}</td>

                        {/* PO Value */}
                        <td className="py-3 px-4 text-right font-bold text-purple-950">
                          ₹{L2(poVal)}L
                        </td>

                        {/* Filled Qty */}
                        <td className="py-3 px-4 text-right font-semibold text-emerald-700">
                          {L(grnQty, 0)}
                        </td>

                        {/* Filled Val */}
                        <td className="py-3 px-4 text-right font-semibold text-emerald-700">
                          ₹{L2(grnVal)}L
                        </td>

                        {/* Gap Qty */}
                        <td
                          onClick={() => {
                            if (gapQty > 0) {
                              setSkuPopup({
                                icon: skuIcon,
                                name: skuName,
                                stats: [
                                  { label: "Category", value: category },
                                  { label: "Location", value: city },
                                  { label: "PO Qty", value: L(poQty, 0) },
                                  { label: "Filled Qty", value: L(grnQty, 0) },
                                  {
                                    label: "Remaining Gap",
                                    value: `${L(gapQty, 0)} (${L2(gapVal)}L)`,
                                    cls: "text-rose-600 font-bold",
                                  },
                                  { label: "Fill Rate", value: `${frVal.toFixed(1)}%` },
                                ],
                              });
                            }
                          }}
                          className={`py-3 px-4 text-right font-bold ${gapQty > 0
                              ? "text-rose-700 cursor-pointer hover:underline"
                              : "text-slate-400"
                            }`}
                        >
                          {gapQty > 0 ? `-${L(gapQty, 0)}` : "0"}
                        </td>

                        {/* Gap Val */}
                        <td
                          onClick={() => {
                            if (gapVal > 0) {
                              setSkuPopup({
                                icon: skuIcon,
                                name: skuName,
                                stats: [
                                  { label: "Category", value: category },
                                  { label: "Location", value: city },
                                  { label: "PO Qty", value: L(poQty, 0) },
                                  { label: "Filled Qty", value: L(grnQty, 0) },
                                  {
                                    label: "Remaining Gap",
                                    value: `${L(gapQty, 0)} (${L2(gapVal)}L)`,
                                    cls: "text-rose-600 font-bold",
                                  },
                                  { label: "Fill Rate", value: `${frVal.toFixed(1)}%` },
                                ],
                              });
                            }
                          }}
                          className={`py-3 px-4 text-right font-bold ${gapVal > 0
                              ? "text-rose-700 cursor-pointer hover:underline"
                              : "text-slate-400"
                            }`}
                        >
                          {gapVal > 0 ? `₹${L2(gapVal)}L` : "₹0.00L"}
                        </td>

                        {/* Fill Rate % */}
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold border ${getFillRatePill(
                              frVal
                            )}`}
                          >
                            {frVal.toFixed(1)}%
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4 text-center text-xs font-semibold text-slate-600">
                          {status}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
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
                Page {page} of {Math.ceil(processedT1Rows.length / pageSize) || 1}
              </span>
              <button
                disabled={page >= Math.ceil(processedT1Rows.length / pageSize)}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold disabled:opacity-40 hover:bg-slate-50 cursor-pointer"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 2: DEDICATED DAILY LOCATION PO & GAP MONITOR
         ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "location-monitor" && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
          <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="font-extrabold text-slate-900 text-lg">
                Daily Location & City-wise Gap Monitor
              </h3>
              <p className="text-xs font-medium text-slate-500">
                Monitor for each day which location received how much fill, remaining gap, and PO status.
                Click on any unfulfilled SKU cell to view full itemized popup details.
              </p>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative min-w-[260px]">
                <input
                  type="text"
                  placeholder="Search in Table 2 (City, Depot, Region, SKUs...)"
                  value={t2Search}
                  onChange={(e) => {
                    setT2Search(e.target.value);
                    setLocPage(1);
                  }}
                  className="w-full pl-8 pr-7 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <span className="absolute left-2.5 top-2 text-slate-400 text-xs">🔍</span>
                {t2Search && (
                  <button
                    onClick={() => {
                      setT2Search("");
                      setLocPage(1);
                    }}
                    className="absolute right-2.5 top-1.5 text-xs text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* View Mode Toggle */}
              <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl shrink-0">
                <button
                  onClick={() => {
                    setLocationViewMode("by-po");
                    setLocPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${locationViewMode === "by-po"
                      ? "bg-white text-purple-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                    }`}
                >
                  By Date + City + PO
                </button>
                <button
                  onClick={() => {
                    setLocationViewMode("by-city-summary");
                    setLocPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${locationViewMode === "by-city-summary"
                      ? "bg-white text-purple-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                    }`}
                >
                  By City Daily Summary
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            {locationViewMode === "by-po" ? (
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-500 font-extrabold uppercase text-[11px] tracking-wider border-y border-slate-200 select-none">
                  <tr>
                    <th
                      onClick={() => toggleT2Sort("date")}
                      className={`py-3.5 px-4 cursor-pointer hover:bg-slate-100 transition-colors ${t2SortKey === "date" ? "text-purple-900 bg-purple-50/60" : ""
                        }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Date</span>
                        <span className="text-[10px] font-black text-purple-700">
                          {t2SortKey === "date" ? (t2SortDir === "asc" ? "▲" : "▼") : "⇅"}
                        </span>
                      </div>
                    </th>

                    <th
                      onClick={() => toggleT2Sort("city")}
                      className={`py-3.5 px-4 cursor-pointer hover:bg-slate-100 transition-colors ${t2SortKey === "city" ? "text-purple-900 bg-purple-50/60" : ""
                        }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Location (City)</span>
                        <span className="text-[10px] font-black text-purple-700">
                          {t2SortKey === "city" ? (t2SortDir === "asc" ? "▲" : "▼") : "⇅"}
                        </span>
                      </div>
                    </th>

                    <th
                      onClick={() => toggleT2Sort("region")}
                      className={`py-3.5 px-4 cursor-pointer hover:bg-slate-100 transition-colors ${t2SortKey === "region" ? "text-purple-900 bg-purple-50/60" : ""
                        }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Region</span>
                        <span className="text-[10px] font-black text-purple-700">
                          {t2SortKey === "region" ? (t2SortDir === "asc" ? "▲" : "▼") : "⇅"}
                        </span>
                      </div>
                    </th>

                    <th
                      onClick={() => toggleT2Sort("depo")}
                      className={`py-3.5 px-4 cursor-pointer hover:bg-slate-100 transition-colors ${t2SortKey === "depo" ? "text-purple-900 bg-purple-50/60" : ""
                        }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Depot</span>
                        <span className="text-[10px] font-black text-purple-700">
                          {t2SortKey === "depo" ? (t2SortDir === "asc" ? "▲" : "▼") : "⇅"}
                        </span>
                      </div>
                    </th>

                    <th
                      onClick={() => toggleT2Sort("poNumber")}
                      className={`py-3.5 px-4 cursor-pointer hover:bg-slate-100 transition-colors ${t2SortKey === "poNumber" ? "text-purple-900 bg-purple-50/60" : ""
                        }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>PO Number</span>
                        <span className="text-[10px] font-black text-purple-700">
                          {t2SortKey === "poNumber" ? (t2SortDir === "asc" ? "▲" : "▼") : "⇅"}
                        </span>
                      </div>
                    </th>

                    <th
                      onClick={() => toggleT2Sort("poVal")}
                      className={`py-3.5 px-4 text-right cursor-pointer hover:bg-slate-100 transition-colors ${t2SortKey === "poVal" ? "text-purple-900 bg-purple-50/60" : ""
                        }`}
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>PO Ordered (₹)</span>
                        <span className="text-[10px] font-black text-purple-700">
                          {t2SortKey === "poVal" ? (t2SortDir === "asc" ? "▲" : "▼") : "⇅"}
                        </span>
                      </div>
                    </th>

                    <th
                      onClick={() => toggleT2Sort("grnVal")}
                      className={`py-3.5 px-4 text-right cursor-pointer hover:bg-slate-100 transition-colors ${t2SortKey === "grnVal" ? "text-purple-900 bg-purple-50/60" : ""
                        }`}
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>Filled GRN (₹)</span>
                        <span className="text-[10px] font-black text-purple-700">
                          {t2SortKey === "grnVal" ? (t2SortDir === "asc" ? "▲" : "▼") : "⇅"}
                        </span>
                      </div>
                    </th>

                    <th
                      onClick={() => toggleT2Sort("gapVal")}
                      className={`py-3.5 px-4 text-right cursor-pointer hover:bg-slate-100 transition-colors ${t2SortKey === "gapVal" ? "text-purple-900 bg-purple-50/60" : ""
                        }`}
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>Remaining Gap (₹)</span>
                        <span className="text-[10px] font-black text-purple-700">
                          {t2SortKey === "gapVal" ? (t2SortDir === "asc" ? "▲" : "▼") : "⇅"}
                        </span>
                      </div>
                    </th>

                    <th
                      onClick={() => toggleT2Sort("frVal")}
                      className={`py-3.5 px-4 text-center cursor-pointer hover:bg-slate-100 transition-colors ${t2SortKey === "frVal" ? "text-purple-900 bg-purple-50/60" : ""
                        }`}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span>Fill Rate %</span>
                        <span className="text-[10px] font-black text-purple-700">
                          {t2SortKey === "frVal" ? (t2SortDir === "asc" ? "▲" : "▼") : "⇅"}
                        </span>
                      </div>
                    </th>

                    <th
                      onClick={() => toggleT2Sort("skus")}
                      className={`py-3.5 px-4 cursor-pointer hover:bg-slate-100 transition-colors ${t2SortKey === "skus" ? "text-purple-900 bg-purple-50/60" : ""
                        }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Top Unfulfilled Items (Gap SKUs)</span>
                        <span className="text-[10px] font-black text-purple-700">
                          {t2SortKey === "skus" ? (t2SortDir === "asc" ? "▲" : "▼") : "⇅"}
                        </span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {paginatedLocRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-400">
                        <span className="text-3xl block mb-2">🔍</span>
                        <p className="text-sm font-bold text-slate-700">No matching location records</p>
                        <p className="text-xs text-slate-400">Try adjusting your table search query or filters.</p>
                      </td>
                    </tr>
                  ) : (
                    paginatedLocRows.map((item: any, idx) => (
                      <tr key={idx} className="hover:bg-purple-50/40 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-800">{ymdToDate(item.date)}</td>
                        <td className="py-3 px-4 font-extrabold text-purple-950">{item.city}</td>
                        <td className="py-3 px-4 text-slate-600">{item.region}</td>
                        <td className="py-3 px-4 text-slate-500 text-xs">{item.depo}</td>
                        <td className="py-3 px-4 font-mono font-bold text-purple-800">
                          {item.poNumber}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900">
                          ₹{L2(item.poVal)}L
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-700">
                          ₹{L2(item.grnVal)}L
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-rose-700">
                          {item.gapVal > 0 ? `₹${L2(item.gapVal)}L` : "₹0.00L"}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold border ${getFillRatePill(
                              item.frVal
                            )}`}
                          >
                            {item.frVal.toFixed(1)}%
                          </span>
                        </td>

                        {/* Top Unfulfilled Items (Clickable for Popup Mode) */}
                        <td className="py-3 px-4 max-w-sm">
                          {item.skus.length > 0 ? (
                            <button
                              type="button"
                              onClick={() =>
                                setUnfulfilledPopup({
                                  title: `Unfulfilled SKUs Breakdown`,
                                  subtitle: `Itemized gap summary for PO #${item.poNumber}`,
                                  poNumber: item.poNumber,
                                  city: item.city,
                                  region: item.region,
                                  depo: item.depo,
                                  date: ymdToDate(item.date),
                                  poVal: item.poVal,
                                  grnVal: item.grnVal,
                                  gapVal: item.gapVal,
                                  frVal: item.frVal,
                                  skus: item.skus,
                                })
                              }
                              className="group/btn flex items-center gap-2 text-left px-3 py-1.5 rounded-xl border border-purple-200 bg-purple-50/60 hover:bg-purple-100/90 text-purple-900 transition-all shadow-2xs hover:shadow-xs active:scale-[0.99] max-w-full cursor-pointer"
                            >
                              <span className="truncate text-xs font-semibold max-w-[260px]">
                                {item.skus.map((s: any) => s.name).join(", ")}
                              </span>
                              <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-purple-600 text-white font-bold text-[10px]">
                                {item.skus.length} SKUs 🔍
                              </span>
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold text-xs bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                              ✓ 100% Fulfilled
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-500 font-extrabold uppercase text-[11px] tracking-wider border-y border-slate-200 select-none">
                  <tr>
                    <th
                      onClick={() => toggleT2Sort("date")}
                      className={`py-3.5 px-4 cursor-pointer hover:bg-slate-100 transition-colors ${t2SortKey === "date" ? "text-purple-900 bg-purple-50/60" : ""
                        }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Date</span>
                        <span className="text-[10px] font-black text-purple-700">
                          {t2SortKey === "date" ? (t2SortDir === "asc" ? "▲" : "▼") : "⇅"}
                        </span>
                      </div>
                    </th>

                    <th
                      onClick={() => toggleT2Sort("city")}
                      className={`py-3.5 px-4 cursor-pointer hover:bg-slate-100 transition-colors ${t2SortKey === "city" ? "text-purple-900 bg-purple-50/60" : ""
                        }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>City / Location</span>
                        <span className="text-[10px] font-black text-purple-700">
                          {t2SortKey === "city" ? (t2SortDir === "asc" ? "▲" : "▼") : "⇅"}
                        </span>
                      </div>
                    </th>

                    <th
                      onClick={() => toggleT2Sort("region")}
                      className={`py-3.5 px-4 cursor-pointer hover:bg-slate-100 transition-colors ${t2SortKey === "region" ? "text-purple-900 bg-purple-50/60" : ""
                        }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Region</span>
                        <span className="text-[10px] font-black text-purple-700">
                          {t2SortKey === "region" ? (t2SortDir === "asc" ? "▲" : "▼") : "⇅"}
                        </span>
                      </div>
                    </th>

                    <th
                      onClick={() => toggleT2Sort("depo")}
                      className={`py-3.5 px-4 cursor-pointer hover:bg-slate-100 transition-colors ${t2SortKey === "depo" ? "text-purple-900 bg-purple-50/60" : ""
                        }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Depot</span>
                        <span className="text-[10px] font-black text-purple-700">
                          {t2SortKey === "depo" ? (t2SortDir === "asc" ? "▲" : "▼") : "⇅"}
                        </span>
                      </div>
                    </th>

                    <th
                      onClick={() => toggleT2Sort("posCount")}
                      className={`py-3.5 px-4 text-center cursor-pointer hover:bg-slate-100 transition-colors ${t2SortKey === "posCount" ? "text-purple-900 bg-purple-50/60" : ""
                        }`}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span>Total POs</span>
                        <span className="text-[10px] font-black text-purple-700">
                          {t2SortKey === "posCount" ? (t2SortDir === "asc" ? "▲" : "▼") : "⇅"}
                        </span>
                      </div>
                    </th>

                    <th
                      onClick={() => toggleT2Sort("poVal")}
                      className={`py-3.5 px-4 text-right cursor-pointer hover:bg-slate-100 transition-colors ${t2SortKey === "poVal" ? "text-purple-900 bg-purple-50/60" : ""
                        }`}
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>Total PO Val (₹)</span>
                        <span className="text-[10px] font-black text-purple-700">
                          {t2SortKey === "poVal" ? (t2SortDir === "asc" ? "▲" : "▼") : "⇅"}
                        </span>
                      </div>
                    </th>

                    <th
                      onClick={() => toggleT2Sort("grnVal")}
                      className={`py-3.5 px-4 text-right cursor-pointer hover:bg-slate-100 transition-colors ${t2SortKey === "grnVal" ? "text-purple-900 bg-purple-50/60" : ""
                        }`}
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>Filled GRN Val (₹)</span>
                        <span className="text-[10px] font-black text-purple-700">
                          {t2SortKey === "grnVal" ? (t2SortDir === "asc" ? "▲" : "▼") : "⇅"}
                        </span>
                      </div>
                    </th>

                    <th
                      onClick={() => toggleT2Sort("gapVal")}
                      className={`py-3.5 px-4 text-right cursor-pointer hover:bg-slate-100 transition-colors ${t2SortKey === "gapVal" ? "text-purple-900 bg-purple-50/60" : ""
                        }`}
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>Total Gap Val (₹)</span>
                        <span className="text-[10px] font-black text-purple-700">
                          {t2SortKey === "gapVal" ? (t2SortDir === "asc" ? "▲" : "▼") : "⇅"}
                        </span>
                      </div>
                    </th>

                    <th
                      onClick={() => toggleT2Sort("frVal")}
                      className={`py-3.5 px-4 text-center cursor-pointer hover:bg-slate-100 transition-colors ${t2SortKey === "frVal" ? "text-purple-900 bg-purple-50/60" : ""
                        }`}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span>Fill Rate %</span>
                        <span className="text-[10px] font-black text-purple-700">
                          {t2SortKey === "frVal" ? (t2SortDir === "asc" ? "▲" : "▼") : "⇅"}
                        </span>
                      </div>
                    </th>

                    <th
                      onClick={() => toggleT2Sort("skus")}
                      className={`py-3.5 px-4 cursor-pointer hover:bg-slate-100 transition-colors ${t2SortKey === "skus" ? "text-purple-900 bg-purple-50/60" : ""
                        }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Top Impacted SKUs in Location</span>
                        <span className="text-[10px] font-black text-purple-700">
                          {t2SortKey === "skus" ? (t2SortDir === "asc" ? "▲" : "▼") : "⇅"}
                        </span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {paginatedLocRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-400">
                        <span className="text-3xl block mb-2">🔍</span>
                        <p className="text-sm font-bold text-slate-700">No matching location summary</p>
                        <p className="text-xs text-slate-400">Try adjusting your table search query or filters.</p>
                      </td>
                    </tr>
                  ) : (
                    paginatedLocRows.map((item: any, idx) => (
                      <tr key={idx} className="hover:bg-purple-50/40 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-800">{ymdToDate(item.date)}</td>
                        <td className="py-3 px-4 font-extrabold text-purple-950">{item.city}</td>
                        <td className="py-3 px-4 text-slate-600">{item.region}</td>
                        <td className="py-3 px-4 text-slate-500 text-xs">{item.depo}</td>
                        <td className="py-3 px-4 text-center font-bold text-purple-700 bg-purple-50/50 rounded-lg">
                          {item.posCount} POs
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900">
                          ₹{L2(item.poVal)}L
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-700">
                          ₹{L2(item.grnVal)}L
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-rose-700">
                          {item.gapVal > 0 ? `₹${L2(item.gapVal)}L` : "₹0.00L"}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold border ${getFillRatePill(
                              item.frVal
                            )}`}
                          >
                            {item.frVal.toFixed(1)}%
                          </span>
                        </td>

                        {/* City Unfulfilled Impact SKUs Popup Trigger */}
                        <td className="py-3 px-4 max-w-sm">
                          {item.skusList && item.skusList.length > 0 ? (
                            <button
                              type="button"
                              onClick={() =>
                                setUnfulfilledPopup({
                                  title: `Location Impacted SKUs`,
                                  subtitle: `All gap SKUs for ${item.city} on ${ymdToDate(item.date)}`,
                                  city: item.city,
                                  region: item.region,
                                  depo: item.depo,
                                  date: ymdToDate(item.date),
                                  poVal: item.poVal,
                                  grnVal: item.grnVal,
                                  gapVal: item.gapVal,
                                  frVal: item.frVal,
                                  skus: item.skusList,
                                })
                              }
                              className="group/btn flex items-center gap-2 text-left px-3 py-1.5 rounded-xl border border-purple-200 bg-purple-50/60 hover:bg-purple-100/90 text-purple-900 transition-all shadow-2xs hover:shadow-xs active:scale-[0.99] max-w-full cursor-pointer"
                            >
                              <span className="truncate text-xs font-semibold max-w-[260px]">
                                {item.topGapSkusText}
                              </span>
                              <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-purple-600 text-white font-bold text-[10px]">
                                {item.skusList.length} SKUs 🔍
                              </span>
                            </button>
                          ) : (
                            <span className="text-emerald-600 font-semibold text-xs">
                              ✓ 100% Fulfilled
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Location Pagination Controls */}
          <div className="p-4 border-t border-slate-100 flex items-center justify-between">
            <div className="text-xs text-slate-500 font-semibold">
              Showing {(locPage - 1) * pageSize + 1}–
              {Math.min(
                locPage * pageSize,
                locationViewMode === "by-po"
                  ? processedLocByPo.length
                  : processedLocByCity.length
              )}{" "}
              of{" "}
              {locationViewMode === "by-po"
                ? processedLocByPo.length
                : processedLocByCity.length}{" "}
              entries
            </div>

            <div className="flex items-center gap-2">
              <button
                disabled={locPage <= 1}
                onClick={() => setLocPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold disabled:opacity-40 hover:bg-slate-50 cursor-pointer"
              >
                ← Prev
              </button>
              <span className="text-xs font-bold text-slate-700">
                Page {locPage} of{" "}
                {Math.ceil(
                  (locationViewMode === "by-po"
                    ? processedLocByPo.length
                    : processedLocByCity.length) / pageSize
                ) || 1}
              </span>
              <button
                disabled={
                  locPage >=
                  Math.ceil(
                    (locationViewMode === "by-po"
                      ? processedLocByPo.length
                      : processedLocByCity.length) / pageSize
                  )
                }
                onClick={() => setLocPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold disabled:opacity-40 hover:bg-slate-50 cursor-pointer"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Unfulfilled Items Modal (Popup Mode) ── */}
      {unfulfilledPopup && (
        <UnfulfilledItemsModal
          data={unfulfilledPopup}
          onClose={() => setUnfulfilledPopup(null)}
          onOpenSkuLightbox={(sku) => setSkuPopup(sku)}
        />
      )}

      {/* ── Lightbox Single SKU popup ── */}
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