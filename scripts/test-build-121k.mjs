const MONTH_ORDER = ["January","February","March","April","May","June","July",
  "August","September","October","November","December"];

const titleCase = (s) =>
  String(s ?? "").trim().toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());

const MONTH_ABBR = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function normalizeStatus(raw) {
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

const toYMD = (v) => {
  if (typeof v === "number" && v > 20000 && v < 60000) {
    const days = Math.floor(v);
    const dt = new Date(Math.round((days - 25569) * 86400 * 1000));
    return dt.getUTCFullYear() * 10000 + (dt.getUTCMonth() + 1) * 100 + dt.getUTCDate();
  }
  if (v instanceof Date && !isNaN(+v)) {
    let d = v;
    if (d.getUTCHours() >= 12) {
      d = new Date(v.getTime() + 6 * 3600 * 1000);
    }
    return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  }
  const s = String(v ?? "").trim();
  if (!s) return 0;
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return +m[1] * 10000 + +m[2] * 100 + +m[3];
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) return +m[3] * 10000 + +m[2] * 100 + +m[1];
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

const fmtYMD = (n) => {
  const s = String(n);
  return s.length === 8 ? s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8) : "";
};

const parseNum = (v) => {
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  if (!v) return 0;
  const s = String(v).replace(/,/g, "").trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

function buildFromRecords(recs) {
  const dims = { month: [], trade: [], region: [], city: [], category: [], status: [], sku: [], po: [] };
  const maps = { month: {}, trade: {}, region: {}, city: {}, category: {}, status: {}, sku: {} };
  const id = (dim, val) => {
    const m = maps[dim];
    if (!(val in m)) { m[val] = dims[dim].length; dims[dim].push(val); }
    return m[val];
  };
  const poMap = {};
  let poN = 0;
  const poId = (v) => {
    const k = String(v ?? "").trim();
    if (!(k in poMap)) { poMap[k] = poN++; dims.po.push(k); }
    return poMap[k];
  };
  const rows = [];
  for (const rawO of recs) {
    const o = {};
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

  const order = dims.month.map((m) => MONTH_ORDER.indexOf(m));
  const perm = dims.month.map((_, i) => i).sort((a, b) => order[a] - order[b]);
  const remap = {};
  perm.forEach((oldI, newI) => { remap[oldI] = newI; });
  dims.month = perm.map((oldI) => dims.month[oldI]);
  rows.forEach((r) => { r[0] = remap[r[0]]; });

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
    dims, rows,
  };
}

console.log("Generating 121,352 rows...");
const sample = [];
for (let i = 0; i < 121352; i++) {
  sample.push({
    "PO Number": "MBFPO" + i,
    "Po Date": "05 September 2026",
    "Month": "September",
    "Po Expiry Date": "07 September 2026",
    "City": "Bengaluru",
    "Item Code": "689",
    "SKU Name": "Milky Mist Fruit Yogurt " + (i % 50),
    "Category": "Yogurt",
    "PO Qty": 432,
    "Po Value": 0.1296,
    "PO Status": "Partially Supplied Po",
    "GRN Qty": 432,
    "GRN Value": 0.1296,
    "Trade": "Swiggy",
    "Region": "South",
    "MMD Item Code": "FYB0001",
    "MMD SKU name": "YOGHURT BLUEBERRY 100GM",
  });
}

console.time("buildFromRecords");
const res = buildFromRecords(sample);
console.timeEnd("buildFromRecords");
console.log("Result rows:", res.rows.length, "Meta:", res.meta);
