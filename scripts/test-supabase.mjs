import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function testConnection() {
  if (!url || !secretKey) {
    console.error("Missing SUPABASE env vars");
    return;
  }
  const supabase = createClient(url, secretKey);
  const { data, error } = await supabase.from("trade_orders").select("id").limit(1);
  if (error) {
    console.error("Error querying trade_orders:", error);
  } else {
    console.log("SUCCESS! Connected to Supabase trade_orders table. Data count:", data.length);
  }
}

testConnection();
