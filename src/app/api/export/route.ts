import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDataset } from "@/lib/dataset";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fmtYMD = (n: number) =>
  n ? `${String(n).slice(0, 4)}-${String(n).slice(4, 6)}-${String(n).slice(6, 8)}` : "";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const d = await getDataset();
  const records = d.rows.map((r) => ({
    "PO ID": r[12],
    Month: d.dims.month[r[0]],
    Trade: d.dims.trade[r[1]],
    Region: d.dims.region[r[2]],
    City: d.dims.city[r[3]],
    Category: d.dims.category[r[4]],
    "SKU Name": d.dims.sku[r[6]],
    "PO Qty": r[7],
    "Po Value": r[8],
    "GRN Qty": r[9],
    "GRN Value": r[10],
    "Po Date": fmtYMD(r[11]),
    "PO Status": d.dims.status[r[5]],
  }));

  const ws = XLSX.utils.json_to_sheet(records);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Raw Data");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="trade-fr-raw-data_${d.meta.date_min}_to_${d.meta.date_max}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
