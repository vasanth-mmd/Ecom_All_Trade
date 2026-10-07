"use client";

import { useEffect, useMemo, useState } from "react";
import UploadButton from "../upload-button";
import SyncStatus from "../sync-status";
import { mmdGroup } from "@/lib/mmd-mapping";
import { lookupDepoByCity } from "@/lib/depo-mapping";
import { matchSkuIcon } from "@/lib/sku-icon";
import SkuImagePopup from "../sku-image-popup";

/*
  Row:
  [month, trade, region, city, category, status, sku,
   poQty, poVal, grnQty, grnVal, dateYYYYMMDD, poId]
*/

type Data = {
  meta: any;
  dims: Record<string, string[]>;
  rows: number[][];
};

const L = (n: number, d = 1) =>
  n.toLocaleString("en-IN", {
    maximumFractionDigits: d,
    minimumFractionDigits: 0,
  });

const L2 = (n: number) =>
  n.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });

const frPill = (fr: number) =>
  "px-2.5 py-0.5 rounded-full text-xs font-black " +
  (fr >= 90
    ? "bg-emerald-100 text-emerald-950 border border-emerald-300"
    : fr >= 75
      ? "bg-amber-100 text-amber-950 border border-amber-300"
      : "bg-rose-100 text-rose-950 border border-rose-300");

const DATE_PRESETS = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "MTD", days: 0 },
  { label: "All", days: -1 },
];

const dateToYmd = (s: string) => (s ? +s.replaceAll("-", "") : 0);

const TABLES = [
  {
    key: "city",
    rowIdx: 3,
    title: "City-wise Fill Rate",
    nameCol: "City",
  },
  {
    key: "sku",
    rowIdx: 6,
    title: "SKU-wise Fill Rate",
    nameCol: "SKU",
  },
  {
    key: "trade",
    rowIdx: 1,
    title: "Trade-wise Fill Rate",
    nameCol: "TRADE",
  },
  {
    key: "region",
    rowIdx: 2,
    title: "Region-wise Fill Rate",
    nameCol: "Region",
  },
  {
    key: "category",
    rowIdx: 4,
    title: "Category-wise Fill Rate",
    nameCol: "Category",
  },
  {
    key: "depo",
    rowIdx: 3,
    title: "Depo-wise Fill Rate",
    nameCol: "City",
  },
] as const;

type TableKey = (typeof TABLES)[number]["key"];

type ClickSel = {
  city: number | null;
  region: number | null;
  trade: number | null;
  sku: string | null;
  category: number | null;
  depo: number | null;
};

type SortCol =
  | "name"
  | "mmdCode"
  | "mmdName"
  | "delLocation"
  | "poCount"
  | "poQty"
  | "poVal"
  | "grnQty"
  | "grnVal"
  | "gap"
  | "fr";

type SortState = {
  col: SortCol;
  dir: 1 | -1;
};

const DEFAULT_SORT: Record<TableKey, SortState> = {
  city: { col: "poVal", dir: -1 },
  sku: { col: "poVal", dir: -1 },
  trade: { col: "poVal", dir: -1 },
  region: { col: "poVal", dir: -1 },
  category: { col: "poVal", dir: -1 },
  depo: { col: "poVal", dir: -1 },
};

/*
 * IMPORTANT:
 *
 * STATUS is intentionally included here.
 *
 * The actual values come from:
 *
 *     d.dims.status
 *
 * which must be populated from the Google Sheet PO Status column
 * by dataset.ts.
 *
 * Do NOT hardcode:
 *     Expired
 *     Fully Supplied
 *     Other
 *
 * here.
 */
const FILTER_DIMS = [
  "month",
  "trade",
  "region",
  "city",
  "category",
  "status",
  "sku",
] as const;

