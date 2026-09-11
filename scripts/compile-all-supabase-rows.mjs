import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envStr = fs.readFileSync(".env.local", "utf8");
const envVars = Object.fromEntries(
  envStr
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const url = envVars.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = envVars.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, secretKey);

const titleCase = (s) =>
  String(s ?? "").trim().toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());

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

function fmtYMD(n) {
  const s = String(n);
  return s.length === 8 ? s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8) : "";
}

async function compileAll() {
  console.log("Fetching all trade_orders from Supabase...");
  const { count } = await supabase.from("trade_orders").select("*", { count: "exact", head: true });
  console.log("Total rows to process:", count);

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
  let minDate = 99999999;
  let maxDate = 0;

  const BATCH = 1000;
  const totalBatches = Math.ceil((count || 0) / BATCH);

  for (let b = 0; b < totalBatches; b++) {
    const from = b * BATCH;
    const to = from + BATCH - 1;

    if (b % 20 === 0 || b === totalBatches - 1) {
      console.log(`Processing batch ${b + 1} of ${totalBatches} (${Math.round(((b + 1) / totalBatches) * 100)}%)...`);
    }

    const { data, error } = await supabase
      .from("trade_orders")
      .select("month,trade,region,city,category,po_status,sku_name,po_qty,po_value,grn_qty,grn_value,po_date_num,po_number,po_expiry_date")
      .range(from, to);

    if (error) {
      console.error("Error at batch:", b, error);
      break;
    }

    for (const o of data) {
      const status = normalizeStatus(o.po_status);
      const monthVal = String(o.month ?? "").trim() || "Unknown";
      const tradeVal = String(o.trade ?? "").trim() || "Unknown";
      const regionVal = titleCase(o.region);
      const cityVal = titleCase(o.city);
      const catVal = String(o.category ?? "").trim();
      const skuVal = String(o.sku_name ?? "").trim() || "(Blank)";

      const poQty = Math.round(Number(o.po_qty || 0));
      const poVal = +Number(o.po_value || 0).toFixed(4);
      const grnQty = Math.round(Number(o.grn_qty || 0));
      const grnVal = +Number(o.grn_value || 0).toFixed(4);

      const poDate = Number(o.po_date_num || 0);
      const poNum = poId(o.po_number);
      const expDate = o.po_expiry_date ? Number(String(o.po_expiry_date).replace(/-/g, "")) : 0;

      if (poDate > 0) {
        if (poDate < minDate) minDate = poDate;
        if (poDate > maxDate) maxDate = poDate;
      }

      rows.push([
        id("month", monthVal),
        id("trade", tradeVal),
        id("region", regionVal),
        id("city", cityVal),
        id("category", catVal),
        id("status", status),
        id("sku", skuVal),
        poQty,
        poVal,
        grnQty,
        grnVal,
        poDate,
        poNum,
        expDate,
      ]);
    }
  }

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  const dataset = {
    meta: {
      rows: rows.length,
      generated: stamp,
      value_unit: "lakh",
      po_count: dims.po.length,
      date_min: minDate < 99999999 ? fmtYMD(minDate) : "",
      date_max: maxDate > 0 ? fmtYMD(maxDate) : "",
    },
    dims,
    rows,
  };

  console.log("Compiled dataset successfully! Total rows:", dataset.meta.rows, "POs:", dataset.meta.po_count);
  const jsonStr = JSON.stringify(dataset);
  console.log("Dataset size:", (jsonStr.length / (1024 * 1024)).toFixed(2), "MB");

  // Save to local file
  fs.writeFileSync("public/app/data.json", jsonStr, "utf8");
  fs.writeFileSync("public/app/data.js", "window.TRADE_FR=" + jsonStr + ";", "utf8");
  console.log("Saved to local public/app/data.json and data.js");

  // Upload to Supabase Storage
  console.time("uploadToSupabaseStorage");
  const { error: upErr } = await supabase.storage
    .from("datasets")
    .upload("active_dataset.json", Buffer.from(jsonStr, "utf8"), {
      contentType: "application/json",
      upsert: true,
    });
  console.timeEnd("uploadToSupabaseStorage");
  if (upErr) console.error("Upload error:", upErr);
  else console.log("Uploaded active_dataset.json to Supabase storage successfully!");
}

compileAll();
