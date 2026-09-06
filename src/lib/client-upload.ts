"use client";

/* Posts the .xlsx/.xls/.csv file via FormData to /api/upload.
   The file is saved directly into the server's download folder and loaded into
   the database and local storage. Requires the admin passcode. */
export async function uploadDataFile(file: File, adminCode: string) {
  const formData = new FormData();
  formData.append("file", file, file.name);

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


