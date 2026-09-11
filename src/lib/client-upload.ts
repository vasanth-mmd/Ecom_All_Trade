"use client";

import * as XLSX from "xlsx";

function findSheet(wb: XLSX.WorkBook) {
  if (!wb || !wb.SheetNames || !wb.SheetNames.length) return null;

  const rawTarget = wb.SheetNames.find((name: string) => {
    const clean = name.trim().toLowerCase().replace(/[\s_-]+/g, "");
    return clean === "rawdata" || clean === "raw" || clean === "data";
  });
  if (rawTarget && wb.Sheets[rawTarget]) return wb.Sheets[rawTarget];

  if (wb.Sheets["Raw Data"]) return wb.Sheets["Raw Data"];

  for (const name of wb.SheetNames) {
    const s = wb.Sheets[name];
    if (!s) continue;
    try {
      const preview = XLSX.utils.sheet_to_json(s, { header: 1, range: 0, defval: "" }) as any[][];
      if (preview && preview.length > 0) {
        const row0 = (preview[0] || []).map((c: any) => String(c).trim().toLowerCase());
        if (
          row0.includes("po number") ||
          (row0.includes("trade") && row0.includes("po qty")) ||
          (row0.includes("city") && row0.includes("grn qty"))
        ) {
          return s;
        }
      }
    } catch {
      // ignore
    }
  }

  return wb.Sheets[wb.SheetNames[0]];
}

export type UploadProgressCb = (status: string, percent: number) => void;

/* Resilient client-side uploader with Replace Mode:
   1. Reads and parses the Excel file inside the browser memory.
   2. Cleans out existing database records so ONLY the fresh upload is stored.
   3. Transmits records in safe chunks (1,500 rows per request, ~150KB) so Vercel NEVER returns HTTP 413.
   4. Ingests records into Supabase trade_orders and updates the dashboard dataset seamlessly. */
export async function uploadDataFile(
  file: File,
  adminCode: string,
  onProgress?: UploadProgressCb
) {
  onProgress?.("Reading Excel file...", 5);

  const arrayBuffer = await file.arrayBuffer();
  onProgress?.("Parsing sheet records...", 15);

  const wb = XLSX.read(arrayBuffer, { type: "array", cellDates: false });
  const sheet = findSheet(wb);
  if (!sheet) {
    throw new Error("Could not find any data sheets in this Excel workbook.");
  }

  const records = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true }) as any[];
  if (!records || !records.length) {
    throw new Error("The Raw Data sheet appears to be empty.");
  }

  // Validate columns
  const keys0 = Object.keys(records[0] || {}).map((k) => k.trim().toLowerCase());
  const hasPo = keys0.some((k) => k.includes("po number") || k === "po");
  const hasTrade = keys0.some((k) => k.includes("trade"));
  if (!hasPo || !hasTrade) {
    throw new Error(
      "Columns not recognized. Expected Trade FR format (PO Number, Trade, City, PO Qty, Po Value, GRN Qty, GRN Value...)"
    );
  }

  const sessionId = "sess_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
  const CHUNK_SIZE = 1500;
  const totalChunks = Math.ceil(records.length / CHUNK_SIZE);

  // 1. Initialize session & wipe previous database records
  onProgress?.("Clearing previous dataset from Supabase...", 18);
  const initRes = await fetch("/api/upload", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-code": adminCode,
    },
    body: JSON.stringify({
      action: "init",
      sessionId,
      fileName: file.name,
      totalChunks,
    }),
  });

  if (!initRes.ok) {
    const errJson = await initRes.json().catch(() => null);
    throw new Error(errJson?.error || "Failed to initialize upload session.");
  }

  // 2. Upload chunks of the new file
  onProgress?.(`Uploading ${records.length.toLocaleString()} fresh records to Supabase...`, 20);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, records.length);
    const chunk = records.slice(start, end);

    const percent = Math.round(20 + (i / totalChunks) * 70);
    onProgress?.(`Uploading batch ${i + 1} of ${totalChunks} (${percent}%)...`, percent);

    const r = await fetch("/api/upload", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-code": adminCode,
      },
      body: JSON.stringify({
        action: "chunk",
        sessionId,
        chunkIndex: i,
        totalChunks,
        fileName: file.name,
        records: chunk,
      }),
    });

    if (!r.ok) {
      const errJson = await r.json().catch(() => null);
      throw new Error(errJson?.error || `Upload failed on batch ${i + 1} (HTTP ${r.status})`);
    }
  }

  // 3. Finalize new dataset
  onProgress?.("Finalizing Supabase sync & dashboard update...", 95);

  const finalRes = await fetch("/api/upload", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-code": adminCode,
    },
    body: JSON.stringify({
      action: "finalize",
      sessionId,
    }),
  });

  const finalData = await finalRes.json().catch(() => ({
    error: `Server returned an unexpected response (HTTP ${finalRes.status})`,
  }));

  if (!finalRes.ok || !finalData.ok) {
    throw new Error(finalData.error || "Finalizing upload failed.");
  }

  onProgress?.("Completed successfully!", 100);

  return finalData as { ok: true; message: string; meta: unknown; storedFile?: string };
}
