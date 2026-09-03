/* ============================================================
   Unified AI provider layer for JARVIS.

   Supports three engines with one common interface:
     - anthropic  (Claude)   -> primary, best for the numeric/predictive work
     - openai     (GPT)
     - gemini     (Google)

   Keys are read from .env.  Both naming styles work, so the keys you
   already pasted in (OpenAI_API_KEY / Gemini_API_KEY) are picked up
   without renaming anything:

     ANTHROPIC_API_KEY   / Anthropic_API_KEY / CLAUDE_API_KEY
     OPENAI_API_KEY      / OpenAI_API_KEY
     GEMINI_API_KEY      / Gemini_API_KEY   / GOOGLE_API_KEY

   Optional model overrides:
     AI_MODEL_ANTHROPIC, AI_MODEL_OPENAI, AI_MODEL_GEMINI
     AI_PROVIDER  = anthropic | openai | gemini   (default engine)
   ============================================================ */

export type ProviderId = "anthropic" | "openai" | "gemini";

export type ChatMsg = { role: "user" | "assistant"; content: string };

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  anthropic: "Claude",
  openai: "GPT",
  gemini: "Gemini",
};

/* ---------- env helpers ---------- */

function envAny(...names: string[]): string {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  return "";
}

export function keyFor(p: ProviderId): string {
  if (p === "anthropic")
    return envAny("ANTHROPIC_API_KEY", "Anthropic_API_KEY", "CLAUDE_API_KEY");
  if (p === "openai")
    return envAny("OPENAI_API_KEY", "OpenAI_API_KEY", "OPENAI_KEY");
  return envAny("GEMINI_API_KEY", "Gemini_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENAI_API_KEY");
}

/* Model candidates, tried in order. If a model id is retired the next one
   is used automatically, so the app keeps working without a code change. */
function modelsFor(p: ProviderId): string[] {
  if (p === "anthropic")
    return dedupe([
      envAny("AI_MODEL_ANTHROPIC", "AI_MODEL"),
      "claude-sonnet-5",
      "claude-opus-5",
      "claude-sonnet-4-6",
      "claude-3-7-sonnet-latest",
    ]);
  if (p === "openai")
    return dedupe([
      envAny("AI_MODEL_OPENAI"),
      "gpt-5.6",
      "gpt-5.5",
      "gpt-4.1",
      "gpt-4o",
    ]);
  return dedupe([
    envAny("AI_MODEL_GEMINI"),
    "gemini-3.5-flash",
    "gemini-3.6-flash",
    "gemini-2.5-flash",
  ]);
}

const dedupe = (a: string[]) => Array.from(new Set(a.filter(Boolean)));

export function availableProviders(): ProviderId[] {
  return (["anthropic", "openai", "gemini"] as ProviderId[]).filter((p) => !!keyFor(p));
}

export function defaultProvider(): ProviderId {
  const want = (envAny("AI_PROVIDER") || "anthropic").toLowerCase() as ProviderId;
  const have = availableProviders();
  if (have.includes(want)) return want;
  return have[0] || "anthropic";
}

/* ---------- one shared call signature ---------- */

export type AskArgs = {
  system: string;
  messages: ChatMsg[];
  maxTokens?: number;
  timeoutMs?: number;
};

export type AskResult = {
  text: string;
  provider: ProviderId;
  model: string;
  fellBackFrom?: ProviderId;
  fallbackReason?: string;
};

async function postJson(url: string, init: RequestInit, timeoutMs: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    const raw = await r.text();
    let data: any = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
    return { ok: r.ok, status: r.status, data };
  } finally {
    clearTimeout(t);
  }
}

const errMsg = (d: any, status: number) =>
  d?.error?.message || d?.error?.[0]?.message || d?.message || "HTTP " + status;

/* ---------- Anthropic ---------- */

async function callAnthropic(model: string, a: AskArgs, key: string, timeoutMs: number) {
  const { ok, status, data } = await postJson(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: a.maxTokens ?? 2000,
        system: a.system,
        messages: a.messages,
      }),
    },
    timeoutMs
  );
  if (!ok) throw Object.assign(new Error(errMsg(data, status)), { status });
  const text = (data?.content || [])
    .filter((c: any) => c?.type === "text")
    .map((c: any) => c.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("Empty response");
  return text;
}

/* ---------- OpenAI ---------- */

