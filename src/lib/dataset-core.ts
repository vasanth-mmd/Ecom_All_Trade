/* ============================================================
   Pure JavaScript/TypeScript Dataset builder & date parser.
   Zero Node.js/Prisma imports — safe to use in browser client & server.
   ============================================================ */

export type Dataset = {
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

export const MONTH_ORDER = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function normalizeStatus(raw: any): string {
  const s = String(raw ?? "").trim();
  if (!s) return "(Blanks)";
  const lower = s.toLowerCase().replace(/[\s_-]+/g, " ");
  if (
    lower === "fully supplied po" ||
    lower === "fully supplied" ||
    lower === "po fully supplied" ||
    lower === "completed" ||
    lower === "grn_done" ||
    lower === "grn done" ||
    lower === "po fully serviced" ||
    lower === "fully serviced"
  ) {
    return "Fully Supplied Po";
  }
  if (
    lower === "partially supplied po" ||
    lower === "partially supplied" ||
    lower === "po partially supplied" ||
    lower === "po partially serviced" ||
    lower === "partially serviced"
  ) {
    return "Partially Supplied Po";
  }
  if (
    lower === "zero supply po" ||
    lower === "zero supply" ||
    lower === "unsupplied" ||
    lower === "zero fill po" ||
    lower === "zero fill"
  ) {
    return "Zero Supply Po";
  }
  if (lower === "open po" || lower === "open" || lower === "open pos") {
    return "Open Po";
  }
  if (lower === "expired") {
    return "Expired";
  }
  if (lower === "pending acknowledgement" || lower === "pending ack") {
    return "Pending Acknowledgement";
  }
  if (lower === "asn created" || lower === "asn") {
    return "ASN Created";
  }
  if (lower === "cancelled" || lower === "canceled") {
    return "Cancelled";
  }
  return titleCase(s);
}

export const titleCase = (s: any) =>
  String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase());

const MONTH_ABBR: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  september: 9,
  sept: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

export const toYMD = (v: any): number => {
  if (v == null || v === "") return 0;

  // 1. If it's already an 8-digit integer like 20260419
  if (typeof v === "number" && v >= 19000101 && v <= 20991231) {
    return Math.floor(v);
  }

  // 2. Excel serial number (number or numeric string like 46131 or "46131" or "46131.5")
  const numVal =
    typeof v === "number"
      ? v
      : typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim())
      ? parseFloat(v.trim())
      : null;

  if (numVal !== null && numVal >= 20000 && numVal < 70000) {
    const days = Math.floor(numVal);
    // Excel epoch 1899-12-30 (25569 days to 1970-01-01) in pure UTC arithmetic
    const dt = new Date(Math.round((days - 25569) * 86400 * 1000));
    return dt.getUTCFullYear() * 10000 + (dt.getUTCMonth() + 1) * 100 + dt.getUTCDate();
  }

  // 3. Date object
  if (v instanceof Date && !isNaN(+v)) {
    let d = v;
    if (d.getUTCHours() >= 12) {
      d = new Date(v.getTime() + 6 * 3600 * 1000);
    }
    return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  }

  const s = String(v).trim();
  if (!s) return 0;

  // 4. ISO format: YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD (e.g. 2026-04-19 or 2026-04-19T...)
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    const y = +m[1],
      mo = +m[2],
      day = +m[3];
    if (mo >= 1 && mo <= 12 && day >= 1 && day <= 31) {
      return y * 10000 + mo * 100 + day;
    }
  }

  // 5. DD-Mon-YYYY or DD-Mon-YY or DD Mon YYYY (e.g. "19-Apr-2026", "19-Apr-26", "19 April 2026", "19th Apr 2026")
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[- /]([A-Za-z]{3,9})[- /](\d{2,4})/);
  if (m) {
    const day = +m[1];
    const mon = MONTH_ABBR[m[2].toLowerCase()];
    let y = +m[3];
    if (y < 100) y += 2000;
    if (mon && day >= 1 && day <= 31) {
      return y * 10000 + mon * 100 + day;
    }
  }

  // 6. Mon-DD-YYYY or Month DD, YYYY (e.g. "Apr 19, 2026", "April 19 2026", "Apr-19-2026")
  m = s.match(/^([A-Za-z]{3,9})[- /](\d{1,2})(?:st|nd|rd|th)?(?:,)?[- /](\d{2,4})/);
  if (m) {
    const mon = MONTH_ABBR[m[1].toLowerCase()];
    const day = +m[2];
    let y = +m[3];
    if (y < 100) y += 2000;
    if (mon && day >= 1 && day <= 31) {
      return y * 10000 + mon * 100 + day;
    }
  }

  // 7. DD/MM/YYYY or MM/DD/YYYY or DD-MM-YYYY or DD.MM.YYYY (e.g. "19/04/2026", "04/19/2026", "19/04/26")
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let p1 = +m[1],
      p2 = +m[2],
      y = +m[3];
    if (y < 100) y += 2000;

    let day = p1,
      mo = p2;
    // If p1 > 12 and p2 <= 12, p1 MUST be day and p2 MUST be month (e.g. 19/04/2026)
    if (p1 > 12 && p2 <= 12) {
      day = p1;
      mo = p2;
    }
    // If p2 > 12 and p1 <= 12, p2 MUST be day and p1 MUST be month (e.g. 04/19/2026)
    else if (p2 > 12 && p1 <= 12) {
      day = p2;
      mo = p1;
    }
    // If both <= 12, in Indian corporate data (Milky Mist / Trade FR) default is DD/MM/YYYY (p1=day, p2=month)
    else {
      day = p1;
      mo = p2;
    }

    if (mo >= 1 && mo <= 12 && day >= 1 && day <= 31) {
      return y * 10000 + mo * 100 + day;
    }
  }

  // 8. Fallback to native Date parser
  const d = new Date(s);
  if (!isNaN(+d)) {
    let adj = d;
    if (adj.getUTCHours() >= 12) adj = new Date(d.getTime() + 6 * 3600 * 1000);
    const y = adj.getUTCFullYear();
    const mo = adj.getUTCMonth() + 1;
    const day = adj.getUTCDate();
    if (y >= 2000 && y <= 2099) {
      return y * 10000 + mo * 100 + day;
    }
  }

  return 0;
};

