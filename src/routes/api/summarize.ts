import { createFileRoute } from "@tanstack/react-router";

// @business-logic: Streams an AI summary of a business's ledger via Lovable AI Gateway.
// SSE-style chunked response; the UI uses an AbortController to support a Stop button.
export const Route = createFileRoute("/api/summarize")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        let body: { reviews?: { rating: number; content: string }[]; name?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const reviews = (body.reviews ?? []).slice(0, 40);
        if (reviews.length === 0) {
          return new Response("No reviews to summarize.", {
            status: 200,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
        const prompt = `Summarize the patron sentiment for "${body.name ?? "this restaurant"}" based on these verified reviews. Keep it under 120 words. Note common praise, common complaints, and standout dishes. Be candid, no marketing fluff.\n\n${reviews
          .map((r, i) => `Review ${i + 1} (${r.rating}/5): ${r.content}`)
          .join("\n\n")}`;

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            stream: true,
            messages: [
              { role: "system", content: "You are a concise, fair restaurant critic." },
              { role: "user", content: prompt },
            ],
          }),
        });

        if (!upstream.ok || !upstream.body) {
          const txt = await upstream.text().catch(() => "");
          return new Response(`Upstream error: ${upstream.status} ${txt}`, { status: 502 });
        }

        // Token-by-token plain-text stream extracted from OpenAI SSE chunks.
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const reader = upstream.body!.getReader();
            let buf = "";
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                const lines = buf.split("\n");
                buf = lines.pop() ?? "";
                for (const line of lines) {
                  const t = line.trim();
                  if (!t.startsWith("data:")) continue;
                  const payload = t.slice(5).trim();
                  if (payload === "[DONE]") {
                    controller.close();
                    return;
                  }
                  try {
                    const j = JSON.parse(payload);
                    const delta = j.choices?.[0]?.delta?.content;
                    if (delta) controller.enqueue(encoder.encode(delta));
                  } catch {
                    // ignore parse blips
                  }
                }
              }
              controller.close();
            } catch (err) {
              controller.error(err);
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});