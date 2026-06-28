import { NextRequest } from "next/server";
import { runInvestmentAgent } from "@/lib/agent";

// Vercel max function duration — 2 minutes for the multi-step AI pipeline
export const maxDuration = 120;

/**
 * POST /api/research
 *
 * Accepts a JSON body: { companyName: string }
 * Returns a Server-Sent Events (SSE) stream with three event types:
 *   - { type: "progress", step: string }  — one per LangGraph node as it completes
 *   - { type: "complete", result: AgentStateType } — final aggregated report
 *   - { type: "error", message: string }  — if anything fails
 *
 * WHY SSE?
 * The LangGraph pipeline takes 30-60 seconds (9 sequential LLM calls).
 * SSE lets us stream each step completion in real-time so the user sees
 * progress instead of a blank spinner. Much better UX than polling.
 */
export async function POST(req: NextRequest) {
  // ── Input validation ──────────────────────────────────────────────────────
  let companyName: string;
  try {
    const body = await req.json();
    companyName = (body.companyName ?? "").toString().trim();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!companyName) {
    return new Response(
      JSON.stringify({ error: "Company name is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (companyName.length > 100) {
    return new Response(
      JSON.stringify({ error: "Company name must be under 100 characters" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── API key check ─────────────────────────────────────────────────────────
  if (!process.env.GOOGLE_API_KEY) {
    return new Response(
      JSON.stringify({
        error:
          "GOOGLE_API_KEY not configured. Add it to .env.local — get a free key at aistudio.google.com/app/apikey",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();

  // ── SSE Stream ────────────────────────────────────────────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      // Helper: sends a JSON-encoded SSE data line
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send({ type: "start", message: `Starting research on ${companyName}…` });

        /**
         * FIX: We previously called runInvestmentAgent() TWICE:
         *   1. Once with onProgress to stream steps
         *   2. Again without callback to get final result
         * This doubled API cost and latency. 
         * 
         * SOLUTION: runInvestmentAgent now returns the final state after the
         * streaming loop completes. We capture it here in a single run.
         */
        const finalResult = await runInvestmentAgent(
          companyName,
          (step: string) => {
            send({ type: "progress", step });
          }
        );

        send({ type: "complete", result: finalResult });
      } catch (error: unknown) {
        const errMsg =
          error instanceof Error ? error.message : "Unknown error occurred";
        send({ type: "error", message: errMsg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Prevent Vercel/nginx from buffering the SSE stream
      "X-Accel-Buffering": "no",
    },
  });
}
