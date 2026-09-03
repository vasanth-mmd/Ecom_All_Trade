import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDataset } from "@/lib/dataset";
import { buildForecast } from "@/lib/forecast";
import { mmdGroup } from "@/lib/mmd-mapping";
import {
  askAI, availableProviders, defaultProvider, keyFor,
  PROVIDER_LABEL, type ProviderId, type ChatMsg, type AskResult,
} from "@/lib/ai-providers";

export const runtime = "nodejs";
export const maxDuration = 120;

/* Row layout: [month, trade, region, city, category, status, sku,
               poQty, poVal, grnQty, grnVal, dateYYYYMMDD, poId]  (values in ₹ Lakh) */

type Agg = ReturnType<typeof buildAggregates>;
let cache: { stamp: string; agg: Agg; fc: any } | null = null;

async function loadContext() {
  const d = await getDataset();          // Neon first, file fallback
  const stamp = d.meta.generated + ":" + d.meta.rows;
  if (cache && cache.stamp === stamp) return cache;
  const agg = buildAggregates(d);
  let fc: any = null;
  try { fc = buildForecast(d); } catch { fc = null; }
  cache = { stamp, agg, fc };
  return cache;
}

import { lookupDepoByCity } from "@/lib/depo-mapping";

function buildAggregates(d: any) {
  const dims: Record<string, string[]> = d.dims;
  const rows: number[][] = d.rows;
  const mk = (names: string[]) =>
    names.map((n) => ({ name: n, poQty: 0, poVal: 0, grnQty: 0, grnVal: 0, pos: new Set<number>() }));

  // trade SKUs sharing one MMD Item Code collapse into a single bucket
  const skuGroupNames: string[] = [];
  const skuGroupIndexOf = new Map<string, number>();
  const skuGroupIndex = dims.sku.map((name) => {
    const g = mmdGroup(name);
    let gi = skuGroupIndexOf.get(g.key);
    if (gi === undefined) { gi = skuGroupNames.length; skuGroupNames.push(g.name); skuGroupIndexOf.set(g.key, gi); }
    return gi;
  });

  const by = {
    month: mk(dims.month),
    trade: mk(dims.trade),
    region: mk(dims.region),
    city: mk(dims.city),
    category: mk(dims.category),
    status: mk(dims.status),
    sku: mk(skuGroupNames),
  };

  // City x SKU cross map
  const citySkuMap = new Map<string, { city: string; sku: string; poVal: number; grnVal: number; gapVal: number; poQty: number; grnQty: number }>();
  // Depot map
  const depoMap = new Map<string, { depo: string; state: string; poVal: number; grnVal: number; gapVal: number; pos: Set<number> }>();

  let poQty = 0, poVal = 0, grnQty = 0, grnVal = 0;
  let criticalExpiryPoCount = 0, criticalExpiryPoVal = 0;
  let expiredPoCount = 0, expiredPoVal = 0;
  const allPos = new Set<number>();
  const nowYmd = (() => {
    const t = new Date();
    return t.getUTCFullYear() * 10000 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate();
  })();

  for (const r of rows) {
    poQty += r[7]; poVal += r[8]; grnQty += r[9]; grnVal += r[10];
    allPos.add(r[12]);
    const idx = [r[0], r[1], r[2], r[3], r[4], r[5], skuGroupIndex[r[6]]];
    (["month", "trade", "region", "city", "category", "status", "sku"] as const).forEach(
      (k, i) => {
        const b = (by as any)[k][idx[i]];
        b.poQty += r[7]; b.poVal += r[8]; b.grnQty += r[9]; b.grnVal += r[10];
        b.pos.add(r[12]);
      }
    );

    const cityName = dims.city[r[3]] || "Unknown";
    const skuName = skuGroupNames[skuGroupIndex[r[6]]] || "Unknown";
    const cKey = `${cityName}|${skuName}`;
    let cs = citySkuMap.get(cKey);
    if (!cs) {
      cs = { city: cityName, sku: skuName, poVal: 0, grnVal: 0, gapVal: 0, poQty: 0, grnQty: 0 };
      citySkuMap.set(cKey, cs);
    }
    cs.poVal += r[8];
    cs.grnVal += r[10];
    cs.poQty += r[7];
    cs.grnQty += r[9];
    cs.gapVal = Math.max(0, cs.poVal - cs.grnVal);

    // Depot aggregation
    const dInfo = lookupDepoByCity(cityName);
    const depoName = dInfo?.depo || "Unassigned / Other";
    let dbk = depoMap.get(depoName);
    if (!dbk) {
      dbk = { depo: depoName, state: dInfo?.state || "Various", poVal: 0, grnVal: 0, gapVal: 0, pos: new Set() };
      depoMap.set(depoName, dbk);
    }
    dbk.poVal += r[8];
    dbk.grnVal += r[10];
    dbk.gapVal = Math.max(0, dbk.poVal - dbk.grnVal);
    dbk.pos.add(r[12]);

    // Expiry check (r[13] is expiry date if present)
    const expDate = r[13];
    if (expDate > 0) {
      const expY = Math.floor(expDate / 10000), expM = Math.floor(expDate / 100) % 100, expD = expDate % 100;
      const nowY = Math.floor(nowYmd / 10000), nowM = Math.floor(nowYmd / 100) % 100, nowD = nowYmd % 100;
      const diff = Math.round((Date.UTC(expY, expM - 1, expD) - Date.UTC(nowY, nowM - 1, nowD)) / 86400000);
      if (diff < 0) {
        expiredPoCount++;
        expiredPoVal += r[8];
      } else if (diff <= 2) {
        criticalExpiryPoCount++;
        criticalExpiryPoVal += r[8];
      }
    }
  }

  const pack = (arr: any[], topN?: number, sortByGap = false) => {
    let out = arr.map((b) => ({
      name: b.name,
      poVal: +b.poVal.toFixed(1),
      grnVal: +b.grnVal.toFixed(1),
      gapVal: +(b.poVal - b.grnVal).toFixed(1),
      frValPct: b.poVal ? +((b.grnVal / b.poVal) * 100).toFixed(1) : 0,
      frQtyPct: b.poQty ? +((b.grnQty / b.poQty) * 100).toFixed(1) : 0,
      poCount: b.pos.size,
    }));
    if (sortByGap) out = out.sort((a, b) => b.gapVal - a.gapVal);
    if (topN) out = out.slice(0, topN);
    return out;
  };

  const topCitySkuGaps = Array.from(citySkuMap.values())
    .filter((x) => x.gapVal > 0)
    .sort((a, b) => b.gapVal - a.gapVal)
    .slice(0, 15)
    .map((x) => ({
      city: x.city,
      sku: x.sku,
      poVal: +x.poVal.toFixed(1),
      grnVal: +x.grnVal.toFixed(1),
      gapVal: +x.gapVal.toFixed(1),
      frPct: x.poVal ? +((x.grnVal / x.poVal) * 100).toFixed(1) : 0,
    }));

  const depotPerformance = Array.from(depoMap.values())
    .map((d) => ({
      depo: d.depo,
      state: d.state,
      poVal: +d.poVal.toFixed(1),
      grnVal: +d.grnVal.toFixed(1),
      gapVal: +d.gapVal.toFixed(1),
      frPct: d.poVal ? +((d.grnVal / d.poVal) * 100).toFixed(1) : 0,
      poCount: d.pos.size,
    }))
    .sort((a, b) => b.gapVal - a.gapVal);

  return {
    meta: {
      dateRange: `${d.meta.date_min} to ${d.meta.date_max}`,
      totalPOs: allPos.size,
      totalLines: rows.length,
      valueUnit: "₹ Lakh (1 Lakh = 100,000 INR)",
    },
    overall: {
      poVal: +poVal.toFixed(1),
      grnVal: +grnVal.toFixed(1),
      gapVal: +(poVal - grnVal).toFixed(1),
      frValPct: +((grnVal / poVal) * 100).toFixed(1),
      frQtyPct: +((grnQty / poQty) * 100).toFixed(1),
      poQty: Math.round(poQty),
      grnQty: Math.round(grnQty),
    },
    byMonth: pack(by.month),
    byTrade: pack(by.trade),
    byRegion: pack(by.region),
    byStatus: pack(by.status),
    byCategory: pack(by.category),
    topCitiesByGap: pack(by.city, 15, true),
    allCities: pack(by.city).map(({ name, frValPct, poCount }) => ({ name, frValPct, poCount })),
    topSkusByGap: pack(by.sku, 15, true),
    topCitySkuCrossGaps: topCitySkuGaps,
    depotPerformance,
    expiryAlerts: {
      criticalExpiring2DaysPOs: criticalExpiryPoCount,
      criticalExpiring2DaysVal: +criticalExpiryPoVal.toFixed(1),
      alreadyExpiredPOs: expiredPoCount,
      alreadyExpiredVal: +expiredPoVal.toFixed(1),
    },
  };
}

