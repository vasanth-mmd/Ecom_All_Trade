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

async function checkCount() {
  const supabase = createClient(url, secretKey);
  const { count, error } = await supabase.from("trade_orders").select("*", { count: "exact", head: true });
  console.log("Current total rows in Supabase trade_orders:", count, error);

  const { data: sample, error: err2 } = await supabase.from("trade_orders").select("*").limit(3);
  console.log("Sample rows count:", sample?.length, "Sample 0:", sample?.[0]);
  if (err2) console.error("Error fetching sample:", err2);
}

checkCount();
