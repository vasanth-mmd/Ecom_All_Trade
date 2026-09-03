import type { ReportTable } from "@/lib/fr-report";

const L = (n: number, d = 1) =>
  n.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: 0 });
const L2 = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

// same thresholds as frPill() on the dashboard: green >=90, amber >=75, red <75
function frColors(fr: number) {
  if (fr >= 90) return { bg: "#d1fae5", fg: "#047857" };
  if (fr >= 75) return { bg: "#fef3c7", fg: "#b45309" };
  return { bg: "#ffe4e6", fg: "#be123dc6" };
}

function frPillHtml(fr: number) {
  const c = frColors(fr);
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;background:${c.bg};color:${c.fg};">${L(fr, 0)}%</span>`;
}

// Outlook's Word rendering engine inserts implicit paragraph spacing inside
// table cells unless line-height is pinned "exactly" — without this, every
// row renders with large, inconsistent vertical gaps.
const CELL = "padding:6px 10px;font-size:12px;line-height:16px;mso-line-height-rule:exactly;";
const HEAD_CELL = "padding:6px 10px;font-size:11px;line-height:14px;mso-line-height-rule:exactly;";

function tableHtml(t: ReportTable): string {
  const isSku = t.key === "sku";
  const isDepo = t.key === "depo";
  const head = isSku
    ? `<th align="left" style="${HEAD_CELL}">MMD ITEM CODE</th><th align="left" style="${HEAD_CELL}">MMD SKU NAME</th>`
    : isDepo
    ? `<th align="left" style="${HEAD_CELL}">City</th><th align="left" style="${HEAD_CELL}">Depo</th><th align="left" style="${HEAD_CELL}">State</th>`
    : `<th align="left" style="${HEAD_CELL}">${t.nameCol}</th>`;
  const totalCells = isSku || isDepo ? `<td style="${CELL}"></td><td style="${CELL}"></td>` : `<td style="${CELL}"></td>`;
  const rows = t.rows
    .map((r, i) => {
      const nameCells = isSku
        ? `<td style="${CELL}color:#1e293b;font-weight:500;">${r.mmdCode || "—"}</td><td style="${CELL}color:#475569;">${r.mmdName}</td>`
        : isDepo
        ? `<td style="${CELL}color:#1e293b;font-weight:500;">${r.name}</td><td style="${CELL}color:#475569;">${r.mmdCode}</td><td style="${CELL}color:#475569;">${r.mmdName}</td>`
        : `<td style="${CELL}color:#1e293b;font-weight:500;">${r.name}</td>`;
      const bg = i % 2 ? "#f8fafc" : "#ffffff";
      return `<tr style="background:${bg};border-top:1px solid #e2e8f0;">
        ${nameCells}
        <td align="right" style="${CELL}">${L(r.poCount, 0)}</td>
        <td align="right" style="${CELL}">${L2(r.poVal)}</td>
        <td align="right" style="${CELL}">${L2(r.grnVal)}</td>
        <td align="right" style="${CELL}color:#e11d48;font-weight:600;">${L2(r.gap)}</td>
        <td align="right" style="${CELL}">${frPillHtml(r.fr)}</td>
      </tr>`;
    })
    .join("");

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:12px;margin-bottom:28px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
    <tr><td colspan="7" style="background:#f1f5f9;padding:10px 12px;font-weight:700;font-size:13px;line-height:16px;mso-line-height-rule:exactly;color:#0f172a;border-bottom:1px solid #e2e8f0;">${t.title}</td></tr>
    <tr style="background:#f8fafc;color:#475569;text-align:left;">
      ${head}
      <th align="right" style="${HEAD_CELL}">PO COUNT</th>
      <th align="right" style="${HEAD_CELL}">PO ₹L</th>
      <th align="right" style="${HEAD_CELL}">GRN ₹L</th>
      <th align="right" style="${HEAD_CELL}">GAP ₹L</th>
      <th align="right" style="${HEAD_CELL}">FR %</th>
    </tr>
    <tr style="background:#eef2ff;font-weight:700;color:#0f172a;border-top:2px solid #c7d2fe;">
      <td style="${CELL}">TOTAL</td>
      ${totalCells}
      <td align="right" style="${CELL}">${L(t.total.poCount, 0)}</td>
      <td align="right" style="${CELL}">${L2(t.total.poVal)}</td>
      <td align="right" style="${CELL}">${L2(t.total.grnVal)}</td>
      <td align="right" style="${CELL}color:#e11d48;">${L2(t.total.gap)}</td>
      <td align="right" style="${CELL}">${frPillHtml(t.total.fr)}</td>
    </tr>
    ${rows}
  </table>`;
}

export function renderReportEmail(
  tables: ReportTable[], reportDate: string, hasData: boolean, title = "Daily Report"
): string {
  const generated = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
  const body = hasData
    ? tables.map(tableHtml).join("")
    : `<div style="padding:20px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;color:#9a3412;font-size:13px;">
        No PO/GRN activity recorded for ${reportDate}.
      </div>`;
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
    <div style="max-width:760px;margin:0 auto;">
      <div style="margin-bottom:18px;">
        <div style="font-size:20px;font-weight:800;color:#0f172a;">Milky Mist · Trade FR — ${title}</div>
        <div style="font-size:12px;color:#64748b;margin-top:2px;">
          Report for ${reportDate} · Generated ${generated} IST
        </div>
      </div>
      ${body}
      <div style="font-size:11px;color:#94a3b8;margin-top:8px;">
        Colors: <span style="color:#047857;font-weight:600;">green ≥ 90%</span> ·
        <span style="color:#b45309;font-weight:600;">yellow 75–90%</span> ·
        <span style="color:#be123c;font-weight:600;">red &lt; 75%</span>. Values in ₹ Lakh.
      </div>
    </div>
  </body>
</html>`;
}
