"use client";

import * as XLSX from "xlsx";

/* Uploads a .xlsx / .xls / .csv file to /api/upload.
   Strategy (avoids Vercel's 4.5 MB serverless body limit):
   1. Parse the spreadsheet in the browser with SheetJS → JSON rows.
   2. Gzip-compress the JSON string with the native CompressionStream API.
   3. POST the compressed bytes with Content-Encoding: gzip.
   The server already has a gzip-aware JSON branch — no server changes needed. */

async function gzipBytes(data: Uint8Array): Promise<ArrayBuffer> {
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  // Use ArrayBuffer to satisfy TypeScript strict typing
  await writer.write(data.buffer as ArrayBuffer);
  await writer.close();

  const chunks: ArrayBuffer[] = [];
  const reader = cs.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value.buffer as ArrayBuffer);
  }

  // Concatenate all chunks into a single ArrayBuffer
  const totalLength = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const c of chunks) {
    out.set(new Uint8Array(c), offset);
    offset += c.byteLength;
  }
  return out.buffer as ArrayBuffer;
}

export async function uploadDataFile(file: File, adminCode: string) {
  /* ── Step 1: Parse the spreadsheet client-side ── */
  const arrayBuffer = await file.arrayBuffer();
  const wb = XLSX.read(arrayBuffer, { type: "array", cellDates: false });

  // Find the "Raw Data" sheet, or fall back to the first sheet
  const rawSheetName =
    wb.SheetNames.find((n) => n.toLowerCase().replace(/\s/g, "") === "rawdata") ??
    wb.SheetNames[0];
  const ws = wb.Sheets[rawSheetName];
  const records = XLSX.utils.sheet_to_json(ws, { defval: "", raw: true }) as object[];

  if (!records.length) {
    throw new Error("The Raw Data sheet appears to be empty.");
  }

  /* ── Step 2: JSON → gzip ── */
  const jsonBytes = new TextEncoder().encode(JSON.stringify(records));
  const compressed = await gzipBytes(jsonBytes);

  /* ── Step 3: POST compressed JSON ── */
  const r = await fetch("/api/upload", {
    method: "POST",
    headers: {
      "x-admin-code": adminCode,
      "content-type": "application/json",
      "content-encoding": "gzip",
      // Pass the original filename so the server can label the saved backup file
      "x-original-filename": encodeURIComponent(file.name),
    },
    body: compressed,
  });

  const d = await r
    .json()
    .catch(() => ({ error: `Server returned an unexpected response (HTTP ${r.status})` }));

  if (!r.ok || !d.ok) {
    const err = new Error(d.error || "Upload failed") as Error & { status?: number };
    err.status = r.status;
    throw err;
  }

  return d as { ok: true; message: string; meta: unknown; storedFile?: string };
}
