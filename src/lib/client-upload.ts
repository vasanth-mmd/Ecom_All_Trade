"use client";

/* Parses an .xlsx/.xls/.csv file in the browser, and posts the file and extracted
   records via FormData to /api/upload. The file is saved directly into the server's
   download folder and loaded into the database. Requires the admin passcode. */
export async function uploadDataFile(file: File, adminCode: string) {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: false });
  const sheet = wb.Sheets["Raw Data"] || wb.Sheets[wb.SheetNames[0]];
  const recs = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true }) as any[];
  if (!recs.length) throw new Error("No data rows found in the file");

  const formData = new FormData();
  formData.append("file", file, file.name);
  formData.append("records", JSON.stringify(recs));

  const r = await fetch("/api/upload", {
    method: "POST",
    headers: {
      "x-admin-code": adminCode,
    },
    body: formData,
  });
  const d = await r.json().catch(() => ({ error: `Server returned an unexpected response (HTTP ${r.status})` }));
  if (!r.ok || !d.ok) {
    const err = new Error(d.error || "Upload failed") as Error & { status?: number };
    err.status = r.status;
    throw err;
  }
  return d as { ok: true; message: string; meta: unknown; storedFile?: string };
}

