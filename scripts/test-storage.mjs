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

async function testStorage() {
  const { data: buckets, error: errB } = await supabase.storage.listBuckets();
  console.log("Current buckets:", buckets, errB);

  // Try creating 'datasets' bucket if not present
  if (!buckets?.some((b) => b.name === "datasets")) {
    const { data: createB, error: createErr } = await supabase.storage.createBucket("datasets", {
      public: true,
    });
    console.log("Created 'datasets' bucket:", createB, createErr);
  }
}

testStorage();
