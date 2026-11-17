import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";

/**
 * Blinkit Open PO Processor (D - 2 Concept)
 *
 * Rule:
 * In Blinkit, for data provided up to a cutoff date (e.g. 23rd October 2026),
 * any PO with PO Expiry Date above 23 (e.g. > 2026-10-23) is considered an "Open Po".
 *
 * Usage:
 *   node scripts/blinkit-open-po.mjs
 *   node scripts/blinkit-open-po.mjs --cutoff 23
 *   node scripts/blinkit-open-po.mjs --file "path/to/raw_data.xlsx"
 */

const args = process.argv.slice(2);
function getArg(flag, defaultVal = null) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return defaultVal;
}

// 1. Parse Cutoff Argument (default: 23 or 20261023)
let cutoffInput = getArg("--cutoff", "23");
let cutoffYmd = 20261023;
if (cutoffInput) {
  const num = parseInt(cutoffInput, 10);
  if (num > 19000101 && num < 20991231) {
    cutoffYmd = num;
  } else if (num >= 1 && num <= 31) {
    // Relative to October 2026
    cutoffYmd = 20261000 + num;
  }
}

const excelFile = getArg("--file") || getArg("--excel");

console.log("==================================================================");
console.log("   BLINKIT OPEN PO PROCESSOR (D - 2 CONCEPT)");
console.log("==================================================================");
console.log(`Target Cutoff Date: ${cutoffYmd} (Expiry > ${cutoffYmd} => 'Open Po')\n`);

// --- A. Process Active Dashboard Datasets (data.json & data.js) ---
const jsonPath = path.join(process.cwd(), "public", "app", "data.json");
const jsPath = path.join(process.cwd(), "public", "app", "data.js");

if (fs.existsSync(jsonPath)) {
  console.log(`[1/2] Updating Active Dashboard Dataset at ${jsonPath}...`);
  const rawJson = fs.readFileSync(jsonPath, "utf8");
  const data = JSON.parse(rawJson);

  const blinkitId = (data.dims.trade || []).findIndex(
    (t) => String(t).toLowerCase() === "blinkit"
  );

  if (blinkitId === -1) {
    console.warn("Warning: 'Blinkit' not found in data.dims.trade!");
  } else {
    // Indices for standard 4 statuses
    const getOrAddStatus = (name) => {
      let idx = data.dims.status.indexOf(name);
      if (idx === -1) {
        idx = data.dims.status.length;
        data.dims.status.push(name);
      }
      return idx;
    };

    const fullySuppliedIdx = getOrAddStatus("Fully Supplied Po");
    const partiallySuppliedIdx = getOrAddStatus("Partially Supplied Po");
    const zeroSupplyIdx = getOrAddStatus("Zero Supply Po");
    const openPoIdx = getOrAddStatus("Open Po");

    let totalBlinkitRows = 0;
    let convertedOpenRows = 0;
    let normalizedSuppliedRows = 0;
    let normalizedPartialRows = 0;
    let normalizedZeroRows = 0;
    const convertedPoIds = new Set();
    const prevStatusCounts = {};
    let totalPoVal = 0;
    let totalGrnVal = 0;
    const sampleConverted = [];

    for (const r of data.rows) {
      if (r[1] !== blinkitId) continue;
      totalBlinkitRows++;

      const expDate = r[13]; // expiryYYYYMMDD
      const prevStatus = data.dims.status[r[5]] || "Unknown";

      // 1. If Expiry > cutoff => Open PO (D - 2 Rule)
      if (expDate > cutoffYmd) {
        prevStatusCounts[prevStatus] = (prevStatusCounts[prevStatus] || 0) + 1;
        r[5] = openPoIdx;
        convertedOpenRows++;
        convertedPoIds.add(r[12]);
        totalPoVal += r[8];
        totalGrnVal += r[10];

        if (sampleConverted.length < 5) {
          sampleConverted.push({
            poNumber: data.dims.po[r[12]] || "—",
            poDate: r[11],
            expiryDate: expDate,
            city: data.dims.city[r[3]] || "—",
            sku: data.dims.sku[r[6]] || "—",
            poVal: r[8],
            grnVal: r[10],
            prevStatus,
          });
        }
      } else {
        // 2. Otherwise (Expiry <= cutoff) => normalize into Supplied, Partially Supplied, and Zero Supply
        if (prevStatus === "Po Fully Serviced") {
          r[5] = fullySuppliedIdx;
          normalizedSuppliedRows++;
        } else if (prevStatus === "Po Partially Serviced") {
          r[5] = partiallySuppliedIdx;
          normalizedPartialRows++;
        } else if (prevStatus === "Zero Fill Po") {
          r[5] = zeroSupplyIdx;
          normalizedZeroRows++;
        }
      }
    }

    // Prune unused statuses from dims.status and remap row indices
    const usedStatusSet = new Set(data.rows.map((r) => r[5]));
    const oldStatusList = [...data.dims.status];
    const newStatusList = [];
    const statusRemap = {};

    for (let i = 0; i < oldStatusList.length; i++) {
      if (usedStatusSet.has(i)) {
        statusRemap[i] = newStatusList.length;
        newStatusList.push(oldStatusList[i]);
      }
    }

    data.dims.status = newStatusList;
    for (const r of data.rows) {
      if (r[5] in statusRemap) {
        r[5] = statusRemap[r[5]];
      }
    }

    console.log(`✓ Total Blinkit rows scanned: ${totalBlinkitRows.toLocaleString()}`);
    console.log(`✓ Blinkit rows marked as 'Open Po' (Expiry > ${cutoffYmd}): ${convertedOpenRows.toLocaleString()}`);
    console.log(`✓ Unique Blinkit POs marked Open: ${convertedPoIds.size.toLocaleString()}`);
    console.log(`✓ Non-Open Blinkit rows normalized into 3 standard closed statuses:`);
    console.log(`    - 'Po Fully Serviced' -> 'Fully Supplied Po': ${normalizedSuppliedRows.toLocaleString()} rows`);
    console.log(`    - 'Po Partially Serviced' -> 'Partially Supplied Po': ${normalizedPartialRows.toLocaleString()} rows`);
    console.log(`    - 'Zero Fill Po' -> 'Zero Supply Po' (Expired): ${normalizedZeroRows.toLocaleString()} rows`);
    console.log(`✓ Total Open PO Value: ₹${totalPoVal.toFixed(2)} Lakhs`);
    console.log(`✓ Total Open GRN Value: ₹${totalGrnVal.toFixed(2)} Lakhs`);
    console.log(`✓ Total Open Gap Value: ₹${(totalPoVal - totalGrnVal).toFixed(2)} Lakhs`);
    console.log(`✓ Active statuses in dashboard: [${data.dims.status.map(s => "'" + s + "'").join(", ")}]`);

    if (sampleConverted.length > 0) {
      console.log("\nSample Open PO line items:");
      console.table(sampleConverted);
    }

    // Save updated data.json and data.js
    const updatedJsonStr = JSON.stringify(data);
    fs.writeFileSync(jsonPath, updatedJsonStr, "utf8");
    fs.writeFileSync(jsPath, "window.TRADE_FR=" + updatedJsonStr + ";", "utf8");

    // Also mirror to download and downloads folders
    const mirrors = [
      path.join(process.cwd(), "download"),
      path.join(process.cwd(), "downloads"),
    ];
    for (const dir of mirrors) {
      if (fs.existsSync(dir)) {
        try {
          fs.writeFileSync(path.join(dir, "data.json"), updatedJsonStr, "utf8");
          fs.writeFileSync(path.join(dir, "data.js"), "window.TRADE_FR=" + updatedJsonStr + ";", "utf8");
        } catch {}
      }
    }

    console.log(`✓ Saved updated data.json and data.js successfully.`);

    // Optional sync to Supabase storage if env vars exist
    try {
      let sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      let sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!sbUrl && fs.existsSync(".env.local")) {
        const envContent = fs.readFileSync(".env.local", "utf8");
        for (const line of envContent.split("\n")) {
          const trimmed = line.trim();
          if (trimmed.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) sbUrl = trimmed.split("=")[1]?.trim();
          if (trimmed.startsWith("SUPABASE_SERVICE_ROLE_KEY=")) sbKey = trimmed.split("=")[1]?.trim();
        }
      }
      if (sbUrl && sbKey) {
        const { createClient } = await import("@supabase/supabase-js");
        const sb = createClient(sbUrl, sbKey);
        const { error: sbErr } = await sb.storage
          .from("datasets")
          .upload("active_dataset.json", Buffer.from(updatedJsonStr, "utf8"), {
            contentType: "application/json",
            upsert: true,
          });
        if (sbErr) {
          console.log(`(Note: Supabase storage upload: ${sbErr.message})`);
        } else {
          console.log(`✓ Synced active_dataset.json to Supabase storage successfully.`);
        }
      }
    } catch (e) {
      // ignore
    }
    console.log("");
  }
} else {
  console.log(`[1/2] ${jsonPath} not found, skipping local dataset update.`);
}

