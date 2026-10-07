import { getServiceSupabase } from "@/lib/supabase";
import { normalizeStatus, toYMD } from "@/lib/dataset";

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
    
    // Try fast RPC truncate first
    const { error: rpcErr } = await supabase.rpc("truncate_trade_orders");
    if (!rpcErr) {
      console.log("[supabase-sync] Truncated trade_orders table via RPC.");
      return;
    }

    // Fallback standard delete
    const { error } = await supabase.from("trade_orders").delete().gt("id", 0);
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

  const formattedRows = records.map((rawRec) => {
    const cleanMap: Record<string, any> = {};
    for (const k of Object.keys(rawRec)) {
      cleanMap[k.toLowerCase().replace(/[\s_-]+/g, "")] = rawRec[k];
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

    const poDateNum = toYMD(lookup(["Po Date", "PO Date", "Date", "po_date", "Order Date"]));
    const expDateNum = toYMD(lookup(["Po Expiry Date", "PO Expiry Date", "Expiry Date", "po_expiry_date", "Expiry"]));

    return {
      po_number: String(lookup(["PO Number", "Po Number", "po_number", "PO", "PONo"])).trim(),
      po_date: fmtYMD(poDateNum),
      po_date_num: poDateNum || null,
      month: String(lookup(["Month", "month", "MONTH"])).trim() || "Unknown",
      po_expiry_date: fmtYMD(expDateNum),
      city: String(lookup(["City", "city"])).trim(),
      item_code: String(lookup(["Item Code", "item_code", "ItemCode"])).trim(),
      sku_name: String(lookup(["SKU Name", "Sku Name", "sku_name", "SKU", "Item Name"])).trim() || "(Blank)",
      category: String(lookup(["Category", "category"])).trim(),
      po_qty: parseNum(lookup(["PO Qty", "Po Qty", "po_qty", "Ordered Qty", "Qty"])),
      po_value: parseNum(lookup(["Po Value", "PO Value", "po_value", "PO Val"])),
      po_status: normalizeStatus(lookup(["PO Status", "Po Status", "po_status", "Status"])),
      grn_qty: parseNum(lookup(["GRN Qty", "Grn Qty", "grn_qty", "Received Qty"])),
      grn_value: parseNum(lookup(["GRN Value", "Grn Value", "grn_value", "GRN Val"])),
      trade: String(lookup(["Trade", "trade", "Customer"])).trim() || "Unknown",
      region: String(lookup(["Region", "region", "Zone"])).trim(),
      mmd_item_code: String(lookup(["MMD Item Code", "mmd_item_code"])).trim(),
      mmd_sku_name: String(lookup(["MMD SKU name", "MMD Sku Name", "mmd_sku_name"])).trim(),
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
