"use client";

import * as XLSX from "xlsx";
import { buildFromRecords, findRawDataSheet, Dataset } from "@/lib/dataset-core";

export type UploadProgressCb = (status: string, percent: number) => void;

/* Resilient client-side uploader:
   1. Reads and parses the Excel file inside the browser memory using XLSX.
   2. Accurately finds the "Raw Data" sheet (or best match).
   3. Fast-compiles the 160k+ records into the compact matrix dataset format (~150ms in browser).
   4. Posts the compiled dataset directly to /api/upload.
   5. Updates local data.json, data.js, and downloads atomically with 0 data loss. */
export async function uploadDataFile(
  file: File,
  adminCode: string,
  onProgress?: UploadProgressCb
) {
  onProgress?.("Reading Excel file...", 10);

  const arrayBuffer = await file.arrayBuffer();
  onProgress?.("Parsing sheet records...", 25);

  const wb = XLSX.read(arrayBuffer, { type: "array", cellDates: false });
  const sheet = findRawDataSheet(wb, XLSX);
  if (!sheet) {
    throw new Error("Could not find any data sheets in this Excel workbook.");
  }

  const records = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true }) as any[];
  if (!records || !records.length) {
    throw new Error("The Raw Data sheet appears to be empty.");
  }

  // Validate columns
  const keys0 = Object.keys(records[0] || {}).map((k) =>
    k.trim().toLowerCase().replace(/[\s_-]+/g, "")
  );
  const hasPo = keys0.some((k) => k.includes("ponumber") || k === "po");
  const hasTrade = keys0.some((k) => k.includes("trade"));
  if (!hasPo || !hasTrade) {
    throw new Error(
      "Columns not recognized. Expected Trade FR format (PO Number, Trade, City, PO Qty, Po Value, GRN Qty, GRN Value...)"
    );
  }

  onProgress?.(`Compiling ${records.length.toLocaleString()} rows into dataset...`, 60);

  // Fast client-side compile into matrix dataset
  const dataset: Dataset = buildFromRecords(records);

  onProgress?.("Uploading dataset to server...", 80);

  // Send compiled dataset directly to server
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-code": adminCode,
    },
    body: JSON.stringify({
      action: "dataset",
      dataset,
      fileName: file.name,
      records: records.length <= 25000 ? records : undefined,
    }),
  });

  const resData = await res.json().catch(() => ({
    error: `Server returned an unexpected response (HTTP ${res.status})`,
  }));

  if (!res.ok || !resData.ok) {
    throw new Error(resData.error || "Uploading dataset failed.");
  }

  onProgress?.("Completed successfully!", 100);

  return resData as { ok: true; message: string; meta: any; storedFile?: string };
}
