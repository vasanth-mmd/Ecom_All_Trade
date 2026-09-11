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

async function check() {
  const { count } = await supabase.from("trade_orders").select("*", { count: "exact", head: true });
  console.log("Current total in database:", count);

  // Test deleting with delete()
  console.time("delete");
  const { error, count: delCount } = await supabase.from("trade_orders").delete({ count: "exact" }).gt("id", 0);
  console.timeEnd("delete");
  console.log("Delete result error:", error, "Deleted count:", delCount);

  const { count: afterCount } = await supabase.from("trade_orders").select("*", { count: "exact", head: true });
  console.log("Count after delete:", afterCount);
}

check();
