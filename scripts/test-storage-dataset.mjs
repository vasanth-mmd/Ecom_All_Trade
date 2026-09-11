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

async function testUploadDownload() {
  const localData = fs.readFileSync("public/app/data.json", "utf8");
  console.log("Local file size:", (localData.length / (1024 * 1024)).toFixed(2), "MB");

  console.time("uploadToSupabaseStorage");
  const { data: upData, error: upErr } = await supabase.storage
    .from("datasets")
    .upload("active_dataset.json", Buffer.from(localData, "utf8"), {
      contentType: "application/json",
      upsert: true,
    });
  console.timeEnd("uploadToSupabaseStorage");
  console.log("Upload result:", upData, upErr);

  console.time("downloadFromSupabaseStorage");
  const { data: downData, error: downErr } = await supabase.storage
    .from("datasets")
    .download("active_dataset.json");
  console.timeEnd("downloadFromSupabaseStorage");

  if (downData) {
    const text = await downData.text();
    const parsed = JSON.parse(text);
    console.log("Downloaded successfully! Rows:", parsed.rows?.length, "Meta:", parsed.meta);
  }
}

testUploadDownload();
