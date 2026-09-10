import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildFromRecords, findRawDataSheet, saveDataset } from "@/lib/dataset";
import zlib from "zlib";
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const maxDuration = 60;

function saveToDownloadFolders(fileName: string, buffer: Buffer) {
  const targetDirs = [
    path.join(process.cwd(), "download"),
    path.join(process.cwd(), "downloads"),
    path.resolve(process.cwd(), "..", "download"),
    path.resolve(process.cwd(), "..", "downloads"),
  ];

  const ext = path.extname(fileName) || ".xlsx";
  const base = path.basename(fileName, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const timestampedName = `${base}_${stamp}${ext}`;

  for (const dir of targetDirs) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(path.join(dir, fileName), buffer);
      fs.writeFileSync(path.join(dir, timestampedName), buffer);
    } catch (e) {
      console.warn(`[upload] Warning: could not write to ${dir}:`, e);
    }
  }

  return { fileName, timestampedName };
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Admin lock: uploads require the passcode from .env
  const pass = process.env.ADMIN_PASSCODE;
  if (!pass)
    return NextResponse.json({ error: "ADMIN_PASSCODE is not set in .env — set it and restart the server." }, { status: 500 });
  if (req.headers.get("x-admin-code") !== pass)
    return NextResponse.json({ error: "Invalid admin passcode" }, { status: 403 });

  try {
    let recs: any[] = [];
    let savedFileName = "";
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const recordsJson = formData.get("records") as string | null;

      if (!file && !recordsJson) {
        return NextResponse.json({ error: "No file or data received" }, { status: 400 });
      }

      let fileBuffer: Buffer | null = null;
      if (file) {
        fileBuffer = Buffer.from(await file.arrayBuffer());
        savedFileName = path.basename(file.name || "trade_fr_raw_data.xlsx");
        saveToDownloadFolders(savedFileName, fileBuffer);
      }

      if (recordsJson) {
        recs = JSON.parse(recordsJson);
      } else if (fileBuffer) {
        const wb = XLSX.read(fileBuffer, { type: "buffer", cellDates: false });
        const sheet = findRawDataSheet(wb) || wb.Sheets[wb.SheetNames[0]];
        recs = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true }) as any[];
      }
    } else {
      // Fallback for raw compressed/uncompressed JSON
      const raw = Buffer.from(await req.arrayBuffer());
      if (!raw.length) return NextResponse.json({ error: "No data received" }, { status: 400 });
      const jsonBuf = req.headers.get("content-encoding") === "gzip" ? zlib.gunzipSync(raw) : raw;
      recs = JSON.parse(jsonBuf.toString("utf8"));

      // Also generate and store an .xlsx in the download folder
      // Use the original filename if provided by the client
      const rawName = req.headers.get("x-original-filename");
      const originalName = rawName ? decodeURIComponent(rawName) : "";
      savedFileName = originalName || "trade_fr_raw_data.xlsx";
      const ws = XLSX.utils.json_to_sheet(recs);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Raw Data");
      const excelBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
      saveToDownloadFolders(savedFileName, excelBuf);
    }

    if (!Array.isArray(recs) || !recs.length)
      return NextResponse.json({ error: "The Raw Data sheet is empty" }, { status: 400 });

    const keys0 = Object.keys(recs[0] || {}).map((k) => k.trim().toLowerCase());
    const hasPo = keys0.some((k) => k.includes("po number") || k === "po");
    const hasTrade = keys0.some((k) => k.includes("trade"));
    if (!hasPo || !hasTrade)
      return NextResponse.json(
        { error: "Columns not recognised — expected the Trade FR Raw Data format (PO Number, Trade, City, PO Qty, Po Value, GRN Qty, GRN Value, ...)" },
        { status: 400 }
      );

    const data = buildFromRecords(recs);
    await saveDataset(data, "upload");

    return NextResponse.json({
      ok: true,
      meta: data.meta,
      storedFile: savedFileName,
      message:
        `Stored in database & download folder (${savedFileName}): ${data.meta.rows.toLocaleString("en-IN")} PO lines, ` +
        `${data.meta.po_count.toLocaleString("en-IN")} POs, ${data.meta.date_min} → ${data.meta.date_max}`,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Could not process the file: " + e.message }, { status: 500 });
  }
}

