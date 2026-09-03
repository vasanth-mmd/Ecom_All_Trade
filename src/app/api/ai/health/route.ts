import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { askAI, keyFor, PROVIDER_LABEL, defaultProvider, explainError, type ProviderId } from "@/lib/ai-providers";

export const runtime = "nodejs";
export const maxDuration = 60;

/* Connection tester.
   Open http://localhost:3000/api/ai/health while logged in.
   It sends a one-word question to every engine that has a key in .env
   and reports whether the connection works. */

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const ids: ProviderId[] = ["anthropic", "openai", "gemini"];
  const results = await Promise.all(
    ids.map(async (p) => {
      const key = keyFor(p);
      if (!key)
        return { engine: PROVIDER_LABEL[p], provider: p, keyInEnv: false, connected: false,
                 detail: "No key found in .env" };
      const t0 = Date.now();
      try {
        // strict = true: test THIS engine only, no falling back to another one
        const r = await askAI(p, {
          system: "Reply with exactly one word: OK",
          messages: [{ role: "user", content: "ping" }],
          maxTokens: 16,
          timeoutMs: 25_000,
        }, true);
        return {
          engine: PROVIDER_LABEL[p], provider: p, keyInEnv: true, connected: true,
          model: r.model, ms: Date.now() - t0, reply: r.text.slice(0, 40),
        };
      } catch (e: any) {
        return {
          engine: PROVIDER_LABEL[p], provider: p, keyInEnv: true, connected: false,
          ms: Date.now() - t0, detail: e?.message || "Unknown error",
        };
      }
    })
  );

  return NextResponse.json({
    defaultEngine: PROVIDER_LABEL[defaultProvider()],
    results,
    hint: "connected:false with an auth/quota message means the key is wrong or has no credit. Restart the server after editing .env.",
  });
}
