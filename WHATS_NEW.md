# Trade FR Website — Update Pack
## (Milky Mist home page + sidebar app + AI Assistant)

## What this adds
1. **Home page** restyled like milkymist.in — white navbar with the Milky Mist wordmark,
   full-width hero with a background image, Login / Sign up buttons.
2. **After login** you no longer land straight on the raw dashboard. You get a
   sidebar app (like an analytics studio):
   - **Overview** — headline KPIs (FR % by value & qty, PO/GRN/Gap ₹L, PO count),
     monthly trend chart, fill rate by trade, top gap cities
   - **Full Dashboard** — the complete original dashboard as its own menu option
   - **AI Assistant** — chat bot powered by Claude
3. **AI Assistant** — answers questions about the data with clear numbers and renders
   bar/line charts inline. The Claude API key stays on the SERVER (.env) — it is never
   exposed to the browser.

## How to apply (copy files into trade-fr-app/)

Copy each file from this pack into the same path inside your project, replacing
where the file already exists:

```
src/app/page.tsx                     (REPLACES existing home page)
src/app/dashboard/layout.tsx         (NEW)
src/app/dashboard/side-nav.tsx       (NEW)
src/app/dashboard/page.tsx           (REPLACES — old one becomes Full Dashboard)
src/app/dashboard/full/page.tsx      (NEW)
src/app/dashboard/ai/page.tsx        (NEW)
src/app/api/ai/route.ts              (NEW)
```

The old `src/app/dashboard/sign-out-button.tsx` is no longer used (sign out moved
into the sidebar) — you can delete it or leave it.

## Hero background image
Save your Milky Mist banner image (e.g. the product-range photo from your website
team) as:

```
public/hero.jpg
```

If the file is missing the page shows a clean sky-blue background instead.

## Enable the AI bot
Add ONE line to your `.env` file:

```
ANTHROPIC_API_KEY="sk-ant-....your key...."
```

