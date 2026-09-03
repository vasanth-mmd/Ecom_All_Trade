import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";

/* ============================================================
   Dataset shape used everywhere:
   { meta, dims:{month,trade,region,city,category,status,sku,po}, rows }
   Row: [month,trade,region,city,category,status,sku,
         poQty,poVal,grnQty,grnVal,dateYYYYMMDD,poId,expiryYMD]
   dims.po[poId] is the raw PO Number string (e.g. "P5123533").
   expiryYMD is the "Po Expiry Date" column, 0 if missing/unparseable.
   Depo/State are not stored here — they're derived from City on the fly
   (see depo-mapping.ts) since the Trade FR raw data has no Depo field.
   Source of truth: Neon (Dataset table, single JSON row).
   Fallback: public/app/data.json file (first run, before any upload).
   ============================================================ */

export type Dataset = {
  meta: {
    rows: number; generated: string; value_unit: string;
    po_count: number; date_min: string; date_max: string;
  };
  dims: Record<string, string[]>;
  rows: number[][];
};

const MONTH_ORDER = ["January","February","March","April","May","June","July",
  "August","September","October","November","December"];
const STATUS_MAP: Record<string, string> = {
  "Fully Supplied": "Fully Supplied", "Fully Supplied Po": "Fully Supplied",
  "Po Fully Supplied": "Fully Supplied", "COMPLETED": "Fully Supplied",
  "GRN_DONE": "Fully Supplied", "Po Partially Supplied": "Partially Supplied",
  "Zero Supply": "Zero Supply", "EXPIRED": "Expired",
};
const titleCase = (s: any) =>
  String(s ?? "").trim().toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
const MONTH_ABBR: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const toYMD = (v: any): number => {
  // Excel serial number (preferred: we read the sheet with raw:true, so dates
  // arrive as numbers). Convert by pure day arithmetic in UTC — no local
  // timezone shift, so a near-midnight IST timestamp never rolls back a day.
  if (typeof v === "number" && v > 20000 && v < 60000) {
    const days = Math.floor(v);
    const dt = new Date(Math.round((days - 25569) * 86400 * 1000));
    return dt.getUTCFullYear() * 10000 + (dt.getUTCMonth() + 1) * 100 + dt.getUTCDate();
  }
  // Real Date object: if it was parsed in IST (or UTC with IST offset like 18:29Z or 18:30Z),
  // a midnight timestamp will be 18:30 UTC of previous day. If UTC hours >= 12, shift by 6h
  // so it lands on the correct calendar date.
  if (v instanceof Date && !isNaN(+v)) {
    let d = v;
    if (d.getUTCHours() >= 12) {
      d = new Date(v.getTime() + 6 * 3600 * 1000);
    }
    return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  }
  const s = String(v ?? "").trim();
  if (!s) return 0;
  // yyyy-mm-dd / yyyy/mm/dd
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return +m[1] * 10000 + +m[2] * 100 + +m[3];
  // dd-mm-yyyy / dd/mm/yyyy (Indian format, day first)
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) return +m[3] * 10000 + +m[2] * 100 + +m[1];
  // dd-Mon-yyyy (e.g. "19-Apr-2026") — Google Sheets' CSV export renders dates
  // as this display text. Parsed by hand (not new Date(s)) because the local
  // Date constructor round-trips through UTC and rolls IST midnight back a day.
  m = s.match(/^(\d{1,2})[- ]([A-Za-z]{3,9})[- ](\d{4})/);
  if (m) {
    const mon = MONTH_ABBR[m[2].slice(0, 3).toLowerCase()];
    if (mon) return +m[3] * 10000 + mon * 100 + +m[1];
  }
  const d = new Date(s);
  if (isNaN(+d)) return 0;
  let adj = d;
  if (adj.getUTCHours() >= 12) adj = new Date(d.getTime() + 6 * 3600 * 1000);
  return adj.getUTCFullYear() * 10000 + (adj.getUTCMonth() + 1) * 100 + adj.getUTCDate();
};
const fmtYMD = (n: number) => {
  const s = String(n);
  return s.length === 8 ? s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8) : "";
};

