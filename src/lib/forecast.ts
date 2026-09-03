/* ============================================================
   FORECAST ENGINE  —  the "prediction" half of Jarvis.

   All maths happens here in TypeScript (deterministic and
   reproducible). The language model only explains the numbers we
   hand it, so a forecast can never be invented or drift between
   two answers to the same question.

   Key design decisions:
   1. RAMP-UP MONTHS ARE EXCLUDED. Early months with a tiny PO base
      (onboarding period) sit at ~99% FR on a handful of POs. Fitting a
      trend through them produces nonsense. Any month whose PO value is
      below 15% of the largest month is flagged as ramp-up and left out
      of every trend calculation (it is still reported for context).
   2. TWO FORECAST METHODS, chosen by how much real history exists:
        >= 3 representative complete months -> OLS trend + R2 confidence
        fewer                               -> damped momentum off the
                                               current run-rate
      The method used is always named in the output.
   3. WEAK FITS DO NOT EXTRAPOLATE. If R2 is low the projection falls
      back to the moving average instead of running the slope out.

   Row layout: [month,trade,region,city,category,status,sku,
                poQty,poVal,grnQty,grnVal,dateYYYYMMDD,poId]
   Money values are in Rs Lakh.
   ============================================================ */

import { mmdGroup } from "./mmd-mapping";

type Bucket = { poQty: number; poVal: number; grnQty: number; grnVal: number; pos: Set<number> };
const mkB = (): Bucket => ({ poQty: 0, poVal: 0, grnQty: 0, grnVal: 0, pos: new Set() });
const add = (b: Bucket, r: number[]) => {
  b.poQty += r[7]; b.poVal += r[8]; b.grnQty += r[9]; b.grnVal += r[10]; b.pos.add(r[12]);
};
const r1 = (n: number) => +(Math.round(n * 10) / 10).toFixed(1);
const fr = (grn: number, po: number) => (po > 0 ? +((grn / po) * 100).toFixed(1) : 0);
const clampPct = (n: number) => Math.max(0, Math.min(100, +n.toFixed(1)));
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/* ---------- ordinary least squares on y over x = 0..n-1 ---------- */
function ols(ys: number[]) {
  const n = ys.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0, r2: 0, n, sd: 0 };
  const xm = (n - 1) / 2;
  const ym = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  ys.forEach((y, i) => { sxy += (i - xm) * (y - ym); sxx += (i - xm) ** 2; syy += (y - ym) ** 2; });
  const slope = sxx ? sxy / sxx : 0;
  const intercept = ym - slope * xm;
  const r2 = syy ? +Math.max(0, Math.min(1, (sxy * sxy) / (sxx * syy))).toFixed(3) : 0;
  const resid = ys.map((y, i) => y - (intercept + slope * i));
  const sd = n > 2 ? Math.sqrt(resid.reduce((a, b) => a + b * b, 0) / (n - 2)) : 0;
  return { slope, intercept, r2, n, sd };
}
const at = (o: { slope: number; intercept: number }, x: number) => o.intercept + o.slope * x;

function stdev(xs: number[]) {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

/* ---------- date helpers (YYYYMMDD ints) ---------- */
const yOf = (d: number) => Math.floor(d / 10000);
const mOf = (d: number) => Math.floor(d / 100) % 100;
const dOf = (d: number) => d % 100;
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const MONTH_NAMES = ["January","February","March","April","May","June","July",
  "August","September","October","November","December"];
const fmtDay = (d: number) =>
  `${yOf(d)}-${String(mOf(d)).padStart(2, "0")}-${String(dOf(d)).padStart(2, "0")}`;
const weekdayOf = (d: number) =>
  ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][
    new Date(Date.UTC(yOf(d), mOf(d) - 1, dOf(d))).getUTCDay()
  ];

const RAMP_UP_SHARE = 0.15;      // a month counts as real history above 15% of the biggest month
const DAMP = 0.35;               // how much of the last move carries into the next month