// --- B. Optional: Process Raw Excel Workbook if specified ---
if (excelFile && fs.existsSync(excelFile)) {
  console.log(`[2/2] Processing Excel workbook at ${excelFile}...`);
  const wb = XLSX.readFile(excelFile, { cellDates: false });
  let targetSheetName = wb.SheetNames.find((n) =>
    ["raw data", "raw", "data"].includes(n.trim().toLowerCase())
  ) || wb.SheetNames[0];

  const sheet = wb.Sheets[targetSheetName];
  if (sheet) {
    const records = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
    let excelUpdatedCount = 0;

    for (const row of records) {
      const trade = String(row["Trade"] || row["trade"] || "").toLowerCase();
      if (!trade.includes("blinkit")) continue;

      let exp = row["Po Expiry Date"] || row["PO Expiry Date"] || row["Expiry Date"] || row["Expiry"];
      let expYmd = 0;
      if (typeof exp === "number" && exp > 20000 && exp < 70000) {
        const dt = new Date(Math.round((Math.floor(exp) - 25569) * 86400 * 1000));
        expYmd = dt.getUTCFullYear() * 10000 + (dt.getUTCMonth() + 1) * 100 + dt.getUTCDate();
      } else if (typeof exp === "string") {
        const m = exp.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
        if (m) expYmd = +m[1] * 10000 + +m[2] * 100 + +m[3];
      }

      if (expYmd > cutoffYmd) {
        if ("PO Status" in row) row["PO Status"] = "Open Po";
        else if ("Po Status" in row) row["Po Status"] = "Open Po";
        else if ("Status" in row) row["Status"] = "Open Po";
        else row["PO Status"] = "Open Po";
        excelUpdatedCount++;
      }
    }

    const outPath = excelFile.replace(/\.xlsx$/i, "_with_open_po.xlsx");
    const newWs = XLSX.utils.json_to_sheet(records);
    wb.Sheets[targetSheetName] = newWs;
    XLSX.writeFile(wb, outPath);
    console.log(`✓ Updated ${excelUpdatedCount} rows in Excel and saved to: ${outPath}`);
  }
} else {
  console.log("[2/2] No external Excel file specified. (Use --file <path> to process raw Excel)");
}

console.log("\n==================================================================");
console.log("   UPDATE COMPLETE!");
console.log("==================================================================");
