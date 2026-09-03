import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const fileType = searchParams.get("file");

  let fileName = "";
  let downloadName = "";

  if (fileType === "depo") {
    fileName = "Depo-Mapping.xlsx";
    downloadName = "Depo-Mapping_Reference.xlsx";
  } else if (fileType === "sku") {
    fileName = "MMD_SKU.xlsx";
    downloadName = "MMD_SKU_Master_Reference.xlsx";
  } else {
    return NextResponse.json({ error: "Invalid file type. Use ?file=depo or ?file=sku" }, { status: 400 });
  }

  const filePath = path.join(process.cwd(), fileName);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: `File ${fileName} not found on server` }, { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);

  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${downloadName}"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
