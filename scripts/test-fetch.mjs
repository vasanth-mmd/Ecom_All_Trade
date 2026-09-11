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

async function testFetch() {
  console.time("fetch10k");
  const { data, error } = await supabase
    .from("trade_orders")
    .select("month,trade,region,city,category,po_status,sku_name,po_qty,po_value,grn_qty,grn_value,po_date_num,po_number,po_expiry_date")
    .range(0, 9999);
  console.timeEnd("fetch10k");
  console.log("Fetched rows:", data?.length, "Error:", error);
}

testFetch();