export const fmtYMD = (n: number) => {
  const s = String(n);
  return s.length === 8 ? s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8) : "";
};

export const parseNum = (v: any): number => {
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  if (!v) return 0;
  const s = String(v).replace(/,/g, "").trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

/** Locate the raw data sheet regardless of case or spaces, or inspect sheet contents */
export function findRawDataSheet(wb: any, xlsxLib?: any): any {
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
  const X = xlsxLib || (typeof window !== "undefined" ? (window as any).XLSX : null) || (typeof require !== "undefined" ? require("xlsx") : null);
  if (X) {
    for (const name of wb.SheetNames) {
      const s = wb.Sheets[name];
      if (!s) continue;
      try {
        const preview = X.utils.sheet_to_json(s, { header: 1, range: 0, defval: "" }) as any[][];
        if (preview && preview.length > 0) {
          const row0 = (preview[0] || []).map((c: any) =>
            String(c).trim().toLowerCase().replace(/[\s_-]+/g, "")
          );
          if (
            row0.includes("ponumber") ||
            (row0.includes("trade") && row0.includes("poqty")) ||
            (row0.includes("city") && row0.includes("grnqty"))
          ) {
            return s;
          }
        }
      } catch {
        // ignore
      }
    }
  }

  // 4. Pick sheet with the largest range / most rows
  let maxSheet = wb.Sheets[wb.SheetNames[0]];
  let maxRows = 0;
  if (X) {
    for (const name of wb.SheetNames) {
      const s = wb.Sheets[name];
      if (!s || !s["!ref"]) continue;
      try {
        const range = X.utils.decode_range(s["!ref"]);
        const count = range.e.r - range.s.r + 1;
        if (count > maxRows) {
          maxRows = count;
          maxSheet = s;
        }
      } catch {}
    }
  }

  return maxSheet;
}

/** Same transforms as the dashboard's own parser. Compiles raw records into compact matrix dataset. */
export function buildFromRecords(recs: any[]): Dataset {
  const dims: Record<string, string[]> = {
    month: [],
    trade: [],
    region: [],
    city: [],
    category: [],
    status: [],
    sku: [],
    po: [],
  };
  const maps: Record<string, Record<string, number>> = {
    month: {},
    trade: {},
    region: {},
    city: {},
    category: {},
    status: {},
    sku: {},
  };
  const id = (dim: string, val: string) => {
    const m = maps[dim];
    if (!(val in m)) {
      m[val] = dims[dim].length;
      dims[dim].push(val);
    }
    return m[val];
  };
  const poMap: Record<string, number> = {};
  let poN = 0;
  const poId = (v: any) => {
    const k = String(v ?? "").trim();
    if (!(k in poMap)) {
      poMap[k] = poN++;
      dims.po.push(k);
    }
    return poMap[k];
  };

  const rows: number[][] = [];
  for (const rawO of recs) {
    // Build normalized lowercase map of keys for case-insensitive / flexible lookup
    const cleanMap: Record<string, any> = {};
    for (const k of Object.keys(rawO)) {
      const cleanKey = k.toLowerCase().replace(/[\s_-]+/g, "");
      cleanMap[cleanKey] = rawO[k];
    }

    const lookup = (candidates: string[]): any => {
      for (const cand of candidates) {
        const cKey = cand.toLowerCase().replace(/[\s_-]+/g, "");
        if (cKey in cleanMap && cleanMap[cKey] !== undefined && cleanMap[cKey] !== "") {
          return cleanMap[cKey];
        }
      }
      return "";
    };

    const rawStatus = lookup(["PO Status", "Po Status", "Status", "po_status", "Supply Status"]);
    const status = normalizeStatus(rawStatus);

    const poDateRaw = lookup([
      "Po Date",
      "PO Date",
      "PO_Date",
      "po_date",
      "Date",
      "Order Date",
      "PODate",
      "Created Date",
    ]);
    const poDate = toYMD(poDateRaw);

    let monthVal = String(lookup(["Month", "month", "MONTH"])).trim();
    // Auto-populate month from PO date if month is missing or empty
    if (!monthVal && poDate > 0) {
      const monthNum = Math.floor((poDate % 10000) / 100);
      if (monthNum >= 1 && monthNum <= 12) {
        monthVal = MONTH_ORDER[monthNum - 1];
      }
    }
    if (!monthVal) monthVal = "(Blanks)";

    const tradeVal = String(lookup(["Trade", "trade", "Customer", "Platform"])).trim() || "Unknown";
    const regionVal = titleCase(lookup(["Region", "region", "Zone", "State"])) || "Unknown";
    const cityVal = titleCase(lookup(["City", "city", "Location", "Destination"])) || "Unknown";
    const catVal = String(lookup(["Category", "category", "Cat"])).trim() || "General";
    const skuVal =
      String(
        lookup([
          "SKU Name",
          "Sku Name",
          "SKU",
          "sku",
          "Item Name",
          "Item Description",
          "Product Name",
        ])
      ).trim() || "(Blank)";

    const poQty = Math.round(
      parseNum(lookup(["PO Qty", "Po Qty", "po_qty", "Ordered Qty", "PO Quantity", "Qty"]))
    );
    const poVal = +parseNum(
      lookup(["Po Value", "PO Value", "po_value", "PO Val", "Ordered Value", "Value"])
    ).toFixed(4);
    const grnQty = Math.round(
      parseNum(
        lookup(["GRN Qty", "Grn Qty", "grn_qty", "Received Qty", "Supplied Qty", "GRN Quantity"])
      )
    );
    const grnVal = +parseNum(
      lookup(["GRN Value", "Grn Value", "grn_value", "GRN Val", "Supplied Value", "Received Value"])
    ).toFixed(4);

    const poNum = poId(
      lookup(["PO Number", "Po Number", "PO_Number", "po_number", "PO", "PONo", "Order Number", "Order No"])
    );
    const poExpiryRaw = lookup([
      "Po Expiry Date",
      "PO Expiry Date",
      "PO_Expiry_Date",
      "po_expiry_date",
      "Expiry Date",
      "Expiry",
      "ExpiryDate",
    ]);
    const poExpiry = toYMD(poExpiryRaw);

    // D-2 Concept for Blinkit: PO Expiry Date above cutoff date (e.g. > 23 / 20261023) is considered an Open PO
    let finalStatus = status;
    if (tradeVal.toLowerCase().includes("blinkit") && poExpiry > 20261023) {
      finalStatus = "Open Po";
    }

    rows.push([
      id("month", monthVal),
      id("trade", tradeVal),
      id("region", regionVal),
      id("city", cityVal),
      id("category", catVal),
      id("status", finalStatus),
      id("sku", skuVal),
      poQty,
      poVal,
      grnQty,
      grnVal,
      poDate,
      poNum,
      poExpiry,
    ]);
  }

  // calendar-order the month dim
  const order = dims.month.map((m) => MONTH_ORDER.indexOf(m));
  const perm = dims.month.map((_, i) => i).sort((a, b) => {
    const oa = order[a] === -1 ? 99 : order[a];
    const ob = order[b] === -1 ? 99 : order[b];
    return oa - ob;
  });
  const remap: Record<number, number> = {};
  perm.forEach((oldI, newI) => {
    remap[oldI] = newI;
  });
  dims.month = perm.map((oldI) => dims.month[oldI]);
  rows.forEach((r) => {
    r[0] = remap[r[0]];
  });

  let dmin = 99999999;
  let dmax = 0;
  for (let i = 0; i < rows.length; i++) {
    const y = rows[i][11];
    if (y > 0) {
      if (y < dmin) dmin = y;
      if (y > dmax) dmax = y;
    }
  }
  if (dmin === 99999999) dmin = 0;

  return {
    meta: {
      rows: rows.length,
      generated: new Date().toISOString().slice(0, 19).replace("T", " "),
      value_unit: "lakh",
      po_count: poN,
      date_min: fmtYMD(dmin) || "2000-01-01",
      date_max: fmtYMD(dmax) || "2099-12-31",
    },
    dims,
    rows,
  };
}