export default function FrySummaryPage() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");

  /*
   * Multi-select filters.
   *
   * status is included and uses d.dims.status directly.
   */
  const [sel, setSel] = useState<Record<string, number[]>>(
    Object.fromEntries(FILTER_DIMS.map((k) => [k, []]))
  );

  const [openF, setOpenF] = useState<string | null>(null);
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");

  const toggleSel = (dim: string, i: number) =>
    setSel((p) => ({
      ...p,
      [dim]: p[dim].includes(i)
        ? p[dim].filter((x) => x !== i)
        : [...p[dim], i],
    }));

  const setAll = (dim: string, idxs: number[]) =>
    setSel((p) => ({
      ...p,
      [dim]: idxs,
    }));

  const [click, setClick] = useState<ClickSel>({
    city: null,
    region: null,
    sku: null,
    trade: null,
    category: null,
    depo: null,
  });

  const [skuPopup, setSkuPopup] = useState<{
    icon: string | null;
    name: string;
    stats: {
      label: string;
      value: string;
      cls?: string;
    }[];
  } | null>(null);

  const [expanded, setExpanded] = useState<Record<TableKey, boolean>>({
    city: false,
    sku: false,
    trade: false,
    region: false,
    category: false,
    depo: false,
  });

  const toggleExpanded = (key: TableKey) =>
    setExpanded((e) => ({
      ...e,
      [key]: !e[key],
    }));


  const [tableMinW, setTableMinW] = useState<Record<TableKey, number>>({
    city: 620,
    sku: 620,
    trade: 620,
    region: 620,
    category: 620,
    depo: 620,
  });

  const TABLE_W_STEP = 80;
  const TABLE_W_MIN = 400;
  const TABLE_W_MAX = 2000;

  const adjustWidth = (key: TableKey, delta: number) =>
    setTableMinW((w) => ({
      ...w,
      [key]: Math.min(
        TABLE_W_MAX,
        Math.max(TABLE_W_MIN, w[key] + delta)
      ),
    }));

  const [depoPlatform, setDepoPlatform] = useState<number | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  useEffect(() => {
    if (!d || depoPlatform !== null) return;

    const zeptoIdx = d.dims.trade.findIndex(
      (t) => t.toLowerCase() === "zepto"
    );

    setDepoPlatform(zeptoIdx !== -1 ? zeptoIdx : 0);
  }, [d, depoPlatform]);

  const [sortState, setSortState] =
    useState<Record<TableKey, SortState>>(DEFAULT_SORT);

  function toggleSort(key: TableKey, col: SortCol) {
    setSortState((s) => {
      const cur = s[key];

      const dir: 1 | -1 =
        cur.col === col
          ? cur.dir === 1
            ? -1
            : 1
          : col === "name" ||
              col === "mmdCode" ||
              col === "mmdName" ||
              col === "delLocation"
            ? 1
            : -1;

      return {
        ...s,
        [key]: {
          col,
          dir,
        },
      };
    });
  }

  const POLL_MS = 30_000;
  /*
   * Load dashboard data with polling.
   */
  const loadData = () => {
    fetch("/api/data")
      .then((r) =>
        r.ok
          ? r.json()
          : Promise.reject(new Error("HTTP " + r.status))
      )
      .then((data) => {
        setD(data);
        setErr("");
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
    setSel(
      Object.fromEntries(FILTER_DIMS.map((k) => [k, []]))
    );

    setFFrom("");
    setFTo("");
    setOpenF(null);
  }

  /*
   * Apply dropdown filters.
   *
   * STATUS filtering happens here using:
   *
   *     r[5]
   *
   * because row index 5 is PO Status.
   */
  const baseRows = useMemo(() => {
    if (!d) return [];

    const from = dateToYmd(fFrom);
    const to = dateToYmd(fTo);

    const S: Record<string, Set<number>> =
      Object.fromEntries(
        Object.entries(sel).map(([k, v]) => [
          k,
          new Set(v),
        ])
      );

    const pass = (
      set: Set<number>,
      v: number
    ) => set.size === 0 || set.has(v);

    return d.rows.filter(
      (r) =>
        pass(S.month, r[0]) &&
        pass(S.trade, r[1]) &&
        pass(S.region, r[2]) &&
        pass(S.city, r[3]) &&
        pass(S.category, r[4]) &&
        pass(S.status, r[5]) &&
        pass(S.sku, r[6]) &&
        (!from || r[11] === 0 || r[11] >= from) &&
        (!to || r[11] === 0 || r[11] <= to)
    );
  }, [d, sel, fFrom, fTo]);

  const skuGroupKey = useMemo(
    () =>
      d
        ? d.dims.sku.map((s) => mmdGroup(s).key)
        : [],
    [d]
  );

  const skuGroupName = useMemo(
    () =>
      d
        ? d.dims.sku.map((s) => mmdGroup(s).name)
        : [],
    [d]
  );

  const skuGroupCode = useMemo(
    () =>
      d
        ? d.dims.sku.map((s) => mmdGroup(s).code)
        : [],
    [d]
  );

  function crossRows(exceptKey: TableKey) {
    return baseRows.filter(
      (r) =>
        (exceptKey === "city" ||
          click.city === null ||
          r[3] === click.city) &&
        (exceptKey === "region" ||
          click.region === null ||
          r[2] === click.region) &&
        (exceptKey === "sku" ||
          click.sku === null ||
          skuGroupKey[r[6]] === click.sku) &&
        (exceptKey === "trade" ||
          click.trade === null ||
          r[1] === click.trade) &&
        (exceptKey === "category" ||
          click.category === null ||
          r[4] === click.category) &&
        (exceptKey === "depo" ||
          click.depo === null ||
          r[3] === click.depo)
    );
  }

  const allCrossRows = useMemo(
    () =>
      baseRows.filter(
        (r) =>
          (click.city === null ||
            r[3] === click.city) &&
          (click.region === null ||
            r[2] === click.region) &&
          (click.sku === null ||
            skuGroupKey[r[6]] === click.sku) &&
          (click.trade === null ||
            r[1] === click.trade) &&
          (click.category === null ||
            r[4] === click.category) &&
          (click.depo === null ||
            r[3] === click.depo)
      ),
    [baseRows, click, skuGroupKey]
  );

  function toggleClick(
    key: TableKey,
    idx: number | string
  ) {
    setClick(
      (c) =>
        ({
          ...c,
          [key]: c[key] === idx ? null : idx,
        }) as ClickSel
    );
  }

  const tables = useMemo(() => {
    if (!d) return null;

    return TABLES.map((t) => {
      let rows = crossRows(t.key);

      if (
        t.key === "depo" &&
        depoPlatform !== null
      ) {
        rows = rows.filter(
          (r) => r[1] === depoPlatform
        );
      }

      const names =
        t.key === "depo"
          ? d.dims.city
          : d.dims[t.key];

      type A = {
        name: string;
        idx: number | string;
        mmdCode: string;
        mmdName: string;
        delLocation: string;
        poQty: number;
        poVal: number;
        grnQty: number;
        grnVal: number;
        pos: Set<number>;
      };

      const bag = new Map<number | string, A>();

      for (const r of rows) {
        const i: number | string =
          t.key === "sku"
            ? skuGroupKey[r[t.rowIdx]]
            : r[t.rowIdx];

        let a = bag.get(i);

        if (!a) {
          const name =
            t.key === "sku"
              ? skuGroupName[r[t.rowIdx]]
              : names[r[t.rowIdx]];

          let code =
            t.key === "sku"
              ? skuGroupCode[r[t.rowIdx]]
              : "";

          let mmdName = name;
          let delLocation = "";

          if (t.key === "depo") {
            const dep = lookupDepoByCity(name);

            code = dep?.depo || "—";
            mmdName = dep?.state || "—";
            delLocation =
              dep?.delLocation || "—";
          }

          a = {
            name,
            idx: i,
            mmdCode: code,
            mmdName,
            delLocation,
            poQty: 0,
            poVal: 0,
            grnQty: 0,
            grnVal: 0,
            pos: new Set(),
          };

          bag.set(i, a);
        }

        a.poQty += r[7];
        a.poVal += r[8];
        a.grnQty += r[9];
        a.grnVal += r[10];
        a.pos.add(r[12]);
      }

      const agg = Array.from(bag.values())
        .map((a) => ({
          name: a.name,
          idx: a.idx,
          mmdCode: a.mmdCode,
          mmdName: a.mmdName,
          delLocation: a.delLocation,
          poCount: a.pos.size,
          poQty: a.poQty,
          poVal: a.poVal,
          grnQty: a.grnQty,
          grnVal: a.grnVal,
          gap: a.poVal - a.grnVal,
          fr: a.poVal
            ? (a.grnVal / a.poVal) * 100
            : 0,
        }));

      const ss = sortState[t.key];

      agg.sort((x, y) => {
        const xv = x[ss.col];
        const yv = y[ss.col];

        return typeof xv === "string"
          ? xv.localeCompare(yv as string) *
              ss.dir
          : ((xv as number) -
              (yv as number)) *
              ss.dir;
      });

      const tot = agg.reduce(
        (acc, a) => ({
          poCount:
            acc.poCount + a.poCount,
          poQty:
            acc.poQty + a.poQty,
          poVal:
            acc.poVal + a.poVal,
          grnQty:
            acc.grnQty + a.grnQty,
          grnVal:
            acc.grnVal + a.grnVal,
          gap:
            acc.gap + a.gap,
        }),
        {
          poCount: 0,
          poQty: 0,
          poVal: 0,
          grnQty: 0,
          grnVal: 0,
          gap: 0,
        }
      );

      return {
        ...t,
        rows: agg,
        total: {
          ...tot,
          fr: tot.poVal
            ? (tot.grnVal / tot.poVal) * 100
            : 0,
        },
      };
    });
  }, [
    d,
    baseRows,
    click,
    skuGroupKey,
    skuGroupName,
    skuGroupCode,
    sortState,
    depoPlatform,
  ]);

  if (err) {
    return (
      <div className="p-8 text-sm text-red-600">
        Could not load data: {err}
      </div>
    );
  }

  if (!d || !tables) {
    return (
      <div className="p-8 text-sm text-slate-500">
        Loading FR % summary…
      </div>
    );
  }

  const activeChips = tables
    .filter((t) => click[t.key] !== null)
    .map((t) => {
      const row = t.rows.find(
        (r) => r.idx === click[t.key]
      );

      return {
        key: t.key,
        label: t.nameCol,
        value: row
          ? row.name
          : String(click[t.key]),
      };
    });

  const fmtYMD = (n: number) =>
    n ? `${String(n).slice(0, 4)}-${String(n).slice(4, 6)}-${String(n).slice(6, 8)}` : "";

  const getFileDateTag = () => {
    if (fFrom && fTo) return `_${fFrom}_to_${fTo}`;
    if (fFrom) return `_from_${fFrom}`;
    if (fTo) return `_to_${fTo}`;
    if (d?.meta?.date_min && d?.meta?.date_max) return `_${d.meta.date_min}_to_${d.meta.date_max}`;
    return "";
  };

  const getTableExportRows = (t: (typeof tables)[number]) => {
    const isSku = t.key === "sku";
    const isDepo = t.key === "depo";

    const rows: Record<string, any>[] = t.rows.map((r, i) => {
      if (isSku) {
        return {
          "S.No": i + 1,
          "MMD SKU Name": r.mmdName,
          "MMD Item Code": r.mmdCode || "—",
          "Raw SKU Name": r.name,
          "PO Count": r.poCount,
          "PO Qty": r.poQty,
          "PO Value (₹ Lakh)": +r.poVal.toFixed(2),
          "GRN Qty": r.grnQty,
          "GRN Value (₹ Lakh)": +r.grnVal.toFixed(2),
          "Gap Value (₹ Lakh)": +r.gap.toFixed(2),
          "Fill Rate %": +r.fr.toFixed(1),
        };
      }
      if (isDepo) {
        return {
          "S.No": i + 1,
          "Delivery Location": r.delLocation,
          "City": r.name,
          "Depo Code": r.mmdCode,
          "State": r.mmdName,
          "PO Count": r.poCount,
          "PO Qty": r.poQty,
          "PO Value (₹ Lakh)": +r.poVal.toFixed(2),
          "GRN Qty": r.grnQty,
          "GRN Value (₹ Lakh)": +r.grnVal.toFixed(2),
          "Gap Value (₹ Lakh)": +r.gap.toFixed(2),
          "Fill Rate %": +r.fr.toFixed(1),
        };
      }
      return {
        "S.No": i + 1,
        [t.nameCol]: r.name,
        "PO Count": r.poCount,
        "PO Qty": r.poQty,
        "PO Value (₹ Lakh)": +r.poVal.toFixed(2),
        "GRN Qty": r.grnQty,
        "GRN Value (₹ Lakh)": +r.grnVal.toFixed(2),
        "Gap Value (₹ Lakh)": +r.gap.toFixed(2),
        "Fill Rate %": +r.fr.toFixed(1),
      };
    });

    // Append TOTAL row
    if (isSku) {
      rows.push({
        "S.No": "" as any,
        "MMD SKU Name": "TOTAL",
        "MMD Item Code": "",
        "Raw SKU Name": "",
        "PO Count": t.total.poCount,
        "PO Qty": t.total.poQty,
        "PO Value (₹ Lakh)": +t.total.poVal.toFixed(2),
        "GRN Qty": t.total.grnQty,
        "GRN Value (₹ Lakh)": +t.total.grnVal.toFixed(2),
        "Gap Value (₹ Lakh)": +t.total.gap.toFixed(2),
        "Fill Rate %": +t.total.fr.toFixed(1),
      });
    } else if (isDepo) {
      rows.push({
        "S.No": "" as any,
        "Delivery Location": "TOTAL",
        "City": "",
        "Depo Code": "",
        "State": "",
        "PO Count": t.total.poCount,
        "PO Qty": t.total.poQty,
        "PO Value (₹ Lakh)": +t.total.poVal.toFixed(2),
        "GRN Qty": t.total.grnQty,
        "GRN Value (₹ Lakh)": +t.total.grnVal.toFixed(2),
        "Gap Value (₹ Lakh)": +t.total.gap.toFixed(2),
        "Fill Rate %": +t.total.fr.toFixed(1),
      });
    } else {
      rows.push({
        "S.No": "" as any,
        [t.nameCol]: "TOTAL",
        "PO Count": t.total.poCount,
        "PO Qty": t.total.poQty,
        "PO Value (₹ Lakh)": +t.total.poVal.toFixed(2),
        "GRN Qty": t.total.grnQty,
        "GRN Value (₹ Lakh)": +t.total.grnVal.toFixed(2),
        "Gap Value (₹ Lakh)": +t.total.gap.toFixed(2),
        "Fill Rate %": +t.total.fr.toFixed(1),
      });
    }

    return rows;
  };

  const getFilterSummaryRows = () => {
    if (!d) return [];

    const totalPoCount = new Set(allCrossRows.map((r) => r[12])).size;
    const totalPoQty = allCrossRows.reduce((sum, r) => sum + r[7], 0);
    const totalPoVal = allCrossRows.reduce((sum, r) => sum + r[8], 0);
    const totalGrnQty = allCrossRows.reduce((sum, r) => sum + r[9], 0);
    const totalGrnVal = allCrossRows.reduce((sum, r) => sum + r[10], 0);
    const totalGap = totalPoVal - totalGrnVal;
    const totalFr = totalPoVal ? (totalGrnVal / totalPoVal) * 100 : 0;

    return [
      { Parameter: "Report Title", Value: "Milky Mist Trade FR % Summary Report" },
      { Parameter: "Export Date & Time", Value: new Date().toLocaleString("en-IN") },
      {
        Parameter: "PO Date Filter",
        Value: fFrom || fTo ? `${fFrom || d.meta.date_min} to ${fTo || d.meta.date_max}` : `All (${d.meta.date_min} to ${d.meta.date_max})`,
      },
      { Parameter: "Month Filter", Value: sel.month.length ? sel.month.map((i) => d.dims.month[i]).join(", ") : "All Months" },
      { Parameter: "Trade Filter", Value: sel.trade.length ? sel.trade.map((i) => d.dims.trade[i]).join(", ") : "All Trades" },
      { Parameter: "Region / State Filter", Value: sel.region.length ? sel.region.map((i) => d.dims.region[i]).join(", ") : "All Regions" },
      { Parameter: "City Filter", Value: sel.city.length ? sel.city.map((i) => d.dims.city[i]).join(", ") : "All Cities" },
      { Parameter: "Category Filter", Value: sel.category.length ? sel.category.map((i) => d.dims.category[i]).join(", ") : "All Categories" },
      { Parameter: "Status Filter", Value: sel.status.length ? sel.status.map((i) => d.dims.status[i]).join(", ") : "All Statuses" },
      { Parameter: "SKU Filter", Value: sel.sku.length ? sel.sku.map((i) => d.dims.sku[i]).join(", ") : "All SKUs" },
      { Parameter: "Active Cross-Filters", Value: activeChips.length ? activeChips.map((c) => `${c.label}: ${c.value}`).join(" | ") : "None" },
      { Parameter: "Filtered Row Count", Value: allCrossRows.length },
      { Parameter: "Unique PO Count", Value: totalPoCount },
      { Parameter: "Total PO Qty", Value: totalPoQty },
      { Parameter: "Total PO Value (₹ Lakh)", Value: +totalPoVal.toFixed(2) },
      { Parameter: "Total GRN Qty", Value: totalGrnQty },
      { Parameter: "Total GRN Value (₹ Lakh)", Value: +totalGrnVal.toFixed(2) },
      { Parameter: "Total Gap Value (₹ Lakh)", Value: +totalGap.toFixed(2) },
      { Parameter: "Overall Fill Rate %", Value: +totalFr.toFixed(1) },
    ];
  };

  const exportAllSummaryWorkbook = async () => {
    if (!d || !tables) return;
    setExporting("summary-all");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();

      for (const t of tables) {
        const sheetRows = getTableExportRows(t);
        const ws = XLSX.utils.json_to_sheet(sheetRows);
        const cleanName = t.title.replace(" Fill Rate", "").replace(/[:\\\/\?\*\[\]]/g, "-").slice(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, cleanName);
      }

      XLSX.writeFile(wb, `FR_Summary_Tables${getFileDateTag()}.xlsx`);
    } catch (e: any) {
      alert("Failed to export summary workbook: " + (e?.message || e));
    } finally {
      setExporting(null);
    }
  };

  const exportFullComprehensiveWorkbook = async () => {
    if (!d || !tables) return;
    setExporting("master-all");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();

      // 1. Overview Sheet
      const overviewRows = getFilterSummaryRows();
      const wsOverview = XLSX.utils.json_to_sheet(overviewRows);
      XLSX.utils.book_append_sheet(wb, wsOverview, "Report Overview");

      // 2. 6 Summary Table Sheets
      for (const t of tables) {
        const sheetRows = getTableExportRows(t);
        const ws = XLSX.utils.json_to_sheet(sheetRows);
        const cleanName = t.title.replace(" Fill Rate", "").replace(/[:\\\/\?\*\[\]]/g, "-").slice(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, cleanName);
      }

      // 3. Raw Filtered Line Items Sheet
      const rawData = allCrossRows.map((r, i) => {
        const poVal = r[8] || 0;
        const grnVal = r[10] || 0;
        const gapVal = poVal - grnVal;
        const fr = poVal ? (grnVal / poVal) * 100 : 0;

        return {
          "S.No": i + 1,
          "PO ID": r[12],
          "PO Date": fmtYMD(r[11]),
          "Month": d.dims.month[r[0]] || "",
          "Trade": d.dims.trade[r[1]] || "",
          "Region": d.dims.region[r[2]] || "",
          "City": d.dims.city[r[3]] || "",
          "Category": d.dims.category[r[4]] || "",
          "SKU Name": d.dims.sku[r[6]] || "",
          "MMD Item Code": skuGroupCode[r[6]] || "—",
          "MMD SKU Name": skuGroupName[r[6]] || d.dims.sku[r[6]] || "",
          "PO Status": d.dims.status[r[5]] || "",
          "PO Qty": r[7],
          "PO Value (₹ Lakh)": +poVal.toFixed(2),
          "GRN Qty": r[9],
          "GRN Value (₹ Lakh)": +grnVal.toFixed(2),
          "Gap Value (₹ Lakh)": +gapVal.toFixed(2),
          "Fill Rate %": +fr.toFixed(1),
        };
      });

      const wsRaw = XLSX.utils.json_to_sheet(rawData);
      XLSX.utils.book_append_sheet(wb, wsRaw, "Raw PO Line Items");

      XLSX.writeFile(wb, `FR_Master_Report_All_In_One${getFileDateTag()}.xlsx`);
    } catch (e: any) {
      alert("Failed to export master report: " + (e?.message || e));
    } finally {
      setExporting(null);
    }
  };

  const exportFilteredRawDataXlsx = async () => {
    if (!d || allCrossRows.length === 0) {
      alert("No data available to export under current filters.");
      return;
    }
    setExporting("raw-xlsx");
    try {
      const XLSX = await import("xlsx");
      const rawData = allCrossRows.map((r, i) => {
        const poVal = r[8] || 0;
        const grnVal = r[10] || 0;
        const gapVal = poVal - grnVal;
        const fr = poVal ? (grnVal / poVal) * 100 : 0;

        return {
          "S.No": i + 1,
          "PO ID": r[12],
          "PO Date": fmtYMD(r[11]),
          "Month": d.dims.month[r[0]] || "",
          "Trade": d.dims.trade[r[1]] || "",
          "Region": d.dims.region[r[2]] || "",
          "City": d.dims.city[r[3]] || "",
          "Category": d.dims.category[r[4]] || "",
          "SKU Name": d.dims.sku[r[6]] || "",
          "MMD Item Code": skuGroupCode[r[6]] || "—",
          "MMD SKU Name": skuGroupName[r[6]] || d.dims.sku[r[6]] || "",
          "PO Status": d.dims.status[r[5]] || "",
          "PO Qty": r[7],
          "PO Value (₹ Lakh)": +poVal.toFixed(2),
          "GRN Qty": r[9],
          "GRN Value (₹ Lakh)": +grnVal.toFixed(2),
          "Gap Value (₹ Lakh)": +gapVal.toFixed(2),
          "Fill Rate %": +fr.toFixed(1),
        };
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rawData);
      XLSX.utils.book_append_sheet(wb, ws, "Filtered Raw Data");
      XLSX.writeFile(wb, `FR_Raw_Data_Filtered${getFileDateTag()}.xlsx`);
    } catch (e: any) {
      alert("Failed to export raw data: " + (e?.message || e));
    } finally {
      setExporting(null);
    }
  };

  const exportFilteredRawDataCsv = () => {
    if (!d || allCrossRows.length === 0) {
      alert("No data available to export under current filters.");
      return;
    }
    setExporting("raw-csv");
    try {
      const headers = [
        "S.No",
        "PO ID",
        "PO Date",
        "Month",
        "Trade",
        "Region",
        "City",
        "Category",
        "SKU Name",
        "MMD Item Code",
        "MMD SKU Name",
        "PO Status",
        "PO Qty",
        "PO Value (₹ Lakh)",
        "GRN Qty",
        "GRN Value (₹ Lakh)",
        "Gap Value (₹ Lakh)",
        "Fill Rate %"
      ];

      const escapeCsv = (val: any) => {
        if (val === null || val === undefined) return "";
        const str = String(val);
        if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const rows = allCrossRows.map((r, i) => {
        const poVal = r[8] || 0;
        const grnVal = r[10] || 0;
        const gapVal = poVal - grnVal;
        const fr = poVal ? (grnVal / poVal) * 100 : 0;

        return [
          i + 1,
          escapeCsv(r[12]),
          escapeCsv(fmtYMD(r[11])),
          escapeCsv(d.dims.month[r[0]] || ""),
          escapeCsv(d.dims.trade[r[1]] || ""),
          escapeCsv(d.dims.region[r[2]] || ""),
          escapeCsv(d.dims.city[r[3]] || ""),
          escapeCsv(d.dims.category[r[4]] || ""),
          escapeCsv(d.dims.sku[r[6]] || ""),
          escapeCsv(skuGroupCode[r[6]] || "—"),
          escapeCsv(skuGroupName[r[6]] || d.dims.sku[r[6]] || ""),
          escapeCsv(d.dims.status[r[5]] || ""),
          r[7] ?? 0,
          poVal.toFixed(2),
          r[9] ?? 0,
          grnVal.toFixed(2),
          gapVal.toFixed(2),
          fr.toFixed(1)
        ].join(",");
      });

      const csvContent = [headers.join(","), ...rows].join("\r\n");
      const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `FR_Raw_Data_Filtered${getFileDateTag()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert("Failed to export CSV: " + (e?.message || e));
    } finally {
      setExporting(null);
    }
  };

  const exportSingleTable = async (t: (typeof tables)[number]) => {
    if (!d) return;
    setExporting(t.key);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      const sheetRows = getTableExportRows(t);
      const ws = XLSX.utils.json_to_sheet(sheetRows);
      const cleanTitle = t.title.replace(/[:\\\/\?\*\[\]]/g, "-").slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, cleanTitle);
      XLSX.writeFile(wb, `FR_${t.title.replace(/\s+/g, "_")}${getFileDateTag()}.xlsx`);
    } catch (e: any) {
      alert("Failed to export table: " + (e?.message || e));
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-black text-black">
              FR Summary
            </h1>

            <SyncStatus />
          </div>

          <div className="text-xs text-black font-bold mt-1">
            State / SKU / Trade fill-rate summary ·
            values in ₹ Lakh ·{" "}
            {L(allCrossRows.length, 0)} lines in selection
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* EXPORT DATA DROPDOWN */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setExportMenuOpen((v) => !v)}
              disabled={!!exporting}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-sm transition disabled:opacity-50"
              title="Export filtered data based on selected filters"
            >
              {exporting ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Exporting…</span>
                </>
              ) : (
                <>
                  <span className="text-base">📊</span>
                  <span>Export Data</span>
                  <span className="text-[10px] ml-0.5">▾</span>
                </>
              )}
            </button>

            {exportMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setExportMenuOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-white border border-slate-200 rounded-xl shadow-2xl p-2 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <div className="font-extrabold text-slate-800 text-xs flex items-center justify-between">
                      <span>Export Filtered FR Data</span>
                      <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                        {L(allCrossRows.length, 0)} lines
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Export data matching your active filters and date range.
                    </p>
                  </div>

                  <div className="py-1 space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        setExportMenuOpen(false);
                        exportAllSummaryWorkbook();
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-emerald-50 flex items-start gap-2.5 transition text-slate-800"
                    >
                      <span className="text-base">📑</span>
                      <div>
                        <div className="font-bold text-slate-900">Summary Tables Workbook (.xlsx)</div>
                        <div className="text-[10px] text-slate-500">6 Sheets (City, SKU, Trade, Region, Category, Depo) with totals</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setExportMenuOpen(false);
                        exportFullComprehensiveWorkbook();
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-indigo-50 flex items-start gap-2.5 transition text-slate-800"
                    >
                      <span className="text-base">📦</span>
                      <div>
                        <div className="font-bold text-slate-900">All-in-One Master Workbook (.xlsx)</div>
                        <div className="text-[10px] text-slate-500">Overview + 6 Summary Tables + Raw PO Line Items in 1 file</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setExportMenuOpen(false);
                        exportFilteredRawDataXlsx();
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-blue-50 flex items-start gap-2.5 transition text-slate-800"
                    >
                      <span className="text-base">📋</span>
                      <div>
                        <div className="font-bold text-slate-900">Filtered Raw PO Data (.xlsx)</div>
                        <div className="text-[10px] text-slate-500">Row-by-row line items with PO numbers, dates, values & FR%</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setExportMenuOpen(false);
                        exportFilteredRawDataCsv();
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-slate-100 flex items-start gap-2.5 transition text-slate-800"
                    >
                      <span className="text-base">📄</span>
                      <div>
                        <div className="font-bold text-slate-900">Filtered Raw PO Data (.csv)</div>
                        <div className="text-[10px] text-slate-500">Standard CSV file matching active filters</div>
                      </div>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <UploadButton variant="light" />
        </div>
      </div>

      {/* FILTER BAR */}
      <div className="mt-4 bg-white border border-slate-300 rounded-xl p-3.5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">

          {/* DATE RANGE */}
          <label className="text-xs w-full sm:w-auto">
            <div className="text-[10px] font-bold text-black tracking-wider mb-0.5">
              PO DATE RANGE
            </div>

            <span className="flex items-center gap-1.5">
              <input
                type="date"
                value={fFrom}
                onChange={(e) =>
                  setFFrom(e.target.value)
                }
                min={d.meta.date_min}
                max={d.meta.date_max}
                className="flex-1 min-w-0 sm:flex-none border border-slate-300 rounded-lg px-2 py-2 sm:py-1.5 text-sm sm:text-xs bg-white text-black font-bold"
              />

              <span className="text-black font-bold shrink-0">
                →
              </span>

              <input
                type="date"
                value={fTo}
                onChange={(e) =>
                  setFTo(e.target.value)
                }
                min={d.meta.date_min}
                max={d.meta.date_max}
                className="flex-1 min-w-0 sm:flex-none border border-slate-300 rounded-lg px-2 py-2 sm:py-1.5 text-sm sm:text-xs bg-white text-black font-bold"
              />
            </span>
          </label>

          {/* DATE PRESETS */}
          <span className="flex gap-1.5 sm:gap-1 sm:pb-0.5">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() =>
                  applyPreset(p.days)
                }
                className="flex-1 sm:flex-none px-2 py-2 sm:py-1 rounded-md border border-slate-300 text-xs sm:text-[11px] font-bold text-black hover:bg-indigo-50 hover:border-indigo-400"
              >
                {p.label}
              </button>
            ))}
          </span>

          <div className="grid grid-cols-2 gap-3 w-full sm:contents">

            <MultiSel
              label="MONTH"
              opts={d.dims.month}
              selected={sel.month}
              open={openF === "month"}
              onOpen={() =>
                setOpenF(
                  openF === "month"
                    ? null
                    : "month"
                )
              }
              onToggle={(i: number) =>
                toggleSel("month", i)
              }
              onAll={() =>
                setAll(
                  "month",
                  d.dims.month.map(
                    (_, i) => i
                  )
                )
              }
              onClear={() =>
                setAll("month", [])
              }
            />

            <MultiSel
              label="TRADE"
              opts={d.dims.trade}
              selected={sel.trade}
              open={openF === "trade"}
              onOpen={() =>
                setOpenF(
                  openF === "trade"
                    ? null
                    : "trade"
                )
              }
              onToggle={(i: number) =>
                toggleSel("trade", i)
              }
              onAll={() =>
                setAll(
                  "trade",
                  d.dims.trade.map(
                    (_, i) => i
                  )
                )
              }
              onClear={() =>
                setAll("trade", [])
              }
            />

            <MultiSel
              label="STATE (REGION)"
              opts={d.dims.region}
              selected={sel.region}
              open={openF === "region"}
              onOpen={() =>
                setOpenF(
                  openF === "region"
                    ? null
                    : "region"
                )
              }
              onToggle={(i: number) =>
                toggleSel("region", i)
              }
              onAll={() =>
                setAll(
                  "region",
                  d.dims.region.map(
                    (_, i) => i
                  )
                )
              }
              onClear={() =>
                setAll("region", [])
              }
            />

            <MultiSel
              label="CITY"
              opts={d.dims.city}
              selected={sel.city}
              open={openF === "city"}
              onOpen={() =>
                setOpenF(
                  openF === "city"
                    ? null
                    : "city"
                )
              }
              onToggle={(i: number) =>
                toggleSel("city", i)
              }
              onAll={() =>
                setAll(
                  "city",
                  d.dims.city.map(
                    (_, i) => i
                  )
                )
              }
              onClear={() =>
                setAll("city", [])
              }
            />

            <MultiSel
              label="CATEGORY"
              opts={d.dims.category}
              selected={sel.category}
              open={openF === "category"}
              onOpen={() =>
                setOpenF(
                  openF === "category"
                    ? null
                    : "category"
                )
              }
              onToggle={(i: number) =>
                toggleSel("category", i)
              }
              onAll={() =>
                setAll(
                  "category",
                  d.dims.category.map(
                    (_, i) => i
                  )
                )
              }
              onClear={() =>
                setAll("category", [])
              }
            />

            {/* =====================================================
                STATUS FILTER
                =====================================================

                IMPORTANT:
                This uses the actual Google Sheet status dimension.

                Example values:

                ASN_CREATED
                CANCELLED
                COMPLETED
                EXPIRED
                GRN_DONE
                PENDING_ACKNOWLEDGEMENT
                PENDING_GRN

                No conversion to:
                Fully Supplied
                Partially Supplied
                Other
            */}
            <MultiSel
              label="STATUS"
              opts={d.dims.status}
              selected={sel.status}
              open={openF === "status"}
              onOpen={() =>
                setOpenF(
                  openF === "status"
                    ? null
                    : "status"
                )
              }
              onToggle={(i: number) =>
                toggleSel("status", i)
              }
              onAll={() =>
                setAll(
                  "status",
                  d.dims.status.map(
                    (_, i) => i
                  )
                )
              }
              onClear={() =>
                setAll("status", [])
              }
            />

            <MultiSel
              label="SKU"
              opts={d.dims.sku}
              selected={sel.sku}
              open={openF === "sku"}
              onOpen={() =>
                setOpenF(
                  openF === "sku"
                    ? null
                    : "sku"
                )
              }
              onToggle={(i: number) =>
                toggleSel("sku", i)
              }
              onAll={() =>
                setAll(
                  "sku",
                  d.dims.sku.map(
                    (_, i) => i
                  )
                )
              }
              onClear={() =>
                setAll("sku", [])
              }
            />
          </div>

          <button
            onClick={resetFilters}
            className="w-full sm:w-auto sm:ml-auto px-3 py-2 sm:py-1.5 rounded-lg border border-rose-300 text-rose-600 text-sm sm:text-xs font-semibold hover:bg-rose-50"
          >
            Reset filters
          </button>
        </div>
      </div>

      {openF && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setOpenF(null)}
        />
      )}

      {/* CROSS FILTER STATUS */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-black font-semibold">
          Tip: click any row below to cross-filter
          the other tables · click it again to clear.
        </span>

        {activeChips.map((c) => (
          <span
            key={c.key}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-100 border border-indigo-300 text-xs font-black text-black"
          >
            {c.label}: {c.value}

            <button
              onClick={() =>
                setClick((s) => ({
                  ...s,
                  [c.key]: null,
                }))
              }
              className="hover:text-rose-700 font-bold ml-0.5"
            >
              ✕
            </button>
          </span>
        ))}

        {activeChips.length > 0 && (
          <button
            onClick={() =>
              setClick({
                city: null,
                region: null,
                sku: null,
                trade: null,
                category: null,
                depo: null,
              })
            }
            className="text-xs font-semibold text-rose-600 hover:underline"
          >
            Clear all cross-filters
          </button>
        )}
      </div>

      {/* TABLES */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-5">
        {tables.map((t, ti) => {
          const isExpanded = expanded[t.key];

          return (
            <div
              key={t.key}
              className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden"
            >
              <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between gap-2 bg-slate-50/80">
                <h2 className="text-sm font-black text-black tracking-tight">
                  {t.title}
                </h2>

                <div className="flex items-center gap-2">
                  {t.key === "depo" && (
                    <select
                      value={depoPlatform ?? ""}
                      onChange={(e) =>
                        setDepoPlatform(
                          +e.target.value
                        )
                      }
                      title="Depo mapping is platform-specific"
                      className="border border-slate-300 rounded-md px-1.5 py-1 text-[11px] font-bold text-black bg-white"
                    >
                      {d.dims.trade.map(
                        (tr, i) => (
                          <option
                            key={i}
                            value={i}
                          >
                            {tr}
                          </option>
                        )
                      )}
                    </select>
                  )}

                  <span className="text-[11px] font-bold text-slate-800">
                    {L(t.rows.length, 0)}{" "}
                    {t.key === "depo"
                      ? "cities"
                      : t.nameCol.toLowerCase() +
                        "s"}
                  </span>

                  {/* Manual width +/- controls */}
                  <span className="inline-flex items-center rounded-md border border-slate-300 bg-white overflow-hidden text-[11px] font-bold text-black">
                    <button
                      type="button"
                      onClick={() => adjustWidth(t.key, -TABLE_W_STEP)}
                      disabled={tableMinW[t.key] <= TABLE_W_MIN}
                      title="Decrease table width"
                      className="px-2 py-1 text-black font-bold hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition"
                    >
                      −
                    </button>
                    <span className="px-2 py-1 border-x border-slate-300 text-black font-bold select-none tabular-nums">
                      {tableMinW[t.key]}px
                    </span>
                    <button
                      type="button"
                      onClick={() => adjustWidth(t.key, TABLE_W_STEP)}
                      disabled={tableMinW[t.key] >= TABLE_W_MAX}
                      title="Increase table width"
                      className="px-2 py-1 text-black font-bold hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition"
                    >
                      +
                    </button>
                  </span>

                  <button
                    type="button"
                    onClick={() => exportSingleTable(t)}
                    disabled={!!exporting}
                    title={`Export ${t.title} to Excel`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-300 text-[11px] font-bold text-black bg-white hover:bg-emerald-50 hover:border-emerald-400 hover:text-emerald-900 transition shadow-xs disabled:opacity-50"
                  >
                    {exporting === t.key ? (
                      <>
                        <svg className="animate-spin h-3 w-3 text-emerald-700" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        <span>Exporting…</span>
                      </>
                    ) : (
                      <>
                        <span>⬇</span>
                        <span>Excel</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      toggleExpanded(t.key)
                    }
                    title={
                      isExpanded
                        ? "Collapse to scrollable view"
                        : "Expand to show all rows"
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-300 text-[11px] font-bold text-black bg-white hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-900 transition shadow-xs"
                  >
                    {isExpanded
                      ? "Collapse"
                      : "Expand all"}
                  </button>
                </div>
              </div>

              <div
                className={
                  isExpanded
                    ? "overflow-auto"
                    : "max-h-[46vh] overflow-auto"
                }
              >
                <table
                  className="w-full text-xs text-black font-semibold"
                  style={{ minWidth: tableMinW[t.key] }}
                >
                  <thead className="sticky top-0 z-10">
                    <tr className="text-left text-[11px] text-black bg-slate-200/90 border-b border-slate-300 font-black">
                      {t.key === "sku" ? (
                        <SortTh
                          edge
                          label="MMD SKU NAME"
                          col="mmdName"
                          sort={sortState[t.key]}
                          onSort={(c) =>
                            toggleSort(
                              t.key,
                              c
                            )
                          }
                        />
                      ) : t.key === "depo" ? (
                        <>
                          <SortTh
                            edge
                            label="Del Location"
                            col="delLocation"
                            sort={sortState[t.key]}
                            onSort={(c) =>
                              toggleSort(
                                t.key,
                                c
                              )
                            }
                          />

                          <SortTh
                            label="City"
                            col="name"
                            sort={sortState[t.key]}
                            onSort={(c) =>
                              toggleSort(
                                t.key,
                                c
                              )
                            }
                          />

                          <SortTh
                            label="Depo"
                            col="mmdCode"
                            sort={sortState[t.key]}
                            onSort={(c) =>
                              toggleSort(
                                t.key,
                                c
                              )
                            }
                          />

                          <SortTh
                            label="State"
                            col="mmdName"
                            sort={sortState[t.key]}
                            onSort={(c) =>
                              toggleSort(
                                t.key,
                                c
                              )
                            }
                          />
                        </>
                      ) : (
                        <SortTh
                          edge
                          label={t.nameCol}
                          col="name"
                          sort={sortState[t.key]}
                          onSort={(c) =>
                            toggleSort(
                              t.key,
                              c
                            )
                          }
                        />
                      )}

                      <SortTh
                        align="right"
                        label="PO COUNT"
                        col="poCount"
                        sort={sortState[t.key]}
                        onSort={(c) =>
                          toggleSort(t.key, c)
                        }
                      />

                      <SortTh
                        align="right"
                        label="PO QTY"
                        col="poQty"
                        sort={sortState[t.key]}
                        onSort={(c) =>
                          toggleSort(t.key, c)
                        }
                      />

                      <SortTh
                        align="right"
                        label="PO ₹L"
                        col="poVal"
                        sort={sortState[t.key]}
                        onSort={(c) =>
                          toggleSort(t.key, c)
                        }
                      />

                      <SortTh
                        align="right"
                        label="GRN QTY"
                        col="grnQty"
                        sort={sortState[t.key]}
                        onSort={(c) =>
                          toggleSort(t.key, c)
                        }
                      />

                      <SortTh
                        align="right"
                        label="GRN ₹L"
                        col="grnVal"
                        sort={sortState[t.key]}
                        onSort={(c) =>
                          toggleSort(t.key, c)
                        }
                      />

                      <SortTh
                        align="right"
                        label="GAP ₹L"
                        col="gap"
                        sort={sortState[t.key]}
                        onSort={(c) =>
                          toggleSort(t.key, c)
                        }
                      />

                      <SortTh
                        align="right"
                        edge
                        label="FR %"
                        col="fr"
                        sort={sortState[t.key]}
                        onSort={(c) =>
                          toggleSort(t.key, c)
                        }
                      />
                    </tr>

                    <tr className="bg-indigo-100/90 border-b-2 border-indigo-300 font-black text-black text-xs">
                      <td className="py-2 px-2 font-black text-black">
                        TOTAL
                      </td>

                      {t.key === "depo" && (
                        <>
                          <td className="py-2 px-1.5" />
                          <td className="py-2 px-1.5" />
                          <td className="py-2 px-1.5" />
                        </>
                      )}

                      <td className="py-2 px-1.5 text-right font-black text-black tabular-nums">
                        {L(t.total.poCount, 0)}
                      </td>

                      <td className="py-2 px-1.5 text-right font-black text-black tabular-nums">
                        {L(t.total.poQty, 0)}
                      </td>

                      <td className="py-2 px-1.5 text-right font-black text-black tabular-nums">
                        {L2(t.total.poVal)}
                      </td>

                      <td className="py-2 px-1.5 text-right font-black text-black tabular-nums">
                        {L(t.total.grnQty, 0)}
                      </td>

                      <td className="py-2 px-1.5 text-right font-black text-black tabular-nums">
                        {L2(t.total.grnVal)}
                      </td>

                      <td className="py-2 px-1.5 text-right font-black text-rose-700 tabular-nums">
                        {L2(t.total.gap)}
                      </td>

                      <td className="py-2 px-2 text-right font-black text-black tabular-nums">
                        <span
                          className={frPill(
                            t.total.fr
                          )}
                        >
                          {L(t.total.fr, 0)}%
                        </span>
                      </td>
                    </tr>
                  </thead>

                  <tbody>
                    {t.rows.map((r, i) => {
                      const selected =
                        click[t.key] === r.idx;

                      return (
                        <tr
                          key={r.name + i}
                          onClick={() =>
                            toggleClick(
                              t.key,
                              r.idx
                            )
                          }
                          className={
                            "border-t border-slate-200/80 cursor-pointer transition font-bold text-black " +
                            (selected
                              ? "bg-indigo-100 hover:bg-indigo-100 text-black"
                              : i % 2
                                ? "bg-slate-50 hover:bg-indigo-50/70 text-black"
                                : "bg-white hover:bg-indigo-50/70 text-black")
                          }
                          title="Click to cross-filter the other tables"
                        >
                          {t.key === "sku" ? (
                            <td className="py-1.5 px-2 font-bold text-black">
                              {(() => {
                                const icon =
                                  matchSkuIcon(
                                    r.mmdName
                                  );

                                return icon ? (
                                  <span className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();

                                        setSkuPopup({
                                          icon,
                                          name: r.mmdName,
                                          stats: [
                                            {
                                              label:
                                                "PO COUNT",
                                              value:
                                                L(
                                                  r.poCount,
                                                  0
                                                ),
                                            },
                                            {
                                              label:
                                                "PO QTY",
                                              value:
                                                L(
                                                  r.poQty,
                                                  0
                                                ),
                                            },
                                            {
                                              label:
                                                "PO ₹L",
                                              value:
                                                L2(
                                                  r.poVal
                                                ),
                                            },
                                            {
                                              label:
                                                "GRN QTY",
                                              value:
                                                L(
                                                  r.grnQty,
                                                  0
                                                ),
                                            },
                                            {
                                              label:
                                                "GRN ₹L",
                                              value:
                                                L2(
                                                  r.grnVal
                                                ),
                                            },
                                            {
                                              label:
                                                "GAP ₹L",
                                              value:
                                                L2(
                                                  r.gap
                                                ),
                                              cls:
                                                "text-rose-700 font-black",
                                            },
                                            {
                                              label:
                                                "FR %",
                                              value:
                                                L(
                                                  r.fr,
                                                  0
                                                ) +
                                                "%",
                                            },
                                          ],
                                        });
                                      }}
                                      className="shrink-0 w-6 h-6 rounded-md bg-white border border-slate-300 grid place-items-center overflow-hidden hover:border-indigo-400 hover:ring-2 hover:ring-indigo-200 transition"
                                      title="Click to enlarge"
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={icon}
                                        alt=""
                                        className="max-w-full max-h-full object-contain"
                                      />
                                    </button>

                                    <span className="font-bold text-black">{r.mmdName}</span>
                                  </span>
                                ) : (
                                  <span className="font-bold text-black">{r.mmdName}</span>
                                );
                              })()}
                            </td>
                          ) : t.key === "depo" ? (
                            <>
                              <td className="py-1.5 px-2 font-bold text-black">
                                {r.delLocation}
                              </td>

                              <td className="py-1.5 px-1.5 font-bold text-black">
                                {r.name}
                              </td>

                              <td className="py-1.5 px-1.5 font-bold text-black">
                                {r.mmdCode}
                              </td>

                              <td className="py-1.5 px-1.5 font-bold text-black">
                                {r.mmdName}
                              </td>
                            </>
                          ) : (
                            <td className="py-1.5 px-2 font-bold text-black">
                              {r.name}
                            </td>
                          )}

                          <td className="py-1.5 px-1.5 text-right font-bold text-black tabular-nums">
                            {L(r.poCount, 0)}
                          </td>

                          <td className="py-1.5 px-1.5 text-right font-bold text-black tabular-nums">
                            {L(r.poQty, 0)}
                          </td>

                          <td className="py-1.5 px-1.5 text-right font-bold text-black tabular-nums">
                            {L2(r.poVal)}
                          </td>

                          <td className="py-1.5 px-1.5 text-right font-bold text-black tabular-nums">
                            {L(r.grnQty, 0)}
                          </td>

                          <td className="py-1.5 px-1.5 text-right font-bold text-black tabular-nums">
                            {L2(r.grnVal)}
                          </td>

                          <td className="py-1.5 px-1.5 text-right font-black text-rose-700 tabular-nums">
                            {L2(r.gap)}
                          </td>

                          <td className="py-1.5 px-2 text-right">
                            <span
                              className={frPill(
                                r.fr
                              )}
                            >
                              {L(r.fr, 0)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 text-xs text-black font-bold">
        Colors:{" "}
        <span className="text-emerald-700 font-black">
          green ≥ 90%
        </span>{" "}
        ·{" "}
        <span className="text-amber-700 font-black">
          yellow 75–90%
        </span>{" "}
        ·{" "}
        <span className="text-rose-700 font-black">
          red &lt; 75%
        </span>
        . "State" uses the Region field from the
        uploaded data. PO Count is the number of
        distinct PO numbers in each row.
      </div>

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

/* Sortable table header */
function SortTh({
  label,
  col,
  sort,
  onSort,
  align,
  edge,
}: {
  label: string;
  col: SortCol;
  sort: SortState;
  onSort: (c: SortCol) => void;
  align?: "left" | "right";
  edge?: boolean;
}) {
  const active = sort.col === col;

  return (
    <th
      onClick={() => onSort(col)}
      className={
        "py-2.5 " +
        (edge ? "px-2" : "px-1.5") +
        (align === "right" ? " text-right" : "") +
        " font-black uppercase text-black text-[11px] cursor-pointer select-none hover:text-indigo-900 transition-colors " +
        (active ? "text-indigo-950 bg-indigo-200/70" : "")
      }
    >
      {label}
      {active
        ? sort.dir === 1
          ? " ▲"
          : " ▼"
        : ""}
    </th>
  );
}

/*
 * Generic checkbox multi-select.
 *
 * STATUS is NOT hardcoded here.
 * Whatever exists in d.dims.status is displayed.
 */
function MultiSel({
  label,
  opts,
  selected,
  open,
  onOpen,
  onToggle,
  onAll,
  onClear,
}: any) {
  const [q, setQ] = useState("");

  const selSet = new Set<number>(selected);

  const shown = opts
    .map((o: string, i: number) => ({
      o,
      i,
    }))
    .filter(
      (x: any) =>
        !q ||
        x.o
          .toLowerCase()
          .includes(q.toLowerCase())
    );

  return (
    <div className="relative text-xs z-40 w-full sm:w-auto">
      <div className="text-[10px] font-bold text-black tracking-wider mb-0.5">
        {label}
      </div>

      <button
        onClick={onOpen}
        className={
          "w-full sm:w-auto bg-white border rounded-lg px-2.5 py-2 sm:py-1.5 text-sm sm:text-xs sm:min-w-[110px] sm:max-w-[180px] text-left truncate font-bold " +
          (selSet.size
            ? "border-indigo-600 text-indigo-950 font-black bg-indigo-50/50"
            : "border-slate-400 text-black")
        }
      >
        {selSet.size === 0
          ? "All"
          : selSet.size === 1
            ? opts[selected[0]]
            : selSet.size + " selected"}{" "}
        ▾
      </button>

      {open && (
        <div
          className="absolute z-50 mt-1 w-64 bg-slate-50 border border-indigo-200 rounded-xl shadow-xl p-2"
          onClick={(e) =>
            e.stopPropagation()
          }
        >
          <input
            autoFocus
            value={q}
            onChange={(e) =>
              setQ(e.target.value)
            }
            placeholder={
              "Search " +
              label.toLowerCase() +
              "…"
            }
            className="w-full bg-white border border-slate-300 text-slate-700 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-indigo-400"
          />

          <div className="flex gap-2 mt-1.5 px-0.5">
            <button
              onClick={onAll}
              className="text-[11px] text-indigo-600 hover:underline"
            >
              Select all
            </button>

            <button
              onClick={onClear}
              className="text-[11px] text-rose-600 hover:underline"
            >
              Clear
            </button>

            <span className="ml-auto text-[11px] text-slate-500">
              {selSet.size}/{opts.length}
            </span>
          </div>

          <div className="mt-1 max-h-56 overflow-y-auto pr-1">
            {shown.map(
              ({ o, i }: any) => (
                <label
                  key={i}
                  className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-slate-100 cursor-pointer text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={selSet.has(i)}
                    onChange={() =>
                      onToggle(i)
                    }
                    className="accent-indigo-500"
                  />

                  <span
                    className="truncate"
                    title={o}
                  >
                    {o}
                  </span>
                </label>
              )
            )}

            {!shown.length && (
              <div className="text-slate-500 text-[11px] px-1.5 py-2">
                No matches
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}