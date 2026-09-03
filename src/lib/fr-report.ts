import type { Dataset } from "@/lib/dataset";
import { mmdGroup } from "@/lib/mmd-mapping";
import { lookupDepoByCity } from "@/lib/depo-mapping";

/* Server-side equivalent of the 5 tables on the FR Summary dashboard page
   (City / SKU / Trade / Region / Depo), used to build the daily email
   report. Callers pass in just the rows for the day they want summarized
   (see yesterdayYmdIST below) rather than the full historical dataset. */

export type ReportRow = {
  name: string; mmdCode: string; mmdName: string;
  poCount: number; poVal: number; grnVal: number; gap: number; fr: number;
};
export type ReportTable = { key: string; title: string; nameCol: string; rows: ReportRow[]; total: ReportRow };

// Depo is keyed off City (see depo-mapping.ts — the raw data has no per-PO
// Depo field), and the mapping is Zepto-specific, so it's always scoped to
// that platform here (the dashboard has an interactive picker; email doesn't).
const TABLES = [
  { key: "city", rowIdx: 3, title: "City-wise Fill Rate", nameCol: "City" },
  { key: "sku", rowIdx: 6, title: "SKU-wise Fill Rate", nameCol: "SKU" },
  { key: "trade", rowIdx: 1, title: "Trade-wise Fill Rate", nameCol: "TRADE" },
  { key: "region", rowIdx: 2, title: "Region-wise Fill Rate", nameCol: "Region" },
  { key: "depo", rowIdx: 3, title: "Depo-wise Fill Rate (Zepto)", nameCol: "City" },
] as const;

// Today's IST calendar date, expressed as a UTC midnight timestamp so later
// day-arithmetic (+/- N * 86400000) can't be shifted by DST or local TZ quirks.
function todayUTCms(): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => +parts.find((p) => p.type === t)!.value;
  return Date.UTC(get("year"), get("month") - 1, get("day"));
}
const msToYmd = (ms: number) => { 
  const d = new Date(ms);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
};

// Yesterday's date (IST calendar day) as a YYYYMMDD number — matches the
// format already used for row[11] (see toYMD in dataset.ts).
export function yesterdayYmdIST(): number {
  return msToYmd(todayUTCms() - 86400000);
}

// Last 7 full days ending yesterday (IST) — e.g. running on Monday covers
// the previous Monday through Sunday.
export function lastWeekRangeYmdIST(): { fromYmd: number; toYmd: number } {
  const today = todayUTCms();
  return { fromYmd: msToYmd(today - 7 * 86400000), toYmd: msToYmd(today - 86400000) };
}

export function ymdToLabel(ymd: number): string {
  const s = String(ymd);
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s;
}

export function buildFrTables(d: Dataset, sourceRows: number[][] = d.rows): ReportTable[] {
  const skuGroupKey = d.dims.sku.map((s: string) => mmdGroup(s).key);
  const skuGroupName = d.dims.sku.map((s: string) => mmdGroup(s).name);
  const skuGroupCode = d.dims.sku.map((s: string) => mmdGroup(s).code);

  const zeptoIdx = d.dims.trade.findIndex((tr: string) => tr.toLowerCase() === "zepto");

  return TABLES.map((t) => {
    const names = t.key === "depo" ? d.dims.city : d.dims[t.key];
    const tableRows = t.key === "depo" && zeptoIdx !== -1 ? sourceRows.filter((r: number[]) => r[1] === zeptoIdx) : sourceRows;
    type A = { name: string; mmdCode: string; mmdName: string; poVal: number; grnVal: number; pos: Set<number> };
    const bag = new Map<number | string, A>();
    for (const r of tableRows) {
      const i: number | string = t.key === "sku" ? skuGroupKey[r[t.rowIdx]] : r[t.rowIdx];
      let a = bag.get(i);
      if (!a) {
        const name = t.key === "sku" ? skuGroupName[r[t.rowIdx]] : names[r[t.rowIdx]];
        let code = t.key === "sku" ? skuGroupCode[r[t.rowIdx]] : "";
        let mmdName = name;
        if (t.key === "depo") {
          const dep = lookupDepoByCity(name);
          code = dep?.depo || "—";
          mmdName = dep?.state || "—";
        }
        a = { name, mmdCode: code, mmdName, poVal: 0, grnVal: 0, pos: new Set() };
        bag.set(i, a);
      }
      a.poVal += r[8]; a.grnVal += r[10]; a.pos.add(r[12]);
    }
    const rows: ReportRow[] = Array.from(bag.values())
      .map((a) => ({
        name: a.name, mmdCode: a.mmdCode, mmdName: a.mmdName, poCount: a.pos.size,
        poVal: a.poVal, grnVal: a.grnVal, gap: a.poVal - a.grnVal,
        fr: a.poVal ? (a.grnVal / a.poVal) * 100 : 0,
      }))
      .sort((x, y) => y.poVal - x.poVal);
    const tot = rows.reduce(
      (acc, a) => ({ poCount: acc.poCount + a.poCount, poVal: acc.poVal + a.poVal, grnVal: acc.grnVal + a.grnVal, gap: acc.gap + a.gap }),
      { poCount: 0, poVal: 0, grnVal: 0, gap: 0 }
    );
    const total: ReportRow = { name: "TOTAL", mmdCode: "", mmdName: "", ...tot, fr: tot.poVal ? (tot.grnVal / tot.poVal) * 100 : 0 };
    return { key: t.key, title: t.title, nameCol: t.nameCol, rows, total };
  });
}
