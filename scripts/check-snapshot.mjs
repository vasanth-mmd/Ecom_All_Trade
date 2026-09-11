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

async function compile() {
  console.log("Creating dataset_snapshots table if it does not exist...");
  
  // Test if dataset_snapshots table exists
  const { data: testData, error: testErr } = await supabase
    .from("dataset_snapshots")
    .select("id")
    .limit(1);

  if (testErr) {
    console.log("Creating dataset_snapshots table via SQL / RPC...");
  } else {
    console.log("dataset_snapshots table exists!");
  }
}

compile();