Get a key at https://console.anthropic.com → API Keys. Optional: choose the model with
`AI_MODEL_ANTHROPIC="claude-sonnet-5"` (that's the default).

## Run
```
npm run dev
```
Open http://localhost:3000 → new home page → log in → sidebar app.

## Notes
- The AI reads `public/app/data.json`, pre-computes aggregates on the server
  (overall, by month/trade/region/category/status, top gap cities & SKUs) and sends
  ONLY those aggregates to Claude — not all 48k rows. When you refresh data.json,
  the bot automatically picks up the new numbers (it checks the file's timestamp).
- /api/ai requires login (session check) so outsiders can't use your API key.
- If the bot replies "AI is not configured yet", the .env key is missing or the
  server wasn't restarted after adding it.
- Your .env contains real database credentials — never share this project folder
  publicly with the .env inside.


---

# v14 — Jarvis: three engines + forecasting

## 1. Multi-engine Jarvis
Jarvis now runs on **Claude (Anthropic)**, **GPT (OpenAI)** or **Gemini (Google)**.

- New file `src/lib/ai-providers.ts` — one `askAI()` function that speaks all three
  APIs over plain `fetch` (no new npm packages).
- Keys are read from `.env` in either capitalisation, so `OpenAI_API_KEY` and
  `Gemini_API_KEY` work exactly as you pasted them:
  ```
  ANTHROPIC_API_KEY="..."     # or Anthropic_API_KEY
  OpenAI_API_KEY="..."        # or OPENAI_API_KEY
  Gemini_API_KEY="..."        # or GEMINI_API_KEY
  AI_PROVIDER="anthropic"     # default engine
  ```
- **Engine switcher** in the Jarvis header: Auto / Claude / GPT / Gemini. Engines
  with no key are greyed out. The engine that answered is shown under each reply.
- **Automatic fallback**: if the chosen engine is down or out of quota, the next
  configured engine answers instead, so Jarvis never goes silent.
- **Model ids are not hard-locked**: each engine has a fallback list
  (claude-sonnet-5 → claude-opus-5 → claude-sonnet-4-6, gpt-5.6 → gpt-5.5 → gpt-4.1,
  gemini-3.5-flash → gemini-3.6-flash → gemini-2.5-flash). If a model is retired the
  next one is used automatically. Override with `AI_MODEL_ANTHROPIC`,
  `AI_MODEL_OPENAI`, `AI_MODEL_GEMINI`.

## 2. Forecasting (`src/lib/forecast.ts`)
The maths runs on the server in TypeScript — **not** in the AI. The model only
explains numbers it is handed, so a forecast can't be hallucinated and the same
question always returns the same figures.

Computed on every dataset load (cached until you upload new data):

| Output | What it is |
|---|---|
| `monthEndProjection` | where the current part-month lands at the run-rate of the last 14 active days |
| `nextMonth` | next-month FR forecast + low/high range + confidence + the method used |
| `dailyMomentum` | 7-day moving average, slope, 7/14-day projection |
| `tradeOutlook` | per-trade next-month FR and expected gap |
| `skuWatchlist` / `cityWatchlist` | ₹L at risk if the recent slippage continues |
| `statusTrend` | Zero Supply / Partially Supplied / Expired share direction |
| `weekdayPattern` | which weekday fills worst |

Three safeguards keep the predictions honest:

1. **Ramp-up months are excluded.** Any month whose PO base is under 15% of the
   biggest month (April and May 2026 here) is left out of every trend calculation.
   Fitting a line through them predicted August at 77.7% and falling — the opposite
   of what the data actually shows.
2. **Method switches with the amount of history.** Three or more representative
   complete months → OLS regression with an R² confidence label. Fewer → damped
   momentum off the current run-rate, flagged Low confidence with a wide range.
   From September this switches over on its own and the range tightens.
3. **Weak fits don't extrapolate.** If the daily R² is below 0.15 the 7-day moving
   average is reported instead of running the slope out.

## 3. Jarvis page
- **ANALYSE / PREDICT** tabs on the home screen with ready-made prompts
  ("Forecast next month's fill rate", "Which SKUs are at risk next month?").
- `/api/ai` GET returns which engines have keys, so the switcher reflects `.env`.

## Files added / changed in v14
```
src/lib/ai-providers.ts          NEW
src/lib/forecast.ts              NEW
src/app/api/ai/route.ts          replaced (forecast block + engine choice)
src/app/dashboard/ai/page.tsx    replaced (engine switcher, predict tab)
src/app/dashboard/reports/page.tsx  AVERAGE rows removed (screen + Excel)
.env.example                     documents all three keys
```

## Run
```
npm install          # only if this is a fresh copy
# delete the .next folder, then:
npm run dev
```
`.env` is **not** included in this zip — your existing one stays as it is.

---

# v15 — keys wired in .env + connection tester

- `.env` is **included** in this folder with all three keys already in place
  (Claude, OpenAI, Gemini) plus `AI_PROVIDER="anthropic"` as the default engine.
  Nothing to paste — extract and run.
- Key names in `.env` are read exactly as they are: `ANTHROPIC_API_KEY`,
  `OpenAI_API_KEY`, `Gemini_API_KEY`. Both capitalisations work.
- New route **`/api/ai/health`** — a connection tester. Log in, then open
  http://localhost:3000/api/ai/health in the browser. It pings every engine that
  has a key and reports, per engine:
  ```
  { "engine": "Claude", "keyInEnv": true, "connected": true,
    "model": "claude-sonnet-5", "ms": 940, "reply": "OK" }
  ```
  `connected: false` with an auth or quota message means that key is wrong or has
  no credit left — the other engines still work.
- Verified against the Anthropic account attached to this key: it is valid and
  `claude-sonnet-5` (the default) is available on it.

---

# v16 — why did an engine fail?

Fallback used to be silent: the badge just said "GPT unavailable" and the real
cause never left the server. Now the reason is captured and shown.

- `src/lib/ai-providers.ts`
  - `explainError()` translates raw API errors into plain English
    (401 = key rejected, 429 + quota wording = no credit left, 404 = unknown
    model id, and so on), and names the model that was tried.
  - Smarter retry classification. Previously a 403 stopped the whole engine, so
    if one model id was blocked for the account the remaining models in the
    fallback list were never tried. Now a 403/400 that mentions the model or
    account verification moves on to the next model; only key and quota errors
    stop the engine.
  - Every failure is also logged to the server terminal, prefixed `[jarvis]`.
- `/api/ai` returns `fallbackReason`; the Jarvis chat shows it in amber under
  the reply, e.g. "GPT unavailable — answered by Claude" plus the actual cause.
- `/api/ai/health` now returns the HTTP `status`, the explained `detail` and the
  `raw` provider message for each engine.

---

# v17 — SKU × City gaps, and date views everywhere

## 1. SKU × City gap analysis
Finds which SKU is failing *in which city* — a single SKU can be 95% in Chennai
and 60% in Bengaluru, and neither the SKU view nor the City view alone shows that.

- **Full Dashboard** → Gap analysis → new chip **By SKU × City** (and **By Date**).
  The table gains a CITY column; sorting, the ₹Value/Qty toggle, the TOTAL row and
  every existing slicer work on it unchanged.
- **Reports** → new tabs **Gap by SKU × City** and **Gap by Date**, both included in
  the Excel download (now 8 sheets, each with its TOTAL row).
- There are 3,528 live SKU × City pairs in the current data, so the Reports table
  shows the worst 500 by gap with a **search box** (type a SKU or a city) and a
  **Show all** link. Excel always exports the full list.

Worst pairs in the current dataset, for reference: Milky Mist Skyr 700 g in
Bengaluru (₹29.3L gap, 61% FR) and Milky Mist Skyr in Bengaluru (₹26.0L, 44% FR).

## 2. Date filtering on every page
Every page already had a PO date range; each one now also gets quick presets:

| Button | Meaning |
|---|---|
| 7D | last 7 days of data |
| 30D | last 30 days of data |
| MTD | 1st of the latest month to date |
| All | clears the date filter |

Presets are measured from the **newest PO date in the dataset**, not from today's
system date, so they stay correct when an upload is a few days behind.

Added to: Overview (dark bar), Reports (filter bar), Full Dashboard (under the PO
Date range slicer, in both the top bar and the gap-analysis card).

Plus **Gap by Date** as a grouping option, so the day-by-day PO / GRN / gap / FR
table can be read directly and exported.

## Files changed in v17
```
public/app/index.html                 By SKU × City + By Date chips
public/app/script.js                  composite grouping, date presets
public/app/style.css                  preset button styling
src/app/dashboard/reports/page.tsx    2 new tabs, search, row cap, 8-sheet export, presets
src/app/dashboard/page.tsx            date presets
```
This build also carries the v16 AI-diagnostics changes, so it supersedes v15 and v16.
