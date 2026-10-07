"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import UploadButton from "../upload-button";
import SyncStatus from "../sync-status";
import { matchSkuIcon } from "@/lib/sku-icon";
import SkuImagePopup from "../sku-image-popup";
import { lookupDepoByCity } from "@/lib/depo-mapping";

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
  { key: "today", label: "Expires Today" },
  { key: "tomorrow", label: "Expires Tomorrow" },
  { key: "day_after", label: "Day After Tomorrow" },
  { key: "5d", label: "In 3–5 Days" },
  { key: "safe", label: "Safe (> 5 Days)" },
  { key: "expired", label: "Expired / Overdue" },
  { key: "nodate", label: "No Expiry Date" },
] as const;

type UrgencyKey = (typeof URGENCY_OPTIONS)[number]["key"];

type PriorityTier = "P0" | "P1" | "P2" | "P3";

interface PriorityInfo {
  tier: PriorityTier;
  label: string;
  badgeCls: string;
  rowCls: string;
  order: number;
  reason: string;
  timelineGroup: "today" | "tomorrow" | "day_after" | "future" | "expired" | "no_date";
  timelineLabel: string;
  timelineBadgeCls: string;
}

function calculatePriority(
  daysLeft: number | null,
  gapVal: number,
  frVal: number,
  poVal: number,
  isPortalCompleted = false
): PriorityInfo {
  // If officially completed in portal or 100% fulfilled, it's safe/on track
  if (isPortalCompleted || gapVal <= 0.001 || frVal >= 99.9) {
    return {
      tier: "P3",
      label: "P3 · COMPLETED",
      badgeCls: "bg-emerald-600 text-white font-bold",
      rowCls: "hover:bg-emerald-50/20",
      order: 5,
      reason: isPortalCompleted ? "Completed (GRN Done in Portal)" : "100% Fulfilled",
      timelineGroup: "future",
      timelineLabel: "✓ Completed",
      timelineBadgeCls: "bg-emerald-100 text-emerald-800 border-emerald-300 font-bold",
    };
  }

  // EXPIRED POs
  if (daysLeft !== null && daysLeft < 0) {
    return {
      tier: "P0",
      label: "P0 · EXPIRED",
      badgeCls: "bg-rose-600 text-white shadow-xs",
      rowCls: "bg-rose-50/50 hover:bg-rose-50/80 border-rose-200",
      order: 0,
      reason: `Expired ${Math.abs(daysLeft)}d ago with ₹${L2(gapVal)}L gap`,
      timelineGroup: "expired",
      timelineLabel: `Expired ${Math.abs(daysLeft)}d ago`,
      timelineBadgeCls: "bg-rose-100 text-rose-800 border-rose-300 font-bold",
    };
  }

  // EXPIRES TODAY (0 days left)
  if (daysLeft === 0) {
    return {
      tier: "P0",
      label: "P0 · EXPIRES TODAY",
      badgeCls: "bg-rose-600 text-white shadow-sm ring-1 ring-rose-700 animate-pulse",
      rowCls: "bg-rose-50/40 hover:bg-rose-50/70 border-rose-200",
      order: 1,
      reason: `Expires today! Fill ₹${L2(gapVal)}L immediately`,
      timelineGroup: "today",
      timelineLabel: "🚨 Expires Today",
      timelineBadgeCls: "bg-rose-600 text-white font-extrabold shadow-xs animate-pulse",
    };
  }

  // EXPIRES TOMORROW (1 day left)
  if (daysLeft === 1) {
    return {
      tier: "P0",
      label: "P0 · EXPIRES TOMORROW",
      badgeCls: "bg-orange-500 text-white shadow-xs ring-1 ring-orange-600",
      rowCls: "bg-orange-50/30 hover:bg-orange-50/60 border-orange-200",
      order: 2,
      reason: `Expires tomorrow! Remaining gap ₹${L2(gapVal)}L`,
      timelineGroup: "tomorrow",
      timelineLabel: "⏰ Expires Tomorrow (1d left)",
      timelineBadgeCls: "bg-orange-100 text-orange-900 border-orange-300 font-bold",
    };
  }

  // DAY AFTER TOMORROW (2 days left)
  if (daysLeft === 2) {
    return {
      tier: "P0",
      label: "P0 · 2 DAYS LEFT",
      badgeCls: "bg-orange-500 text-white shadow-xs",
      rowCls: "bg-orange-50/20 hover:bg-orange-50/50 border-orange-200",
      order: 3,
      reason: `Expires in 2 days (Day after tomorrow)`,
      timelineGroup: "day_after",
      timelineLabel: "📅 Day After Tomorrow (2d left)",
      timelineBadgeCls: "bg-amber-100 text-amber-900 border-amber-300 font-bold",
    };
  }

  // IN 3 TO 5 DAYS
  if (daysLeft !== null && daysLeft <= 5) {
    return {
      tier: "P1",
      label: `P1 · ${daysLeft} DAYS LEFT`,
      badgeCls: "bg-amber-500 text-white shadow-xs",
      rowCls: "bg-amber-50/20 hover:bg-amber-50/40 border-amber-200",
      order: 4,
      reason: `Expires in ${daysLeft} days with ₹${L2(gapVal)}L gap`,
      timelineGroup: "future",
      timelineLabel: `⏳ In ${daysLeft} Days`,
      timelineBadgeCls: "bg-slate-100 text-slate-700 border-slate-300 font-semibold",
    };
  }

  // SAFE EXPIRY (> 5 DAYS) OR NO EXPIRY
  if (daysLeft !== null && daysLeft > 5) {
    return {
      tier: gapVal >= 1.0 ? "P1" : gapVal >= 0.2 ? "P2" : "P3",
      label: `SAFE (${daysLeft}D)`,
      badgeCls: "bg-emerald-600 text-white",
      rowCls: "hover:bg-emerald-50/20",
      order: 5,
      reason: `Safe expiry window (${daysLeft}d left)`,
      timelineGroup: "future",
      timelineLabel: `Safe (${daysLeft}d left)`,
      timelineBadgeCls: "bg-emerald-50 text-emerald-700 border-emerald-200 font-medium",
    };
  }

  return {
    tier: gapVal >= 1.0 ? "P1" : gapVal >= 0.2 ? "P2" : "P3",
    label: gapVal === 0 ? "P3 · ON TRACK" : "P2 · ACTION",
    badgeCls: "bg-slate-600 text-white",
    rowCls: "hover:bg-slate-50",
    order: 6,
    reason: "No expiry deadline set",
    timelineGroup: "no_date",
    timelineLabel: "No Expiry Date",
    timelineBadgeCls: "bg-slate-100 text-slate-500 border-slate-200 text-xs",
  };
}

/* ── Helper for GRN & Acknowledgement Status (Portal Aware) ── */
function getGrnAckStatus(po: {
  grnVal: number;
  gapVal: number;
  frVal: number;
  isPortalCompleted?: boolean;
}) {
  // If officially marked Completed / GRN Done in the portal OR mathematically 100%
  if (po.isPortalCompleted || po.gapVal <= 0.001 || po.frVal >= 99.9) {
    return {
      key: "completed",
      label: "GRN Done / Completed",
      badgeCls: "bg-emerald-100 text-emerald-800 border-emerald-300 font-bold",
      icon: "✓",
      statusText: "GRN Done (Completed)",
      subText: po.frVal < 99.9 ? `Short-closed at ${po.frVal.toFixed(1)}%` : "100% Fulfilled",
      isPending: false,
    };
  }
  if (po.grnVal > 0) {
    return {
      key: "partial",
      label: "Partially Supplied",
      badgeCls: "bg-amber-100 text-amber-900 border-amber-300 font-bold",
      icon: "⏳",
      statusText: "Partially Supplied",
      subText: `₹${L2(po.gapVal)}L Gap Pending`,
      isPending: true,
    };
  }
  return {
    key: "pending_ack",
    label: "Pending Acknowledgement",
    badgeCls: "bg-rose-100 text-rose-800 border-rose-300 animate-pulse font-extrabold",
    icon: "⚠️",
    statusText: "Pending Ack (0% GRN)",
    subText: "No Supply Yet",
    isPending: true,
  };
}

const GRN_STATUS_OPTIONS = [
  { key: "completed", label: "GRN Done / Completed (100% / Portal ✓)" },
  { key: "partial", label: "Partially Supplied (Gap Open)" },
  { key: "pending_ack", label: "Pending Acknowledgement (0% GRN)" },
];