export function buildForecast(d: any) {
  const dims: Record<string, string[]> = d.dims;
  const rows: number[][] = d.rows;

  /* ---------- bucket everything ---------- */
  const byYm = new Map<number, Bucket>();
  const byDay = new Map<number, Bucket>();
  const tradeByYm = new Map<string, Map<number, Bucket>>();
  const skuByYm = new Map<string, Map<number, Bucket>>();
  const cityByYm = new Map<string, Map<number, Bucket>>();
  const statusByYm = new Map<string, Map<number, Bucket>>();

  const nest = (m: Map<string, Map<number, Bucket>>, k: string, ym: number) => {
    let inner = m.get(k); if (!inner) { inner = new Map(); m.set(k, inner); }
    let b = inner.get(ym); if (!b) { b = mkB(); inner.set(ym, b); }
    return b;
  };

  for (const r of rows) {
    const day = r[11];
    if (!day || day < 19000000) continue;
    const ym = yOf(day) * 100 + mOf(day);
    let b = byYm.get(ym); if (!b) { b = mkB(); byYm.set(ym, b); } add(b, r);
    let dbk = byDay.get(day); if (!dbk) { dbk = mkB(); byDay.set(day, dbk); } add(dbk, r);
    add(nest(tradeByYm, dims.trade[r[1]], ym), r);
    // trade SKUs sharing one MMD Item Code merge into a single watchlist entry
    add(nest(skuByYm, mmdGroup(dims.sku[r[6]]).name, ym), r);
    add(nest(cityByYm, dims.city[r[3]], ym), r);
    add(nest(statusByYm, dims.status[r[5]], ym), r);
  }

  const yms = Array.from(byYm.keys()).sort((a, b) => a - b);
  if (!yms.length) return null;

  const days = Array.from(byDay.keys()).sort((a, b) => a - b);
  const lastDay = days[days.length - 1];
  const curYm = yms[yms.length - 1];
  const curY = Math.floor(curYm / 100), curM = curYm % 100;
  const dim = daysInMonth(curY, curM);
  const elapsed = dOf(lastDay);
  const partial = elapsed < dim;

  const maxPo = Math.max(...yms.map((ym) => byYm.get(ym)!.poVal));
  const monthly = yms.map((ym) => {
    const b = byYm.get(ym)!;
    const complete = ym !== curYm || !partial;
    return {
      month: `${MONTH_NAMES[(ym % 100) - 1]} ${Math.floor(ym / 100)}`,
      ym, complete,
      poVal: r1(b.poVal), grnVal: r1(b.grnVal), gapVal: r1(b.poVal - b.grnVal),
      frValPct: fr(b.grnVal, b.poVal), frQtyPct: fr(b.grnQty, b.poQty),
      poCount: b.pos.size,
      rampUp: b.poVal < maxPo * RAMP_UP_SHARE,
    };
  });

  const rampUpMonths = monthly.filter((m) => m.rampUp).map((m) => m.month);
  const rep = monthly.filter((m) => !m.rampUp);              // representative months
  const repComplete = rep.filter((m) => m.complete);
  const cur = monthly[monthly.length - 1];

  /* ---------- current-month run-rate projection ---------- */
  const activeDays = days.filter((x) => yOf(x) * 100 + mOf(x) === curYm);
  const recentDays = activeDays.slice(-14);
  let rPo = 0, rGrn = 0;
  for (const dd of recentDays) { const b = byDay.get(dd)!; rPo += b.poVal; rGrn += b.grnVal; }
  const perDayPo = recentDays.length ? rPo / recentDays.length : 0;
  const perDayGrn = recentDays.length ? rGrn / recentDays.length : 0;
  const remaining = Math.max(0, dim - elapsed);
  const projPo = cur.poVal + perDayPo * remaining;
  const projGrn = cur.grnVal + perDayGrn * remaining;
  const scaleToFullMonth = partial && cur.poVal > 0 ? projPo / cur.poVal : 1;

  const monthEndProjection = partial
    ? {
        month: cur.month,
        daysElapsed: elapsed, daysInMonth: dim,
        monthCompletedPct: +((elapsed / dim) * 100).toFixed(1),
        mtdPoVal: cur.poVal, mtdGrnVal: cur.grnVal, mtdGapVal: cur.gapVal, mtdFrValPct: cur.frValPct,
        projectedPoVal: r1(projPo),
        projectedGrnVal: r1(projGrn),
        projectedGapVal: r1(projPo - projGrn),
        projectedFrValPct: fr(projGrn, projPo),
        method: `month-to-date + (average of the last ${recentDays.length} active days x ${remaining} remaining days)`,
      }
    : null;

  /* ---------- daily momentum ---------- */
  const last30 = days.slice(-30);
  const dailySeries = last30.map((dd) => {
    const b = byDay.get(dd)!;
    return { date: fmtDay(dd), frValPct: fr(b.grnVal, b.poVal), poVal: r1(b.poVal) };
  });
  const dFit = ols(dailySeries.map((x) => x.frValPct));
  const movAvg = (arr: number[], w: number) =>
    arr.map((_, i) => {
      const s = arr.slice(Math.max(0, i - w + 1), i + 1);
      return +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(1);
    });
  const ma7 = movAvg(dailySeries.map((x) => x.frValPct), 7);
  const ma7Latest = ma7[ma7.length - 1] ?? 0;
  const dailyReliable = dFit.r2 >= 0.15 && dFit.n >= 10;
  const dailyVolatility = +stdev(dailySeries.map((x) => x.frValPct)).toFixed(1);

  const dailyMomentum = {
    windowDays: dailySeries.length,
    slopePctPerDay: +dFit.slope.toFixed(3),
    r2: dFit.r2,
    trendReliable: dailyReliable,
    ma7Latest,
    ma7SevenDaysAgo: ma7[Math.max(0, ma7.length - 8)] ?? 0,
    dailyVolatilityPct: dailyVolatility,
    projected7DayFrPct: dailyReliable ? clampPct(ma7Latest + dFit.slope * 7) : ma7Latest,
    projected14DayFrPct: dailyReliable ? clampPct(ma7Latest + dFit.slope * 14) : ma7Latest,
    direction: !dailyReliable ? "flat / no reliable short-term trend"
      : dFit.slope > 0.05 ? "improving" : dFit.slope < -0.05 ? "deteriorating" : "flat",
    note: dailyReliable
      ? "Short-term slope is statistically usable."
      : "Day-to-day scatter is too high to extrapolate; the 7-day moving average is used instead of the slope.",
    last14Days: dailySeries.slice(-14),
  };

  /* ---------- next-month forecast ---------- */
  const curFr = partial ? (monthEndProjection?.projectedFrValPct ?? cur.frValPct) : cur.frValPct;
  const prevRep = rep.length >= 2 ? rep[rep.length - 2] : null;
  const lastMove = prevRep ? +(curFr - prevRep.frValPct).toFixed(1) : 0;

  let forecastFr: number, band: number, methodName: string, confidence: string,
      trendSlope = 0, fitR2 = 0, nextPo: number;

  if (repComplete.length >= 3) {
    const f = ols(repComplete.map((m) => m.frValPct));
    const p = ols(repComplete.map((m) => m.poVal));
    const trendNext = clampPct(at(f, f.n));
    forecastFr = clampPct(0.55 * trendNext + 0.45 * curFr);
    band = clamp((f.sd || dailyVolatility / 2) * 1.5, 2, 10);
    trendSlope = +f.slope.toFixed(2);
    fitR2 = f.r2;
    nextPo = Math.max(0, at(p, p.n));
    methodName = "OLS trend on representative complete months (55%) blended with the current run-rate (45%)";
    confidence = f.r2 >= 0.6 && f.n >= 4 ? "High" : f.r2 >= 0.25 ? "Medium" : "Low";
  } else {
    forecastFr = clampPct(curFr + DAMP * lastMove);
    band = clamp(dailyVolatility * 0.7 + Math.abs(lastMove) * 0.4, 3, 12);
    trendSlope = lastMove;
    nextPo = partial ? projPo : cur.poVal;
    methodName = `damped momentum: current run-rate ${curFr}% carried forward with ${Math.round(DAMP * 100)}% of the last month-on-month move (${lastMove >= 0 ? "+" : ""}${lastMove} pts)`;
    confidence = repComplete.length >= 2 ? "Medium" : "Low";
  }

  const nextMonth = {
    month: `${MONTH_NAMES[curM % 12]} ${curM === 12 ? curY + 1 : curY}`,
    forecastFrValPct: forecastFr,
    rangeLowPct: clampPct(forecastFr - band),
    rangeHighPct: clampPct(forecastFr + band),
    forecastPoVal: r1(nextPo),
    expectedGapVal: r1(nextPo * (1 - forecastFr / 100)),
    currentRunRateFrPct: curFr,
    lastMonthOnMonthMovePts: lastMove,
    trendPtsPerMonth: trendSlope,
    r2: fitR2,
    representativeMonthsUsed: repComplete.length,
    confidence,
    method: methodName,
  };

  /* ---------- weekday pattern (last 8 weeks) ---------- */
  const wd = new Map<string, Bucket>();
  for (const dd of days.slice(-56)) {
    const k = weekdayOf(dd);
    let b = wd.get(k); if (!b) { b = mkB(); wd.set(k, b); }
    const s = byDay.get(dd)!;
    b.poVal += s.poVal; b.grnVal += s.grnVal;
  }
  const weekdayPattern = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]
    .filter((k) => wd.has(k))
    .map((k) => ({ day: k, frValPct: fr(wd.get(k)!.grnVal, wd.get(k)!.poVal), poVal: r1(wd.get(k)!.poVal) }));

  /* ---------- latest vs previous representative month ---------- */
  const repYms = rep.map((m) => m.ym);
  const curPeriod = repYms.length ? repYms[repYms.length - 1] : null;
  const prevPeriod = repYms.length >= 2 ? repYms[repYms.length - 2] : null;
  const curLabel = (rep[rep.length - 1]?.month ?? cur.month) + (partial ? ` (month-to-date, ${elapsed}/${dim} days)` : "");
  const prevLabel = prevRep?.month ?? null;

  /* ---------- per-trade outlook ---------- */
  const tradeOutlook = dims.trade.map((name) => {
    const inner = tradeByYm.get(name);
    const c = curPeriod != null ? inner?.get(curPeriod) : undefined;
    const p = prevPeriod != null ? inner?.get(prevPeriod) : undefined;
    if (!c || c.poVal <= 0) return null;
    const nowFr = fr(c.grnVal, c.poVal);
    const wasFr = p && p.poVal > 0 ? fr(p.grnVal, p.poVal) : null;
    const move = wasFr == null ? 0 : +(nowFr - wasFr).toFixed(1);
    // cap the carried-forward move: one big swing should not extrapolate away
    const proj = clampPct(nowFr + DAMP * clamp(move, -10, 10));
    const expPo = r1(c.poVal * scaleToFullMonth);
    return {
      trade: name,
      frCurrentPct: nowFr,
      frPreviousPct: wasFr,
      movePts: move,
      forecastNextFrPct: proj,
      expectedPoVal: expPo,
      expectedGapVal: r1(expPo * (1 - proj / 100)),
      outlook: wasFr == null ? "no comparable history"
        : move <= -3 ? "deteriorating" : move >= 3 ? "improving" : "stable",
    };
  }).filter(Boolean).sort((a: any, b: any) => b.expectedGapVal - a.expectedGapVal);

  /* ---------- risk watchlists (value-weighted slippage) ---------- */
  function watchlist(map: Map<string, Map<number, Bucket>>, label: string, minPoVal: number, topN = 12) {
    if (prevPeriod == null || curPeriod == null) return [];
    const out: any[] = [];
    map.forEach((inner, name) => {
      const c = inner.get(curPeriod);
      const p = inner.get(prevPeriod);
      if (!c || c.poVal < minPoVal || !p || p.poVal <= 0) return;
      const nowFr = fr(c.grnVal, c.poVal);
      const wasFr = fr(p.grnVal, p.poVal);
      const drop = +(wasFr - nowFr).toFixed(1);
      if (drop <= 1) return;
      const fullMonthPo = c.poVal * scaleToFullMonth;
      out.push({
        [label]: name,
        frNowPct: nowFr,
        frPrevPct: wasFr,
        dropPts: drop,
        poValNow: r1(c.poVal),
        gapNowVal: r1(c.poVal - c.grnVal),
        valueAtRiskVal: r1(fullMonthPo * (drop / 100)),
      });
    });
    return out.sort((a, b) => b.valueAtRiskVal - a.valueAtRiskVal).slice(0, topN);
  }

  /* ---------- status pressure ---------- */
  const statusTrend = ["Zero Supply", "Partially Supplied", "Expired"].map((s) => {
    const inner = statusByYm.get(s);
    if (!inner) return null;
    const series = rep.map((m) => {
      const b = inner.get(m.ym);
      const tot = byYm.get(m.ym)!;
      return { month: m.month, sharePct: tot.poVal ? +(((b?.poVal || 0) / tot.poVal) * 100).toFixed(1) : 0 };
    });
    if (!series.some((x) => x.sharePct > 0)) return null;
    const nowS = series[series.length - 1]?.sharePct ?? 0;
    const prevS = series.length >= 2 ? series[series.length - 2].sharePct : null;
    const move = prevS == null ? 0 : +(nowS - prevS).toFixed(1);
    return {
      status: s,
      sharePctByMonth: series,
      movePts: move,
      forecastNextSharePct: clampPct(nowS + DAMP * move),
      direction: prevS == null ? "no comparable history" : move > 1 ? "rising" : move < -1 ? "falling" : "flat",
    };
  }).filter(Boolean);

  return {
    asOf: fmtDay(lastDay),
    unit: "Rs Lakh",
    comparisonBasis: { current: curLabel, previous: prevLabel },
    monthly,
    rampUpMonthsExcluded: rampUpMonths,
    currentMonthIsPartial: partial,
    monthEndProjection,
    nextMonth,
    dailyMomentum,
    weekdayPattern,
    tradeOutlook,
    skuWatchlist: watchlist(skuByYm, "sku", 5),
    cityWatchlist: watchlist(cityByYm, "city", 20),
    statusTrend,
    caveats: [
      "Forecasts are statistical projections from past PO/GRN behaviour only. They do not know about promotions, festivals, new listings, capacity changes or supply decisions already taken.",
      rampUpMonths.length
        ? `${rampUpMonths.join(", ")} treated as ramp-up (PO base under ${RAMP_UP_SHARE * 100}% of the largest month) and excluded from all trend maths.`
        : "",
      repComplete.length < 3
        ? `Only ${repComplete.length} complete month(s) of representative history, so the momentum method is used and the range is wide.`
        : "",
      partial ? `${cur.month} is only ${elapsed} of ${dim} days, so its figures are month-to-date unless labelled projected.` : "",
    ].filter(Boolean),
  };
}

export type Forecast = NonNullable<ReturnType<typeof buildForecast>>;
