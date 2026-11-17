"use client";

import { useEffect, useMemo, useState } from "react";
import UploadButton from "../upload-button";
import SyncStatus from "../sync-status";
import { matchSkuIcon } from "@/lib/sku-icon";
import SkuImagePopup from "../sku-image-popup";
import { lookupDepoByCity } from "@/lib/depo-mapping";

/* Row: [month,trade,region,city,category,status,sku,
         poQty,poVal,grnQty,grnVal,dateYYYYMMDD,poId,expiryYYYYMMDD] */

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
  const a = ymdToUTC(fromYmd), b = ymdToUTC(toYmd);
  if (a == null || b == null) return null;
  return Math.round((b - a) / 86400000);
};
const todayYmd = () => {
  const t = new Date();
  return t.getUTCFullYear() * 10000 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate();
};

/* PO Date Range filter — same pattern as FR Summary. Values are plain
   YYYY-MM-DD strings from <input type="date">, converted to YYYYMMDD
   integers for comparison against row[11] (the PO date column). */
const DATE_PRESETS = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "MTD", days: 0 },
  { label: "All", days: -1 },
];
const dateToYmd = (s: string) => (s ? +s.replaceAll("-", "") : 0);

const URGENCY = [
  { key: "expired", label: "Expired" },
  { key: "2d", label: "≤ 2 Days" },
  { key: "3d", label: "≤ 3 Days" },
  { key: "7d", label: "≤ 7 Days" },
  { key: "all", label: "All" },
] as const;
type UrgencyKey = (typeof URGENCY)[number]["key"];

/* Splits the PO table into two panes by status, per ops request:
   pane A = "closed / done" states, pane B = "still moving through the
   pipeline" states. Matching is done on a normalized (upper-case,
   space/dash → underscore) status label so it doesn't matter whether the
   sheet stores "GRN Done", "grn-done", or "GRN_DONE". */
const STATUS_GROUP_A = new Set([
  "COMPLETED",
  "EXPIRED",
  "GRN_DONE",
  "FULLY_SUPPLIED_PO",
  "FULLY_SUPPLIED",
  "PO_FULLY_SUPPLIED",
]);
const STATUS_GROUP_B = new Set([
  "PENDING_ACKNOWLEDGEMENT",
  "ASN_CREATED",
  "CANCELLED",
  "PARTIALLY_SUPPLIED_PO",
  "PARTIALLY_SUPPLIED",
  "PO_PARTIALLY_SUPPLIED",
  "ZERO_SUPPLY_PO",
  "ZERO_SUPPLY",
  "UNSUPPLIED",
  "OPEN_PO",
  "OPEN",
  "OPEN_POS",
]);
const normStatus = (s: string) => s.trim().toUpperCase().replace(/[\s-]+/g, "_");

function statusOf(daysLeft: number | null) {
  if (daysLeft === null) return { label: "No Expiry Date", cls: "bg-slate-100 text-slate-600" };
  if (daysLeft < 0) return { label: `Expired ${L(Math.abs(daysLeft), 0)}d ago`, cls: "bg-rose-100 text-rose-700" };
  if (daysLeft === 0) return { label: "Expires Today", cls: "bg-rose-100 text-rose-700" };
  if (daysLeft <= 3) return { label: `${daysLeft}d left`, cls: "bg-amber-100 text-amber-700" };
  if (daysLeft <= 7) return { label: `${daysLeft}d left`, cls: "bg-amber-50 text-amber-600" };
  return { label: `${daysLeft}d left`, cls: "bg-emerald-100 text-emerald-700" };
}

/* Compact signed day-offset shown in its own column, e.g. "-2" (2 days past
   expiry) or "+5" (5 days still to go) — same underlying number as the
   STATUS chip, just as a quick-scan figure instead of a sentence. */
function daysIndicator(daysLeft: number | null) {
  if (daysLeft === null) return { text: "—", cls: "text-slate-400" };
  const text = daysLeft > 0 ? `+${daysLeft}` : `${daysLeft}`;
  const cls = daysLeft < 0 ? "text-rose-600" : daysLeft <= 3 ? "text-amber-600" : "text-emerald-600";
  return { text, cls };
}

/* Flags every SKU chip belonging to a PO that's already expired or expiring
   within 2 days (urgent-red) or within 7 days (amber), instead of a flat
   gray chip regardless of how much time is actually left. */
function chipUrgencyCls(daysLeft: number | null) {
  if (daysLeft === null) return "bg-slate-50 border-slate-200 text-slate-600";
  if (daysLeft <= 2) return "bg-rose-50 border-rose-200 text-rose-700";
  if (daysLeft <= 7) return "bg-amber-50 border-amber-200 text-amber-700";
  return "bg-slate-50 border-slate-200 text-slate-600";
}

/* Badge for the PO's supply status — the sheet's own "PO Status" column
   (Fully Supplied / Partially Supplied / Zero Supply / Expired), separate
   from the expiry-date STATUS column above which is purely days-left math. */