/* ── Helper for Portal Status Badge ── */
function getPortalStatusBadge(statusStr: string, isCompleted: boolean) {
  if (isCompleted || statusStr === "Completed" || statusStr === "COMPLETED" || statusStr === "GRN Done" || statusStr === "GRN_DONE") {
    return {
      label: "Completed",
      badgeCls: "bg-sky-100 text-sky-800 border-sky-300 font-extrabold",
      icon: "✓",
    };
  }
  if (statusStr === "ASN Created" || statusStr === "ASN_CREATED") {
    return {
      label: "ASN Created",
      badgeCls: "bg-indigo-100 text-indigo-800 border-indigo-300 font-bold",
      icon: "📦",
    };
  }
  if (statusStr === "Pending GRN" || statusStr === "PENDING_GRN") {
    return {
      label: "Pending GRN",
      badgeCls: "bg-purple-100 text-purple-800 border-purple-300 font-bold",
      icon: "⏳",
    };
  }
  if (statusStr === "Acknowledged" || statusStr === "PO Acknowledged") {
    return {
      label: "Acknowledged",
      badgeCls: "bg-amber-100 text-amber-900 border-amber-300 font-bold",
      icon: "📋",
    };
  }
  if (statusStr === "Pending Acknowledgement" || statusStr === "PENDING_ACKNOWLEDGEMENT") {
    return {
      label: "Pending Ack",
      badgeCls: "bg-rose-100 text-rose-800 border-rose-300 font-bold",
      icon: "⚠️",
    };
  }
  if (statusStr === "Partially Supplied" || statusStr === "Po Partially Supplied") {
    return {
      label: "Partially Supplied",
      badgeCls: "bg-amber-100 text-amber-800 border-amber-200 font-semibold",
      icon: "⏳",
    };
  }
  if (statusStr === "Fully Supplied" || statusStr === "Po Fully Supplied") {
    return {
      label: "Fully Supplied",
      badgeCls: "bg-emerald-100 text-emerald-800 border-emerald-300 font-bold",
      icon: "✓",
    };
  }
  return {
    label: statusStr || "—",
    badgeCls: "bg-slate-100 text-slate-700 border-slate-200 font-medium",
    icon: "•",
  };
}

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
        className={`w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm font-semibold text-left transition-all cursor-pointer ${
          isFiltered
            ? "border-rose-500 bg-rose-50/70 text-rose-900 ring-1 ring-rose-400"
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
            className="absolute left-0 top-full mt-1.5 z-50 w-72 max-w-[90vw] bg-white border border-rose-200 rounded-2xl shadow-2xl p-3 space-y-2 animate-in fade-in zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative">
              <input
                autoFocus
                type="text"
                placeholder={`Search ${label.toLowerCase()}...`}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-rose-500"
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
                  className="text-rose-600 hover:text-rose-800 hover:underline cursor-pointer"
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
                          ? "bg-rose-50 text-rose-900 font-bold"
                          : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleItem(opt.key)}
                        className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 h-4 w-4 accent-rose-600 cursor-pointer shrink-0"
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

/* ── Dispatch Modal: Itemized PO Pick List ── */
interface DispatchModalProps {
  po: any;
  onClose: () => void;
  onOpenSkuLightbox: (sku: { icon: string | null; name: string; stats: any[] }) => void;
}

function DispatchModal({ po, onClose, onOpenSkuLightbox }: DispatchModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs transition-opacity" onClick={onClose} />
      <div className="fixed z-50 inset-0 flex items-center justify-center p-3 sm:p-6 pointer-events-none">
        <div className="pointer-events-auto bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="p-5 sm:p-6 border-b border-slate-100 bg-gradient-to-r from-rose-950 via-purple-950 to-indigo-950 text-white flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap mb-1.5">
                <span className={`px-2.5 py-1 rounded-full text-xs font-black tracking-wider uppercase ${po.priority.badgeCls}`}>
                  {po.priority.label}
                </span>
                <span className={`px-2.5 py-1 rounded-full text-xs font-extrabold border ${po.portalBadge.badgeCls}`}>
                  {po.trade || "Trade"} Portal: {po.portalBadge.icon} {po.portalBadge.label}
                </span>
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${po.grnAckStatus.badgeCls}`}>
                  {po.grnAckStatus.icon} {po.grnAckStatus.label}
                </span>
                <span className="px-3 py-1 rounded-lg bg-white/15 text-rose-100 font-mono font-extrabold text-xs">
                  PO #{po.poNumber}
                </span>
                <span className="px-3 py-1 rounded-lg bg-white/10 text-white font-bold text-xs">
                  📍 {po.city} ({po.depo})
                </span>
                <span className="px-3 py-1 rounded-lg bg-white/10 text-purple-200 font-medium text-xs">
                  {po.trade}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                Dispatch Pick List & Fill Command
              </h2>
              <p className="text-xs font-medium text-purple-200/80 mt-1">
                Raised Date: <span className="font-bold text-white">{ymdToDate(po.date)}</span> · Expiry:{" "}
                <span className="font-bold text-rose-300">{ymdToDate(po.expiryDate)}</span> (
                {po.daysLeft !== null
                  ? po.daysLeft < 0
                    ? `Expired ${Math.abs(po.daysLeft)}d ago`
                    : po.daysLeft === 0
                    ? "Expires Today!"
                    : `${po.daysLeft} days left`
                  : "No Expiry"}
                )
              </p>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center font-bold transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 border-b border-slate-100">
            <div className="bg-white p-3 rounded-2xl border border-slate-200">
              <div className="text-[10px] font-extrabold uppercase text-slate-400">Total PO Value</div>
              <div className="text-lg font-black text-purple-950">₹{L2(po.poVal)}L</div>
              <div className="text-[11px] font-semibold text-slate-500">{L(po.poQty, 0)} Units ordered</div>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-slate-200">
              <div className="text-[10px] font-extrabold uppercase text-emerald-600">Filled GRN</div>
              <div className="text-lg font-black text-emerald-700">₹{L2(po.grnVal)}L</div>
              <div className="text-[11px] font-semibold text-emerald-600">{L(po.grnQty, 0)} Units filled</div>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-rose-200 bg-rose-50/40">
              <div className="text-[10px] font-extrabold uppercase text-rose-600">Urgent Gap to Dispatch</div>
              <div className="text-lg font-black text-rose-700">₹{L2(po.gapVal)}L</div>
              <div className="text-[11px] font-extrabold text-rose-600">{L(po.gapQty, 0)} Units unfulfilled</div>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-slate-200">
              <div className="text-[10px] font-extrabold uppercase text-slate-400">Current Fill Rate</div>
              <div className="text-lg font-black text-slate-900">{po.frVal.toFixed(1)}%</div>
              <div className="mt-1 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    po.frVal >= 90 ? "bg-emerald-500" : po.frVal >= 75 ? "bg-amber-500" : "bg-rose-500"
                  }`}
                  style={{ width: `${Math.min(100, po.frVal)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Itemized SKUs Pick Table */}
          <div className="p-4 overflow-y-auto flex-1 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-800">
                Itemized SKU Dispatch Queue ({po.skus.length} SKUs)
              </h3>
              <span className="text-xs text-slate-500 font-semibold">
                Priority ordered by largest gap value
              </span>
            </div>

            <div className="space-y-2.5">
              {po.skus.map((sku: any, idx: number) => {
                const icon = matchSkuIcon(sku.name);
                const isFulfilled = sku.gapQty === 0;

                return (
                  <div
                    key={idx}
                    className={`p-3.5 sm:p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isFulfilled
                        ? "bg-slate-50/60 border-slate-200 opacity-70"
                        : "bg-white border-slate-200 hover:border-purple-300 hover:shadow-sm"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        onClick={() =>
                          onOpenSkuLightbox({
                            icon,
                            name: sku.name,
                            stats: [
                              { label: "Category", value: sku.category || "General" },
                              { label: "Ordered Qty", value: L(sku.poQty, 0) },
                              { label: "Filled Qty", value: L(sku.grnQty, 0) },
                              {
                                label: "Gap to Fill",
                                value: `${L(sku.gapQty, 0)} (₹${L2(sku.gapVal)}L)`,
                                cls: "text-rose-600 font-bold",
                              },
                              { label: "Fill Rate", value: `${sku.frVal.toFixed(1)}%` },
                            ],
                          })
                        }
                        className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 grid place-items-center shrink-0 overflow-hidden cursor-pointer hover:scale-105 transition-transform"
                      >
                        {icon ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={icon} alt="" className="max-w-full max-h-full object-contain" />
                        ) : (
                          <span className="text-lg">🥛</span>
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
                                { label: "Ordered Qty", value: L(sku.poQty, 0) },
                                { label: "Filled Qty", value: L(sku.grnQty, 0) },
                                {
                                  label: "Gap to Fill",
                                  value: `${L(sku.gapQty, 0)} (₹${L2(sku.gapVal)}L)`,
                                  cls: "text-rose-600 font-bold",
                                },
                                { label: "Fill Rate", value: `${sku.frVal.toFixed(1)}%` },
                              ],
                            })
                          }
                          className="font-bold text-sm text-slate-900 hover:text-purple-700 transition cursor-pointer"
                        >
                          {sku.name}
                        </div>
                        <div className="text-[11px] font-semibold text-slate-400">
                          {sku.category} · Ordered: ₹{L2(sku.poVal)}L
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 sm:gap-6 self-end sm:self-center shrink-0">
                      <div className="text-right">
                        <div className="text-[10px] font-bold uppercase text-slate-400">PO / GRN Qty</div>
                        <div className="text-xs font-bold text-slate-800">
                          {L(sku.poQty, 0)} / <span className="text-emerald-600">{L(sku.grnQty, 0)}</span>
                        </div>
                      </div>

                      <div className="text-right min-w-[90px]">
                        <div className="text-[10px] font-bold uppercase text-rose-500">Pick to Dispatch</div>
                        <div className={`text-xs font-extrabold ${isFulfilled ? "text-emerald-600" : "text-rose-700"}`}>
                          {isFulfilled ? "✓ 0 (Full)" : `+${L(sku.gapQty, 0)} (₹${L2(sku.gapVal)}L)`}
                        </div>
                      </div>

                      <div className="text-center min-w-[55px]">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${
                            sku.frVal >= 90
                              ? "bg-emerald-100 text-emerald-800"
                              : sku.frVal >= 75
                              ? "bg-amber-100 text-amber-800"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {sku.frVal.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between flex-wrap gap-2">
            <div className="text-xs font-semibold text-slate-500">
              Pick the unfulfilled quantities from depot stock to complete this PO.
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs transition cursor-pointer"
              >
                🖨️ Print Pick List
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function PriorityPoPage() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");

  // Filters State - Date Selection & Multi-Select Filters
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [selMonths, setSelMonths] = useState<string[]>([]);
  const [selTiers, setSelTiers] = useState<string[]>([]);
  const [selCities, setSelCities] = useState<string[]>([]);
  const [selDepots, setSelDepots] = useState<string[]>([]);
  const [selTrades, setSelTrades] = useState<string[]>([]);
  const [selRegions, setSelRegions] = useState<string[]>([]);
  const [selCategories, setSelCategories] = useState<string[]>([]);
  const [selUrgencies, setSelUrgencies] = useState<UrgencyKey[]>([]);
  const [selGrnStatuses, setSelGrnStatuses] = useState<string[]>([]);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [onlyOpenGaps, setOnlyOpenGaps] = useState(false);

  // Active Timeline Quick Filter Tab
  const [timelineTab, setTimelineTab] = useState<"all" | "today" | "tomorrow" | "day_after" | "future">("all");

  // In-Table Search & Sorting for Active PO Queue (Table 1)
  const [activeSearch, setActiveSearch] = useState("");
  const [activeSortKey, setActiveSortKey] = useState<string>("urgency");
  const [activeSortDir, setActiveSortDir] = useState<"asc" | "desc">("asc");

  // In-Table Search & Sorting for Expired PO Backlog (Table 2)
  const [expiredSearch, setExpiredSearch] = useState("");
  const [expiredSortKey, setExpiredSortKey] = useState<string>("overdue");
  const [expiredSortDir, setExpiredSortDir] = useState<"asc" | "desc">("asc");

  // Pagination for Active Table
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Pagination for Expired Table
  const [expPage, setExpPage] = useState(1);
  const [expPageSize, setExpPageSize] = useState(15);

  const toggleActiveSort = (key: string) => {
    if (activeSortKey === key) {
      setActiveSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setActiveSortKey(key);
      const defaultAsc = ["urgency", "poNumber", "city", "depo", "trade", "portalStatus", "grnAckStatus"].includes(key);
      setActiveSortDir(defaultAsc ? "asc" : "desc");
    }
    setPage(1);
  };

  const toggleExpiredSort = (key: string) => {
    if (expiredSortKey === key) {
      setExpiredSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setExpiredSortKey(key);
      const defaultAsc = ["overdue", "poNumber", "city", "depo", "trade", "portalStatus", "grnAckStatus"].includes(key);
      setExpiredSortDir(defaultAsc ? "asc" : "desc");
    }
    setExpPage(1);
  };

  // Modals
  const [activeDispatchPo, setActiveDispatchPo] = useState<any | null>(null);
  const [skuPopup, setSkuPopup] = useState<{
    icon: string | null;
    name: string;
    stats: { label: string; value: string; cls?: string }[];
  } | null>(null);

  useEffect(() => {
    fetch("/api/data")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
      .then((data) => {
        setD(data);
        // Default to all dates (full date range visible)
        if (data?.meta?.date_max) {
          setFFrom("");
          setFTo("");
        }
      })
      .catch((e) => setErr(String(e.message || e)));
  }, []);

  // Quick preset helper
  function applyDatePreset(days: number) {
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

  // Reset all filters
  function resetAllFilters() {
    setSelMonths([]);
    setSelTiers([]);
    setSelCities([]);
    setSelDepots([]);
    setSelTrades([]);
    setSelRegions([]);
    setSelCategories([]);
    setSelUrgencies([]);
    setSelGrnStatuses([]);
    setSearchQuery("");
    setOnlyOpenGaps(false);
    setTimelineTab("all");
    if (d?.meta?.date_max) {
      const max = d.meta.date_max as string;
      setFFrom(max.slice(0, 7) + "-01");
      setFTo(max);
    } else {
      setFFrom("");
      setFTo("");
    }
  }

  const nowYmd = todayYmd();

  // Extract list of all unique Depots from data
  const allDepotsList = useMemo(() => {
    if (!d) return [];
    const set = new Set<string>();
    for (const city of d.dims.city) {
      const entry = lookupDepoByCity(city);
      if (entry?.depo) set.add(entry.depo);
    }
    return Array.from(set).sort();
  }, [d]);

  // Aggregated PO Level Intelligence with Priority Scoring & Date Filters
  const allPriorityPos = useMemo(() => {
    if (!d) return [];
    const fromYmd = dateToYmd(fFrom);
    const toYmd = dateToYmd(fTo);

    const monthSet = new Set(selMonths);
    const tradeSet = new Set(selTrades);
    const regionSet = new Set(selRegions);
    const citySet = new Set(selCities);
    const catSet = new Set(selCategories);
    const urgencySet = new Set(selUrgencies);

    const poMap = new Map<
      number,
      {
        poId: number;
        poNumber: string;
        date: number;
        expiryDate: number;
        daysLeft: number | null;
        city: string;
        region: string;
        depo: string;
        trade: string;
        month: string;
        portalStatuses: Set<string>;
        poQty: number;
        poVal: number;
        grnQty: number;
        grnVal: number;
        categories: Set<string>;
        skus: {
          name: string;
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

    for (const r of d.rows) {
      const rowMonth = d.dims.month[r[0]];
      const rowTrade = d.dims.trade[r[1]];
      const rowRegion = d.dims.region[r[2]];
      const rowCity = d.dims.city[r[3]];
      const rowCategory = d.dims.category[r[4]];
      const rowStatus = d.dims.status[r[5]];
      const skuName = d.dims.sku[r[6]];
      const dt = r[11];
      const poId = r[12];
      const expDt = r[13];
      const poNumber = d.dims.po[poId] || `PO-${poId}`;

      // Date Range Filter
      if (fromYmd && dt < fromYmd) continue;
      if (toYmd && dt > toYmd) continue;

      // Dimension Filters
      if (monthSet.size > 0 && !monthSet.has(rowMonth)) continue;
      if (tradeSet.size > 0 && !tradeSet.has(rowTrade)) continue;
      if (regionSet.size > 0 && !regionSet.has(rowRegion)) continue;
      if (citySet.size > 0 && !citySet.has(rowCity)) continue;
      if (catSet.size > 0 && !catSet.has(rowCategory)) continue;

      // Expiry Urgency Filter
      if (urgencySet.size > 0) {
        const daysLeft = expDt > 0 ? diffDays(nowYmd, expDt) : null;
        let matchesUrgency = false;
        if (urgencySet.has("expired") && daysLeft !== null && daysLeft < 0) matchesUrgency = true;
        if (urgencySet.has("today") && daysLeft === 0) matchesUrgency = true;
        if (urgencySet.has("tomorrow") && daysLeft === 1) matchesUrgency = true;
        if (urgencySet.has("day_after") && daysLeft === 2) matchesUrgency = true;
        if (urgencySet.has("5d") && daysLeft !== null && daysLeft >= 3 && daysLeft <= 5)
          matchesUrgency = true;
        if (urgencySet.has("safe") && daysLeft !== null && daysLeft > 5) matchesUrgency = true;
        if (urgencySet.has("nodate") && daysLeft === null) matchesUrgency = true;
        if (!matchesUrgency) continue;
      }

      const depoEntry = lookupDepoByCity(rowCity);
      const depo = depoEntry?.depo || "—";

      let entry = poMap.get(poId);
      if (!entry) {
        const daysLeft = expDt > 0 ? diffDays(nowYmd, expDt) : null;
        entry = {
          poId,
          poNumber,
          date: dt,
          expiryDate: expDt,
          daysLeft,
          city: rowCity,
          region: rowRegion,
          depo,
          trade: rowTrade,
          month: rowMonth,
          portalStatuses: new Set<string>(),
          poQty: 0,
          poVal: 0,
          grnQty: 0,
          grnVal: 0,
          categories: new Set(),
          skus: [],
        };
        poMap.set(poId, entry);
      }

      if (rowStatus) entry.portalStatuses.add(rowStatus);
      entry.poQty += r[7];
      entry.poVal += r[8];
      entry.grnQty += r[9];
      entry.grnVal += r[10];
      entry.categories.add(rowCategory);

      const skuGapQty = Math.max(0, r[7] - r[9]);
      const skuGapVal = Math.max(0, r[8] - r[10]);
      const skuFr = r[8] > 0 ? (r[10] / r[8]) * 100 : 0;

      entry.skus.push({
        name: skuName,
        category: rowCategory,
        poQty: r[7],
        poVal: r[8],
        grnQty: r[9],
        grnVal: r[10],
        gapQty: skuGapQty,
        gapVal: skuGapVal,
        frVal: skuFr,
      });
    }

    return Array.from(poMap.values())
      .map((item) => {
        const gapQty = Math.max(0, item.poQty - item.grnQty);
        const gapVal = Math.max(0, item.poVal - item.grnVal);
        const frVal = item.poVal > 0 ? (item.grnVal / item.poVal) * 100 : 0;
        const frQty = item.poQty > 0 ? (item.grnQty / item.poQty) * 100 : 0;

        // Check if any row in portal says Completed, GRN Done, or Fully Supplied
        const isPortalCompleted = Array.from(item.portalStatuses).some(
          (s) =>
            s === "Completed" ||
            s === "COMPLETED" ||
            s === "GRN Done" ||
            s === "GRN_DONE" ||
            s === "Fully Supplied" ||
            s === "Po Fully Supplied"
        );

        // Find primary portal status
        const primaryPortalStatus = Array.from(item.portalStatuses)[0] || (isPortalCompleted ? "Completed" : "Partially Supplied");
        const portalBadge = getPortalStatusBadge(primaryPortalStatus, isPortalCompleted);

        const priority = calculatePriority(item.daysLeft, gapVal, frVal, item.poVal, isPortalCompleted);
        const grnAckStatus = getGrnAckStatus({ grnVal: item.grnVal, gapVal, frVal, isPortalCompleted });

        return {
          ...item,
          gapQty,
          gapVal,
          frVal,
          frQty,
          isPortalCompleted,
          primaryPortalStatus,
          portalBadge,
          priority,
          grnAckStatus,
          skus: item.skus.sort((a, b) => b.gapVal - a.gapVal),
        };
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
    selUrgencies,
    nowYmd,
  ]);

  // Filtered Common Pool (Search + Dimensions)
  const filteredBasePos = useMemo(() => {
    const tierSet = new Set(selTiers);
    const depoSet = new Set(selDepots);
    const grnStatusSet = new Set(selGrnStatuses);
    const q = searchQuery.trim().toLowerCase();

    return allPriorityPos.filter((po) => {
      if (onlyOpenGaps && (po.isPortalCompleted || po.gapVal <= 0.001)) return false;
      if (tierSet.size > 0 && !tierSet.has(po.priority.tier)) return false;
      if (depoSet.size > 0 && !depoSet.has(po.depo)) return false;
      if (grnStatusSet.size > 0 && !grnStatusSet.has(po.grnAckStatus.key)) return false;

      if (q) {
        const matches =
          po.poNumber.toLowerCase().includes(q) ||
          po.city.toLowerCase().includes(q) ||
          po.depo.toLowerCase().includes(q) ||
          po.trade.toLowerCase().includes(q) ||
          po.primaryPortalStatus.toLowerCase().includes(q) ||
          po.grnAckStatus.label.toLowerCase().includes(q) ||
          po.skus.some((s) => s.name.toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    });
  }, [allPriorityPos, selTiers, selDepots, selGrnStatuses, searchQuery, onlyOpenGaps]);

  // 1. ACTIVE & UPCOMING QUEUE (Today -> Tomorrow -> Day After -> Future)
  const activePos = useMemo(() => {
    const list = filteredBasePos.filter((po) => po.daysLeft === null || po.daysLeft >= 0);

    // Apply Timeline Tab Filter
    let tabFiltered = list;
    if (timelineTab === "today") tabFiltered = list.filter((p) => p.daysLeft === 0);
    else if (timelineTab === "tomorrow") tabFiltered = list.filter((p) => p.daysLeft === 1);
    else if (timelineTab === "day_after") tabFiltered = list.filter((p) => p.daysLeft === 2);
    else if (timelineTab === "future") tabFiltered = list.filter((p) => p.daysLeft !== null && p.daysLeft >= 3);

    // Sort strictly chronological: 0 (Today) -> 1 (Tomorrow) -> 2 (Day After) -> 3+ -> No Date, then largest gap
    return tabFiltered.sort((a, b) => {
      const dayA = a.daysLeft !== null ? a.daysLeft : 9999;
      const dayB = b.daysLeft !== null ? b.daysLeft : 9999;
      if (dayA !== dayB) return dayA - dayB;
      return b.gapVal - a.gapVal;
    });
  }, [filteredBasePos, timelineTab]);

  // 2. EXPIRED & OVERDUE POs BACKLOG QUEUE (Separate Table)
  const expiredPos = useMemo(() => {
    return filteredBasePos
      .filter((po) => po.daysLeft !== null && po.daysLeft < 0)
      .sort((a, b) => {
        // Most recently expired first (-1, -2, -3...), then largest overdue gap
        if (a.daysLeft !== b.daysLeft) return (b.daysLeft ?? 0) - (a.daysLeft ?? 0);
        return b.gapVal - a.gapVal;
      });
  }, [filteredBasePos]);

  // Counts for Timeline Tabs
  const timelineCounts = useMemo(() => {
    let today = 0;
    let tomorrow = 0;
    let dayAfter = 0;
    let future = 0;
    for (const p of filteredBasePos) {
      if (p.daysLeft === 0) today++;
      else if (p.daysLeft === 1) tomorrow++;
      else if (p.daysLeft === 2) dayAfter++;
      else if (p.daysLeft !== null && p.daysLeft >= 3) future++;
    }
    return { today, tomorrow, dayAfter, future, totalActive: today + tomorrow + dayAfter + future };
  }, [filteredBasePos]);

  // Summary Metrics
  const summary = useMemo(() => {
    let p0Count = 0;
    let p0GapVal = 0;
    let expiringTodayCount = 0;
    let expiringTomorrowCount = 0;
    let expiredCount = 0;
    let expiredGapVal = 0;
    let zeroFillCount = 0;
    let completedGrnCount = 0;
    let partialGrnCount = 0;

    for (const po of allPriorityPos) {
      if (po.isPortalCompleted || po.gapVal <= 0.001) {
        completedGrnCount++;
      } else {
        if (po.grnVal > 0) partialGrnCount++;
        else zeroFillCount++;

        if (po.daysLeft === 0) expiringTodayCount++;
        if (po.daysLeft === 1) expiringTomorrowCount++;

        if (po.daysLeft !== null && po.daysLeft < 0) {
          expiredCount++;
          expiredGapVal += po.gapVal;
        }

        if (po.priority.tier === "P0") {
          p0Count++;
          p0GapVal += po.gapVal;
        }
      }
    }

    return {
      p0Count,
      p0GapVal,
      expiringTodayCount,
      expiringTomorrowCount,
      expiredCount,
      expiredGapVal,
      zeroFillCount,
      completedGrnCount,
      partialGrnCount,
      totalPos: allPriorityPos.length,
    };
  }, [allPriorityPos]);

  // Export Active CSV
  function downloadActiveCsv() {
    if (!activePos.length) return;
    const headers = [
      "Timeline Urgency",
      "Portal Status",
      "Priority Tier",
      "GRN & Ack Status",
      "PO Number",
      "PO Date",
      "Expiry Date",
      "Days Left",
      "Trade Channel",
      "City",
      "Depot",
      "PO Value (Lakhs)",
      "Filled GRN (Lakhs)",
      "Remaining Gap (Lakhs)",
      "Fill Rate %",
      "Top Gap SKUs",
    ];

    const rows = activePos.map((p) => [
      `"${p.priority.timelineLabel}"`,
      `"${p.portalBadge.label}"`,
      p.priority.tier,
      `"${p.grnAckStatus.label}"`,
      `"${p.poNumber}"`,
      ymdToDate(p.date),
      ymdToDate(p.expiryDate),
      p.daysLeft !== null ? String(p.daysLeft) : "No Expiry",
      `"${p.trade}"`,
      `"${p.city}"`,
      `"${p.depo}"`,
      p.poVal.toFixed(4),
      p.grnVal.toFixed(4),
      p.gapVal.toFixed(4),
      p.frVal.toFixed(1) + "%",
      `"${p.skus
        .filter((s) => s.gapQty > 0)
        .map((s) => `${s.name} (${s.gapQty} qty, ₹${L2(s.gapVal)}L)`)
        .join("; ")}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `active-po-timeline-queue-${todayYmd()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Export Expired CSV
  function downloadExpiredCsv() {
    if (!expiredPos.length) return;
    const headers = [
      "Overdue Status",
      "Portal Status",
      "GRN & Ack Status",
      "PO Number",
      "PO Date",
      "Expiry Date",
      "Days Overdue",
      "Trade Channel",
      "City",
      "Depot",
      "PO Value (Lakhs)",
      "Filled GRN (Lakhs)",
      "Overdue Gap (Lakhs)",
      "Fill Rate %",
      "Top Gap SKUs",
    ];

    const rows = expiredPos.map((p) => [
      `"Expired ${Math.abs(p.daysLeft ?? 0)} days ago"`,
      `"${p.portalBadge.label}"`,
      `"${p.grnAckStatus.label}"`,
      `"${p.poNumber}"`,
      ymdToDate(p.date),
      ymdToDate(p.expiryDate),
      String(Math.abs(p.daysLeft ?? 0)),
      `"${p.trade}"`,
      `"${p.city}"`,
      `"${p.depo}"`,
      p.poVal.toFixed(4),
      p.grnVal.toFixed(4),
      p.gapVal.toFixed(4),
      p.frVal.toFixed(1) + "%",
      `"${p.skus
        .filter((s) => s.gapQty > 0)
        .map((s) => `${s.name} (${s.gapQty} qty, ₹${L2(s.gapVal)}L)`)
        .join("; ")}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `expired-po-backlog-${todayYmd()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Processed Active Queue (In-Table Search + Column Sorting)
  const processedActivePos = useMemo(() => {
    let list = [...activePos];

    if (activeSearch.trim()) {
      const q = activeSearch.toLowerCase().trim();
      list = list.filter((po) => {
        const poNum = po.poNumber.toLowerCase();
        const city = po.city.toLowerCase();
        const depo = po.depo.toLowerCase();
        const trade = po.trade.toLowerCase();
        const region = po.region.toLowerCase();
        const portal = (po.primaryPortalStatus || "").toLowerCase();
        const grnAck = (po.grnAckStatus.label || "").toLowerCase();
        const timelineLabel = (po.priority.timelineLabel || "").toLowerCase();
        const poDate = ymdToDate(po.date).toLowerCase();
        const expiryDate = ymdToDate(po.expiryDate).toLowerCase();
        const skusMatch = po.skus.some(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            (s.category && s.category.toLowerCase().includes(q))
        );

        return (
          poNum.includes(q) ||
          city.includes(q) ||
          depo.includes(q) ||
          trade.includes(q) ||
          region.includes(q) ||
          portal.includes(q) ||
          grnAck.includes(q) ||
          timelineLabel.includes(q) ||
          poDate.includes(q) ||
          expiryDate.includes(q) ||
          skusMatch
        );
      });
    }

    if (activeSortKey) {
      list.sort((a, b) => {
        let valA: any;
        let valB: any;

        switch (activeSortKey) {
          case "urgency": {
            valA = a.daysLeft !== null ? a.daysLeft : 9999;
            valB = b.daysLeft !== null ? b.daysLeft : 9999;
            break;
          }
          case "portalStatus":
            valA = a.primaryPortalStatus || "";
            valB = b.primaryPortalStatus || "";
            break;
          case "grnAckStatus":
            valA = a.grnAckStatus.label || "";
            valB = b.grnAckStatus.label || "";
            break;
          case "poNumber":
            valA = a.poNumber;
            valB = b.poNumber;
            break;
          case "expiryDate":
            valA = a.expiryDate || 0;
            valB = b.expiryDate || 0;
            break;
          case "city":
            valA = a.city;
            valB = b.city;
            break;
          case "poVal":
            valA = a.poVal;
            valB = b.poVal;
            break;
          case "grnVal":
            valA = a.grnVal;
            valB = b.grnVal;
            break;
          case "gapVal":
            valA = a.gapVal;
            valB = b.gapVal;
            break;
          case "frVal":
            valA = a.frVal;
            valB = b.frVal;
            break;
          case "skuCount":
            valA = a.skus.filter((s) => s.gapQty > 0).length;
            valB = b.skus.filter((s) => s.gapQty > 0).length;
            break;
          default:
            return 0;
        }

        if (typeof valA === "string" && typeof valB === "string") {
          const comp = valA.localeCompare(valB);
          return activeSortDir === "asc" ? comp : -comp;
        }
        const numComp = (valA ?? 0) - (valB ?? 0);
        return activeSortDir === "asc" ? numComp : -numComp;
      });
    }

    return list;
  }, [activePos, activeSearch, activeSortKey, activeSortDir]);

  // Processed Expired Queue (In-Table Search + Column Sorting)
  const processedExpiredPos = useMemo(() => {
    let list = [...expiredPos];

    if (expiredSearch.trim()) {
      const q = expiredSearch.toLowerCase().trim();
      list = list.filter((po) => {
        const poNum = po.poNumber.toLowerCase();
        const city = po.city.toLowerCase();
        const depo = po.depo.toLowerCase();
        const trade = po.trade.toLowerCase();
        const region = po.region.toLowerCase();
        const portal = (po.primaryPortalStatus || "").toLowerCase();
        const grnAck = (po.grnAckStatus.label || "").toLowerCase();
        const poDate = ymdToDate(po.date).toLowerCase();
        const expiryDate = ymdToDate(po.expiryDate).toLowerCase();
        const overdueDays = Math.abs(po.daysLeft ?? 0).toString();
        const skusMatch = po.skus.some(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            (s.category && s.category.toLowerCase().includes(q))
        );

        return (
          poNum.includes(q) ||
          city.includes(q) ||
          depo.includes(q) ||
          trade.includes(q) ||
          region.includes(q) ||
          portal.includes(q) ||
          grnAck.includes(q) ||
          poDate.includes(q) ||
          expiryDate.includes(q) ||
          overdueDays.includes(q) ||
          skusMatch
        );
      });
    }

    if (expiredSortKey) {
      list.sort((a, b) => {
        let valA: any;
        let valB: any;

        switch (expiredSortKey) {
          case "overdue":
            valA = Math.abs(a.daysLeft ?? 0);
            valB = Math.abs(b.daysLeft ?? 0);
            break;
          case "portalStatus":
            valA = a.primaryPortalStatus || "";
            valB = b.primaryPortalStatus || "";
            break;
          case "grnAckStatus":
            valA = a.grnAckStatus.label || "";
            valB = b.grnAckStatus.label || "";
            break;
          case "poNumber":
            valA = a.poNumber;
            valB = b.poNumber;
            break;
          case "date":
            valA = a.expiryDate || 0;
            valB = b.expiryDate || 0;
            break;
          case "city":
            valA = a.city;
            valB = b.city;
            break;
          case "poVal":
            valA = a.poVal;
            valB = b.poVal;
            break;
          case "grnVal":
            valA = a.grnVal;
            valB = b.grnVal;
            break;
          case "gapVal":
            valA = a.gapVal;
            valB = b.gapVal;
            break;
          case "frVal":
            valA = a.frVal;
            valB = b.frVal;
            break;
          case "skuCount":
            valA = a.skus.filter((s) => s.gapQty > 0).length;
            valB = b.skus.filter((s) => s.gapQty > 0).length;
            break;
          default:
            return 0;
        }

        if (typeof valA === "string" && typeof valB === "string") {
          const comp = valA.localeCompare(valB);
          return expiredSortDir === "asc" ? comp : -comp;
        }
        const numComp = (valA ?? 0) - (valB ?? 0);
        return expiredSortDir === "asc" ? numComp : -numComp;
      });
    }

    return list;
  }, [expiredPos, expiredSearch, expiredSortKey, expiredSortDir]);

  // Pagination for Active Queue
  const paginatedActivePos = useMemo(() => {
    const start = (page - 1) * pageSize;
    return processedActivePos.slice(start, start + pageSize);
  }, [processedActivePos, page, pageSize]);

  // Pagination for Expired Queue
  const paginatedExpiredPos = useMemo(() => {
    const start = (expPage - 1) * expPageSize;
    return processedExpiredPos.slice(start, start + expPageSize);
  }, [processedExpiredPos, expPage, expPageSize]);

  if (err) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700">
          Failed to load priority data: {err}
        </div>
      </div>
    );
  }

  if (!d) {
    return (
      <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-4 border-rose-600 border-t-transparent rounded-full animate-spin" />
        <span className="font-semibold text-sm">Evaluating Urgent PO Priorities & Timelines...</span>
      </div>
    );
  }

  const priorityOptions = [
    { key: "P0", label: "P0 · Critical (Fill Now)" },
    { key: "P1", label: "P1 · High Priority" },
    { key: "P2", label: "P2 · Medium Action" },
    { key: "P3", label: "P3 · On Track" },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-6">
      {/* ── Header Bar ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-sm">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold uppercase tracking-wider mb-2">
            <span className="h-2 w-2 rounded-full bg-rose-600 animate-ping" />
            Priority PO Fill & Dispatch Center
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Which POs Need to be Filled Now?
          </h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Fulfillment schedule showing official <strong className="text-sky-600">Trade Portal Status (Completed / GRN Done)</strong> & timeline urgency (<strong className="text-rose-600">Today</strong> → <strong className="text-orange-600">Tomorrow</strong> → <strong className="text-amber-600">Day After</strong>).
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <SyncStatus />
          <UploadButton variant="light" />
          <button
            onClick={downloadActiveCsv}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-bold text-sm shadow-md shadow-rose-900/10 active:scale-95 transition-all cursor-pointer"
          >
            <span>📥</span>
            <span>Export Active Timeline</span>
          </button>
        </div>
      </div>

      {/* ── Top Executive Action Cards (6-Card Grid) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Expires Today */}
        <div className="bg-gradient-to-br from-rose-600 to-rose-800 text-white p-4 rounded-3xl shadow-md shadow-rose-700/20">
          <div className="flex items-center justify-between text-[11px] font-bold text-rose-100 uppercase tracking-wider">
            <span>🚨 Today</span>
            <span className="animate-pulse">⚡</span>
          </div>
          <div className="mt-1.5 text-2xl sm:text-3xl font-black">{summary.expiringTodayCount} POs</div>
          <div className="mt-0.5 text-[11px] font-bold text-rose-100 truncate">
            Must dispatch today!
          </div>
        </div>

        {/* Expires Tomorrow */}
        <div className="bg-white p-4 rounded-3xl border border-orange-200 bg-orange-50/20 shadow-xs">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-orange-600">
            ⏰ Tomorrow
          </div>
          <div className="mt-1.5 text-2xl sm:text-3xl font-black text-orange-900">
            {summary.expiringTomorrowCount} POs
          </div>
          <div className="mt-0.5 text-[11px] font-bold text-orange-700 truncate">Stage for dispatch</div>
        </div>

        {/* Pending Acknowledgement (0% GRN) */}
        <div className="bg-white p-4 rounded-3xl border border-rose-200 bg-rose-50/30 shadow-xs">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-rose-700">
            ⚠️ Pending Ack
          </div>
          <div className="mt-1.5 text-2xl sm:text-3xl font-black text-rose-900">
            {summary.zeroFillCount} POs
          </div>
          <div className="mt-0.5 text-[11px] font-bold text-rose-600 truncate">0% GRN Dispatched</div>
        </div>

        {/* Partially Supplied */}
        <div className="bg-white p-4 rounded-3xl border border-amber-200 bg-amber-50/20 shadow-xs">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700">
            ⏳ Partial GRN
          </div>
          <div className="mt-1.5 text-2xl sm:text-3xl font-black text-amber-900">
            {summary.partialGrnCount} POs
          </div>
          <div className="mt-0.5 text-[11px] font-semibold text-amber-700 truncate">Open gap pending</div>
        </div>

        {/* GRN Done (100% / Portal Completed) */}
        <div className="bg-white p-4 rounded-3xl border border-emerald-200 bg-emerald-50/20 shadow-xs">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">
            ✓ GRN Done
          </div>
          <div className="mt-1.5 text-2xl sm:text-3xl font-black text-emerald-900">
            {summary.completedGrnCount} POs
          </div>
          <div className="mt-0.5 text-[11px] font-bold text-emerald-700 truncate">Completed / GRN Done</div>
        </div>

        {/* Expired Backlog */}
        <div className="bg-white p-4 rounded-3xl border border-rose-300 bg-rose-50/40 shadow-xs">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-rose-700">
            🚨 Expired
          </div>
          <div className="mt-1.5 text-2xl sm:text-3xl font-black text-rose-900">
            {summary.expiredCount} POs
          </div>
          <div className="mt-0.5 text-[11px] font-extrabold text-rose-600 truncate">
            ₹{L2(summary.expiredGapVal)}L Overdue
          </div>
        </div>
      </div>

      {/* ── Comprehensive Filter Bar with Date Selection & Multi-Select Filters ── */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm font-extrabold text-slate-900">
              Date & Multi-Select Filters
            </span>
            {(selMonths.length > 0 ||
              selTiers.length > 0 ||
              selCities.length > 0 ||
              selDepots.length > 0 ||
              selTrades.length > 0 ||
              selRegions.length > 0 ||
              selCategories.length > 0 ||
              selUrgencies.length > 0 ||
              selGrnStatuses.length > 0 ||
              searchQuery ||
              onlyOpenGaps ||
              (fFrom && d && fFrom !== d.meta.date_min)) && (
              <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-xs font-bold">
                Filtered Active
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyOpenGaps}
                onChange={(e) => setOnlyOpenGaps(e.target.checked)}
                className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 h-4 w-4 accent-rose-600"
              />
              <span>Only Show Open Gaps (Hide 100% Completed)</span>
            </label>

            <button
              onClick={resetAllFilters}
              className="px-3 py-1 rounded-lg border border-rose-200 bg-rose-50/60 hover:bg-rose-100 text-rose-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <span>✕</span>
              <span>Reset All Filters</span>
            </button>
          </div>
        </div>

        {/* Row 1: Date Range, Presets & Primary Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* From Date */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              From Date
            </label>
            <input
              type="date"
              value={fFrom}
              onChange={(e) => setFFrom(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          {/* To Date */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              To Date
            </label>
            <input
              type="date"
              value={fTo}
              onChange={(e) => setFTo(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

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

          {/* Priority Tier Filter (Multi-Select) */}
          <MultiSelectDropdown
            label="Priority Tier"
            options={priorityOptions}
            selected={selTiers}
            onChange={(s) => setSelTiers(s)}
            open={openDropdown === "tier"}
            onToggle={() => setOpenDropdown(openDropdown === "tier" ? null : "tier")}
            onClose={() => setOpenDropdown(null)}
          />

          {/* GRN & Acknowledgement Status Filter (Multi-Select) */}
          <MultiSelectDropdown
            label="GRN & Ack Status"
            options={GRN_STATUS_OPTIONS}
            selected={selGrnStatuses}
            onChange={(s) => setSelGrnStatuses(s)}
            open={openDropdown === "grnStatus"}
            onToggle={() => setOpenDropdown(openDropdown === "grnStatus" ? null : "grnStatus")}
            onClose={() => setOpenDropdown(null)}
          />

          {/* Expiry Deadline / Urgency (Multi-Select) */}
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

        {/* Row 2: Secondary Filters (City, Depot, Trade, Region, Category) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 pt-2 border-t border-slate-100">
          {/* City / Location (Multi-Select) */}
          <MultiSelectDropdown
            label="Location / City"
            options={d.dims.city.map((c) => ({ key: c, label: c }))}
            selected={selCities}
            onChange={(s) => setSelCities(s)}
            open={openDropdown === "city"}
            onToggle={() => setOpenDropdown(openDropdown === "city" ? null : "city")}
            onClose={() => setOpenDropdown(null)}
          />

          {/* Depot Filter */}
          <MultiSelectDropdown
            label="Depot"
            options={allDepotsList.map((depo) => ({ key: depo, label: depo }))}
            selected={selDepots}
            onChange={(s) => setSelDepots(s)}
            open={openDropdown === "depo"}
            onToggle={() => setOpenDropdown(openDropdown === "depo" ? null : "depo")}
            onClose={() => setOpenDropdown(null)}
          />

          {/* Trade / Channel */}
          <MultiSelectDropdown
            label="Trade Channel"
            options={d.dims.trade.map((t) => ({ key: t, label: t }))}
            selected={selTrades}
            onChange={(s) => setSelTrades(s)}
            open={openDropdown === "trade"}
            onToggle={() => setOpenDropdown(openDropdown === "trade" ? null : "trade")}
            onClose={() => setOpenDropdown(null)}
          />

          {/* Region */}
          <MultiSelectDropdown
            label="Region"
            options={d.dims.region.map((r) => ({ key: r, label: r }))}
            selected={selRegions}
            onChange={(s) => setSelRegions(s)}
            open={openDropdown === "region"}
            onToggle={() => setOpenDropdown(openDropdown === "region" ? null : "region")}
            onClose={() => setOpenDropdown(null)}
          />

          {/* Category */}
          <MultiSelectDropdown
            label="Category"
            options={d.dims.category.map((cat) => ({ key: cat, label: cat }))}
            selected={selCategories}
            onChange={(s) => setSelCategories(s)}
            open={openDropdown === "category"}
            onToggle={() => setOpenDropdown(openDropdown === "category" ? null : "category")}
            onClose={() => setOpenDropdown(null)}
          />
        </div>

        {/* Quick Date Presets & Free Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Date Presets:
            </span>
            {DATE_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => applyDatePreset(p.days)}
                className="px-3 py-1 text-xs font-bold rounded-lg border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700 transition cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="relative min-w-[280px]">
            <input
              type="text"
              placeholder="Search PO#, city, SKU, depot..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            <span className="absolute left-2.5 top-2.5 text-slate-400 text-xs">🔍</span>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2 text-xs text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TABLE 1: ACTIVE & UPCOMING PO FULFILLMENT QUEUE (Today -> Tomorrow -> Day After)
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
        {/* Header with Timeline Tabs */}
        <div className="p-5 border-b border-slate-100 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-xs font-extrabold uppercase mb-1">
                ⚡ Active Fulfillment Queue
              </div>
              <h3 className="font-extrabold text-slate-900 text-lg">
                Upcoming POs to Fill (Today → Tomorrow → Day After)
              </h3>
              <p className="text-xs font-medium text-slate-500">
                Shows official Trade Portal Status & urgency timeline. Completed POs are verified against portal records.
              </p>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative min-w-[260px]">
                <input
                  type="text"
                  placeholder="Search in Active POs (PO#, SKU, City...)"
                  value={activeSearch}
                  onChange={(e) => {
                    setActiveSearch(e.target.value);
                    setPage(1);
                  }}
                  className="w-full pl-8 pr-7 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <span className="absolute left-2.5 top-2 text-slate-400 text-xs">🔍</span>
                {activeSearch && (
                  <button
                    onClick={() => {
                      setActiveSearch("");
                      setPage(1);
                    }}
                    className="absolute right-2.5 top-1.5 text-xs text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className="text-xs font-bold text-slate-500 whitespace-nowrap">
                Showing {processedActivePos.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, processedActivePos.length)} of{" "}
                {processedActivePos.length} active POs
              </div>
            </div>
          </div>

          {/* Timeline Quick Filter Tabs */}
          <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-100">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Urgency Filter:
            </span>
            <button
              onClick={() => {
                setTimelineTab("all");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                timelineTab === "all"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              All Active ({timelineCounts.totalActive})
            </button>

            <button
              onClick={() => {
                setTimelineTab("today");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                timelineTab === "today"
                  ? "bg-rose-600 text-white shadow-md shadow-rose-600/30 ring-2 ring-rose-400"
                  : "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
              }`}
            >
              <span>🚨 Today</span>
              <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-[10px]">
                {timelineCounts.today}
              </span>
            </button>

            <button
              onClick={() => {
                setTimelineTab("tomorrow");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                timelineTab === "tomorrow"
                  ? "bg-orange-500 text-white shadow-xs ring-2 ring-orange-300"
                  : "bg-orange-50 text-orange-800 border border-orange-200 hover:bg-orange-100"
              }`}
            >
              <span>⏰ Tomorrow</span>
              <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-[10px]">
                {timelineCounts.tomorrow}
              </span>
            </button>

            <button
              onClick={() => {
                setTimelineTab("day_after");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                timelineTab === "day_after"
                  ? "bg-amber-500 text-white shadow-xs ring-2 ring-amber-300"
                  : "bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100"
              }`}
            >
              <span>📅 Day After Tomorrow</span>
              <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-[10px]">
                {timelineCounts.dayAfter}
              </span>
            </button>

            <button
              onClick={() => {
                setTimelineTab("future");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                timelineTab === "future"
                  ? "bg-slate-700 text-white shadow-xs"
                  : "bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100"
              }`}
            >
              <span>⏳ In 3+ Days ({timelineCounts.future})</span>
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 font-extrabold uppercase text-[11px] tracking-wider border-y border-slate-200 select-none">
              <tr>
                <th
                  onClick={() => toggleActiveSort("urgency")}
                  className={`py-3.5 px-4 text-center cursor-pointer hover:bg-slate-100 transition-colors ${
                    activeSortKey === "urgency" ? "text-purple-900 bg-purple-50/60" : ""
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span>Urgency Timeline</span>
                    <span className="text-[10px] font-black text-purple-700">
                      {activeSortKey === "urgency" ? (activeSortDir === "asc" ? "▲" : "▼") : "⇅"}
                    </span>
                  </div>
                </th>

                <th
                  onClick={() => toggleActiveSort("portalStatus")}
                  className={`py-3.5 px-4 text-center cursor-pointer hover:bg-slate-100 transition-colors ${
                    activeSortKey === "portalStatus" ? "text-purple-900 bg-purple-50/60" : ""
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span>Trade Portal Status</span>
                    <span className="text-[10px] font-black text-purple-700">
                      {activeSortKey === "portalStatus" ? (activeSortDir === "asc" ? "▲" : "▼") : "⇅"}
                    </span>
                  </div>
                </th>

                <th
                  onClick={() => toggleActiveSort("grnAckStatus")}
                  className={`py-3.5 px-4 text-center cursor-pointer hover:bg-slate-100 transition-colors ${
                    activeSortKey === "grnAckStatus" ? "text-purple-900 bg-purple-50/60" : ""
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span>GRN & Ack Status</span>
                    <span className="text-[10px] font-black text-purple-700">
                      {activeSortKey === "grnAckStatus" ? (activeSortDir === "asc" ? "▲" : "▼") : "⇅"}
                    </span>
                  </div>
                </th>

                <th
                  onClick={() => toggleActiveSort("poNumber")}
                  className={`py-3.5 px-4 cursor-pointer hover:bg-slate-100 transition-colors ${
                    activeSortKey === "poNumber" ? "text-purple-900 bg-purple-50/60" : ""
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>PO Number</span>
                    <span className="text-[10px] font-black text-purple-700">
                      {activeSortKey === "poNumber" ? (activeSortDir === "asc" ? "▲" : "▼") : "⇅"}
                    </span>
                  </div>
                </th>

                <th
                  onClick={() => toggleActiveSort("expiryDate")}
                  className={`py-3.5 px-4 cursor-pointer hover:bg-slate-100 transition-colors ${
                    activeSortKey === "expiryDate" ? "text-purple-900 bg-purple-50/60" : ""
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>Expiry Deadline</span>
                    <span className="text-[10px] font-black text-purple-700">
                      {activeSortKey === "expiryDate" ? (activeSortDir === "asc" ? "▲" : "▼") : "⇅"}
                    </span>
                  </div>
                </th>

                <th
                  onClick={() => toggleActiveSort("city")}
                  className={`py-3.5 px-4 cursor-pointer hover:bg-slate-100 transition-colors ${
                    activeSortKey === "city" ? "text-purple-900 bg-purple-50/60" : ""
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>Channel & Location</span>
                    <span className="text-[10px] font-black text-purple-700">
                      {activeSortKey === "city" ? (activeSortDir === "asc" ? "▲" : "▼") : "⇅"}
                    </span>
                  </div>
                </th>

                <th
                  onClick={() => toggleActiveSort("poVal")}
                  className={`py-3.5 px-4 text-right cursor-pointer hover:bg-slate-100 transition-colors ${
                    activeSortKey === "poVal" ? "text-purple-900 bg-purple-50/60" : ""
                  }`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>PO Val (₹)</span>
                    <span className="text-[10px] font-black text-purple-700">
                      {activeSortKey === "poVal" ? (activeSortDir === "asc" ? "▲" : "▼") : "⇅"}
                    </span>
                  </div>
                </th>

                <th
                  onClick={() => toggleActiveSort("grnVal")}
                  className={`py-3.5 px-4 text-right cursor-pointer hover:bg-slate-100 transition-colors ${
                    activeSortKey === "grnVal" ? "text-purple-900 bg-purple-50/60" : ""
                  }`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Filled GRN (₹)</span>
                    <span className="text-[10px] font-black text-purple-700">
                      {activeSortKey === "grnVal" ? (activeSortDir === "asc" ? "▲" : "▼") : "⇅"}
                    </span>
                  </div>
                </th>

                <th
                  onClick={() => toggleActiveSort("gapVal")}
                  className={`py-3.5 px-4 text-right cursor-pointer hover:bg-slate-100 transition-colors ${
                    activeSortKey === "gapVal" ? "text-purple-900 bg-purple-50/60" : ""
                  }`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Remaining Gap (₹)</span>
                    <span className="text-[10px] font-black text-purple-700">
                      {activeSortKey === "gapVal" ? (activeSortDir === "asc" ? "▲" : "▼") : "⇅"}
                    </span>
                  </div>
                </th>

                <th
                  onClick={() => toggleActiveSort("frVal")}
                  className={`py-3.5 px-4 text-center cursor-pointer hover:bg-slate-100 transition-colors ${
                    activeSortKey === "frVal" ? "text-purple-900 bg-purple-50/60" : ""
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span>Fill Rate %</span>
                    <span className="text-[10px] font-black text-purple-700">
                      {activeSortKey === "frVal" ? (activeSortDir === "asc" ? "▲" : "▼") : "⇅"}
                    </span>
                  </div>
                </th>

                <th
                  onClick={() => toggleActiveSort("skuCount")}
                  className={`py-3.5 px-4 cursor-pointer hover:bg-slate-100 transition-colors ${
                    activeSortKey === "skuCount" ? "text-purple-900 bg-purple-50/60" : ""
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>Unfulfilled SKUs</span>
                    <span className="text-[10px] font-black text-purple-700">
                      {activeSortKey === "skuCount" ? (activeSortDir === "asc" ? "▲" : "▼") : "⇅"}
                    </span>
                  </div>
                </th>

                <th className="py-3.5 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {paginatedActivePos.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-400">
                    <span className="text-3xl block mb-2">🎉</span>
                    <p className="text-sm font-bold text-slate-700">No active POs found</p>
                    <p className="text-xs text-slate-400">Try adjusting your table search or urgency filter.</p>
                  </td>
                </tr>
              ) : (
                paginatedActivePos.map((po, idx) => {
                  const globalRank = (page - 1) * pageSize + idx + 1;
                  const unfulfilledSkus = po.skus.filter((s) => s.gapQty > 0);

                  return (
                    <tr key={po.poId} className={`transition-colors ${po.priority.rowCls}`}>
                      {/* Urgency Timeline Badge */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span className="font-mono text-xs font-black text-slate-400">
                            #{globalRank}
                          </span>
                          <span
                            className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold border ${po.priority.timelineBadgeCls}`}
                          >
                            {po.priority.timelineLabel}
                          </span>
                        </div>
                      </td>

                      {/* Trade Portal Status (COLUMN) */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border shadow-2xs ${po.portalBadge.badgeCls}`}
                        >
                          <span>{po.portalBadge.icon}</span>
                          <span>{po.portalBadge.label}</span>
                        </span>
                      </td>

                      {/* GRN & Acknowledgement Status */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border shadow-2xs ${po.grnAckStatus.badgeCls}`}
                        >
                          <span className="text-xs">{po.grnAckStatus.icon}</span>
                          <span>{po.grnAckStatus.statusText}</span>
                        </span>
                      </td>

                      {/* PO Number */}
                      <td className="py-3.5 px-4 font-mono font-extrabold text-purple-950">
                        {po.poNumber}
                        <div className="text-[10px] font-semibold text-slate-400">
                          Raised: {ymdToDate(po.date)}
                        </div>
                      </td>

                      {/* Expiry Deadline */}
                      <td className="py-3.5 px-4">
                        {po.daysLeft === null ? (
                          <span className="text-xs text-slate-500 font-semibold">No Expiry</span>
                        ) : po.daysLeft === 0 ? (
                          <span className="inline-flex px-2.5 py-0.5 rounded-md bg-rose-600 text-white text-xs font-extrabold shadow-xs animate-pulse">
                            Expires Today!
                          </span>
                        ) : po.daysLeft === 1 ? (
                          <span className="inline-flex px-2.5 py-0.5 rounded-md bg-orange-100 text-orange-900 text-xs font-extrabold border border-orange-300">
                            Tomorrow ({ymdToDate(po.expiryDate)})
                          </span>
                        ) : po.daysLeft === 2 ? (
                          <span className="inline-flex px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-900 text-xs font-extrabold border border-amber-300">
                            Day After ({ymdToDate(po.expiryDate)})
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-slate-600">
                            {po.daysLeft}d left ({ymdToDate(po.expiryDate)})
                          </span>
                        )}
                      </td>

                      {/* Channel & Location */}
                      <td className="py-3.5 px-4">
                        <div className="font-extrabold text-slate-900">{po.city}</div>
                        <div className="text-xs text-slate-500 font-semibold">
                          {po.depo} · <span className="text-purple-700">{po.trade}</span>
                        </div>
                      </td>

                      {/* PO Value */}
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                        ₹{L2(po.poVal)}L
                      </td>

                      {/* Filled GRN */}
                      <td className="py-3.5 px-4 text-right font-semibold text-emerald-700">
                        ₹{L2(po.grnVal)}L
                      </td>

                      {/* Remaining Gap */}
                      <td className="py-3.5 px-4 text-right font-extrabold text-rose-700">
                        ₹{L2(po.gapVal)}L
                      </td>

                      {/* Fill Rate % */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="inline-flex flex-col items-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                              po.frVal >= 90
                                ? "bg-emerald-100 text-emerald-800"
                                : po.frVal >= 75
                                ? "bg-amber-100 text-amber-800"
                                : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {po.frVal.toFixed(1)}%
                          </span>
                        </div>
                      </td>

                      {/* Unfulfilled SKUs to Dispatch */}
                      <td className="py-3.5 px-4 max-w-xs">
                        {unfulfilledSkus.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setActiveDispatchPo(po)}
                            className="text-left group flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-900 transition-all cursor-pointer max-w-full"
                          >
                            <span className="truncate text-xs font-semibold max-w-[190px]">
                              {unfulfilledSkus.map((s) => s.name).join(", ")}
                            </span>
                            <span className="shrink-0 px-1.5 py-0.2 rounded-md bg-purple-700 text-white font-bold text-[10px]">
                              {unfulfilledSkus.length} SKUs 🔍
                            </span>
                          </button>
                        ) : (
                          <span className="text-emerald-600 text-xs font-semibold">✓ 100% Filled</span>
                        )}
                      </td>

                      {/* Action Button */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => setActiveDispatchPo(po)}
                          className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-rose-600 via-purple-700 to-indigo-700 hover:from-rose-700 hover:to-indigo-800 text-white font-extrabold text-xs shadow-sm hover:shadow-md transition active:scale-95 cursor-pointer"
                        >
                          Fill Now ⚡
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Active Table */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-semibold">Rows:</span>
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
              Page {page} of {Math.ceil(processedActivePos.length / pageSize) || 1}
            </span>
            <button
              disabled={page >= Math.ceil(processedActivePos.length / pageSize)}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold disabled:opacity-40 hover:bg-slate-50 cursor-pointer"
            >
              Next →
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TABLE 2: EXPIRED & OVERDUE POs BACKLOG (Separate Dedicated Table)
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-3xl border border-rose-300 shadow-lg shadow-rose-950/5 overflow-hidden space-y-4">
        {/* Header */}
        <div className="p-5 border-b border-rose-100 bg-gradient-to-r from-rose-50 via-purple-50 to-indigo-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-md bg-rose-600 text-white text-xs font-black uppercase mb-1">
              🚨 Overdue & Expired Backlog
            </div>
            <h3 className="font-black text-rose-950 text-lg">
              Expired POs Requiring Urgent Recovery ({processedExpiredPos.length} Orders)
            </h3>
            <p className="text-xs font-medium text-rose-900/80">
              POs past their validity deadline with open gap value. Prioritized for immediate recovery dispatch.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative min-w-[260px]">
              <input
                type="text"
                placeholder="Search in Expired Backlog (PO#, City, SKUs...)"
                value={expiredSearch}
                onChange={(e) => {
                  setExpiredSearch(e.target.value);
                  setExpPage(1);
                }}
                className="w-full pl-8 pr-7 py-1.5 rounded-xl border border-rose-200 bg-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              <span className="absolute left-2.5 top-2 text-rose-400 text-xs">🔍</span>
              {expiredSearch && (
                <button
                  onClick={() => {
                    setExpiredSearch("");
                    setExpPage(1);
                  }}
                  className="absolute right-2.5 top-1.5 text-xs text-rose-400 hover:text-rose-600 font-bold cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            <button
              onClick={downloadExpiredCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-300 bg-white hover:bg-rose-50 text-rose-800 text-xs font-extrabold shadow-2xs transition cursor-pointer shrink-0"
            >
              <span>📥</span>
              <span>Export Expired Backlog CSV</span>
            </button>
          </div>
        </div>

        {/* Expired Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-rose-50/70 text-rose-900 font-extrabold uppercase text-[11px] tracking-wider border-y border-rose-200 select-none">
              <tr>
                <th
                  onClick={() => toggleExpiredSort("overdue")}
                  className={`py-3.5 px-4 text-center cursor-pointer hover:bg-rose-100/70 transition-colors ${
                    expiredSortKey === "overdue" ? "text-rose-950 bg-rose-100/90" : ""
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span>Overdue Status</span>
                    <span className="text-[10px] font-black text-rose-700">
                      {expiredSortKey === "overdue" ? (expiredSortDir === "asc" ? "▲" : "▼") : "⇅"}
                    </span>
                  </div>
                </th>

                <th
                  onClick={() => toggleExpiredSort("portalStatus")}
                  className={`py-3.5 px-4 text-center cursor-pointer hover:bg-rose-100/70 transition-colors ${
                    expiredSortKey === "portalStatus" ? "text-rose-950 bg-rose-100/90" : ""
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span>Trade Portal Status</span>
                    <span className="text-[10px] font-black text-rose-700">
                      {expiredSortKey === "portalStatus" ? (expiredSortDir === "asc" ? "▲" : "▼") : "⇅"}
                    </span>
                  </div>
                </th>

                <th
                  onClick={() => toggleExpiredSort("grnAckStatus")}
                  className={`py-3.5 px-4 text-center cursor-pointer hover:bg-rose-100/70 transition-colors ${
                    expiredSortKey === "grnAckStatus" ? "text-rose-950 bg-rose-100/90" : ""
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span>GRN & Ack Status</span>
                    <span className="text-[10px] font-black text-rose-700">
                      {expiredSortKey === "grnAckStatus" ? (expiredSortDir === "asc" ? "▲" : "▼") : "⇅"}
                    </span>
                  </div>
                </th>

                <th
                  onClick={() => toggleExpiredSort("poNumber")}
                  className={`py-3.5 px-4 cursor-pointer hover:bg-rose-100/70 transition-colors ${
                    expiredSortKey === "poNumber" ? "text-rose-950 bg-rose-100/90" : ""
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>PO Number</span>
                    <span className="text-[10px] font-black text-rose-700">
                      {expiredSortKey === "poNumber" ? (expiredSortDir === "asc" ? "▲" : "▼") : "⇅"}
                    </span>
                  </div>
                </th>

                <th
                  onClick={() => toggleExpiredSort("date")}
                  className={`py-3.5 px-4 cursor-pointer hover:bg-rose-100/70 transition-colors ${
                    expiredSortKey === "date" ? "text-rose-950 bg-rose-100/90" : ""
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>Raised / Expired Date</span>
                    <span className="text-[10px] font-black text-rose-700">
                      {expiredSortKey === "date" ? (expiredSortDir === "asc" ? "▲" : "▼") : "⇅"}
                    </span>
                  </div>
                </th>

                <th
                  onClick={() => toggleExpiredSort("city")}
                  className={`py-3.5 px-4 cursor-pointer hover:bg-rose-100/70 transition-colors ${
                    expiredSortKey === "city" ? "text-rose-950 bg-rose-100/90" : ""
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>Channel & Location</span>
                    <span className="text-[10px] font-black text-rose-700">
                      {expiredSortKey === "city" ? (expiredSortDir === "asc" ? "▲" : "▼") : "⇅"}
                    </span>
                  </div>
                </th>

                <th
                  onClick={() => toggleExpiredSort("poVal")}
                  className={`py-3.5 px-4 text-right cursor-pointer hover:bg-rose-100/70 transition-colors ${
                    expiredSortKey === "poVal" ? "text-rose-950 bg-rose-100/90" : ""
                  }`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>PO Val (₹)</span>
                    <span className="text-[10px] font-black text-rose-700">
                      {expiredSortKey === "poVal" ? (expiredSortDir === "asc" ? "▲" : "▼") : "⇅"}
                    </span>
                  </div>
                </th>

                <th
                  onClick={() => toggleExpiredSort("grnVal")}
                  className={`py-3.5 px-4 text-right cursor-pointer hover:bg-rose-100/70 transition-colors ${
                    expiredSortKey === "grnVal" ? "text-rose-950 bg-rose-100/90" : ""
                  }`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Filled GRN (₹)</span>
                    <span className="text-[10px] font-black text-rose-700">
                      {expiredSortKey === "grnVal" ? (expiredSortDir === "asc" ? "▲" : "▼") : "⇅"}
                    </span>
                  </div>
                </th>

                <th
                  onClick={() => toggleExpiredSort("gapVal")}
                  className={`py-3.5 px-4 text-right cursor-pointer hover:bg-rose-100/70 transition-colors ${
                    expiredSortKey === "gapVal" ? "text-rose-950 bg-rose-100/90" : ""
                  }`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Overdue Gap (₹)</span>
                    <span className="text-[10px] font-black text-rose-700">
                      {expiredSortKey === "gapVal" ? (expiredSortDir === "asc" ? "▲" : "▼") : "⇅"}
                    </span>
                  </div>
                </th>

                <th
                  onClick={() => toggleExpiredSort("frVal")}
                  className={`py-3.5 px-4 text-center cursor-pointer hover:bg-rose-100/70 transition-colors ${
                    expiredSortKey === "frVal" ? "text-rose-950 bg-rose-100/90" : ""
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span>Fill Rate %</span>
                    <span className="text-[10px] font-black text-rose-700">
                      {expiredSortKey === "frVal" ? (expiredSortDir === "asc" ? "▲" : "▼") : "⇅"}
                    </span>
                  </div>
                </th>

                <th
                  onClick={() => toggleExpiredSort("skuCount")}
                  className={`py-3.5 px-4 cursor-pointer hover:bg-rose-100/70 transition-colors ${
                    expiredSortKey === "skuCount" ? "text-rose-950 bg-rose-100/90" : ""
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>Unfulfilled Gap SKUs</span>
                    <span className="text-[10px] font-black text-rose-700">
                      {expiredSortKey === "skuCount" ? (expiredSortDir === "asc" ? "▲" : "▼") : "⇅"}
                    </span>
                  </div>
                </th>

                <th className="py-3.5 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {paginatedExpiredPos.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-400">
                    <span className="text-3xl block mb-2">🎉</span>
                    <p className="text-sm font-bold text-emerald-700">Zero Expired POs</p>
                    <p className="text-xs text-slate-400">All POs in this selection are within their valid deadline.</p>
                  </td>
                </tr>
              ) : (
                paginatedExpiredPos.map((po, idx) => {
                  const globalRank = (expPage - 1) * expPageSize + idx + 1;
                  const unfulfilledSkus = po.skus.filter((s) => s.gapQty > 0);

                  return (
                    <tr key={po.poId} className="bg-rose-50/30 hover:bg-rose-50/70 transition-colors">
                      {/* Overdue Status */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span className="font-mono text-xs font-black text-rose-500">
                            #{globalRank}
                          </span>
                          <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-black bg-rose-600 text-white shadow-2xs">
                            Expired {Math.abs(po.daysLeft ?? 0)}d ago
                          </span>
                        </div>
                      </td>

                      {/* Trade Portal Status */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border shadow-2xs ${po.portalBadge.badgeCls}`}
                        >
                          <span>{po.portalBadge.icon}</span>
                          <span>{po.portalBadge.label}</span>
                        </span>
                      </td>

                      {/* GRN & Acknowledgement Status */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border shadow-2xs ${po.grnAckStatus.badgeCls}`}
                        >
                          <span className="text-xs">{po.grnAckStatus.icon}</span>
                          <span>{po.grnAckStatus.statusText}</span>
                        </span>
                      </td>

                      {/* PO Number */}
                      <td className="py-3.5 px-4 font-mono font-extrabold text-purple-950">
                        {po.poNumber}
                        <div className="text-[10px] font-semibold text-rose-600">
                          Overdue Recovery
                        </div>
                      </td>

                      {/* Dates */}
                      <td className="py-3.5 px-4 text-xs font-medium text-slate-600">
                        <div>Raised: {ymdToDate(po.date)}</div>
                        <div className="font-bold text-rose-700">Expired: {ymdToDate(po.expiryDate)}</div>
                      </td>

                      {/* Channel & Location */}
                      <td className="py-3.5 px-4">
                        <div className="font-extrabold text-slate-900">{po.city}</div>
                        <div className="text-xs text-slate-500 font-semibold">
                          {po.depo} · <span className="text-purple-700">{po.trade}</span>
                        </div>
                      </td>

                      {/* PO Value */}
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                        ₹{L2(po.poVal)}L
                      </td>

                      {/* Filled GRN */}
                      <td className="py-3.5 px-4 text-right font-semibold text-emerald-700">
                        ₹{L2(po.grnVal)}L
                      </td>

                      {/* Remaining Gap */}
                      <td className="py-3.5 px-4 text-right font-black text-rose-700">
                        ₹{L2(po.gapVal)}L
                      </td>

                      {/* Fill Rate % */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            po.frVal >= 90
                              ? "bg-emerald-100 text-emerald-800"
                              : po.frVal >= 75
                              ? "bg-amber-100 text-amber-800"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {po.frVal.toFixed(1)}%
                        </span>
                      </td>

                      {/* Unfulfilled SKUs */}
                      <td className="py-3.5 px-4 max-w-xs">
                        {unfulfilledSkus.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setActiveDispatchPo(po)}
                            className="text-left group flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-900 transition-all cursor-pointer max-w-full"
                          >
                            <span className="truncate text-xs font-semibold max-w-[190px]">
                              {unfulfilledSkus.map((s) => s.name).join(", ")}
                            </span>
                            <span className="shrink-0 px-1.5 py-0.2 rounded-md bg-purple-700 text-white font-bold text-[10px]">
                              {unfulfilledSkus.length} SKUs 🔍
                            </span>
                          </button>
                        ) : (
                          <span className="text-emerald-600 text-xs font-semibold">✓ 100% Filled</span>
                        )}
                      </td>

                      {/* Action Button */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => setActiveDispatchPo(po)}
                          className="px-3.5 py-1.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-black text-xs shadow-sm hover:shadow-md transition active:scale-95 cursor-pointer"
                        >
                          Recover / Fill ⚡
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Expired Table */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-semibold">Rows:</span>
            <select
              value={expPageSize}
              onChange={(e) => {
                setExpPageSize(+e.target.value);
                setExpPage(1);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700"
            >
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={expPage <= 1}
              onClick={() => setExpPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold disabled:opacity-40 hover:bg-slate-50 cursor-pointer"
            >
              ← Prev
            </button>
            <span className="text-xs font-bold text-slate-700">
              Page {expPage} of {Math.ceil(processedExpiredPos.length / expPageSize) || 1}
            </span>
            <button
              disabled={expPage >= Math.ceil(processedExpiredPos.length / expPageSize)}
              onClick={() => setExpPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold disabled:opacity-40 hover:bg-slate-50 cursor-pointer"
            >
              Next →
            </button>
          </div>
        </div>
      </div>

      {/* ── Dispatch Modal ── */}
      {activeDispatchPo && (
        <DispatchModal
          po={activeDispatchPo}
          onClose={() => setActiveDispatchPo(null)}
          onOpenSkuLightbox={(sku) => setSkuPopup(sku)}
        />
      )}

      {/* ── Lightbox Single SKU ── */}
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