const SYSTEM = (agg: Agg, fc: any) => `You are JARVIS, the Chief Trade Fill Rate & Predictive AI Analyst for Milky Mist Dairy Food Pvt Ltd.
You deeply analyse purchase-order (PO) fulfilment data for quick-commerce trades (Amazon, Blinkit, Zepto, Swiggy Instamart, BigBasket)
and you produce accurate mathematical FORECASTS and WHAT-IF SCENARIO SIMULATIONS.

Definitions:
- Fill Rate (FR) = GRN / PO, by value or by quantity. Gap = PO value - GRN value.
- All money values are in ${agg.meta.valueUnit}.
- "Fully Supplied / Partially Supplied / Zero Supply / Expired" are PO statuses.
- Depots: HO Depo (Bangalore/Karnataka), Sunethra Depo (Chennai/TN), Hyderabad Depo (Telangana), Taloja Depo (Mumbai/MH), Pune Depo (MH), Gujarat Depo (Ahmedabad/Gujarat), Deneha Depo (Kochi/Kerala).

=== ACTUALS (Pre-computed from ${agg.meta.totalLines} lines, ${agg.meta.totalPOs} POs, ${agg.meta.dateRange}) ===
${JSON.stringify(agg)}

=== STATISTICAL FORECAST ENGINE OUTPUT ===
${fc ? JSON.stringify(fc) : "Not available for this dataset."}

=== CAPABILITIES:
1. DEEP ROOT-CAUSE ANALYSIS: Drill into city x SKU shortages, zero-supply surge, depot bottlenecks, and trade drop-offs.
2. PREDICTIVE FORECASTING: Quote monthEndProjection, nextMonth forecast (with low/high bounds and confidence), and dailyMomentum.
3. WHAT-IF SCENARIO SIMULATION:
   When asked "What if Trade X / SKU Y / Depot Z achieves N% fill rate?", mathematically calculate:
   - Current PO value and current GRN for that entity.
   - New simulated GRN = PO * (N / 100).
   - Recovered Gap = New GRN - Current GRN (in ₹ Lakhs).
   - New Overall Company FR = ((Current Total GRN + Recovered Gap) / Current Total PO) * 100.
   - Outline the required dispatch actions to achieve it.

Rules for answering:
1. Lead directly with clear, authoritative numbers (₹ Lakh with commas, % to 1 decimal).
2. Answer ONLY from grounded facts and mathematical derivations. Never invent numbers.
3. For predictions, state confidence level, range (low-high), and key drivers.
4. Keep answers crisp and formatted with bold key metrics, bullet points, and action-oriented takeaways.
5. Include visual charts using the fenced block (max 2 per answer):
\`\`\`chart
{"type":"bar","title":"Gap by Trade (₹L)","labels":["Amazon","Blinkit"],"values":[123.4,88.1],"unit":"₹L"}
\`\`\`
   - Supports "bar" or "line".
6. Always conclude with a single high-impact "Action Plan" recommendation.
7. Maintain JARVIS's polished, intelligent, professional persona.`;

