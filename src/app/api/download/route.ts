import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getDownloadDir(): string {
  const primary = path.join(process.cwd(), "download");
  if (fs.existsSync(primary)) return primary;
  const secondary = path.join(process.cwd(), "downloads");
  if (fs.existsSync(secondary)) return secondary;
  fs.mkdirSync(primary, { recursive: true });
  return primary;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const requestedFile = searchParams.get("file");
  const downloadDir = getDownloadDir();

  // If no file parameter is specified, list files in the download folder
  if (!requestedFile) {
    try {
      if (!fs.existsSync(downloadDir)) {
        return NextResponse.json({ files: [] });
      }

      const entries = fs.readdirSync(downloadDir, { withFileTypes: true });
      const files = entries
        .filter((e) => e.isFile() && !e.name.startsWith(".") && e.name.toLowerCase() !== "readme.md")
        .map((e) => {
          const filePath = path.join(downloadDir, e.name);
          const stats = fs.statSync(filePath);
          return {
            name: e.name,
            size: stats.size,
            sizeFormatted: formatBytes(stats.size),
            modified: stats.mtime.toISOString(),
            url: `/api/download?file=${encodeURIComponent(e.name)}`,
          };
        })
        .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());

      return NextResponse.json({ files });
    } catch (e: any) {
      return NextResponse.json({ error: "Failed to list files: " + e.message }, { status: 500 });
    }
  }

  // Security: prevent directory traversal
  const safeName = path.basename(requestedFile);
  const filePath = path.join(downloadDir, safeName);

  if (!fs.existsSync(filePath)) {
    // Check fallback directories
    const fallbackDir = path.join(process.cwd(), "downloads");
    const fallbackPath = path.join(fallbackDir, safeName);
    if (fs.existsSync(fallbackPath)) {
      const fileBuffer = fs.readFileSync(fallbackPath);
      return sendFile(safeName, fileBuffer);
    }
    return NextResponse.json({ error: `File "${safeName}" not found in download folder` }, { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);
  return sendFile(safeName, fileBuffer);
}

function sendFile(safeName: string, fileBuffer: Buffer) {
  const ext = path.extname(safeName).toLowerCase();
  let contentType = "application/octet-stream";
  if (ext === ".xlsx") {
    contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  } else if (ext === ".xls") {
    contentType = "application/vnd.ms-excel";
  } else if (ext === ".csv") {
    contentType = "text/csv; charset=utf-8";
  } else if (ext === ".json") {
    contentType = "application/json; charset=utf-8";
  } else if (ext === ".js") {
    contentType = "text/javascript; charset=utf-8";
  }

  return new NextResponse(new Uint8Array(fileBuffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
