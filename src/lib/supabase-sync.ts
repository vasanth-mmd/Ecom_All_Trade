import { getServiceSupabase } from "@/lib/supabase";
import { normalizeStatus } from "@/lib/dataset";

const MONTH_ABBR: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function toYMD(v: any): number {
  if (typeof v === "number" && v > 20000 && v < 60000) {
    const days = Math.floor(v);
    const dt = new Date(Math.round((days - 25569) * 86400 * 1000));
    return dt.getUTCFullYear() * 10000 + (dt.getUTCMonth() + 1) * 100 + dt.getUTCDate();
  }
  if (v instanceof Date && !isNaN(+v)) {
    let d = v;
    if (d.getUTCHours() >= 12) d = new Date(v.getTime() + 6 * 3600 * 1000);
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
}

function fmtYMD(n: number): string | null {
  if (!n || n < 10000000) return null;
  const s = String(n);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function parseNum(v: any): number {
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  if (!v) return 0;
  const s = String(v).replace(/,/g, "").trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/** Clear all previous records from Supabase trade_orders so only fresh uploaded data exists */
export async function clearSupabaseTradeOrders() {
  try {
    const supabase = getServiceSupabase();
    const { error } = await supabase.from("trade_orders").delete().gte("id", 0);
    if (error) {
      console.warn("[supabase-sync] Notice on clearing existing trade_orders:", error.message);
    } else {
      console.log("[supabase-sync] Cleaned previous records from Supabase trade_orders table.");
    }
  } catch (err) {
    console.warn("[supabase-sync] Clear trade_orders error:", err);
  }
}

/** Insert records into Supabase trade_orders in batches */
export async function syncRecordsToSupabase(records: any[]) {
  if (!records || !records.length) return;
  const supabase = getServiceSupabase();

  const formattedRows = records.map((rec) => {
    const poDateNum = toYMD(rec["Po Date"] ?? rec["PO Date"] ?? rec["Date"] ?? rec["po_date"] ?? "");
    const expDateNum = toYMD(rec["Po Expiry Date"] ?? rec["PO Expiry Date"] ?? rec["Expiry Date"] ?? rec["po_expiry_date"] ?? "");

    return {
      po_number: String(rec["PO Number"] ?? rec["Po Number"] ?? rec["po_number"] ?? "").trim(),
      po_date: fmtYMD(poDateNum),
      po_date_num: poDateNum || null,
      month: String(rec["Month"] ?? rec["month"] ?? "").trim() || "Unknown",
      po_expiry_date: fmtYMD(expDateNum),
      city: String(rec["City"] ?? rec["city"] ?? "").trim(),
      item_code: String(rec["Item Code"] ?? rec["item_code"] ?? "").trim(),
      sku_name: String(rec["SKU Name"] ?? rec["Sku Name"] ?? rec["sku_name"] ?? rec["SKU"] ?? "").trim() || "(Blank)",
      category: String(rec["Category"] ?? rec["category"] ?? "").trim(),
      po_qty: parseNum(rec["PO Qty"] ?? rec["Po Qty"] ?? rec["po_qty"] ?? 0),
      po_value: parseNum(rec["Po Value"] ?? rec["PO Value"] ?? rec["po_value"] ?? 0),
      po_status: normalizeStatus(rec["PO Status"] ?? rec["Po Status"] ?? rec["po_status"] ?? ""),
      grn_qty: parseNum(rec["GRN Qty"] ?? rec["Grn Qty"] ?? rec["grn_qty"] ?? 0),
      grn_value: parseNum(rec["GRN Value"] ?? rec["Grn Value"] ?? rec["grn_value"] ?? 0),
      trade: String(rec["Trade"] ?? rec["trade"] ?? "").trim() || "Unknown",
      region: String(rec["Region"] ?? rec["region"] ?? "").trim(),
      mmd_item_code: String(rec["MMD Item Code"] ?? rec["mmd_item_code"] ?? "").trim(),
      mmd_sku_name: String(rec["MMD SKU name"] ?? rec["MMD Sku Name"] ?? rec["mmd_sku_name"] ?? "").trim(),
    };
  });

  // Batch insert into Supabase in chunks of 1000
  const BATCH_SIZE = 1000;
  for (let i = 0; i < formattedRows.length; i += BATCH_SIZE) {
    const chunk = formattedRows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("trade_orders").insert(chunk);
    if (error) {
      console.error("[supabase-sync] Error inserting chunk:", error);
    }
  }
}
