import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getDataset } from "@/lib/dataset";
import { buildFrTables, lastWeekRangeYmdIST, ymdToLabel } from "@/lib/fr-report";
import { renderReportEmail } from "@/lib/report-email";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  // Vercel automatically sends "Authorization: Bearer <CRON_SECRET>" for
  // Cron Job invocations when a CRON_SECRET env var is set on the project.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "RESEND_API_KEY is not set" }, { status: 500 });

  const to = (process.env.REPORT_RECIPIENTS || "vasanth@milkymist.com")
    .split(",").map((s) => s.trim()).filter(Boolean);

  try {
    const data = await getDataset();
    const { fromYmd, toYmd } = lastWeekRangeYmdIST();
    const weekRows = data.rows.filter((r) => r[11] >= fromYmd && r[11] <= toYmd);
    const rangeLabel = `${ymdToLabel(fromYmd)} → ${ymdToLabel(toYmd)}`;
    const tables = buildFrTables(data, weekRows);
    const html = renderReportEmail(tables, rangeLabel, weekRows.length > 0, "Weekly Report");

    const resend = new Resend(apiKey);
    const { data: sent, error } = await resend.emails.send({
      from: "Trade FR Reports <onboarding@resend.dev>",
      to,
      subject: `Trade FR Weekly Report — ${rangeLabel}`,
      html,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, id: sent?.id, recipients: to, range: rangeLabel });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