/** Same transforms as the dashboard's own parser (script.js buildFromObjects). */
export function buildFromRecords(recs: any[]): Dataset {
  const dims: Record<string, string[]> =
    { month: [], trade: [], region: [], city: [], category: [], status: [], sku: [], po: [] };
  const maps: Record<string, Record<string, number>> =
    { month: {}, trade: {}, region: {}, city: {}, category: {}, status: {}, sku: {} };
  const id = (dim: string, val: string) => {
    const m = maps[dim];
    if (!(val in m)) { m[val] = dims[dim].length; dims[dim].push(val); }
    return m[val];
  };
  const poMap: Record<string, number> = {};
  let poN = 0;
  const poId = (v: any) => {
    const k = String(v ?? "").trim();
    if (!(k in poMap)) { poMap[k] = poN++; dims.po.push(k); }
    return poMap[k];
  };
  const rows: number[][] = [];
  for (const o of recs) {
    const rawStatus = String(o["PO Status"] ?? "").trim();
    const status = rawStatus || "(Blanks)";
    rows.push([
      id("month", String(o["Month"] ?? "").trim()),
      id("trade", String(o["Trade"] ?? "").trim()),
      id("region", titleCase(o["Region"])),
      id("city", titleCase(o["City"])),
      id("category", String(o["Category"] ?? "").trim()),
      id("status", status),
      id("sku", String(o["SKU Name"] ?? "").trim()),
      Math.round(+o["PO Qty"] || 0), +(+o["Po Value"] || 0).toFixed(4),
      Math.round(+o["GRN Qty"] || 0), +(+o["GRN Value"] || 0).toFixed(4),
      toYMD(o["Po Date"]),
      poId(o["PO Number"]),
      toYMD(o["Po Expiry Date"]),
    ]);
  }
  // calendar-order the month dim
  const order = dims.month.map((m) => MONTH_ORDER.indexOf(m));
  const perm = dims.month.map((_, i) => i).sort((a, b) => order[a] - order[b]);
  const remap: Record<number, number> = {};
  perm.forEach((oldI, newI) => { remap[oldI] = newI; });
  dims.month = perm.map((oldI) => dims.month[oldI]);
  rows.forEach((r) => { r[0] = remap[r[0]]; });

  const ymds = rows.map((r) => r[11]).filter((y) => y > 0);
  const dmin = ymds.length ? Math.min(...ymds) : 0;
  const dmax = ymds.length ? Math.max(...ymds) : 0;
  return {
    meta: {
      rows: rows.length,
      generated: new Date().toISOString().slice(0, 19).replace("T", " "),
      value_unit: "lakh",
      po_count: poN,
      date_min: fmtYMD(dmin) || "2000-01-01",
      date_max: fmtYMD(dmax) || "2099-12-31",
    },
    dims, rows,
  };
}

/* ---------------- Upload-only loader with in-memory cache -----------------
   The dashboard's data comes from exactly one place: a manually-uploaded
   file via /api/upload (see /dashboard/upload). That upload is stored in
   Neon (Dataset table, single JSON row) and served from there on every
   request until the next upload replaces it. There is no automatic or
   scheduled fetch from any external source — the stored row (or, before the
   very first upload, the bundled public/app/data.json file) is always the
   source of truth. ---------------------------------------------------------- */

type StoredDataset = Dataset & { _source?: "upload" };
let cache: { stamp: string; data: Dataset } | null = null;

async function loadStored(): Promise<{ data: Dataset; stamp: string } | null> {
  try {
    const dbPromise = prisma.dataset.findUnique({ where: { id: 1 } });
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
    const rec = await Promise.race([dbPromise, timeoutPromise]);
    if (!rec) return null;
    const stamp = rec.updatedAt.toISOString();
    if (cache && cache.stamp === stamp) return cache;
    const parsed = JSON.parse(rec.json) as StoredDataset;
    const { _source, ...data } = parsed;
    const entry = { data: data as Dataset, stamp };
    cache = entry;
    return entry;
  } catch {
    return null; // table may not exist yet or connection error — fall through to file
  }
}

export async function getDataset(): Promise<Dataset> {
  const stored = await loadStored();
  if (stored) return stored.data;

  // file fallback (before the very first upload)
  const file = path.join(process.cwd(), "public", "app", "data.json");
  const stamp = "file:" + fs.statSync(file).mtimeMs;
  if (cache && cache.stamp === stamp) return cache.data;
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as Dataset;
  cache = { stamp, data };
  return data;
}

export async function saveDataset(data: Dataset, source: "upload" = "upload") {
  const stored: StoredDataset = { ...data, _source: source };
  const json = JSON.stringify(stored);
  await prisma.dataset.upsert({
    where: { id: 1 },
    update: { json },
    create: { id: 1, json },
  });
  cache = null;
}
