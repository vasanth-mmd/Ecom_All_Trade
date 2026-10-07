"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import { mmdGroup } from "@/lib/mmd-mapping";
import { matchSkuIcon } from "@/lib/sku-icon";
import { lookupDepoByCity } from "@/lib/depo-mapping";
import SyncStatus from "../sync-status";

/* ── Types & Interfaces ── */
type Data = {
  meta: any;
  dims: Record<string, string[]>;
  rows: number[][];
};

type MetricType = "fr" | "poVal" | "grnVal" | "gapVal" | "poQty" | "grnQty" | "poCount";

type PrimaryDimension = "category_day" | "category_city" | "city_day" | "sku_day" | "city_category";

interface CellData {
  poVal: number;
  grnVal: number;
  gapVal: number;
  poQty: number;
  grnQty: number;
  poCount: number;
  fr: number;
  poSet: Set<string>;
  skuDetails: Array<{
    skuName: string;
    code: string;
    category: string;
    poNum: string;
    poQty: number;
    grnQty: number;
    poVal: number;
    grnVal: number;
    gapVal: number;
    fr: number;
    status: string;
    city: string;
    day: number;
    dateYmd: number;
  }>;
}

interface MultiSelectProps {
  label: string;
  options: { key: string; label: string; badge?: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  searchPlaceholder?: string;
  allLabel?: string;
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
  allLabel,
}: MultiSelectProps) {
  const [q, setQ] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selSet = useMemo(() => new Set(selected), [selected]);

  const filteredOptions = useMemo(() => {
    if (!q.trim()) return options;
    const lower = q.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(lower) || (o.badge && o.badge.toLowerCase().includes(lower)));
  }, [options, q]);

  const toggleItem = (key: string) => {
    if (selSet.has(key)) {
      onChange(selected.filter((k) => k !== key));
    } else {
      onChange([...selected, key]);
    }
  };

  const defaultAll = allLabel || `All (${options.length})`;
  let buttonLabel = defaultAll;
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
      <label className="block text-[10.5px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
        {label}
      </label>
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center justify-between gap-2 rounded-xl border-2 px-3 py-1.5 text-xs font-black text-left transition-all cursor-pointer shadow-xs ${
          isFiltered
            ? "border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-950 dark:text-amber-200 ring-1 ring-amber-400"
            : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
        }`}
      >
        <span className="truncate max-w-[150px]">{buttonLabel}</span>
        <span className="text-xs text-slate-400 shrink-0">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} />
          <div
            className="absolute left-0 top-full mt-1.5 z-50 w-72 max-w-[90vw] bg-white dark:bg-slate-900 border-2 border-amber-400 dark:border-amber-500 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.35)] p-3 space-y-2 animate-in fade-in zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
          >
            {options.length > 5 && (
              <div className="relative">
                <input
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={searchPlaceholder || `Search ${label.toLowerCase()}...`}
                  className="w-full pl-8 pr-7 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 bg-slate-50 dark:bg-slate-950"
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
            )}

            <div className="flex items-center justify-between px-1 text-[11px] font-black border-b border-slate-100 dark:border-slate-800 pb-1.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onChange(options.map((o) => o.key))}
                  className="text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                >
                  Select All
                </button>
                <span className="text-slate-400">·</span>
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                >
                  Clear
                </button>
              </div>
              <span className="text-slate-400 font-mono">
                {selected.length === 0 ? "All" : `${selected.length}/${options.length}`}
              </span>
            </div>

            <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
              {filteredOptions.length === 0 ? (
                <div className="text-center py-4 text-xs text-slate-400 font-medium">No matches found</div>
              ) : (
                filteredOptions.map((opt) => {
                  const isChecked = selSet.has(opt.key);
                  return (
                    <label
                      key={opt.key}
                      className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                        isChecked
                          ? "bg-amber-100/70 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200 font-bold"
                          : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleItem(opt.key)}
                        className="rounded border-slate-300 dark:border-slate-700 text-amber-600 focus:ring-amber-500 h-4 w-4 accent-amber-600 cursor-pointer shrink-0"
                      />
                      <span className="truncate flex-1" title={opt.label}>
                        {opt.label}
                      </span>
                      {opt.badge && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-500">
                          {opt.badge}
                        </span>
                      )}
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

interface DateRangeProps {
  startDate: string;
  endDate: string;
  onRangeChange: (start: string, end: string) => void;
  minDate?: string;
  maxDate?: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}

function DateRangeDropdown({
  startDate,
  endDate,
  onRangeChange,
  minDate = "2026-07-01",
  maxDate = "2026-09-29",
  open,
  onToggle,
  onClose,
}: DateRangeProps) {
  const [localStart, setLocalStart] = useState(startDate);
  const [localEnd, setLocalEnd] = useState(endDate);

  useEffect(() => {
    setLocalStart(startDate);
    setLocalEnd(endDate);
  }, [startDate, endDate]);

  const formatDateLabel = (dStr: string) => {
    if (!dStr) return "";
    const parts = dStr.split("-");
    if (parts.length !== 3) return dStr;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const mIdx = parseInt(parts[1], 10) - 1;
    return `${parts[2]} ${months[mIdx] || parts[1]}`;
  };

  let buttonLabel = "Select Date Range";
  if (startDate && endDate) {
    if (startDate === "2026-09-01" && endDate === "2026-09-29") {
      buttonLabel = "Sep 2026 (MTD)";
    } else if (startDate === "2026-08-01" && endDate === "2026-08-31") {
      buttonLabel = "August 2026 (Full)";
    } else if (startDate === "2026-07-01" && endDate === "2026-07-31") {
      buttonLabel = "July 2026 (Full)";
    } else {
      buttonLabel = `${formatDateLabel(startDate)} → ${formatDateLabel(endDate)}`;
    }
  } else if (startDate) {
    buttonLabel = `From ${formatDateLabel(startDate)}`;
  } else {
    buttonLabel = "All Available Dates";
  }

  const isFiltered = !!(startDate || endDate);

  const applyPreset = (start: string, end: string) => {
    setLocalStart(start);
    setLocalEnd(end);
    onRangeChange(start, end);
    onClose();
  };

  const handleApplyCustom = () => {
    onRangeChange(localStart, localEnd);
    onClose();
  };

  const handleClear = () => {
    setLocalStart("");
    setLocalEnd("");
    onRangeChange("", "");
    onClose();
  };

  return (
    <div className={`relative ${open ? "z-50" : "z-10"}`}>
      <label className="block text-[10.5px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
        🗓️ Month Date Range
      </label>
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center justify-between gap-2 rounded-xl border-2 px-3 py-1.5 text-xs font-black text-left transition-all cursor-pointer shadow-xs ${
          isFiltered
            ? "border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-950 dark:text-amber-200 ring-1 ring-amber-400"
            : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
        }`}
      >
        <span className="truncate max-w-[150px]">{buttonLabel}</span>
        <span className="text-xs text-slate-400 shrink-0">📅</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} />
          <div
            className="absolute left-0 top-full mt-1.5 z-50 w-84 max-w-[95vw] bg-white dark:bg-slate-900 border-2 border-amber-400 dark:border-amber-500 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.35)] p-3.5 space-y-3 animate-in fade-in zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <span className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>🗓️</span> Select Month Date Range
              </span>
              {isFiltered && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                >
                  Clear Range
                </button>
              )}
            </div>

            {/* Quick Month Presets */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Month Presets:</span>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => applyPreset("2026-09-01", "2026-09-29")}
                  className={`px-2 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                    startDate === "2026-09-01" && endDate === "2026-09-29"
                      ? "bg-amber-500 text-white border-amber-600 font-black shadow-xs"
                      : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                  }`}
                >
                  Sep 2026 (MTD)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("2026-08-01", "2026-08-31")}
                  className={`px-2 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                    startDate === "2026-08-01" && endDate === "2026-08-31"
                      ? "bg-amber-500 text-white border-amber-600 font-black shadow-xs"
                      : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                  }`}
                >
                  August 2026
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("2026-07-01", "2026-07-31")}
                  className={`px-2 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                    startDate === "2026-07-01" && endDate === "2026-07-31"
                      ? "bg-amber-500 text-white border-amber-600 font-black shadow-xs"
                      : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                  }`}
                >
                  July 2026
                </button>
              </div>
            </div>

            {/* Quick Cycle / Rolling Presets */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Cycle & Rolling Ranges:</span>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => applyPreset("2026-09-01", "2026-09-10")}
                  className="px-2 py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Sep Cycle 1 (1–10)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("2026-09-11", "2026-09-20")}
                  className="px-2 py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Sep Cycle 2 (11–20)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("2026-09-21", "2026-09-29")}
                  className="px-2 py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Sep Cycle 3 (21–29)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("2026-09-23", "2026-09-29")}
                  className="px-2 py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Last 7 Days
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("2026-09-16", "2026-09-29")}
                  className="px-2 py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Last 14 Days
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("2026-08-31", "2026-09-29")}
                  className="px-2 py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Last 30 Days
                </button>
              </div>
            </div>

            {/* Custom From/To Calendar Pickers */}
            <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Custom Date Range:</span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">From Date</label>
                  <input
                    type="date"
                    value={localStart}
                    min={minDate}
                    max={maxDate}
                    onChange={(e) => setLocalStart(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">To Date</label>
                  <input
                    type="date"
                    value={localEnd}
                    min={localStart || minDate}
                    max={maxDate}
                    onChange={(e) => setLocalEnd(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplyCustom}
                  className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs cursor-pointer shadow-xs"
                >
                  Apply Custom Range
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DayMultiSelectDropdown({
  selected,
  onChange,
  open,
  onToggle,
  onClose,
}: {
  selected: number[];
  onChange: (days: number[]) => void;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const allDays = useMemo(() => Array.from({ length: 31 }, (_, i) => i + 1), []);
  const selSet = useMemo(() => new Set(selected), [selected]);

  const setCycle = (start: number, end: number) => {
    const cycle = allDays.filter((d) => d >= start && d <= end);
    onChange(cycle);
  };

  const toggleDay = (d: number) => {
    if (selSet.has(d)) {
      onChange(selected.filter((x) => x !== d));
    } else {
      onChange([...selected, d].sort((a, b) => a - b));
    }
  };

  let buttonLabel = "All Days (1–31)";
  if (selected.length > 0 && selected.length < 31) {
    if (selected.length === 10 && selected[0] === 1 && selected[9] === 10) {
      buttonLabel = "Cycle 1 (Days 1–10)";
    } else if (selected.length === 10 && selected[0] === 11 && selected[9] === 20) {
      buttonLabel = "Cycle 2 (Days 11–20)";
    } else if (selected.length === 11 && selected[0] === 21 && selected[10] === 31) {
      buttonLabel = "Cycle 3 (Days 21–31)";
    } else if (selected.length <= 3) {
      buttonLabel = selected.map((d) => `Day ${d}`).join(", ");
    } else {
      buttonLabel = `${selected.length} Days Selected`;
    }
  }

  const isFiltered = selected.length > 0 && selected.length < 31;

  return (
    <div className={`relative ${open ? "z-50" : "z-10"}`}>
      <label className="block text-[10.5px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
        📅 Target Days (1–31)
      </label>
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center justify-between gap-2 rounded-xl border-2 px-3 py-1.5 text-xs font-black text-left transition-all cursor-pointer shadow-xs ${
          isFiltered
            ? "border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-950 dark:text-amber-200 ring-1 ring-amber-400"
            : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
        }`}
      >
        <span className="truncate max-w-[150px]">{buttonLabel}</span>
        <span className="text-xs text-slate-400 shrink-0">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} />
          <div
            className="absolute left-0 top-full mt-1.5 z-50 w-80 max-w-[95vw] bg-white dark:bg-slate-900 border-2 border-amber-400 dark:border-amber-500 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.35)] p-3 space-y-3 animate-in fade-in zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Quick Cycle Presets */}
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-400">Quick Cycle Presets:</span>
              <div className="grid grid-cols-4 gap-1">
                <button
                  type="button"
                  onClick={() => onChange(allDays)}
                  className="px-2 py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  All 31
                </button>
                <button
                  type="button"
                  onClick={() => setCycle(1, 10)}
                  className="px-2 py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  D1 (1–10)
                </button>
                <button
                  type="button"
                  onClick={() => setCycle(11, 20)}
                  className="px-2 py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  D2 (11–20)
                </button>
                <button
                  type="button"
                  onClick={() => setCycle(21, 31)}
                  className="px-2 py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  D3 (21–31)
                </button>
              </div>
            </div>

            {/* Header with Select All / Clear */}
            <div className="flex items-center justify-between px-1 text-[11px] font-black border-t border-b border-slate-100 dark:border-slate-800 py-1.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onChange(allDays)}
                  className="text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                >
                  Select All
                </button>
                <span className="text-slate-400">·</span>
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                >
                  Clear
                </button>
              </div>
              <span className="text-slate-400 font-mono">
                {selected.length === 0 ? "All (31)" : `${selected.length}/31 Selected`}
              </span>
            </div>

            {/* 31-Day Number Grid */}
            <div className="grid grid-cols-7 gap-1.5">
              {allDays.map((d) => {
                const isSelected = selSet.has(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    className={`py-1.5 rounded-lg text-xs font-mono font-bold transition cursor-pointer border ${
                      isSelected
                        ? "bg-amber-500 border-amber-600 text-white shadow-xs font-black"
                        : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function HeatmapTrendsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Controls & Dimensions
  const [activeDimension, setActiveDimension] = useState<PrimaryDimension>("category_day");
  const [activeMetric, setActiveMetric] = useState<MetricType>("fr");
  
  // Multi-Select & Date Range Filters
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [selectedTrades, setSelectedTrades] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [highlightRanges, setHighlightRanges] = useState<string[]>([]);
  const [skuSearch, setSkuSearch] = useState("");
  
  const [cellDensity, setCellDensity] = useState<"compact" | "normal" | "spacious">("normal");
  const [showValues, setShowValues] = useState<boolean>(true);

  // Single active open dropdown manager
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const toggleDropdown = (name: string) => {
    setActiveDropdown((prev) => (prev === name ? null : name));
  };
  const closeDropdown = () => setActiveDropdown(null);

  // Drill-down Modal State
  const [drillModalOpen, setDrillModalOpen] = useState(false);
  const [selectedCellInfo, setSelectedCellInfo] = useState<{
    rowLabel: string;
    colLabel: string;
    cell: CellData;
  } | null>(null);

  useEffect(() => {
    fetch("/api/data")
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setErr(e.message);
        setLoading(false);
      });
  }, []);

  // PO Number string resolution helper
  const getPoNumberStr = (poIndex: number, dims: Record<string, string[]>) => {
    if (poIndex === undefined || poIndex === null || poIndex < 0) return "—";
    if (dims?.po && dims.po[poIndex] !== undefined) {
      return String(dims.po[poIndex]);
    }
    return `PO-${poIndex}`;
  };

  // Compute actual min/max dates available in dataset
  const datasetDateRange = useMemo(() => {
    if (!data?.rows || data.rows.length === 0) {
      return { minDate: "2026-07-01", maxDate: "2026-09-29" };
    }
    let minD = 99999999;
    let maxD = 0;
    data.rows.forEach((r) => {
      const d = r[11];
      if (d && d > 19000101) {
        if (d < minD) minD = d;
        if (d > maxD) maxD = d;
      }
    });
    const formatYmdToIso = (ymd: number) => {
      const s = String(ymd);
      if (s.length !== 8) return "";
      return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    };
    return {
      minDate: formatYmdToIso(minD) || "2026-07-01",
      maxDate: formatYmdToIso(maxD) || "2026-09-29",
    };
  }, [data]);

  // Dimensions & Options
  const allMonthsOptions = useMemo(() => {
    return (data?.dims?.month || [])
      .filter((m) => m && m !== "#N/A")
      .map((m) => ({ key: m, label: m }));
  }, [data]);

  const allTradeOptions = useMemo(() => {
    return (data?.dims?.trade || [])
      .filter((t) => t && t !== "#N/A")
      .map((t) => ({ key: t, label: t }));
  }, [data]);

  const allCitiesOptions = useMemo(() => {
    return (data?.dims?.city || [])
      .filter((c) => c && c !== "#N/A")
      .map((c) => ({
        key: c,
        label: c,
        badge: lookupDepoByCity(c)?.depo || undefined,
      }));
  }, [data]);

  const allCategoryOptions = useMemo(() => {
    return (data?.dims?.category || [])
      .filter((c) => c && c !== "#N/A")
      .map((c) => ({ key: c, label: c }));
  }, [data]);

  const allStatusOptions = useMemo(
    () => [
      { key: "completed", label: "Completed / Fully Supplied" },
      { key: "open", label: "Open POs" },
      { key: "expired", label: "Expired POs" },
      { key: "grn_done", label: "GRN-Done / Closed" },
      { key: "cancelled", label: "Cancelled POs" },
    ],
    []
  );

  // Filter matched raw rows
  const filteredRows = useMemo(() => {
    if (!data || !data.rows) return [];
    const { dims, rows } = data;

    const startYmd = startDate ? parseInt(startDate.replace(/-/g, ""), 10) : null;
    const endYmd = endDate ? parseInt(endDate.replace(/-/g, ""), 10) : null;

    const monthSet = selectedMonths.length > 0 ? new Set(selectedMonths) : null;
    const tradeSet = selectedTrades.length > 0 ? new Set(selectedTrades) : null;
    const citySet = selectedCities.length > 0 ? new Set(selectedCities) : null;
    const catSet = selectedCategories.length > 0 ? new Set(selectedCategories) : null;
    const statusSet = selectedStatuses.length > 0 ? new Set(selectedStatuses) : null;
    const daySet = selectedDays.length > 0 ? new Set(selectedDays) : null;

    return rows.filter((r) => {
      // Date Range Filter (From Date - To Date)
      if (r[11]) {
        if (startYmd && r[11] < startYmd) return false;
        if (endYmd && r[11] > endYmd) return false;
      }

      // Month Multi-select
      if (monthSet) {
        const m = dims.month?.[r[0]];
        if (!m || !monthSet.has(m)) return false;
      }

      // Trade Multi-select
      if (tradeSet) {
        const t = dims.trade?.[r[1]];
        if (!t || !tradeSet.has(t)) return false;
      }

      // City Multi-select
      if (citySet) {
        const c = dims.city?.[r[3]];
        if (!c || !citySet.has(c)) return false;
      }

      // Category Multi-select
      if (catSet) {
        const cat = dims.category?.[r[4]];
        if (!cat || !catSet.has(cat)) return false;
      }

      // Days Multi-select
      if (daySet && r[11]) {
        const day = r[11] % 100;
        if (!daySet.has(day)) return false;
      }

      // Status Multi-select
      if (statusSet) {
        const rawStatus = (dims.status?.[r[5]] || "").toLowerCase();
        let match = false;
        if (statusSet.has("completed") && (rawStatus.includes("completed") || rawStatus.includes("fully"))) match = true;
        if (statusSet.has("open") && rawStatus.includes("open")) match = true;
        if (statusSet.has("expired") && rawStatus.includes("expired")) match = true;
        if (statusSet.has("grn_done") && (rawStatus.includes("grn_done") || rawStatus.includes("partial") || rawStatus.includes("closed"))) match = true;
        if (statusSet.has("cancelled") && rawStatus.includes("cancel")) match = true;
        if (!match) return false;
      }

      // SKU Search if active in SKU mode
      if (activeDimension === "sku_day" && skuSearch.trim()) {
        const skuRaw = dims.sku?.[r[6]] || "";
        const g = mmdGroup(skuRaw);
        const q = skuSearch.toLowerCase();
        if (!skuRaw.toLowerCase().includes(q) && !g.name.toLowerCase().includes(q) && !g.code.toLowerCase().includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [
    data,
    startDate,
    endDate,
    selectedMonths,
    selectedTrades,
    selectedCities,
    selectedCategories,
    selectedStatuses,
    selectedDays,
    activeDimension,
    skuSearch,
  ]);

  // Overall KPI Summary Statistics
  const overallKPIs = useMemo(() => {
    let totalPoVal = 0;
    let totalGrnVal = 0;
    let totalPoQty = 0;
    let totalGrnQty = 0;
    const poSet = new Set<string>();
    const activeCats = new Set<string>();
    const activeCities = new Set<string>();
    const activeSkus = new Set<string>();
    const dayDemandMap: Record<number, number> = {};

    filteredRows.forEach((r) => {
      const poVal = r[8] || 0;
      const grnVal = r[10] || 0;
      const poQty = r[7] || 0;
      const grnQty = r[9] || 0;
      const day = r[11] ? r[11] % 100 : 0;
      const poNum = getPoNumberStr(r[12], data?.dims || {});

      totalPoVal += poVal;
      totalGrnVal += grnVal;
      totalPoQty += poQty;
      totalGrnQty += grnQty;
      if (poNum && poNum !== "—") poSet.add(poNum);

      if (data?.dims) {
        if (r[4] !== undefined) activeCats.add(data.dims.category[r[4]]);
        if (r[3] !== undefined) activeCities.add(data.dims.city[r[3]]);
        if (r[6] !== undefined) activeSkus.add(data.dims.sku[r[6]]);
      }

      if (day > 0) {
        dayDemandMap[day] = (dayDemandMap[day] || 0) + poVal;
      }
    });

    const gapVal = Math.max(0, totalPoVal - totalGrnVal);
    const fr = totalPoVal > 0 ? (totalGrnVal / totalPoVal) * 100 : 0;

    let peakDay = 0;
    let peakDayVal = 0;
    Object.entries(dayDemandMap).forEach(([d, v]) => {
      if (v > peakDayVal) {
        peakDayVal = v;
        peakDay = parseInt(d, 10);
      }
    });

    return {
      totalPoVal,
      totalGrnVal,
      gapVal,
      totalPoQty,
      totalGrnQty,
      fr,
      poCount: poSet.size,
      activeCatsCount: activeCats.size,
      activeCitiesCount: activeCities.size,
      activeSkusCount: activeSkus.size,
      peakDay,
      peakDayVal,
    };
  }, [filteredRows, data]);

  // Determine Columns and Rows for Active Dimension
  const matrixData = useMemo(() => {
    if (!data || !data.dims) {
      return {
        rowKeys: [],
        colKeys: [],
        colLabels: [],
        grid: new Map<string, CellData>(),
        rowTotals: new Map<string, CellData>(),
        colTotals: new Map<string, CellData>(),
        grandTotal: {
          poVal: 0,
          grnVal: 0,
          gapVal: 0,
          poQty: 0,
          grnQty: 0,
          poCount: 0,
          fr: 0,
          poSet: new Set<string>(),
          skuDetails: [],
        } as CellData,
        minMetric: 0,
        maxMetric: 0,
      };
    }

    const grid = new Map<string, CellData>();
    const rowTotals = new Map<string, CellData>();
    const colTotals = new Map<string, CellData>();
    const grandTotal: CellData = {
      poVal: 0,
      grnVal: 0,
      gapVal: 0,
      poQty: 0,
      grnQty: 0,
      poCount: 0,
      fr: 0,
      poSet: new Set<string>(),
      skuDetails: [],
    };

    // Helper to get or initialize cell data
    const getInitCell = (): CellData => ({
      poVal: 0,
      grnVal: 0,
      gapVal: 0,
      poQty: 0,
      grnQty: 0,
      poCount: 0,
      fr: 0,
      poSet: new Set<string>(),
      skuDetails: [],
    });

    const addRecordToCell = (cell: CellData, r: number[]) => {
      const poVal = r[8] || 0;
      const grnVal = r[10] || 0;
      const poQty = r[7] || 0;
      const grnQty = r[9] || 0;
      const poNum = getPoNumberStr(r[12], data.dims);
      const skuRaw = data.dims.sku?.[r[6]] || "";
      const g = mmdGroup(skuRaw);
      const cat = data.dims.category?.[r[4]] || "";
      const city = data.dims.city?.[r[3]] || "";
      const status = data.dims.status?.[r[5]] || "Completed";
      const day = r[11] ? r[11] % 100 : 0;
      const dateYmd = r[11] || 0;

      cell.poVal += poVal;
      cell.grnVal += grnVal;
      cell.poQty += poQty;
      cell.grnQty += grnQty;
      if (poNum && poNum !== "—") cell.poSet.add(poNum);

      cell.skuDetails.push({
        skuName: g.name || skuRaw,
        code: g.code || "—",
        category: cat,
        poNum,
        poQty,
        grnQty,
        poVal,
        grnVal,
        gapVal: Math.max(0, poVal - grnVal),
        fr: poVal > 0 ? (grnVal / poVal) * 100 : 0,
        status,
        city,
        day,
        dateYmd,
      });
    };

    const finalizeCell = (cell: CellData) => {
      cell.gapVal = Math.max(0, cell.poVal - cell.grnVal);
      cell.poCount = cell.poSet.size;
      cell.fr = cell.poVal > 0 ? (cell.grnVal / cell.poVal) * 100 : 0;
    };

    let rowKeys: string[] = [];
    let colKeys: string[] = [];
    let colLabels: { key: string; label: string; subLabel?: string }[] = [];

    // Distinct discovery sets
    const distinctDays = new Set<number>();
    const distinctDateYmds = new Set<number>();
    const distinctCats = new Set<string>();
    const distinctCities = new Set<string>();
    const distinctSkus = new Set<string>();

    filteredRows.forEach((r) => {
      const day = r[11] ? r[11] % 100 : 0;
      const dateYmd = r[11] || 0;
      if (day > 0) distinctDays.add(day);
      if (dateYmd > 0) distinctDateYmds.add(dateYmd);
      if (r[4] !== undefined) distinctCats.add(data.dims.category[r[4]]);
      if (r[3] !== undefined) distinctCities.add(data.dims.city[r[3]]);
      if (r[6] !== undefined) {
        const skuRaw = data.dims.sku[r[6]];
        const g = mmdGroup(skuRaw);
        distinctSkus.add(g.name || skuRaw);
      }
    });

    // Check if the current filter spans across multiple months
    const isMultiMonthSpan = (() => {
      if (!startDate || !endDate) return false;
      const startMonth = startDate.slice(0, 7);
      const endMonth = endDate.slice(0, 7);
      return startMonth !== endMonth;
    })();

    // Structure Rows and Columns based on Active Dimension
    if (activeDimension === "category_day") {
      rowKeys = Array.from(distinctCats).sort();
      if (isMultiMonthSpan) {
        const sortedYmds = Array.from(distinctDateYmds).sort((a, b) => a - b);
        colKeys = sortedYmds.map(String);
        colLabels = sortedYmds.map((ymd) => {
          const s = String(ymd);
          const dStr = s.slice(6, 8);
          const mNum = parseInt(s.slice(4, 6), 10);
          const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          const mStr = months[mNum - 1] || "";
          return {
            key: String(ymd),
            label: `${dStr} ${mStr}`,
            subLabel: s.slice(0, 4),
          };
        });
      } else {
        const sortedDays = Array.from(distinctDays).sort((a, b) => a - b);
        colKeys = sortedDays.map((d) => String(d));
        colLabels = sortedDays.map((d) => {
          let decLabel = "D1";
          if (d > 20) decLabel = "D3";
          else if (d > 10) decLabel = "D2";
          return {
            key: String(d),
            label: `Day ${d < 10 ? "0" + d : d}`,
            subLabel: decLabel,
          };
        });
      }
    } else if (activeDimension === "category_city") {
      rowKeys = Array.from(distinctCats).sort();
      colKeys = Array.from(distinctCities).sort();
      colLabels = colKeys.map((c) => ({
        key: c,
        label: c,
        subLabel: lookupDepoByCity(c)?.depo || "Depot",
      }));
    } else if (activeDimension === "city_day") {
      rowKeys = Array.from(distinctCities).sort();
      if (isMultiMonthSpan) {
        const sortedYmds = Array.from(distinctDateYmds).sort((a, b) => a - b);
        colKeys = sortedYmds.map(String);
        colLabels = sortedYmds.map((ymd) => {
          const s = String(ymd);
          const dStr = s.slice(6, 8);
          const mNum = parseInt(s.slice(4, 6), 10);
          const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          const mStr = months[mNum - 1] || "";
          return {
            key: String(ymd),
            label: `${dStr} ${mStr}`,
            subLabel: s.slice(0, 4),
          };
        });
      } else {
        const sortedDays = Array.from(distinctDays).sort((a, b) => a - b);
        colKeys = sortedDays.map((d) => String(d));
        colLabels = sortedDays.map((d) => {
          let decLabel = "D1";
          if (d > 20) decLabel = "D3";
          else if (d > 10) decLabel = "D2";
          return {
            key: String(d),
            label: `Day ${d < 10 ? "0" + d : d}`,
            subLabel: decLabel,
          };
        });
      }
    } else if (activeDimension === "city_category") {
      rowKeys = Array.from(distinctCities).sort();
      colKeys = Array.from(distinctCats).sort();
      colLabels = colKeys.map((c) => ({
        key: c,
        label: c,
      }));
    } else if (activeDimension === "sku_day") {
      rowKeys = Array.from(distinctSkus).sort();
      if (isMultiMonthSpan) {
        const sortedYmds = Array.from(distinctDateYmds).sort((a, b) => a - b);
        colKeys = sortedYmds.map(String);
        colLabels = sortedYmds.map((ymd) => {
          const s = String(ymd);
          const dStr = s.slice(6, 8);
          const mNum = parseInt(s.slice(4, 6), 10);
          const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          const mStr = months[mNum - 1] || "";
          return {
            key: String(ymd),
            label: `${dStr} ${mStr}`,
          };
        });
      } else {
        const sortedDays = Array.from(distinctDays).sort((a, b) => a - b);
        colKeys = sortedDays.map((d) => String(d));
        colLabels = sortedDays.map((d) => ({
          key: String(d),
          label: `Day ${d < 10 ? "0" + d : d}`,
        }));
      }
    }

    // Populate Matrix Cells
    filteredRows.forEach((r) => {
      let rKey = "";
      let cKey = "";
      const day = r[11] ? String(r[11] % 100) : "0";
      const dateYmd = r[11] ? String(r[11]) : "0";
      const cat = data.dims.category?.[r[4]] || "Other";
      const city = data.dims.city?.[r[3]] || "Unknown";
      const skuRaw = data.dims.sku?.[r[6]] || "SKU";
      const sku = mmdGroup(skuRaw).name || skuRaw;

      const timeKey = isMultiMonthSpan ? dateYmd : day;

      if (activeDimension === "category_day") {
        rKey = cat;
        cKey = timeKey;
      } else if (activeDimension === "category_city") {
        rKey = cat;
        cKey = city;
      } else if (activeDimension === "city_day") {
        rKey = city;
        cKey = timeKey;
      } else if (activeDimension === "city_category") {
        rKey = city;
        cKey = cat;
      } else if (activeDimension === "sku_day") {
        rKey = sku;
        cKey = timeKey;
      }

      if (!rKey || !cKey) return;

      const cellKey = `${rKey}:::${cKey}`;
      if (!grid.has(cellKey)) grid.set(cellKey, getInitCell());
      if (!rowTotals.has(rKey)) rowTotals.set(rKey, getInitCell());
      if (!colTotals.has(cKey)) colTotals.set(cKey, getInitCell());

      addRecordToCell(grid.get(cellKey)!, r);
      addRecordToCell(rowTotals.get(rKey)!, r);
      addRecordToCell(colTotals.get(cKey)!, r);
      addRecordToCell(grandTotal, r);
    });

    // Finalize Calculations for all cells
    grid.forEach((c) => finalizeCell(c));
    rowTotals.forEach((c) => finalizeCell(c));
    colTotals.forEach((c) => finalizeCell(c));
    finalizeCell(grandTotal);

    // Calculate Min & Max for active metric color scale
    let minMetric = Infinity;
    let maxMetric = -Infinity;

    grid.forEach((cell) => {
      const v = getCellMetricValue(cell, activeMetric);
      if (v < minMetric) minMetric = v;
      if (v > maxMetric) maxMetric = v;
    });

    if (minMetric === Infinity) minMetric = 0;
    if (maxMetric === -Infinity) maxMetric = 1;

    return {
      rowKeys,
      colKeys,
      colLabels,
      grid,
      rowTotals,
      colTotals,
      grandTotal,
      minMetric,
      maxMetric,
    };
  }, [data, filteredRows, activeDimension, activeMetric, startDate, endDate]);

  // Helper to get raw numerical value for a metric from CellData
  function getCellMetricValue(cell: CellData | undefined, metric: MetricType): number {
    if (!cell) return 0;
    switch (metric) {
      case "fr":
        return cell.poVal > 0 ? (cell.grnVal / cell.poVal) * 100 : 0;
      case "poVal":
        return cell.poVal;
      case "grnVal":
        return cell.grnVal;
      case "gapVal":
        return cell.gapVal;
      case "poQty":
        return cell.poQty;
      case "grnQty":
        return cell.grnQty;
      case "poCount":
        return cell.poCount;
      default:
        return 0;
    }
  }

  // Format metric number for display
  const formatMetricDisplay = (val: number, metric: MetricType): string => {
    if (val === 0) return "—";
    switch (metric) {
      case "fr":
        return `${val.toFixed(1)}%`;
      case "poVal":
      case "grnVal":
      case "gapVal":
        return val >= 10 ? `₹${val.toFixed(1)}L` : `₹${val.toFixed(2)}L`;
      case "poQty":
      case "grnQty":
        return val >= 1000 ? `${(val / 1000).toFixed(1)}k` : String(Math.round(val));
      case "poCount":
        return String(val);
      default:
        return String(val);
    }
  };

  // Compute Heatmap Cell Background & Text Color
  const getCellColorClass = (cell: CellData | undefined, metric: MetricType): string => {
    if (!cell || cell.poVal === 0) {
      return "bg-slate-100/60 dark:bg-slate-900/40 text-slate-400 dark:text-slate-600 border border-slate-200/50 dark:border-slate-800/40";
    }

    const val = getCellMetricValue(cell, metric);

    // 1. FILL RATE % HEATMAP COLOR SCALE
    if (metric === "fr") {
      if (val >= 95) {
        return "bg-emerald-600 dark:bg-emerald-700 text-white font-black shadow-xs border border-emerald-500";
      }
      if (val >= 90) {
        return "bg-emerald-500 dark:bg-emerald-600 text-white font-extrabold border border-emerald-400";
      }
      if (val >= 80) {
        return "bg-lime-500 dark:bg-lime-600 text-slate-950 font-bold border border-lime-400";
      }
      if (val >= 70) {
        return "bg-amber-400 dark:bg-amber-500 text-slate-950 font-extrabold border border-amber-300 ring-1 ring-amber-400/40";
      }
      if (val >= 50) {
        return "bg-orange-500 dark:bg-orange-600 text-white font-bold border border-orange-400";
      }
      if (val > 0) {
        return "bg-rose-600 dark:bg-rose-700 text-white font-black border border-rose-500 animate-pulse-slow";
      }
      return "bg-red-800 dark:bg-red-900 text-white font-black border border-red-700";
    }

    // 2. GAP VALUE (ALERT SHORTFALL THEME)
    if (metric === "gapVal") {
      if (val === 0) return "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-medium";
      if (val < 0.2) return "bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 font-semibold";
      if (val < 1.0) return "bg-orange-300 dark:bg-orange-700 text-slate-950 dark:text-white font-bold";
      if (val < 3.0) return "bg-rose-500 dark:bg-rose-600 text-white font-black shadow-xs";
      return "bg-rose-700 dark:bg-rose-800 text-white font-black shadow-sm ring-1 ring-rose-400";
    }

    // 3. VALUE INTENSITY GRADIENTS (PO Value, GRN Value, Qty, Count)
    const { minMetric, maxMetric } = matrixData;
    const range = maxMetric - minMetric || 1;
    const ratio = Math.max(0, Math.min(1, (val - minMetric) / range));

    if (metric === "poVal") {
      if (ratio > 0.8) return "bg-indigo-700 dark:bg-indigo-600 text-white font-black shadow-sm ring-1 ring-cyan-400";
      if (ratio > 0.5) return "bg-indigo-500 dark:bg-indigo-500 text-white font-bold";
      if (ratio > 0.25) return "bg-cyan-500/80 dark:bg-cyan-600 text-slate-950 dark:text-white font-semibold";
      if (ratio > 0.1) return "bg-cyan-200 dark:bg-cyan-900/80 text-cyan-950 dark:text-cyan-200";
      return "bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-300";
    }

    if (metric === "grnVal") {
      if (ratio > 0.8) return "bg-teal-700 dark:bg-teal-600 text-white font-black shadow-sm";
      if (ratio > 0.5) return "bg-teal-500 dark:bg-teal-500 text-white font-bold";
      if (ratio > 0.25) return "bg-emerald-300 dark:bg-emerald-800 text-slate-950 dark:text-white font-semibold";
      if (ratio > 0.1) return "bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-300";
      return "bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-300";
    }

    // Fallback for Qty & Count
    if (ratio > 0.75) return "bg-blue-600 text-white font-bold";
    if (ratio > 0.4) return "bg-sky-400 text-slate-950 font-semibold";
    if (ratio > 0.15) return "bg-sky-200 dark:bg-sky-900 text-slate-900 dark:text-white";
    return "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300";
  };

  // Check if cell matches currently active highlight filter
  const isCellHighlighted = (cell: CellData | undefined): boolean => {
    if (highlightRanges.length === 0) return true;
    if (!cell || cell.poVal === 0) return highlightRanges.includes("zero_demand");

    const val = getCellMetricValue(cell, activeMetric);
    return highlightRanges.some((rangeKey) => {
      if (rangeKey === "perfect") return val >= 99.99;
      if (rangeKey === "optimal") return val >= 90;
      if (rangeKey === "warning") return val >= 75 && val < 90;
      if (rangeKey === "critical") return (val < 75 && cell.poVal > 0) || cell.gapVal > 1.0;
      if (rangeKey === "high_gap") return cell.gapVal >= 0.5;
      if (rangeKey === "high_val") return cell.poVal >= 2.0;
      if (rangeKey === "zero_demand") return cell.poVal === 0;
      return true;
    });
  };

  const toggleHighlightRange = (rangeKey: string) => {
    if (rangeKey === "all") {
      setHighlightRanges([]);
      return;
    }
    if (highlightRanges.includes(rangeKey)) {
      setHighlightRanges(highlightRanges.filter((k) => k !== rangeKey));
    } else {
      setHighlightRanges([...highlightRanges, rangeKey]);
    }
  };

  // Export Matrix to CSV
  const handleExportCsv = () => {
    if (!matrixData || matrixData.rowKeys.length === 0) return;

    const headers = [
      activeDimension.toUpperCase(),
      ...matrixData.colLabels.map((c) => `"${c.label}"`),
      "TOTAL DEMAND (L)",
      "TOTAL SUPPLY (L)",
      "TOTAL GAP (L)",
      "AVG FILL RATE %",
    ];

    const csvRows: string[] = [headers.join(",")];

    matrixData.rowKeys.forEach((rKey) => {
      const rTotal = matrixData.rowTotals.get(rKey);
      const rowCols = [
        `"${rKey.replace(/"/g, '""')}"`,
        ...matrixData.colKeys.map((cKey) => {
          const cell = matrixData.grid.get(`${rKey}:::${cKey}`);
          const val = getCellMetricValue(cell, activeMetric);
          return val > 0 ? val.toFixed(2) : "0";
        }),
        rTotal ? rTotal.poVal.toFixed(2) : "0",
        rTotal ? rTotal.grnVal.toFixed(2) : "0",
        rTotal ? rTotal.gapVal.toFixed(2) : "0",
        rTotal ? rTotal.fr.toFixed(1) : "0",
      ];
      csvRows.push(rowCols.join(","));
    });

    const csvString = "data:text/csv;charset=utf-8," + encodeURIComponent(csvRows.join("\n"));
    const link = document.createElement("a");
    link.setAttribute("href", csvString);
    link.setAttribute("download", `MilkyMist_Heatmap_${activeDimension}_${activeMetric}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCellClick = (rKey: string, cKey: string, cell: CellData | undefined) => {
    if (!cell || cell.poVal === 0) return;
    const colFound = matrixData.colLabels.find((c) => c.key === cKey);
    setSelectedCellInfo({
      rowLabel: rKey,
      colLabel: colFound ? colFound.label : cKey,
      cell,
    });
    setDrillModalOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[600px] text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <span className="font-bold text-sm">Generating Interactive Heatmap Analytics Matrix…</span>
        </div>
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="p-8 text-rose-500 bg-rose-500/10 rounded-2xl border border-rose-500/20 m-6">
        Error loading dataset: {err}
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-4 max-w-[1900px] mx-auto space-y-4 font-sans text-slate-900 dark:text-white">
      {/* ── TOP HEADER & KPI BANNER ── */}
      <div className="bg-gradient-to-r from-[#030d22] via-[#091b3e] to-[#04122c] text-white rounded-3xl p-5 shadow-2xl border-2 border-amber-500/30 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-amber-500/20 pb-4">
          <div className="flex items-center gap-3.5 flex-wrap">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-2xl shadow-lg shadow-amber-500/20">
              🔥
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                  Multi-Dimensional Heatmap Trends & Matrix Analytics
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-400 text-slate-950 uppercase tracking-wide">
                  LIVE ENGINE v17
                </span>
              </div>
              <p className="text-xs text-amber-200/80 font-medium mt-0.5">
                Visual Intensity & Range Distribution across Day-Wise, Category-Wise, and City-Wise fulfillment rhythms
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={handleExportCsv}
              className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition flex items-center gap-1.5 border border-white/20 shadow-xs cursor-pointer active:scale-95"
              title="Export visible matrix table to CSV spreadsheet"
            >
              <span>📥</span> Export Matrix CSV
            </button>
            <Link
              href="/dashboard/opportunity"
              className="px-3.5 py-2 rounded-xl bg-purple-600/80 hover:bg-purple-500 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-xs"
            >
              <span>🎯</span> Opportunity Suite
            </Link>
            <Link
              href="/dashboard/trending-analysis"
              className="px-3.5 py-2 rounded-xl bg-indigo-600/80 hover:bg-indigo-500 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-xs"
            >
              <span>📈</span> Trending Curves
            </Link>
            <Link
              href="/dashboard/city-sku"
              className="px-3.5 py-2 rounded-xl bg-sky-600/80 hover:bg-sky-500 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-xs"
            >
              <span>🏙️</span> City SKU View
            </Link>
          </div>
        </div>

        {/* 6 Executive KPI Metric Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          <div className="p-3 rounded-2xl bg-[#061530]/90 border border-amber-500/30">
            <div className="text-[10px] uppercase font-bold tracking-wider text-amber-300">Total PO Demand</div>
            <div className="text-lg font-black text-white mt-0.5">
              ₹{overallKPIs.totalPoVal.toFixed(2)} <span className="text-xs font-semibold text-amber-400">Lakhs</span>
            </div>
            <div className="text-[10.5px] font-mono text-slate-400 mt-0.5">{overallKPIs.poCount} Total PO Orders</div>
          </div>

          <div className="p-3 rounded-2xl bg-[#061530]/90 border border-emerald-500/30">
            <div className="text-[10px] uppercase font-bold tracking-wider text-emerald-300">Total Fulfilled GRN</div>
            <div className="text-lg font-black text-emerald-400 mt-0.5">
              ₹{overallKPIs.totalGrnVal.toFixed(2)} <span className="text-xs font-semibold text-emerald-300">Lakhs</span>
            </div>
            <div className="text-[10.5px] font-mono text-slate-400 mt-0.5">{Math.round(overallKPIs.totalGrnQty).toLocaleString()} Units Supplied</div>
          </div>

          <div className="p-3 rounded-2xl bg-[#061530]/90 border border-cyan-500/30">
            <div className="text-[10px] uppercase font-bold tracking-wider text-cyan-300">Overall Fill Rate</div>
            <div className={`text-xl font-black mt-0.5 ${
              overallKPIs.fr >= 90 ? "text-emerald-400" : overallKPIs.fr >= 75 ? "text-amber-400" : "text-rose-400"
            }`}>
              {overallKPIs.fr.toFixed(1)}%
            </div>
            <div className="text-[10.5px] font-semibold text-slate-400 mt-0.5">
              {overallKPIs.fr >= 90 ? "🟢 Healthy Fulfillment" : "⚠️ Supply Action Needed"}
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-[#061530]/90 border border-rose-500/30">
            <div className="text-[10px] uppercase font-bold tracking-wider text-rose-300">Total Supply Gap</div>
            <div className="text-lg font-black text-rose-400 mt-0.5">
              ₹{overallKPIs.gapVal.toFixed(2)} <span className="text-xs font-semibold text-rose-300">Lakhs</span>
            </div>
            <div className="text-[10.5px] font-mono text-slate-400 mt-0.5">Unsupplied Shortfall</div>
          </div>

          <div className="p-3 rounded-2xl bg-[#061530]/90 border border-indigo-500/30">
            <div className="text-[10px] uppercase font-bold tracking-wider text-indigo-300">Peak Demand Day</div>
            <div className="text-lg font-black text-white mt-0.5">
              {overallKPIs.peakDay > 0 ? `Day ${overallKPIs.peakDay}` : "—"}
            </div>
            <div className="text-[10.5px] font-mono text-cyan-300 mt-0.5">
              {overallKPIs.peakDayVal > 0 ? `₹${overallKPIs.peakDayVal.toFixed(2)} Lakhs` : "—"}
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-[#061530]/90 border border-purple-500/30">
            <div className="text-[10px] uppercase font-bold tracking-wider text-purple-300">Scope Coverage</div>
            <div className="text-sm font-black text-white mt-1">
              {overallKPIs.activeCatsCount} Cats · {overallKPIs.activeCitiesCount} Cities
            </div>
            <div className="text-[10.5px] font-mono text-slate-400 mt-0.5">
              {overallKPIs.activeSkusCount} Active Unique SKUs
            </div>
          </div>
        </div>
      </div>

      {/* ── MASTER CONTROL BAR: TABS, METRICS & FILTERS ── */}
      <div className="bg-white dark:bg-[#000d2b] p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        {/* Dimension Switcher Tabs (4 Heatmap Modes) */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-black uppercase text-slate-400 mr-1">Heatmap Dimension:</span>
            <button
              onClick={() => setActiveDimension("category_day")}
              className={`px-3.5 py-1.5 rounded-xl font-black text-xs transition cursor-pointer flex items-center gap-1.5 ${
                activeDimension === "category_day"
                  ? "bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md ring-2 ring-amber-400/40"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              <span>📅</span> 1. Category × Day-Wise Trend
            </button>
            <button
              onClick={() => setActiveDimension("category_city")}
              className={`px-3.5 py-1.5 rounded-xl font-black text-xs transition cursor-pointer flex items-center gap-1.5 ${
                activeDimension === "category_city"
                  ? "bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-md ring-2 ring-cyan-400/40"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              <span>🏷️</span> 2. Category × City Geographic Matrix
            </button>
            <button
              onClick={() => setActiveDimension("city_day")}
              className={`px-3.5 py-1.5 rounded-xl font-black text-xs transition cursor-pointer flex items-center gap-1.5 ${
                activeDimension === "city_day"
                  ? "bg-gradient-to-r from-teal-600 to-emerald-700 text-white shadow-md ring-2 ring-emerald-400/40"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              <span>🏙️</span> 3. City × Day-Wise Rhythm
            </button>
            <button
              onClick={() => setActiveDimension("sku_day")}
              className={`px-3.5 py-1.5 rounded-xl font-black text-xs transition cursor-pointer flex items-center gap-1.5 ${
                activeDimension === "sku_day"
                  ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md ring-2 ring-purple-400/40"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              <span>🔍</span> 4. Granular SKU × Day Matrix
            </button>
          </div>

          {/* Metric Selector Pills */}
          <div className="flex items-center gap-1 flex-wrap bg-slate-100 dark:bg-slate-900/80 p-1 rounded-2xl border border-slate-200 dark:border-slate-800">
            <span className="text-[10.5px] font-black uppercase text-slate-400 px-2">Metric:</span>
            {[
              { key: "fr", label: "📈 Fill Rate %" },
              { key: "poVal", label: "💰 Demand (₹L)" },
              { key: "grnVal", label: "🚚 Supplied (₹L)" },
              { key: "gapVal", label: "⚠️ Gap (₹L)" },
              { key: "poQty", label: "📦 Units" },
              { key: "poCount", label: "📋 POs" },
            ].map((m) => (
              <button
                key={m.key}
                onClick={() => setActiveMetric(m.key as MetricType)}
                className={`px-2.5 py-1 rounded-xl text-xs font-black transition cursor-pointer ${
                  activeMetric === m.key
                    ? "bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-xs ring-1 ring-slate-300 dark:ring-slate-700"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filter Controls Row (6 Multi-Select & Range Dropdowns) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
          {/* 1. Month Date Range Dropdown with 1-Click Presets & Custom Pickers */}
          <DateRangeDropdown
            startDate={startDate}
            endDate={endDate}
            minDate={datasetDateRange.minDate}
            maxDate={datasetDateRange.maxDate}
            onRangeChange={(start, end) => {
              setStartDate(start);
              setEndDate(end);
            }}
            open={activeDropdown === "dateRange"}
            onToggle={() => toggleDropdown("dateRange")}
            onClose={closeDropdown}
          />

          {/* 2. Multi-Select Trade Channel */}
          <MultiSelectDropdown
            label="🏢 Trade Channels"
            options={allTradeOptions}
            selected={selectedTrades}
            onChange={setSelectedTrades}
            open={activeDropdown === "trade"}
            onToggle={() => toggleDropdown("trade")}
            onClose={closeDropdown}
            searchPlaceholder="Search channels..."
            allLabel="All Channels"
          />

          {/* 3. Multi-Select City / Depot */}
          <MultiSelectDropdown
            label="📍 Cities / Depots"
            options={allCitiesOptions}
            selected={selectedCities}
            onChange={setSelectedCities}
            open={activeDropdown === "city"}
            onToggle={() => toggleDropdown("city")}
            onClose={closeDropdown}
            searchPlaceholder="Search city or depot code..."
            allLabel="All Cities"
          />

          {/* 4. Multi-Select Category */}
          <MultiSelectDropdown
            label="🏷️ Product Categories"
            options={allCategoryOptions}
            selected={selectedCategories}
            onChange={setSelectedCategories}
            open={activeDropdown === "category"}
            onToggle={() => toggleDropdown("category")}
            onClose={closeDropdown}
            searchPlaceholder="Search categories..."
            allLabel="All Categories"
          />

          {/* 5. Multi-Select Days (1–31) with Cycle Presets */}
          <DayMultiSelectDropdown
            selected={selectedDays}
            onChange={setSelectedDays}
            open={activeDropdown === "day"}
            onToggle={() => toggleDropdown("day")}
            onClose={closeDropdown}
          />

          {/* 6. Multi-Select PO Status */}
          <MultiSelectDropdown
            label="🚦 PO Statuses"
            options={allStatusOptions}
            selected={selectedStatuses}
            onChange={setSelectedStatuses}
            open={activeDropdown === "status"}
            onToggle={() => toggleDropdown("status")}
            onClose={closeDropdown}
            searchPlaceholder="Search status..."
            allLabel="All Statuses"
          />
        </div>

        {/* Active Filter Pills Bar (Shows when any filter is active) */}
        {(startDate ||
          endDate ||
          selectedMonths.length > 0 ||
          selectedTrades.length > 0 ||
          selectedCities.length > 0 ||
          selectedCategories.length > 0 ||
          selectedStatuses.length > 0 ||
          (selectedDays.length > 0 && selectedDays.length < 31) ||
          highlightRanges.length > 0 ||
          skuSearch.trim()) && (
          <div className="flex items-center gap-2 flex-wrap pt-2 pb-1 border-t border-slate-100 dark:border-slate-800/80 text-xs">
            <span className="font-extrabold uppercase text-[10px] text-slate-400">Active Filters:</span>
            
            {(startDate || endDate) && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 font-bold text-[11px] border border-amber-300 dark:border-amber-800">
                🗓️ {startDate === "2026-09-01" && endDate === "2026-09-29" ? "Sep 2026 (MTD)" : startDate === "2026-08-01" && endDate === "2026-08-31" ? "August 2026" : startDate === "2026-07-01" && endDate === "2026-07-31" ? "July 2026" : `${startDate || "Start"} → ${endDate || "End"}`}
                <button
                  type="button"
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                  }}
                  className="hover:text-rose-600 font-black ml-0.5 cursor-pointer"
                  title="Clear date range"
                >
                  ✕
                </button>
              </span>
            )}

            {selectedMonths.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 font-bold text-[11px] border border-amber-300 dark:border-amber-800">
                🗓️ {selectedMonths.length === 1 ? selectedMonths[0] : `${selectedMonths.length} Months`}
                <button
                  type="button"
                  onClick={() => setSelectedMonths([])}
                  className="hover:text-rose-600 font-black ml-0.5 cursor-pointer"
                >
                  ✕
                </button>
              </span>
            )}

            {selectedTrades.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-100 dark:bg-blue-950/70 text-blue-900 dark:text-blue-200 font-bold text-[11px] border border-blue-300 dark:border-blue-800">
                🏢 {selectedTrades.length === 1 ? selectedTrades[0] : `${selectedTrades.length} Channels`}
                <button
                  type="button"
                  onClick={() => setSelectedTrades([])}
                  className="hover:text-rose-600 font-black ml-0.5 cursor-pointer"
                >
                  ✕
                </button>
              </span>
            )}

            {selectedCities.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-950/70 text-indigo-900 dark:text-indigo-200 font-bold text-[11px] border border-indigo-300 dark:border-indigo-800">
                📍 {selectedCities.length === 1 ? selectedCities[0] : `${selectedCities.length} Cities`}
                <button
                  type="button"
                  onClick={() => setSelectedCities([])}
                  className="hover:text-rose-600 font-black ml-0.5 cursor-pointer"
                >
                  ✕
                </button>
              </span>
            )}

            {selectedCategories.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-100 dark:bg-purple-950/70 text-purple-900 dark:text-purple-200 font-bold text-[11px] border border-purple-300 dark:border-purple-800">
                🏷️ {selectedCategories.length === 1 ? selectedCategories[0] : `${selectedCategories.length} Categories`}
                <button
                  type="button"
                  onClick={() => setSelectedCategories([])}
                  className="hover:text-rose-600 font-black ml-0.5 cursor-pointer"
                >
                  ✕
                </button>
              </span>
            )}

            {selectedDays.length > 0 && selectedDays.length < 31 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-100 dark:bg-teal-950/70 text-teal-900 dark:text-teal-200 font-bold text-[11px] border border-teal-300 dark:border-teal-800">
                📅 {selectedDays.length === 10 && selectedDays[0] === 1 ? "Cycle 1 (Days 1–10)" : selectedDays.length === 10 && selectedDays[0] === 11 ? "Cycle 2 (Days 11–20)" : selectedDays.length === 11 && selectedDays[0] === 21 ? "Cycle 3 (Days 21–31)" : `${selectedDays.length} Days`}
                <button
                  type="button"
                  onClick={() => setSelectedDays([])}
                  className="hover:text-rose-600 font-black ml-0.5 cursor-pointer"
                >
                  ✕
                </button>
              </span>
            )}

            {selectedStatuses.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-200 font-bold text-[11px] border border-emerald-300 dark:border-emerald-800">
                🚦 {selectedStatuses.length === 1 ? selectedStatuses[0].toUpperCase() : `${selectedStatuses.length} Statuses`}
                <button
                  type="button"
                  onClick={() => setSelectedStatuses([])}
                  className="hover:text-rose-600 font-black ml-0.5 cursor-pointer"
                >
                  ✕
                </button>
              </span>
            )}

            {highlightRanges.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-100 dark:bg-rose-950/70 text-rose-900 dark:text-rose-200 font-bold text-[11px] border border-rose-300 dark:border-rose-800">
                🔥 {highlightRanges.length} Range Bins
                <button
                  type="button"
                  onClick={() => setHighlightRanges([])}
                  className="hover:text-rose-600 font-black ml-0.5 cursor-pointer"
                >
                  ✕
                </button>
              </span>
            )}

            {skuSearch.trim() && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-[11px] border border-slate-300 dark:border-slate-700">
                🔍 &ldquo;{skuSearch}&rdquo;
                <button
                  type="button"
                  onClick={() => setSkuSearch("")}
                  className="hover:text-rose-600 font-black ml-0.5 cursor-pointer"
                >
                  ✕
                </button>
              </span>
            )}

            <button
              type="button"
              onClick={() => {
                setStartDate("");
                setEndDate("");
                setSelectedMonths([]);
                setSelectedTrades([]);
                setSelectedCities([]);
                setSelectedCategories([]);
                setSelectedStatuses([]);
                setSelectedDays([]);
                setHighlightRanges([]);
                setSkuSearch("");
              }}
              className="text-[11px] font-black text-rose-600 dark:text-rose-400 hover:underline px-2 py-0.5 rounded cursor-pointer"
            >
              Reset All Filters
            </button>
          </div>
        )}

        {/* Secondary Options: SKU Search & Multi-Range Highlighter */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          {/* Dynamic Range Legend with Multi-Select Click-to-Highlight */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-slate-500 dark:text-slate-400 text-[11px]">Multi-Select Range Filter:</span>
            {activeMetric === "fr" ? (
              <>
                <button
                  type="button"
                  onClick={() => toggleHighlightRange("all")}
                  className={`px-2 py-0.5 rounded-lg text-[10.5px] font-black transition cursor-pointer ${
                    highlightRanges.length === 0
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-xs"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
                  }`}
                >
                  All Ranges
                </button>
                <button
                  type="button"
                  onClick={() => toggleHighlightRange("perfect")}
                  className={`px-2 py-0.5 rounded-lg text-[10.5px] font-black transition cursor-pointer flex items-center gap-1 border ${
                    highlightRanges.includes("perfect")
                      ? "ring-2 ring-emerald-400 bg-emerald-600 text-white border-emerald-500 font-black shadow-xs"
                      : "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-900 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> 100% (Perfect)
                </button>
                <button
                  type="button"
                  onClick={() => toggleHighlightRange("optimal")}
                  className={`px-2 py-0.5 rounded-lg text-[10.5px] font-black transition cursor-pointer flex items-center gap-1 border ${
                    highlightRanges.includes("optimal")
                      ? "ring-2 ring-emerald-500 bg-emerald-500 text-white border-emerald-600 font-black shadow-xs"
                      : "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> ≥ 90% (Optimal)
                </button>
                <button
                  type="button"
                  onClick={() => toggleHighlightRange("warning")}
                  className={`px-2 py-0.5 rounded-lg text-[10.5px] font-black transition cursor-pointer flex items-center gap-1 border ${
                    highlightRanges.includes("warning")
                      ? "ring-2 ring-amber-500 bg-amber-400 text-slate-950 border-amber-500 font-black shadow-xs"
                      : "bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 border-amber-200 dark:border-amber-900"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> 75–89.9% (Warning)
                </button>
                <button
                  type="button"
                  onClick={() => toggleHighlightRange("critical")}
                  className={`px-2 py-0.5 rounded-lg text-[10.5px] font-black transition cursor-pointer flex items-center gap-1 border ${
                    highlightRanges.includes("critical")
                      ? "ring-2 ring-rose-500 bg-rose-600 text-white border-rose-600 font-black shadow-xs"
                      : "bg-rose-100 dark:bg-rose-950 text-rose-900 dark:text-rose-200 border-rose-200 dark:border-rose-900"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" /> &lt; 75% (Critical Shortfall)
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => toggleHighlightRange("all")}
                  className={`px-2 py-0.5 rounded-lg text-[10.5px] font-black transition cursor-pointer ${
                    highlightRanges.length === 0
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-xs"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  All Values
                </button>
                <button
                  type="button"
                  onClick={() => toggleHighlightRange("high_gap")}
                  className={`px-2 py-0.5 rounded-lg text-[10.5px] font-black transition cursor-pointer ${
                    highlightRanges.includes("high_gap")
                      ? "bg-rose-600 text-white font-black ring-2 ring-rose-400"
                      : "bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300"
                  }`}
                >
                  ⚠️ High Gap (&gt;₹0.5L)
                </button>
                <button
                  type="button"
                  onClick={() => toggleHighlightRange("high_val")}
                  className={`px-2 py-0.5 rounded-lg text-[10.5px] font-black transition cursor-pointer ${
                    highlightRanges.includes("high_val")
                      ? "bg-indigo-600 text-white font-black ring-2 ring-indigo-400"
                      : "bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300"
                  }`}
                >
                  🔥 High Demand (&gt;₹2.0L)
                </button>
              </>
            )}
          </div>

          {/* View Toggles & SKU Search */}
          <div className="flex items-center gap-3 flex-wrap">
            {activeDimension === "sku_day" && (
              <div className="relative">
                <input
                  type="text"
                  placeholder="Filter SKU name or code..."
                  value={skuSearch}
                  onChange={(e) => setSkuSearch(e.target.value)}
                  className="pl-7 pr-3 py-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-slate-200 w-44 focus:w-60 transition-all focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <span className="absolute left-2 top-1 text-xs text-slate-400">🔍</span>
              </div>
            )}

            <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-600 dark:text-slate-300 text-xs select-none">
              <input
                type="checkbox"
                checked={showValues}
                onChange={(e) => setShowValues(e.target.checked)}
                className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
              />
              <span>Show Cell Numbers</span>
            </label>

            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-0.5 rounded-xl border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setCellDensity("compact")}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                  cellDensity === "compact" ? "bg-white dark:bg-slate-800 shadow-xs font-black" : "text-slate-500"
                }`}
              >
                Compact
              </button>
              <button
                type="button"
                onClick={() => setCellDensity("normal")}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                  cellDensity === "normal" ? "bg-white dark:bg-slate-800 shadow-xs font-black" : "text-slate-500"
                }`}
              >
                Normal
              </button>
              <button
                type="button"
                onClick={() => setCellDensity("spacious")}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                  cellDensity === "spacious" ? "bg-white dark:bg-slate-800 shadow-xs font-black" : "text-slate-500"
                }`}
              >
                Wide
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── HEATMAP MATRIX VISUAL CONTAINER ── */}
      <div className="bg-white dark:bg-[#000d2b] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-lg overflow-hidden">
        {/* Table Title Bar */}
        <div className="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-lg">🔥</span>
            <div>
              <div className="text-sm font-black flex items-center gap-2">
                <span>
                  {activeDimension === "category_day" && "Category × Day-Wise Trend Heatmap"}
                  {activeDimension === "category_city" && "Category × City Geographic Cross-Fulfillment Heatmap"}
                  {activeDimension === "city_day" && "City Hub × Day-Wise Supply Rhythm Heatmap"}
                  {activeDimension === "sku_day" && "Granular SKU-Level × Day-Wise Matrix"}
                </span>
                <span className="px-2 py-0.2 rounded-full text-[10px] font-black bg-amber-400 text-slate-950 uppercase">
                  {matrixData.rowKeys.length} Rows × {matrixData.colKeys.length} Columns
                </span>
              </div>
              <div className="text-[11px] text-amber-200/90 font-medium">
                Metric: <b>{activeMetric === "fr" ? "Fill Rate % (Fulfillment Ratio)" : activeMetric.toUpperCase()}</b> · Click any cell to inspect detailed SKU orders
              </div>
            </div>
          </div>

          <div className="text-right shrink-0">
            <span className="text-xs font-mono font-black text-amber-300">
              Total Metric Value: {formatMetricDisplay(getCellMetricValue(matrixData.grandTotal, activeMetric), activeMetric)}
            </span>
          </div>
        </div>

        {/* Scrollable Heatmap Table Grid */}
        <div className="overflow-x-auto max-h-[720px] overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-[#020b18] shadow-sm">
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[10.5px] font-extrabold uppercase font-mono text-slate-600 dark:text-slate-300">
                {/* Fixed Header: Row Dimension Name */}
                <th className="p-3 sticky left-0 z-30 bg-slate-100 dark:bg-[#020b18] min-w-[200px] border-r border-slate-200 dark:border-slate-800">
                  {activeDimension === "category_day" && "📦 Product Category"}
                  {activeDimension === "category_city" && "📦 Product Category"}
                  {activeDimension === "city_day" && "📍 City / Depot Hub"}
                  {activeDimension === "city_category" && "📍 City / Depot Hub"}
                  {activeDimension === "sku_day" && "🥛 SKU Full Description"}
                </th>

                {/* Matrix Column Headers */}
                {matrixData.colLabels.map((c) => (
                  <th
                    key={c.key}
                    className={`text-center p-2 border-r border-slate-200 dark:border-slate-800 ${
                      cellDensity === "compact" ? "min-w-[46px]" : cellDensity === "spacious" ? "min-w-[85px]" : "min-w-[62px]"
                    }`}
                  >
                    <div className="truncate">{c.label}</div>
                    {c.subLabel && (
                      <div className="text-[9px] font-normal text-slate-400 lowercase">{c.subLabel}</div>
                    )}
                  </th>
                ))}

                {/* Summary Column Header */}
                <th className="p-3 text-right sticky right-0 z-30 bg-slate-200 dark:bg-[#051329] min-w-[130px] border-l-2 border-slate-300 dark:border-slate-700">
                  ROW SUMMARY ({activeMetric.toUpperCase()})
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-sans">
              {matrixData.rowKeys.length === 0 ? (
                <tr>
                  <td colSpan={matrixData.colKeys.length + 2} className="p-12 text-center text-slate-400">
                    No data found matching your current filter criteria.
                  </td>
                </tr>
              ) : (
                matrixData.rowKeys.map((rKey, rIdx) => {
                  const rTotal = matrixData.rowTotals.get(rKey);
                  return (
                    <tr
                      key={rKey}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                        rIdx % 2 === 0 ? "bg-white dark:bg-[#000d2b]" : "bg-slate-50/50 dark:bg-[#001033]"
                      }`}
                    >
                      {/* Sticky Row Header */}
                      <td
                        className={`p-2.5 sticky left-0 z-10 font-bold text-slate-900 dark:text-white border-r border-slate-200 dark:border-slate-800 ${
                          rIdx % 2 === 0 ? "bg-white dark:bg-[#000d2b]" : "bg-slate-50 dark:bg-[#001033]"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {activeDimension === "sku_day" ? (
                            <div className="flex items-center gap-2 truncate">
                              <div className="w-6 h-6 rounded-md bg-slate-100 dark:bg-white/10 border border-slate-200 dark:border-white/10 grid place-items-center shrink-0 overflow-hidden">
                                {matchSkuIcon(rKey) ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={matchSkuIcon(rKey) || undefined} alt="" className="max-w-full max-h-full object-contain" />
                                ) : (
                                  <span className="text-amber-500 text-xs">🥛</span>
                                )}
                              </div>
                              <div className="truncate">
                                <span className="truncate text-xs font-bold block" title={rKey}>
                                  {rKey}
                                </span>
                                {mmdGroup(rKey).code && (
                                  <span className="text-[9px] font-mono text-amber-500 font-bold block">
                                    {mmdGroup(rKey).code}
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="text-amber-500 font-mono text-[10px] text-slate-400 shrink-0">
                                {rIdx + 1}.
                              </span>
                              <span className="font-extrabold text-xs truncate" title={rKey}>
                                {rKey}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Heatmap Matrix Cells */}
                      {matrixData.colKeys.map((cKey) => {
                        const cellKey = `${rKey}:::${cKey}`;
                        const cell = matrixData.grid.get(cellKey);
                        const val = getCellMetricValue(cell, activeMetric);
                        const colorCls = getCellColorClass(cell, activeMetric);
                        const isMatch = isCellHighlighted(cell);

                        return (
                          <td
                            key={cKey}
                            onClick={() => handleCellClick(rKey, cKey, cell)}
                            className={`p-1 text-center border-r border-slate-100 dark:border-slate-800/60 transition-all ${
                              cell && cell.poVal > 0 ? "cursor-pointer hover:scale-105 hover:z-20 hover:shadow-lg" : ""
                            } ${!isMatch ? "opacity-20 saturate-50" : ""}`}
                            title={
                              cell && cell.poVal > 0
                                ? `${rKey} on ${cKey}\n• Demand: ₹${cell.poVal.toFixed(2)}L\n• Supplied: ₹${cell.grnVal.toFixed(2)}L\n• Fill Rate: ${cell.fr.toFixed(1)}%\n• Gap: ₹${cell.gapVal.toFixed(2)}L\n• Units: ${Math.round(cell.poQty).toLocaleString()}\n• POs: ${cell.poCount}`
                                : "No orders"
                            }
                          >
                            <div
                              className={`rounded-xl transition-all flex items-center justify-center font-mono ${
                                cellDensity === "compact"
                                  ? "h-8 text-[10px] px-1"
                                  : cellDensity === "spacious"
                                  ? "h-11 text-xs px-2"
                                  : "h-9 text-[11px] px-1.5"
                              } ${colorCls}`}
                            >
                              {showValues ? formatMetricDisplay(val, activeMetric) : val > 0 ? "•" : ""}
                            </div>
                          </td>
                        );
                      })}

                      {/* Sticky Row Summary Column */}
                      <td className="p-2.5 text-right font-mono font-black sticky right-0 z-10 bg-slate-100 dark:bg-[#051329] border-l-2 border-slate-300 dark:border-slate-700 text-xs">
                        <div className="flex flex-col items-end justify-center">
                          <span
                            className={
                              activeMetric === "fr"
                                ? rTotal && rTotal.fr >= 90
                                  ? "text-emerald-600 dark:text-emerald-400 font-extrabold"
                                  : "text-amber-600 dark:text-amber-400 font-extrabold"
                                : "text-slate-900 dark:text-white"
                            }
                          >
                            {rTotal ? formatMetricDisplay(getCellMetricValue(rTotal, activeMetric), activeMetric) : "—"}
                          </span>
                          {rTotal && activeMetric !== "fr" && (
                            <span className="text-[9.5px] font-medium text-slate-400">
                              FR: {rTotal.fr.toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Matrix Footer: Column Totals */}
            {matrixData.rowKeys.length > 0 && (
              <tfoot className="sticky bottom-0 z-20 bg-slate-200 dark:bg-[#03152c] border-t-2 border-slate-400 dark:border-slate-700 text-slate-900 dark:text-white font-extrabold text-xs shadow-md">
                <tr>
                  <td className="p-3 sticky left-0 z-30 bg-slate-200 dark:bg-[#03152c] font-black uppercase tracking-wider border-r border-slate-300 dark:border-slate-700">
                    PAN-INDIA SUMMARY TOTAL
                  </td>

                  {matrixData.colKeys.map((cKey) => {
                    const cTotal = matrixData.colTotals.get(cKey);
                    const val = getCellMetricValue(cTotal, activeMetric);
                    return (
                      <td
                        key={cKey}
                        className="p-2 text-center font-mono font-black border-r border-slate-300 dark:border-slate-700 text-[11px]"
                      >
                        <div className="truncate">
                          {cTotal ? formatMetricDisplay(val, activeMetric) : "—"}
                        </div>
                        {cTotal && activeMetric !== "fr" && (
                          <div className="text-[9px] font-normal text-slate-500 dark:text-slate-400">
                            {cTotal.fr.toFixed(1)}%
                          </div>
                        )}
                      </td>
                    );
                  })}

                  <td className="p-3 text-right font-mono font-black text-sm text-emerald-700 dark:text-emerald-300 sticky right-0 z-30 bg-slate-300 dark:bg-[#051c3d] border-l-2 border-slate-400 dark:border-slate-600">
                    {formatMetricDisplay(getCellMetricValue(matrixData.grandTotal, activeMetric), activeMetric)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ── DEEP-DIVE DRILL DOWN DRAWER / MODAL ── */}
      {drillModalOpen && selectedCellInfo && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border-2 border-amber-500/40 shadow-2xl max-w-4xl w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 text-[10px] font-mono font-black uppercase">
                    CELL INSPECTION
                  </span>
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400 font-bold">
                    {selectedCellInfo.rowLabel} · {selectedCellInfo.colLabel}
                  </span>
                </div>
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-1 flex items-center gap-2">
                  <span>📊</span> Itemized SKU Orders & Fulfillment Audit
                </h2>
              </div>
              <button
                onClick={() => setDrillModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-sm font-black text-slate-500 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Cell KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div className="text-[10px] uppercase font-bold text-slate-500">Demand Value</div>
                <div className="text-base font-black text-slate-900 dark:text-white mt-0.5">
                  ₹{selectedCellInfo.cell.poVal.toFixed(2)} Lakhs
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div className="text-[10px] uppercase font-bold text-slate-500">Supplied Value</div>
                <div className="text-base font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                  ₹{selectedCellInfo.cell.grnVal.toFixed(2)} Lakhs
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div className="text-[10px] uppercase font-bold text-slate-500">Fill Rate %</div>
                <div className={`text-base font-black mt-0.5 ${
                  selectedCellInfo.cell.fr >= 90 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                }`}>
                  {selectedCellInfo.cell.fr.toFixed(1)}%
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div className="text-[10px] uppercase font-bold text-slate-500">Orders / PO Count</div>
                <div className="text-base font-black text-indigo-600 dark:text-cyan-400 mt-0.5">
                  {selectedCellInfo.cell.poCount} POs ({selectedCellInfo.cell.skuDetails.length} SKUs)
                </div>
              </div>
            </div>

            {/* Itemized SKU List Table */}
            <div className="flex-1 overflow-y-auto max-h-[380px] rounded-2xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-950 text-[10.5px] uppercase font-mono text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-2.5">SKU Description</th>
                    <th className="p-2.5 text-center">Code</th>
                    <th className="p-2.5">PO Number</th>
                    <th className="p-2.5 text-right">PO Qty</th>
                    <th className="p-2.5 text-right">GRN Qty</th>
                    <th className="p-2.5 text-right">Demand (₹L)</th>
                    <th className="p-2.5 text-right">Supply (₹L)</th>
                    <th className="p-2.5 text-right">Fill Rate</th>
                    <th className="p-2.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-sans">
                  {selectedCellInfo.cell.skuDetails.map((s, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="p-2.5 font-bold text-slate-900 dark:text-white">
                        {s.skuName}
                      </td>
                      <td className="p-2.5 text-center font-mono text-slate-500">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px]">
                          {s.code}
                        </span>
                      </td>
                      <td className="p-2.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                        {s.poNum}
                      </td>
                      <td className="p-2.5 text-right font-mono text-slate-700 dark:text-slate-300">
                        {Math.round(s.poQty).toLocaleString()}
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {Math.round(s.grnQty).toLocaleString()}
                      </td>
                      <td className="p-2.5 text-right font-mono text-slate-800 dark:text-slate-200">
                        ₹{s.poVal.toFixed(2)}
                      </td>
                      <td className="p-2.5 text-right font-mono font-black text-emerald-600 dark:text-emerald-400">
                        ₹{s.grnVal.toFixed(2)}
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold">
                        <span className={s.fr >= 90 ? "text-emerald-600" : s.fr >= 75 ? "text-amber-600" : "text-rose-600"}>
                          {s.fr.toFixed(1)}%
                        </span>
                      </td>
                      <td className="p-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          s.status === "COMPLETED"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : s.status === "EXPIRED"
                            ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        }`}>
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
              <span className="text-slate-500 font-mono">
                Active POs: {Array.from(selectedCellInfo.cell.poSet).join(", ") || "None"}
              </span>
              <button
                type="button"
                onClick={() => setDrillModalOpen(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-950 font-extrabold text-xs cursor-pointer"
              >
                Close Audit
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