async function callOpenAI(model: string, a: AskArgs, key: string, timeoutMs: number) {
  const body: any = {
    model,
    messages: [
      { role: "system", content: a.system },
      ...a.messages.map((m) => ({ role: m.role, content: m.content })),
    ],
    max_completion_tokens: a.maxTokens ?? 2000,
  };
  let res = await postJson(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify(body),
    },
    timeoutMs
  );
  // Older models want max_tokens instead of max_completion_tokens
  if (!res.ok && /max_completion_tokens|Unrecognized request argument/i.test(errMsg(res.data, res.status))) {
    delete body.max_completion_tokens;
    body.max_tokens = a.maxTokens ?? 2000;
    res = await postJson(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify(body),
      },
      timeoutMs
    );
  }
  if (!res.ok) throw Object.assign(new Error(errMsg(res.data, res.status)), { status: res.status });
  const text = String(res.data?.choices?.[0]?.message?.content || "").trim();
  if (!text) throw new Error("Empty response");
  return text;
}

/* ---------- Gemini ---------- */

async function callGemini(model: string, a: AskArgs, key: string, timeoutMs: number) {
  const { ok, status, data } = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: a.system }] },
        contents: a.messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        generationConfig: { maxOutputTokens: a.maxTokens ?? 2000 },
      }),
    },
    timeoutMs
  );
  if (!ok) throw Object.assign(new Error(errMsg(data, status)), { status });
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map((p: any) => p?.text || "")
    .join("")
    .trim();
  if (!text) throw new Error("Empty response");
  return text;
}

/* ---------- public entry point ---------- */

async function callOne(p: ProviderId, a: AskArgs): Promise<AskResult> {
  const key = keyFor(p);
  if (!key) throw new Error(`No API key configured for ${PROVIDER_LABEL[p]}`);
  const timeoutMs = a.timeoutMs ?? 90_000;
  let lastErr: any = null;
  for (const model of modelsFor(p)) {
    try {
      const text =
        p === "anthropic" ? await callAnthropic(model, a, key, timeoutMs)
        : p === "openai"  ? await callOpenAI(model, a, key, timeoutMs)
        :                   await callGemini(model, a, key, timeoutMs);
      return { text, provider: p, model };
    } catch (e: any) {
      lastErr = Object.assign(e, { model });
      if (!shouldTryNextModel(e)) break;   // bad key / no credit -> no point trying other models
    }
  }
  throw lastErr || new Error("AI call failed");
}

/* Is this failure about THIS MODEL (try the next one) or about the ACCOUNT
   (stop, no other model will work either)? */
function shouldTryNextModel(e: any): boolean {
  const s = e?.status;
  const m = String(e?.message || "");
  if (s === 401 || (s === 403 && /key|auth|permission denied/i.test(m))) return false;
  if (s === 429 && /quota|billing|credit|insufficient/i.test(m)) return false;
  if (s === 404) return true;
  if (s === 400 || s === 403)
    return /model|not_found|does not exist|unsupported|must be verified|verification/i.test(m);
  return /Empty response/i.test(m);
}

/** Turn a raw API error into something a non-developer can act on. */
export function explainError(p: ProviderId, e: any): string {
  const s = e?.status;
  const m = String(e?.message || "unknown error");
  const who = PROVIDER_LABEL[p];
  if (s === 401) return `${who} rejected the API key (401). The key is wrong, revoked, or belongs to a different account.`;
  if (s === 429 && /quota|billing|credit|insufficient/i.test(m))
    return `${who} says the account has no usable credit or quota left (429). Add billing/credit to the ${who} account — the key itself is fine.`;
  if (s === 429) return `${who} rate-limited the request (429). Try again in a moment.`;
  if (s === 403) return `${who} refused the request (403): ${m}`;
  if (s === 404) return `${who} does not recognise the model id (404): ${m}`;
  if (s === 400) return `${who} rejected the request (400): ${m}`;
  if (/abort/i.test(m)) return `${who} timed out.`;
  return `${who}: ${m}${e?.model ? ` [model: ${e.model}]` : ""}`;
}

/**
 * Ask the preferred engine. If it fails (bad key, quota, outage) and
 * `strict` is false, silently fall back to the other configured engines
 * so Jarvis keeps answering.
 */
export async function askAI(
  preferred: ProviderId | undefined,
  a: AskArgs,
  strict = false
): Promise<AskResult> {
  const have = availableProviders();
  if (!have.length) throw new Error("No AI key configured. Add ANTHROPIC_API_KEY to .env and restart.");
  const first: ProviderId = preferred && have.includes(preferred) ? preferred : defaultProvider();
  try {
    return await callOne(first, a);
  } catch (e: any) {
    if (strict) throw e;
    const reason = explainError(first, e);
    console.error("[jarvis] " + reason);          // full reason in the server terminal
    for (const p of have) {
      if (p === first) continue;
      try {
        const r = await callOne(p, a);
        return { ...r, fellBackFrom: first, fallbackReason: reason };
      } catch (e2: any) {
        console.error("[jarvis] " + explainError(p, e2));
      }
    }
    throw Object.assign(new Error(reason), { status: e?.status });
  }
}
