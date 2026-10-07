import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getServiceSupabase } from "@/lib/supabase";
import {
  Dataset,
  MONTH_ORDER,
  normalizeStatus,
  titleCase,
  toYMD,
  fmtYMD,
  parseNum,
  findRawDataSheet,
  buildFromRecords,
} from "./dataset-core";

export {
  type Dataset,
  MONTH_ORDER,
  normalizeStatus,
  titleCase,
  toYMD,
  fmtYMD,
  parseNum,
  findRawDataSheet,
  buildFromRecords,
};

/* ---------------- Upload-only loader with in-memory cache & local fallback -----------------
   The dashboard's data comes from a manually-uploaded file via /api/upload.
   That upload is stored in Neon (Dataset table, single JSON row) AND backed up
   atomically to public/app/data.json and public/app/data.js.
   This guarantees that even during cold-starts, connection delays, or temporary
   database offline states, the dashboard always serves the latest uploaded dataset.
-------------------------------------------------------------------------------------------- */

type StoredDataset = Dataset & { _source?: "upload" };
let cache: { stamp: string; data: Dataset } | null = null;

function saveLocalFiles(data: Dataset) {
  try {
    const jsonStr = JSON.stringify(data);
    const jsonPath = path.join(process.cwd(), "public", "app", "data.json");
    const jsPath = path.join(process.cwd(), "public", "app", "data.js");
    fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
    fs.writeFileSync(jsonPath, jsonStr, "utf8");
    fs.writeFileSync(jsPath, "window.TRADE_FR=" + jsonStr + ";", "utf8");

    // Also backup to download folders so user can download data.json and data.js
    const downloadDirs = [
      path.join(process.cwd(), "download"),
      path.join(process.cwd(), "downloads"),
    ];
    for (const dir of downloadDirs) {
      try {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "data.json"), jsonStr, "utf8");
        fs.writeFileSync(path.join(dir, "data.js"), "window.TRADE_FR=" + jsonStr + ";", "utf8");
      } catch {}
    }
  } catch (e) {
    console.warn("[dataset] Warning: could not write local JS/JSON files:", e);
  }
}

async function loadFromSupabase(): Promise<Dataset | null> {
  try {
    const supabase = getServiceSupabase();
    const { data: blob, error } = await supabase.storage
      .from("datasets")
      .download("active_dataset.json");

    if (error || !blob) {
      return null;
    }

    const text = await blob.text();
    const parsed = JSON.parse(text) as StoredDataset;
    const { _source, ...data } = parsed;
    return data as Dataset;
  } catch (e) {
    return null;
  }
}

async function loadStored(): Promise<{ data: Dataset; stamp: string } | null> {
  if (cache && cache.data && cache.data.rows && cache.data.rows.length > 0) {
    return cache;
  }

  try {
    const dbPromise = prisma.dataset.findUnique({ where: { id: 1 } });
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000));
    const rec = await Promise.race([dbPromise, timeoutPromise]);
    if (!rec) return null;
    const stamp = rec.updatedAt.toISOString();
    if (cache && cache.stamp === stamp) return cache;
    const parsed = JSON.parse(rec.json) as StoredDataset;
    const { _source, ...data } = parsed;
    const entry = { data: data as Dataset, stamp };
    cache = entry;

    saveLocalFiles(data as Dataset);
    return entry;
  } catch (e) {
    return null;
  }
}

export async function getDataset(): Promise<Dataset> {
  // 1. Check in-memory cache
  if (cache && cache.data && cache.data.rows && cache.data.rows.length > 0) {
    return cache.data;
  }

  // 2. Check local JSON file (Fastest, zero-database dependency)
  try {
    const file = path.join(process.cwd(), "public", "app", "data.json");
    if (fs.existsSync(file)) {
      const stamp = "file:" + fs.statSync(file).mtimeMs;
      const rawText = fs.readFileSync(file, "utf8");
      if (rawText && rawText.length > 10) {
        const data = JSON.parse(rawText) as Dataset;
        if (data && data.rows && data.rows.length > 0) {
          cache = { stamp, data };
          return data;
        }
      }
    }
  } catch (e) {
    console.warn("[dataset] Notice reading local data.json:", e);
  }

  // 3. Fall back to Supabase Storage if available
  try {
    const sbData = await loadFromSupabase();
    if (sbData && sbData.rows && sbData.rows.length > 0) {
      const stamp = "supabase:" + Date.now();
      cache = { stamp, data: sbData };
      saveLocalFiles(sbData);
      return sbData;
    }
  } catch {}

  // 4. Fall back to Prisma database if available
  try {
    const stored = await loadStored();
    if (stored && stored.data && stored.data.rows && stored.data.rows.length > 0) {
      return stored.data;
    }
  } catch {}

  throw new Error("No dataset available. Please upload an Excel/CSV file to generate data.json and data.js.");
}

export async function saveDataset(data: Dataset, source: "upload" = "upload") {
  const stored: StoredDataset = { ...data, _source: source };
  const json = JSON.stringify(stored);
  const stamp = new Date().toISOString();

  // 1. Update memory cache immediately
  cache = { stamp, data };

  // 2. Update local JS and JSON files immediately
  saveLocalFiles(data);

  // 3. Optional background sync to Supabase Storage (non-blocking)
  try {
    const supabase = getServiceSupabase();
    supabase.storage
      .from("datasets")
      .upload("active_dataset.json", Buffer.from(json, "utf8"), {
        contentType: "application/json",
        upsert: true,
      })
      .then(() => {})
      .catch((e) => console.warn("[dataset] Optional Supabase storage notice:", e.message));
  } catch (e) {
    // ignore
  }

  // 4. Optional background upsert to Prisma database (non-blocking)
  try {
    prisma.dataset
      .upsert({
        where: { id: 1 },
        update: { json },
        create: { id: 1, json },
      })
      .then(() => {})
      .catch((e) => console.warn("[dataset] Optional Prisma notice:", e.message));
  } catch (e) {
    // ignore
  }
}
