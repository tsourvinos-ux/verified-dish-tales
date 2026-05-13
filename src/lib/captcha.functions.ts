import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// @business-logic: Server-side verification of a Cloudflare Turnstile token.
// Called from the signup form before `supabase.auth.signUp`. Fails CLOSED:
// if `TURNSTILE_SECRET_KEY` is configured and the verification request fails,
// signup is denied. If the secret is NOT configured (local dev) the check
// is a no-op so the dev loop is unaffected.
export const verifyCaptcha = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().min(1).max(2048) }).parse(input),
  )
  .handler(async ({ data }) => {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) {
      // Dev / preview without Turnstile configured.
      return { ok: true, dev: true };
    }
    const form = new URLSearchParams();
    form.set("secret", secret);
    form.set("response", data.token);
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body: form },
    );
    if (!res.ok) {
      throw new Error("Captcha verification unavailable. Please try again.");
    }
    const json = (await res.json()) as { success: boolean; "error-codes"?: string[] };
    if (!json.success) {
      throw new Error("Captcha failed. Please try again.");
    }
    return { ok: true, dev: false };
  });