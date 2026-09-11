import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildFromRecords, findRawDataSheet, saveDataset, Dataset } from "@/lib/dataset";
import { syncRecordsToSupabase, clearSupabaseTradeOrders } from "@/lib/supabase-sync";
import zlib from "zlib";
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function saveToDownloadFolders(fileName: string, buffer: Buffer) {
  const targetDirs = [
    path.join(process.cwd(), "download"),
    path.join(process.cwd(), "downloads"),
    path.resolve(process.cwd(), "..", "download"),
    path.resolve(process.cwd(), "..", "downloads"),
  ];

  for (const dir of targetDirs) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      } else {
        // Remove older uploaded Excel/CSV files so ONLY the latest uploaded file exists
        const existingFiles = fs.readdirSync(dir);
        for (const f of existingFiles) {
          if (f.endsWith(".xlsx") || f.endsWith(".xls") || f.endsWith(".csv")) {
            try {
              fs.unlinkSync(path.join(dir, f));
            } catch {}
          }
        }
      }
      fs.writeFileSync(path.join(dir, fileName), buffer);
    } catch (e) {
      console.warn(`[upload] Warning: could not write to ${dir}:`, e);
    }
  }

  return { fileName };
}

// In-memory staging for multi-chunk uploads
const chunkSessions = new Map<string, { records: any[]; fileName: string; totalChunks: number; createdAt: number }>();

// Clean up stale sessions older than 10 minutes
function cleanOldSessions() {
  const now = Date.now();
  for (const [id, s] of chunkSessions.entries()) {
    if (now - s.createdAt > 10 * 60 * 1000) {
      chunkSessions.delete(id);
    }
  }
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

  cleanOldSessions();

  try {
    const contentType = req.headers.get("content-type") || "";

    // ── 1. CHUNKED JSON UPLOAD (Guarantees no HTTP 413 on Vercel for any file size) ──
    if (contentType.includes("application/json")) {
      const body = await req.json();

      // Action: Init (wipes old database records so only new file exists)
      if (body.action === "init") {
        const { sessionId, fileName, totalChunks } = body;
        if (!sessionId) return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });

        // Wipe previous database records
        await clearSupabaseTradeOrders();

        chunkSessions.set(sessionId, {
          records: [],
          fileName: fileName || "trade_fr_raw_data.xlsx",
          totalChunks: totalChunks || 1,
          createdAt: Date.now(),
        });

        return NextResponse.json({ ok: true, message: "Initialized session and cleared previous dataset." });
      }

      // Action: Chunk (receives records batch and inserts into Supabase)
      if (body.action === "chunk") {
        const { sessionId, chunkIndex, totalChunks, records, fileName } = body;
        if (!sessionId) return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });

        if (!chunkSessions.has(sessionId)) {
          // If init wasn't explicitly called, clear old records on first chunk
          if (chunkIndex === 0) {
            await clearSupabaseTradeOrders();
          }
          chunkSessions.set(sessionId, {
            records: [],
            fileName: fileName || "trade_fr_raw_data.xlsx",
            totalChunks,
            createdAt: Date.now(),
          });
        }

        const sess = chunkSessions.get(sessionId)!;
        if (Array.isArray(records) && records.length) {
          for (let i = 0; i < records.length; i++) {
            sess.records.push(records[i]);
          }
          // Sync this batch into Supabase trade_orders
          try {
            await syncRecordsToSupabase(records);
          } catch (err) {
            console.warn("[upload-chunk] Supabase sync notice:", err);
          }
        }

        return NextResponse.json({
          ok: true,
          chunkIndex,
          totalChunks,
          received: sess.records.length,
        });
      }

      // Action: Finalize (compiles new dataset and replaces active snapshot in Supabase storage)
      if (body.action === "finalize") {
        const { sessionId } = body;
        const sess = chunkSessions.get(sessionId);
        if (!sess || !sess.records.length) {
          return NextResponse.json({ error: "No records found in upload session" }, { status: 400 });
        }

        const allRecs = sess.records;
        const savedFileName = sess.fileName;
        chunkSessions.delete(sessionId);

        // Build compact matrix dataset from only the new file & replace active dataset
        const data = buildFromRecords(allRecs);
        await saveDataset(data, "upload");

        // Save server download backup
        try {
          const ws = XLSX.utils.json_to_sheet(allRecs.slice(0, 50000));
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "Raw Data");
          const excelBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
          saveToDownloadFolders(savedFileName, excelBuf);
        } catch (e) {
          console.warn("[upload] Download backup notice:", e);
        }

        return NextResponse.json({
          ok: true,
          meta: data.meta,
          storedFile: savedFileName,
          message:
            `Successfully stored ${data.meta.rows.toLocaleString("en-IN")} fresh records in Supabase and updated dashboard.`,
        });
      }

      // Pre-processed dataset direct push
      if (body.dataset && body.records) {
        await clearSupabaseTradeOrders();
        const data: Dataset = body.dataset;
        await saveDataset(data, "upload");
        try {
          await syncRecordsToSupabase(body.records);
        } catch (e) {
          console.warn("[upload] Supabase sync notice:", e);
        }
        return NextResponse.json({
          ok: true,
          meta: data.meta,
          message: `Replaced dataset with ${data.meta.rows.toLocaleString("en-IN")} new rows in Supabase.`,
        });
      }
    }

    // ── 2. STANDARD MULTIPART / FORM-DATA UPLOAD (For smaller files) ──
    let recs: any[] = [];
    let savedFileName = "trade_fr_raw_data.xlsx";

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
      const raw = Buffer.from(await req.arrayBuffer());
      if (!raw.length) return NextResponse.json({ error: "No data received" }, { status: 400 });
      const jsonBuf = req.headers.get("content-encoding") === "gzip" ? zlib.gunzipSync(raw) : raw;
      recs = JSON.parse(jsonBuf.toString("utf8"));
    }

    if (!Array.isArray(recs) || !recs.length)
      return NextResponse.json({ error: "The Raw Data sheet is empty" }, { status: 400 });

    const keys0 = Object.keys(recs[0] || {}).map((k) => k.trim().toLowerCase());
    const hasPo = keys0.some((k) => k.includes("po number") || k === "po");
    const hasTrade = keys0.some((k) => k.includes("trade"));
    if (!hasPo || !hasTrade)
      return NextResponse.json(
        { error: "Columns not recognised — expected Trade FR Raw Data columns (PO Number, Trade, City, PO Qty, Po Value, GRN Qty, GRN Value...)" },
        { status: 400 }
      );

    // Clear old data from Supabase before saving new file
    await clearSupabaseTradeOrders();

    const data = buildFromRecords(recs);
    await saveDataset(data, "upload");

    try {
      await syncRecordsToSupabase(recs);
    } catch (dbErr) {
      console.warn("[upload] Supabase sync notice:", dbErr);
    }

    return NextResponse.json({
      ok: true,
      meta: data.meta,
      storedFile: savedFileName,
      message:
        `Replaced database with ${data.meta.rows.toLocaleString("en-IN")} fresh PO lines from ${savedFileName}.`,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Could not process the file: " + e.message }, { status: 500 });
  }
}
