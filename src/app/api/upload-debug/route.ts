import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const maxDuration = 60;

/* Upload the SAME Excel here to see how dates & months are being read.
   Returns the distinct months, the max parsed date, and sample raw "Po Date"
   cells for the latest rows — no database write. Admin passcode required. */

function toYMD(v: any): number {
  if (v instanceof Date && !isNaN(+v))
    return v.getFullYear() * 10000 + (v.getMonth() + 1) * 100 + v.getDate();
  if (typeof v === "number" && v > 20000 && v < 60000) {
    const dt = new Date(Math.round((v - 25569) * 86400 * 1000));
    return dt.getUTCFullYear() * 10000 + (dt.getUTCMonth() + 1) * 100 + dt.getUTCDate();
  }
  const s = String(v ?? "").trim();
  if (!s) return 0;
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return +m[1] * 10000 + +m[2] * 100 + +m[3];
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) return +m[3] * 10000 + +m[2] * 100 + +m[1];
  const d = new Date(s);
  return isNaN(+d) ? 0 : d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (req.headers.get("x-admin-code") !== process.env.ADMIN_PASSCODE)
    return NextResponse.json({ error: "Invalid admin passcode" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer", cellDates: true });
  const sheet = wb.Sheets["Raw Data"] || wb.Sheets[wb.SheetNames[0]];
  const recs = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as any[];

  const monthCounts: Record<string, number> = {};
  let maxYmd = 0;
  const samplesLatest: any[] = [];
  let zeroDate = 0;
  const byYmd: Record<number, number> = {};

  for (const o of recs) {
    const mo = String(o["Month"] ?? "");
    monthCounts[mo] = (monthCounts[mo] || 0) + 1;
    const y = toYMD(o["Po Date"]);
    if (y === 0) zeroDate++;
    else { byYmd[y] = (byYmd[y] || 0) + 1; if (y > maxYmd) maxYmd = y; }
  }
  // grab a few raw samples from the newest date-region rows
  for (const o of recs) {
    if (toYMD(o["Po Date"]) === maxYmd && samplesLatest.length < 5) {
      const raw = o["Po Date"];
      samplesLatest.push({
        raw_value: raw instanceof Date ? raw.toISOString() : String(raw),
        raw_type: raw instanceof Date ? "Date" : typeof raw,
        Month: o["Month"], parsed: toYMD(raw),
      });
    }
  }
  const top = Object.entries(byYmd).sort((a, b) => +b[0] - +a[0]).slice(0, 6)
    .map(([ymd, n]) => ({ date: String(ymd), rows: n }));

  return NextResponse.json({
    totalRows: recs.length,
    headers: Object.keys(recs[0] || {}),
    monthCounts,
    maxParsedDate: String(maxYmd),
    rowsWithNoDate: zeroDate,
    latestSixDates: top,
    sampleLatestRows: samplesLatest,
  });
}
