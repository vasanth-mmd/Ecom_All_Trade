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

export function normalizeStatus(raw: any): string {
  const s = String(raw ?? "").trim();
  if (!s) return "(Blanks)";
  const lower = s.toLowerCase().replace(/\s+/g, " ");
  if (
    lower === "fully supplied po" ||
    lower === "fully supplied" ||
    lower === "po fully supplied" ||
    lower === "completed" ||
    lower === "grn_done"
  ) {
    return "Fully Supplied Po";
  }
  if (
    lower === "partially supplied po" ||
    lower === "partially supplied" ||
    lower === "po partially supplied"
  ) {
    return "Partially Supplied Po";
  }
  if (lower === "zero supply po" || lower === "zero supply") {
    return "Zero Supply Po";
  }
  if (lower === "expired") {
    return "Expired";
  }
  return titleCase(s);
}
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

const parseNum = (v: any): number => {
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  if (!v) return 0;
  const s = String(v).replace(/,/g, "").trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

/** Locate the raw data sheet regardless of case or spaces, or inspect sheet contents */
export function findRawDataSheet(wb: any): any {
  if (!wb || !wb.SheetNames || !wb.SheetNames.length) return null;

  // 1. Direct or normalized name match
  const rawTarget = wb.SheetNames.find((name: string) => {
    const clean = name.trim().toLowerCase().replace(/[\s_-]+/g, "");
    return clean === "rawdata" || clean === "raw" || clean === "data";
  });
  if (rawTarget && wb.Sheets[rawTarget]) return wb.Sheets[rawTarget];

  // 2. Exact "Raw Data" fallback
  if (wb.Sheets["Raw Data"]) return wb.Sheets["Raw Data"];

  // 3. Inspect headers of each sheet to find one that has Trade FR columns
  const XLSX = require("xlsx");
  for (const name of wb.SheetNames) {
    const s = wb.Sheets[name];
    if (!s) continue;
    try {
      const preview = XLSX.utils.sheet_to_json(s, { header: 1, range: 0, defval: "" }) as any[][];
      if (preview && preview.length > 0) {
        const row0 = (preview[0] || []).map((c: any) => String(c).trim().toLowerCase());
        if (
          row0.includes("po number") ||
          (row0.includes("trade") && row0.includes("po qty")) ||
          (row0.includes("city") && row0.includes("grn qty"))
        ) {
          return s;
        }
      }
    } catch {
      // ignore
    }
  }

  // 4. Default to first sheet
  return wb.Sheets[wb.SheetNames[0]];
}

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
  for (const rawO of recs) {
    // Normalize keys in case of leading/trailing spaces
    const o: Record<string, any> = {};
    for (const k of Object.keys(rawO)) {
      o[k.trim()] = rawO[k];
    }

    const rawStatus = o["PO Status"] ?? o["Po Status"] ?? o["Status"] ?? o["status"] ?? "";
    const status = normalizeStatus(rawStatus);

    const monthVal = String(o["Month"] ?? o["month"] ?? "").trim();
    const tradeVal = String(o["Trade"] ?? o["trade"] ?? "").trim();
    const regionVal = titleCase(o["Region"] ?? o["region"]);
    const cityVal = titleCase(o["City"] ?? o["city"]);
    const catVal = String(o["Category"] ?? o["category"] ?? "").trim();
    const skuVal = String(o["SKU Name"] ?? o["Sku Name"] ?? o["SKU"] ?? o["sku"] ?? "").trim();

    const poQty = Math.round(parseNum(o["PO Qty"] ?? o["Po Qty"]));
    const poVal = +parseNum(o["Po Value"] ?? o["PO Value"] ?? o["po value"]).toFixed(4);
    const grnQty = Math.round(parseNum(o["GRN Qty"] ?? o["Grn Qty"]));
    const grnVal = +parseNum(o["GRN Value"] ?? o["Grn Value"] ?? o["grn value"]).toFixed(4);

    const poDate = toYMD(o["Po Date"] ?? o["PO Date"] ?? o["po date"]);
    const poNum = poId(o["PO Number"] ?? o["Po Number"] ?? o["po number"]);
    const poExpiry = toYMD(o["Po Expiry Date"] ?? o["PO Expiry Date"] ?? o["po expiry date"]);

    rows.push([
      id("month", monthVal),
      id("trade", tradeVal),
      id("region", regionVal),
      id("city", cityVal),
      id("category", catVal),
      id("status", status),
      id("sku", skuVal),
      poQty, poVal,
      grnQty, grnVal,
      poDate,
      poNum,
      poExpiry,
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

/* ---------------- Upload-only loader with in-memory cache & local fallback -----------------
   The dashboard's data comes from a manually-uploaded file via /api/upload.
   That upload is stored in Neon (Dataset table, single JSON row) AND backed up
   atomically to public/app/data.json and public/app/data.js.
   This guarantees that even during cold-starts, connection delays, or temporary
   database offline states, the dashboard always serves the latest uploaded dataset.
-------------------------------------------------------------------------------------------- */

type StoredDataset = Dataset & { _source?: "upload" };
let cache: { stamp: string; data: Dataset } | null = null;

function saveLocalFiles(data: Dataset) {
  try {
    const jsonStr = JSON.stringify(data);
    const jsonPath = path.join(process.cwd(), "public", "app", "data.json");
    const jsPath = path.join(process.cwd(), "public", "app", "data.js");
    fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
    fs.writeFileSync(jsonPath, jsonStr, "utf8");
    fs.writeFileSync(jsPath, "window.TRADE_FR=" + jsonStr + ";", "utf8");
  } catch (e) {
    console.warn("[dataset] Warning: could not write local backup files:", e);
  }
}

async function loadStored(): Promise<{ data: Dataset; stamp: string } | null> {
  // If we already have a valid memory cache, return it immediately
  if (cache && cache.data && cache.data.rows && cache.data.rows.length > 0) {
    return cache;
  }

  try {
    const dbPromise = prisma.dataset.findUnique({ where: { id: 1 } });
    // Allow up to 10 seconds for Neon serverless wake up on cold boot
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000));
    const rec = await Promise.race([dbPromise, timeoutPromise]);
    if (!rec) return null;
    const stamp = rec.updatedAt.toISOString();
    if (cache && cache.stamp === stamp) return cache;
    const parsed = JSON.parse(rec.json) as StoredDataset;
    const { _source, ...data } = parsed;
    const entry = { data: data as Dataset, stamp };
    cache = entry;

    // Keep local files updated if database has fresh data
    saveLocalFiles(data as Dataset);

    return entry;
  } catch (e) {
    console.warn("[dataset] Could not load from database:", e);
    return null;
  }
}

export async function getDataset(): Promise<Dataset> {
  // 1. Try to load from database or active memory cache
  const stored = await loadStored();
  if (stored && stored.data) return stored.data;

  // 2. If memory cache already holds data, never downgrade to disk file
  if (cache && cache.data && cache.data.rows && cache.data.rows.length > 0) {
    return cache.data;
  }

  // 3. Fall back to local file
  try {
    const file = path.join(process.cwd(), "public", "app", "data.json");
    if (fs.existsSync(file)) {
      const stamp = "file:" + fs.statSync(file).mtimeMs;
      if (cache && cache.stamp === stamp) return cache.data;
      const data = JSON.parse(fs.readFileSync(file, "utf8")) as Dataset;
      cache = { stamp, data };
      return data;
    }
  } catch (e) {
    console.error("[dataset] Failed to read public/app/data.json fallback:", e);
  }

  throw new Error("No dataset available");
}

export async function saveDataset(data: Dataset, source: "upload" = "upload") {
  const stored: StoredDataset = { ...data, _source: source };
  const json = JSON.stringify(stored);
  const stamp = new Date().toISOString();

  // 1. Always update memory cache immediately so callers see it right away
  cache = { stamp, data };

  // 2. Always update local backup files so server restarts/offline retain it
  saveLocalFiles(data);

  // 3. Upsert into database
  try {
    await prisma.dataset.upsert({
      where: { id: 1 },
      update: { json },
      create: { id: 1, json },
    });
  } catch (e) {
    console.error("[dataset] Failed to write to Prisma database, but local file saved:", e);
    // Don't re-throw if local file was saved so upload succeeds even if DB is temporarily failing
  }
}