function supplyStatusCls(label: string) {
  const lower = String(label || "").toLowerCase();
  if (lower.includes("fully") || lower.includes("completed") || lower.includes("grn done")) {
    return "bg-emerald-100 text-emerald-700";
  }
  if (lower.includes("partial")) {
    return "bg-amber-100 text-amber-700";
  }
  if (lower.includes("zero") || lower.includes("unsupplied")) {
    return "bg-rose-100 text-rose-700";
  }
  if (lower.includes("expired")) {
    return "bg-slate-200 text-slate-600";
  }
  return "bg-slate-100 text-slate-500";
}

const POLL_MS = 30_000;
const SKU_CHIPS_SHOWN = 3;

/* Escapes a value for safe inclusion in a CSV cell — wraps in quotes and
   doubles any embedded quotes if the value contains a comma, quote, or
   newline; otherwise returns it as-is. */
function csvCell(v: string | number) {
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/* Builds a one-PO CSV (header + summary row + one row per SKU line item)
   and triggers a browser download. Filename is the PO number so multiple
   downloads don't collide or overwrite each other. */
function downloadPoCsv(p: {
  po: string; tradeName: string; cityName: string; depo: string | null;
  expiry: number; daysLeft: number | null; statusLabel: string;
  poVal: number; grnVal: number; gapVal: number;
  skuDetails: { name: string; poQty: number; poVal: number; grnQty: number; grnVal: number; gapVal: number }[];
}) {
  const lines: string[] = [];
  lines.push(["PO Number", "Trade", "City", "Depo", "Expiry Date", "Days Left", "PO Supply Status",
    "PO Total ₹L", "GRN Total ₹L", "Gap Total ₹L"].join(","));
  lines.push([
    p.po, p.tradeName, p.cityName, p.depo || "—", ymdToDate(p.expiry),
    p.daysLeft === null ? "—" : p.daysLeft, p.statusLabel,
    p.poVal.toFixed(2), p.grnVal.toFixed(2), p.gapVal.toFixed(2),
  ].map(csvCell).join(","));
  lines.push("");
  lines.push(["SKU", "PO Qty", "PO ₹L", "GRN Qty", "GRN ₹L", "Gap ₹L"].join(","));
  for (const sk of p.skuDetails) {
    lines.push([
      sk.name, sk.poQty, sk.poVal.toFixed(2), sk.grnQty, sk.grnVal.toFixed(2), sk.gapVal.toFixed(2),
    ].map(csvCell).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `PO_${p.po}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function PoExpiryAlertPage() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  // PO Date Range filter state (mirrors FR Summary's fFrom/fTo) — kept at
  // the page level since it feeds the underlying PO aggregation both panes
  // are built from. Search/trade/city/status/urgency/sort are per-pane
  // (see PoPane) so each table can be sliced independently.
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  type SkuDetail = { name: string; poQty: number; poVal: number; grnQty: number; grnVal: number; gapVal: number };
  const [skuPopup, setSkuPopup] = useState<
    { po: string; trade: string; city: string; depo: string | null; details: SkuDetail[]; daysLeft: number | null;
      expiry: number; statusLabel: string; poVal: number; grnVal: number; gapVal: number } | null
  >(null);
  const [imgPopup, setImgPopup] = useState<{ icon: string | null; name: string; stats: { label: string; value: string; cls?: string }[] } | null>(null);

  useEffect(() => {
    const load = () =>
      fetch("/api/data")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
        .then(setD)
        .catch((e) => setErr(String(e.message || e)));
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, []);

  const today = useMemo(todayYmd, []);

  /* Apply a quick date preset relative to the data's own max PO date,
     same behaviour as FR Summary's "7D / 30D / MTD / All" buttons. */
  function applyPreset(days: number) {
    if (!d) return;
    const max = d.meta.date_max as string;
    if (days === -1) { setFFrom(""); setFTo(""); return; }
    if (days === 0) { setFFrom(max.slice(0, 7) + "-01"); setFTo(max); return; }
    const dt = new Date(max + "T00:00:00Z");
    dt.setUTCDate(dt.getUTCDate() - (days - 1));
    setFFrom(dt.toISOString().slice(0, 10));
    setFTo(max);
  }

  /* Rows narrowed by the PO Date Range filter, before PO-level aggregation.
     Rows with no date (0) always pass through, same convention used on
     FR Summary, so undated lines aren't silently dropped by a date filter. */
  const baseRows = useMemo(() => {
    if (!d) return [];
    const from = dateToYmd(fFrom), to = dateToYmd(fTo);
    if (!from && !to) return d.rows;
    return d.rows.filter(
      (r) => (!from || r[11] === 0 || r[11] >= from) && (!to || r[11] === 0 || r[11] <= to)
    );
  }, [d, fFrom, fTo]);

  const pos = useMemo(() => {
    if (!d) return [];
    type SkuLine = { poQty: number; poVal: number; grnQty: number; grnVal: number };
    type P = {
      po: string; trade: number; city: number; region: number; expiry: number; status: number;
      poQty: number; poVal: number; grnQty: number; grnVal: number; lines: number;
      skuLines: Map<number, SkuLine>;
    };
    const map = new Map<number, P>();
    for (const r of baseRows) {
      const poId = r[12];
      let p = map.get(poId);
      if (!p) {
        p = { po: d.dims.po?.[poId] || "—", trade: r[1], city: r[3], region: r[2], expiry: 0, status: r[5],
              poQty: 0, poVal: 0, grnQty: 0, grnVal: 0, lines: 0, skuLines: new Map() };
        map.set(poId, p);
      }
      p.poQty += r[7]; p.poVal += r[8]; p.grnQty += r[9]; p.grnVal += r[10];
      p.lines++;
      const skuIdx = r[6];
      let sl = p.skuLines.get(skuIdx);
      if (!sl) { sl = { poQty: 0, poVal: 0, grnQty: 0, grnVal: 0 }; p.skuLines.set(skuIdx, sl); }
      sl.poQty += r[7]; sl.poVal += r[8]; sl.grnQty += r[9]; sl.grnVal += r[10];
      if (r[13] > 0) p.expiry = r[13];
      p.status = r[5];
    }
    return Array.from(map.values()).map((p) => {
      const gapVal = p.poVal - p.grnVal;
      const daysLeft = p.expiry > 0 ? diffDays(today, p.expiry) : null;
      const skuNames = Array.from(p.skuLines.keys()).map((i) => d.dims.sku[i] || "").sort();
      const skuDetails = Array.from(p.skuLines.entries())
        .map(([i, sl]) => ({
          name: d.dims.sku[i] || "", poQty: sl.poQty, poVal: sl.poVal,
          grnQty: sl.grnQty, grnVal: sl.grnVal, gapVal: sl.poVal - sl.grnVal,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      const depo = lookupDepoByCity(d.dims.city[p.city] || "");
      return {
        ...p, gapVal, gapQty: p.poQty - p.grnQty,
        fr: p.poVal ? (p.grnVal / p.poVal) * 100 : 0,
        daysLeft, skuNames, skuDetails, depo: depo?.depo || null,
        statusLabel: d.dims.status[p.status] || "—",
      };
    });
  }, [d, baseRows, today]);

  const kpi = useMemo(() => {
    const expired = pos.filter((p) => p.gapVal > 0.0001 && p.daysLeft !== null && p.daysLeft < 0);
    const urgent2 = pos.filter((p) => p.gapVal > 0.0001 && p.daysLeft !== null && p.daysLeft >= 0 && p.daysLeft <= 2);
    const urgent3 = pos.filter((p) => p.gapVal > 0.0001 && p.daysLeft !== null && p.daysLeft >= 0 && p.daysLeft <= 3);
    const soon7 = pos.filter((p) => p.gapVal > 0.0001 && p.daysLeft !== null && p.daysLeft >= 0 && p.daysLeft <= 7);
    const sum = (arr: typeof pos) => arr.reduce((a, p) => a + p.gapVal, 0);
    return {
      expiredCount: expired.length, expiredVal: sum(expired),
      urgent2Count: urgent2.length, urgent2Val: sum(urgent2),
      urgent3Count: urgent3.length, urgent3Val: sum(urgent3),
      soon7Count: soon7.length, soon7Val: sum(soon7),
    };
  }, [pos]);

  // Total PO Qty across every SKU line item in the currently open popup —
  // shown in the popup header next to the "N line items" count.
  const skuPopupTotalPoQty = useMemo(
    () => (skuPopup ? skuPopup.details.reduce((sum, sk) => sum + sk.poQty, 0) : 0),
    [skuPopup]
  );

  if (err) return <div className="p-8 text-sm text-red-600">Could not load data: {err}</div>;
  if (!d) return <div className="p-8 text-sm text-slate-500">Loading PO expiry alerts…</div>;

  return (
    <div className="w-full max-w-none p-4 sm:p-6 lg:p-8">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900">PO Expiry Alert</h1>
            <SyncStatus />
          </div>
          <div className="text-xs text-slate-500 mt-1">
            POs still carrying an unfulfilled gap, ranked by how close (or how far past) their expiry date is.
          </div>
        </div>
        <UploadButton variant="light" />
      </div>

      {/* ---- KPI cards ---- */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-rose-200 rounded-xl px-4 py-4">
          <div className="text-[10px] tracking-wider text-rose-600 font-bold uppercase">Expired, still open</div>
          <div className="mt-1 text-3xl font-extrabold text-rose-600">{L(kpi.expiredCount, 0)}</div>
          <div className="mt-1 text-xs text-slate-500">₹{L(kpi.expiredVal, 0)} L unsupplied past expiry</div>
        </div>
        <div className="bg-white border border-rose-100 rounded-xl px-4 py-4">
          <div className="text-[10px] tracking-wider text-rose-500 font-bold uppercase">Expiring in ≤ 2 days</div>
          <div className="mt-1 text-3xl font-extrabold text-rose-500">{L(kpi.urgent2Count, 0)}</div>
          <div className="mt-1 text-xs text-slate-500">₹{L(kpi.urgent2Val, 0)} L at risk</div>
        </div>
        <div className="bg-white border border-amber-200 rounded-xl px-4 py-4">
          <div className="text-[10px] tracking-wider text-amber-600 font-bold uppercase">Expiring in ≤ 3 days</div>
          <div className="mt-1 text-3xl font-extrabold text-amber-600">{L(kpi.urgent3Count, 0)}</div>
          <div className="mt-1 text-xs text-slate-500">₹{L(kpi.urgent3Val, 0)} L at risk</div>
        </div>
        <div className="bg-white border border-amber-100 rounded-xl px-4 py-4">
          <div className="text-[10px] tracking-wider text-amber-500 font-bold uppercase">Expiring in ≤ 7 days</div>
          <div className="mt-1 text-3xl font-extrabold text-amber-500">{L(kpi.soon7Count, 0)}</div>
          <div className="mt-1 text-xs text-slate-500">₹{L(kpi.soon7Val, 0)} L at risk</div>
        </div>
      </div>

      {/* ---- date range bar (shared — feeds the PO aggregation both panes use) ---- */}
      <div className="mt-4 bg-white border border-slate-200 rounded-xl p-3.5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs">
            <div className="text-[10px] font-semibold text-slate-500 tracking-wider mb-0.5">PO DATE RANGE</div>
            <span className="flex items-center gap-1.5">
              <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)}
                min={d.meta.date_min} max={d.meta.date_max}
                className="bg-white border border-slate-300 text-slate-700 rounded-lg px-2 py-1.5 text-xs" />
              <span className="text-slate-400">→</span>
              <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)}
                min={d.meta.date_min} max={d.meta.date_max}
                className="bg-white border border-slate-300 text-slate-700 rounded-lg px-2 py-1.5 text-xs" />
            </span>
          </label>
          <span className="flex gap-1 pb-0.5">
            {DATE_PRESETS.map((p) => (
              <button key={p.label} onClick={() => applyPreset(p.days)}
                className="px-2.5 py-1.5 rounded-md border border-slate-300 text-[11px] font-semibold text-slate-600 hover:bg-rose-50 hover:border-rose-300">
                {p.label}
              </button>
            ))}
          </span>
          <span className="text-[11px] text-slate-400 pb-1.5">
            Applies to both tables below. Each table has its own Search / Trade / City / Status / Urgency / Sort filters.
          </span>
        </div>
      </div>

      {/* ---- pane 1: Pending Acknowledgement / ASN Created / Cancelled (shown first) ---- */}
      <PoPane
        title="Pending Acknowledgement · ASN Created · Cancelled"
        pos={pos}
        d={d}
        group={STATUS_GROUP_B}
        setImgPopup={setImgPopup}
        setSkuPopup={setSkuPopup}
      />

      {/* ---- pane 2: Completed / Expired / GRN Done ---- */}
      <PoPane
        title="Completed · Expired · GRN Done"
        pos={pos}
        d={d}
        group={STATUS_GROUP_A}
        setImgPopup={setImgPopup}
        setSkuPopup={setSkuPopup}
      />

      <div className="mt-3 text-[11px] text-slate-400">
        {L(pos.length, 0)} POs total in the selected date range · "Days left" is measured against today's date, not the data's
        own date range. POs without a Po Expiry Date in the sheet show as "No Expiry Date" and are excluded from the
        Expired / ≤2 / ≤3 / ≤7 day filters. Depo is derived from City (see Depo-Mapping), not a per-PO field in the raw data.
        Statuses outside both groups (e.g. Pending GRN) aren't shown in either table above.
      </div>

      {skuPopup && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/40" onClick={() => setSkuPopup(null)} />
          <div className="fixed z-50 inset-0 flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md max-h-[75vh] flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                <div>
                  <div className="text-sm font-bold text-slate-900">SKUs in {skuPopup.po}</div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-500">
                      {skuPopup.details.length} line items · PO Qty {L(skuPopupTotalPoQty, 0)}
                    </span>
                    <span className={"px-1.5 py-0.5 rounded-full text-[10px] font-semibold " + statusOf(skuPopup.daysLeft).cls}>
                      {statusOf(skuPopup.daysLeft).label}
                    </span>
                  </div>
                </div>
                <span className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => downloadPoCsv({
                      po: skuPopup.po, tradeName: skuPopup.trade, cityName: skuPopup.city,
                      depo: skuPopup.depo, expiry: skuPopup.expiry, daysLeft: skuPopup.daysLeft,
                      statusLabel: skuPopup.statusLabel, poVal: skuPopup.poVal, grnVal: skuPopup.grnVal,
                      gapVal: skuPopup.gapVal, skuDetails: skuPopup.details,
                    })}
                    title={`Download ${skuPopup.po} as CSV`}
                    className="w-7 h-7 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-rose-600 grid place-items-center transition"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path d="M10 12.5a.75.75 0 0 1-.53-.22l-3.5-3.5a.75.75 0 1 1 1.06-1.06L9.25 9.94V3.75a.75.75 0 0 1 1.5 0v6.19l2.22-2.22a.75.75 0 1 1 1.06 1.06l-3.5 3.5a.75.75 0 0 1-.53.22Z" />
                      <path d="M3.75 13a.75.75 0 0 1 .75.75v1.5c0 .414.336.75.75.75h9.5a.75.75 0 0 0 .75-.75v-1.5a.75.75 0 0 1 1.5 0v1.5A2.25 2.25 0 0 1 14.75 17.5h-9.5A2.25 2.25 0 0 1 3 15.25v-1.5a.75.75 0 0 1 .75-.75Z" />
                    </svg>
                  </button>
                  <button onClick={() => setSkuPopup(null)}
                    aria-label="Close"
                    className="w-7 h-7 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-600 grid place-items-center text-sm font-bold">
                    ✕
                  </button>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs">
                <div>
                  <div className="text-[10px] font-semibold text-slate-400 tracking-wider">PO NUMBER</div>
                  <div className="font-medium text-slate-800">{skuPopup.po}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-slate-400 tracking-wider">TRADE</div>
                  <div className="font-medium text-slate-800">{skuPopup.trade}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-slate-400 tracking-wider">CITY</div>
                  <div className="font-medium text-slate-800">{skuPopup.city}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-slate-400 tracking-wider">DEPO</div>
                  <div className="font-medium text-slate-800">{skuPopup.depo || "—"}</div>
                </div>
              </div>
              <div className="p-4 overflow-y-auto flex flex-col gap-1.5">
                {skuPopup.details.map((sk) => {
                  const icon = matchSkuIcon(sk.name);
                  return (
                    <div key={sk.name}
                      className={"flex items-center gap-2.5 border rounded-lg px-2.5 py-2 " + chipUrgencyCls(skuPopup.daysLeft)}>
                      <button
                        type="button"
                        onClick={() => setImgPopup({
                          icon, name: sk.name,
                          stats: [
                            { label: "PO QTY", value: L(sk.poQty, 0) },
                            { label: "PO ₹L", value: L2(sk.poVal) },
                            { label: "GRN ₹L", value: L2(sk.grnVal) },
                            { label: "GAP ₹L", value: L2(sk.gapVal), cls: sk.gapVal <= 0.0001 ? "text-emerald-600" : "text-rose-600" },
                          ],
                        })}
                        className="shrink-0 w-7 h-7 rounded-md bg-white border border-slate-200 grid place-items-center overflow-hidden hover:ring-2 hover:ring-indigo-200 transition"
                        title="Click to enlarge"
                      >
                        {icon ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={icon} alt="" className="max-w-full max-h-full object-contain" />
                        ) : "🥛"}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{sk.name}</div>
                        <div className="text-[11px] opacity-80">
                          PO Qty {L(sk.poQty, 0)} · PO ₹{L2(sk.poVal)} L ·{" "}
                          <span className={sk.gapVal <= 0.0001 ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}>
                            Gap ₹{L2(sk.gapVal)} L
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {imgPopup && (
        <SkuImagePopup icon={imgPopup.icon} name={imgPopup.name} stats={imgPopup.stats} onClose={() => setImgPopup(null)} />
      )}
    </div>
  );
}

/* ---- one status-group pane: its own filter bar + its own PoTable.
   `pos` (the full, date-range-filtered PO list) is shared read-only input;
   everything else (search, trade, city, status, urgency, gap-only, sort) is
   local state, so changing a filter on one pane never touches the other. ---- */
function PoPane({ title, pos, d, group, setImgPopup, setSkuPopup }: any) {
  const [q, setQ] = useState("");
  const [trade, setTrade] = useState("");
  const [citySel, setCitySel] = useState<number[]>([]);
  const [cityOpen, setCityOpen] = useState(false);
  const [statusSel, setStatusSel] = useState<number[]>([]);
  const [statusOpen, setStatusOpen] = useState(false);
  const [urgency, setUrgency] = useState<UrgencyKey>("7d");
  const [onlyGap, setOnlyGap] = useState(true);
  const [sortKey, setSortKey] = useState<"days" | "gapVal">("days");

  const isGroupA = group === STATUS_GROUP_A;
  // This pane's slice of POs, restricted to its status group before any
  // other filter is applied.
  const groupPos = useMemo(
    () =>
      pos.filter((p: any) => {
        const n = normStatus(d?.dims?.status?.[p.status] || "");
        return isGroupA ? STATUS_GROUP_A.has(n) : (!STATUS_GROUP_A.has(n) || STATUS_GROUP_B.has(n));
      }),
    [pos, d, isGroupA]
  );

  // Cities present within this pane's slice, for a right-sized CITY dropdown.
  const cityOpts = useMemo(() => {
    const set = new Set<string>();
    groupPos.forEach((p: any) => set.add(d.dims.city[p.city] || ""));
    return Array.from(set).sort();
  }, [groupPos, d]);

  // The actual status labels present within this pane's group (usually
  // fewer than 3), for a STATUS dropdown scoped to just this pane.
  const statusOpts = useMemo(() => {
    const set = new Set<string>();
    groupPos.forEach((p: any) => set.add(d.dims.status[p.status] || ""));
    return Array.from(set).sort();
  }, [groupPos, d]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const citySelLabels = new Set(citySel.map((i) => cityOpts[i]));
    const statusSelLabels = new Set(statusSel.map((i) => statusOpts[i]));
    return groupPos.filter((p: any) => {
      if (onlyGap && p.gapVal <= 0.0001) return false;
      if (trade && d.dims.trade[p.trade] !== trade) return false;
      if (citySelLabels.size && !citySelLabels.has(d.dims.city[p.city])) return false;
      if (statusSelLabels.size && !statusSelLabels.has(d.dims.status[p.status])) return false;
      // 2d/3d/7d mean "still open, X days or fewer left" — not yet expired.
      if (urgency === "expired" && !(p.daysLeft !== null && p.daysLeft < 0)) return false;
      if (urgency === "2d" && !(p.daysLeft !== null && p.daysLeft >= 0 && p.daysLeft <= 2)) return false;
      if (urgency === "3d" && !(p.daysLeft !== null && p.daysLeft >= 0 && p.daysLeft <= 3)) return false;
      if (urgency === "7d" && !(p.daysLeft !== null && p.daysLeft >= 0 && p.daysLeft <= 7)) return false;
      if (needle) {
        const skuNames = p.skuNames.join(" ").toLowerCase();
        if (!p.po.toLowerCase().includes(needle) && !skuNames.includes(needle)) return false;
      }
      return true;
    });
  }, [groupPos, d, q, trade, citySel, cityOpts, statusSel, statusOpts, urgency, onlyGap]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortKey === "days") {
      arr.sort((a: any, b: any) => (a.daysLeft === null ? Infinity : a.daysLeft) - (b.daysLeft === null ? Infinity : b.daysLeft));
    } else {
      arr.sort((a: any, b: any) => b.gapVal - a.gapVal);
    }
    return arr;
  }, [filtered, sortKey]);

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-sm font-bold text-slate-800">{title}</h2>
        <span className="text-[11px] text-slate-400">{L(sorted.length, 0)} of {L(groupPos.length, 0)} POs</span>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-3.5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs">
            <div className="text-[10px] font-semibold text-slate-500 tracking-wider mb-0.5">SEARCH</div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="PO number or SKU…"
              className="bg-white border border-slate-300 text-slate-700 rounded-lg px-2.5 py-1.5 text-xs w-48" />
          </label>
          <label className="text-xs">
            <div className="text-[10px] font-semibold text-slate-500 tracking-wider mb-0.5">TRADE</div>
            <select value={trade} onChange={(e) => setTrade(e.target.value)}
              className="bg-white border border-slate-300 text-slate-700 rounded-lg px-2 py-1.5 text-xs">
              <option value="">All</option>
              {d.dims.trade.map((t: string) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <MultiSel
            label="CITY"
            opts={cityOpts}
            selected={citySel}
            open={cityOpen}
            onOpen={() => setCityOpen((o) => !o)}
            onToggle={(i: number) => setCitySel((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]))}
            onAll={() => setCitySel(cityOpts.map((_: any, i: number) => i))}
            onClear={() => setCitySel([])}
          />
          <MultiSel
            label="STATUS"
            opts={statusOpts}
            selected={statusSel}
            open={statusOpen}
            onOpen={() => setStatusOpen((o) => !o)}
            onToggle={(i: number) => setStatusSel((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]))}
            onAll={() => setStatusSel(statusOpts.map((_: any, i: number) => i))}
            onClear={() => setStatusSel([])}
          />
          <span className="flex gap-1 pb-0.5">
            {URGENCY.map((u) => (
              <button key={u.key} onClick={() => setUrgency(u.key)}
                className={"px-2.5 py-1.5 rounded-md border text-[11px] font-semibold " +
                  (urgency === u.key ? "bg-rose-500 text-white border-rose-500" : "border-slate-300 text-slate-600 hover:bg-rose-50")}>
                {u.label}
              </button>
            ))}
          </span>
          <label className="flex items-center gap-1.5 text-xs text-slate-600 pb-1.5">
            <input type="checkbox" checked={onlyGap} onChange={(e) => setOnlyGap(e.target.checked)} />
            Only unsupplied (gap &gt; 0)
          </label>
          <div className="ml-auto flex items-center gap-2 pb-0.5">
            <span className="text-[10px] font-semibold text-slate-500 tracking-wider">SORT</span>
            <div className="flex rounded-lg overflow-hidden border border-slate-300 text-xs font-semibold">
              <button onClick={() => setSortKey("days")}
                className={"px-3 py-1.5 " + (sortKey === "days" ? "bg-rose-500 text-white" : "bg-white text-slate-600")}>
                Days left
              </button>
              <button onClick={() => setSortKey("gapVal")}
                className={"px-3 py-1.5 " + (sortKey === "gapVal" ? "bg-rose-500 text-white" : "bg-white text-slate-600")}>
                Gap value
              </button>
            </div>
          </div>
        </div>
      </div>

      <PoTable
        rows={sorted}
        d={d}
        setImgPopup={setImgPopup}
        setSkuPopup={setSkuPopup}
        emptyLabel="No POs match the current filters in this group."
      />
    </div>
  );
}

/* ---- PO table, shared by both status-group panes ---- */
function PoTable({ rows, d, setImgPopup, setSkuPopup, emptyLabel }: any) {
  type SkuDetail = { name: string; poQty: number; poVal: number; grnQty: number; grnVal: number; gapVal: number };
  return (
    <div className="mt-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="max-h-[62vh] overflow-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="text-left text-xs text-slate-600 bg-slate-100">
              <th className="py-2.5 px-4 font-semibold">PO NUMBER</th>
              <th className="py-2.5 px-3 font-semibold">TRADE</th>
              <th className="py-2.5 px-3 font-semibold">CITY</th>
              <th className="py-2.5 px-3 font-semibold">DEPO</th>
              <th className="py-2.5 px-3 font-semibold">EXPIRY DATE</th>
              <th className="py-2.5 px-3 font-semibold text-right">DAYS</th>
              <th className="py-2.5 px-3 font-semibold">STATUS</th>
              <th className="py-2.5 px-3 font-semibold">PO SUPPLIED</th>
              <th className="py-2.5 px-3 font-semibold">SKUs</th>
              <th className="py-2.5 px-3 font-semibold text-right">PO ₹L</th>
              <th className="py-2.5 px-3 font-semibold text-right">GRN ₹L</th>
              <th className="py-2.5 px-4 font-semibold text-right">GAP ₹L</th>
              <th className="py-2.5 px-3 font-semibold text-center">DOWNLOAD</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p: any, i: number) => {
              const st = statusOf(p.daysLeft);
              const di = daysIndicator(p.daysLeft);
              const shown = p.skuNames.slice(0, SKU_CHIPS_SHOWN);
              const extra = p.skuNames.length - shown.length;
              return (
                <tr key={p.po + i} className={"border-t border-slate-100 " + (i % 2 ? "bg-slate-50/50" : "")}>
                  <td className="py-2 px-4 font-medium text-slate-800 align-top">{p.po}</td>
                  <td className="py-2 px-3 text-slate-600 align-top">{d.dims.trade[p.trade]}</td>
                  <td className="py-2 px-3 text-slate-600 align-top">{d.dims.city[p.city]}</td>
                  <td className="py-2 px-3 text-slate-600 align-top">{p.depo || "—"}</td>
                  <td className="py-2 px-3 text-slate-600 align-top">{ymdToDate(p.expiry)}</td>
                  <td className={"py-2 px-3 text-right align-top font-bold " + di.cls}>{di.text}</td>
                  <td className="py-2 px-3 align-top">
                    <span className={"px-2 py-0.5 rounded-full text-xs font-semibold " + st.cls}>{st.label}</span>
                  </td>
                  <td className="py-2 px-3 align-top">
                    <span className={"px-2 py-0.5 rounded-full text-xs font-semibold " + supplyStatusCls(p.statusLabel)}>
                      {p.statusLabel}
                    </span>
                  </td>
                  <td className="py-2 px-3 align-top">
                    <div className="flex flex-wrap gap-1 max-w-xs">
                      {shown.map((name: string) => {
                        const icon = matchSkuIcon(name);
                        const detail = p.skuDetails.find((sk: SkuDetail) => sk.name === name);
                        return (
                          <span key={name} title={name + " — " + st.label}
                            className={"flex items-center gap-1 border rounded-full pl-0.5 pr-2 py-0.5 text-[11px] font-medium " + chipUrgencyCls(p.daysLeft)}>
                            <button
                              type="button"
                              onClick={() => setImgPopup({
                                icon, name,
                                stats: detail ? [
                                  { label: "PO QTY", value: L(detail.poQty, 0) },
                                  { label: "PO ₹L", value: L2(detail.poVal) },
                                  { label: "GRN ₹L", value: L2(detail.grnVal) },
                                  { label: "GAP ₹L", value: L2(detail.gapVal), cls: detail.gapVal <= 0.0001 ? "text-emerald-600" : "text-rose-600" },
                                ] : [],
                              })}
                              className="shrink-0 w-4 h-4 rounded-full bg-white border border-slate-200 grid place-items-center overflow-hidden hover:ring-2 hover:ring-indigo-200 transition"
                              title="Click to enlarge"
                            >
                              {icon ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={icon} alt="" className="max-w-full max-h-full object-contain" />
                              ) : "🥛"}
                            </button>
                            <span className="max-w-[110px] truncate">{name}</span>
                          </span>
                        );
                      })}
                      {extra > 0 && (
                        <button onClick={() => setSkuPopup({
                          po: p.po, trade: d.dims.trade[p.trade], city: d.dims.city[p.city],
                          depo: p.depo, details: p.skuDetails, daysLeft: p.daysLeft,
                          expiry: p.expiry, statusLabel: p.statusLabel,
                          poVal: p.poVal, grnVal: p.grnVal, gapVal: p.gapVal,
                        })}
                          className="text-[11px] text-rose-600 font-semibold self-center hover:underline">
                          +{extra} more
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-right align-top">{L2(p.poVal)}</td>
                  <td className="py-2 px-3 text-right align-top">{L2(p.grnVal)}</td>
                  <td className={"py-2 px-4 text-right font-semibold align-top " + (p.gapVal <= 0.0001 ? "text-emerald-600" : "text-rose-600")}>{L2(p.gapVal)}</td>
                  <td className="py-2 px-3 text-center align-top">
                    <button
                      type="button"
                      onClick={() => downloadPoCsv({
                        po: p.po, tradeName: d.dims.trade[p.trade], cityName: d.dims.city[p.city],
                        depo: p.depo, expiry: p.expiry, daysLeft: p.daysLeft, statusLabel: p.statusLabel,
                        poVal: p.poVal, grnVal: p.grnVal, gapVal: p.gapVal, skuDetails: p.skuDetails,
                      })}
                      title={`Download ${p.po} as CSV`}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-slate-300 text-slate-500 hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50 transition"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path d="M10 12.5a.75.75 0 0 1-.53-.22l-3.5-3.5a.75.75 0 1 1 1.06-1.06L9.25 9.94V3.75a.75.75 0 0 1 1.5 0v6.19l2.22-2.22a.75.75 0 1 1 1.06 1.06l-3.5 3.5a.75.75 0 0 1-.53.22Z" />
                        <path d="M3.75 13a.75.75 0 0 1 .75.75v1.5c0 .414.336.75.75.75h9.5a.75.75 0 0 0 .75-.75v-1.5a.75.75 0 0 1 1.5 0v1.5A2.25 2.25 0 0 1 14.75 17.5h-9.5A2.25 2.25 0 0 1 3 15.25v-1.5a.75.75 0 0 1 .75-.75Z" />
                      </svg>
                    </button>
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr><td colSpan={13} className="py-10 text-center text-sm text-slate-400">{emptyLabel}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---- multi-select dropdown (checkbox list), same pattern used on Overview/Reports ---- */
function MultiSel({ label, opts, selected, open, onOpen, onToggle, onAll, onClear }: any) {
  const [q, setQ] = useState("");
  const selSet = new Set<number>(selected);
  const shown = opts
    .map((o: string, i: number) => ({ o, i }))
    .filter((x: any) => !q || x.o.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="relative text-xs z-40">
      <div className="text-[10px] font-semibold text-slate-500 tracking-wider mb-0.5">{label}</div>
      <button
        onClick={onOpen}
        className={"bg-white border rounded-lg px-2.5 py-1.5 text-xs min-w-[104px] max-w-[170px] text-left truncate " +
          (selSet.size ? "border-rose-400 text-rose-700 font-semibold" : "border-slate-300 text-slate-700")}
      >
        {selSet.size === 0 ? "All" : selSet.size === 1 ? opts[selected[0]] : selSet.size + " selected"} ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onOpen} />
          <div className="absolute z-50 mt-1 w-64 bg-slate-50 border border-rose-200 rounded-xl shadow-xl p-2"
            onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={"Search " + label.toLowerCase() + "…"}
              className="w-full bg-white border border-slate-300 text-slate-700 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-rose-400"
            />
            <div className="flex gap-2 mt-1.5 px-0.5">
              <button onClick={onAll} className="text-[11px] text-rose-600 hover:underline">Select all</button>
              <button onClick={onClear} className="text-[11px] text-rose-600 hover:underline">Clear</button>
              <span className="ml-auto text-[11px] text-slate-500">{selSet.size}/{opts.length}</span>
            </div>
            <div className="mt-1 max-h-56 overflow-y-auto pr-1">
              {shown.map(({ o, i }: any) => (
                <label key={i}
                  className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-slate-100 cursor-pointer text-slate-700">
                  <input type="checkbox" checked={selSet.has(i)} onChange={() => onToggle(i)}
                    className="accent-rose-500" />
                  <span className="truncate" title={o}>{o}</span>
                </label>
              ))}
              {!shown.length && <div className="text-slate-500 text-[11px] px-1.5 py-2">No matches</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
