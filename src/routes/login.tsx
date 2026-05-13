import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Nav } from "@/components/Nav";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { verifyCaptcha } from "@/lib/captcha.functions";
import { Turnstile, TURNSTILE_ENABLED } from "@/components/Turnstile";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — TasteLedger" },
      { name: "description", content: "Sign in to your TasteLedger account." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const verify = useServerFn(verifyCaptcha);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        if (TURNSTILE_ENABLED && !captchaToken) {
          throw new Error("Please complete the captcha.");
        }
        if (TURNSTILE_ENABLED && captchaToken) {
          await verify({ data: { token: captchaToken } });
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { display_name: name || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Account created. You're signed in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back.");
      }
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream">
      <Nav />
      <div className="max-w-md mx-auto px-6 py-16">
        <h1 className="font-serif text-4xl text-forest">
          {mode === "signin" ? "Welcome back" : "Join the ledger"}
        </h1>
        <p className="mt-2 text-sm text-forest/70">
          {mode === "signin"
            ? "Sign in to write reviews and redeem rewards."
            : "Create a patron account to participate in the ledger."}
        </p>
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          {mode === "signup" && (
            <input
              className="w-full bg-card border border-forest/15 rounded-lg px-4 py-3 text-sm"
              placeholder="Display name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
          <input
            type="email"
            required
            autoComplete="email"
            className="w-full bg-card border border-forest/15 rounded-lg px-4 py-3 text-sm"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            className="w-full bg-card border border-forest/15 rounded-lg px-4 py-3 text-sm"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-forest text-cream rounded-full py-3 text-sm font-medium uppercase tracking-widest disabled:opacity-50"
          >
            {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
          {mode === "signup" && <Turnstile onToken={setCaptchaToken} />}
        </form>
        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-6 text-sm text-clay underline underline-offset-4"
        >
          {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
        <p className="mt-8 text-xs text-forest/50">
          By continuing you agree to the immutable nature of the ledger.{" "}
          <Link to="/" className="underline">Back to home</Link>
        </p>
      </div>
    </div>
  );
}