/* ---------- TEAM mode: every configured engine drafts independently,
   then one of them merges the drafts into a single combined answer. ---------- */
async function runTeam(ctx: { agg: Agg; fc: any }, messages: ChatMsg[]) {
  const have = availableProviders();
  const system = SYSTEM(ctx.agg, ctx.fc);

  const settled = await Promise.allSettled(
    have.map((p) => askAI(p, { system, messages, maxTokens: 1400 }, true))
  );
  const drafts = settled
    .filter((s): s is PromiseFulfilledResult<AskResult> => s.status === "fulfilled")
    .map((s) => s.value);

  if (!drafts.length) {
    const reasons = settled
      .map((s, i) => (s.status === "rejected" ? explainErrorFor(have[i], s.reason) : null))
      .filter(Boolean)
      .join(" ");
    return { reply: "None of the configured engines could answer. " + reasons, engine: undefined, team: undefined };
  }

  const members = drafts.map((d) => PROVIDER_LABEL[d.provider]).join(" + ");
  if (drafts.length === 1) {
    return { reply: drafts[0].text, engine: PROVIDER_LABEL[drafts[0].provider], team: undefined };
  }

  const draftsText = drafts
    .map((d) => `--- ${PROVIDER_LABEL[d.provider]} draft ---\n${d.text}`)
    .join("\n\n");
  const synthMessages: ChatMsg[] = [
    ...messages,
    {
      role: "user",
      content:
        `Three teammates (${members}) independently drafted an answer to the question above. ` +
        `Merge them into ONE final answer: keep only statements grounded in the data, combine ` +
        `complementary points, resolve disagreements using the data, drop repetition, and follow ` +
        `the same formatting rules (chart blocks, Action line). Do not mention that there were ` +
        `multiple drafts or name any AI engine.\n\n${draftsText}`,
    },
  ];
  const synthProvider =
    drafts.find((d) => d.provider === "anthropic")?.provider ?? drafts[0].provider;
  try {
    const final = await askAI(synthProvider, { system, messages: synthMessages, maxTokens: 2000 }, true);
    return { reply: final.text, engine: "Team", team: members };
  } catch {
    // synthesis call failed — fall back to the strongest single draft rather than erroring out
    return { reply: drafts[0].text, engine: PROVIDER_LABEL[drafts[0].provider], team: members };
  }
}

function explainErrorFor(p: ProviderId, e: any): string {
  return `${PROVIDER_LABEL[p]}: ${e?.message || "failed"}.`;
}

/* ---------- GET: which engines are configured (for the UI switcher) ---------- */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const have = availableProviders();
  return NextResponse.json({
    providers: (["anthropic", "openai", "gemini"] as ProviderId[]).map((p) => ({
      id: p,
      label: PROVIDER_LABEL[p],
      ready: !!keyFor(p),
    })),
    active: have.length ? defaultProvider() : null,
  });
}

/* ---------- POST: ask Jarvis ---------- */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  if (!availableProviders().length)
    return NextResponse.json(
      { reply: "AI is not configured yet. Add ANTHROPIC_API_KEY (and optionally OpenAI_API_KEY / Gemini_API_KEY) to .env and restart the server." },
      { status: 200 }
    );

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const messages = (body?.messages || [])
    .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-10);
  if (!messages.length || messages[messages.length - 1].role !== "user")
    return NextResponse.json({ error: "No question" }, { status: 400 });

  const isTeam = body?.provider === "team";
  const wanted = ["anthropic", "openai", "gemini"].includes(body?.provider)
    ? (body.provider as ProviderId)
    : undefined;

  let ctx;
  try { ctx = await loadContext(); }
  catch (e: any) { return NextResponse.json({ reply: "Could not load the dataset: " + e.message }, { status: 200 }); }

  if (isTeam) {
    try {
      const out = await runTeam(ctx, messages);
      return NextResponse.json(out);
    } catch (e: any) {
      return NextResponse.json({ reply: "AI error: " + (e?.message || "unknown") }, { status: 200 });
    }
  }

  try {
    const res = await askAI(wanted, {
      system: SYSTEM(ctx.agg, ctx.fc),
      messages,
      maxTokens: 2000,
    });
    return NextResponse.json({
      reply: res.text,
      engine: PROVIDER_LABEL[res.provider],
      provider: res.provider,
      model: res.model,
      fellBackFrom: res.fellBackFrom ? PROVIDER_LABEL[res.fellBackFrom] : undefined,
      fallbackReason: res.fallbackReason,
    });
  } catch (e: any) {
    return NextResponse.json({ reply: "AI error: " + (e?.message || "unknown") }, { status: 200 });
  }
}
