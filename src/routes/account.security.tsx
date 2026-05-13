import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Nav } from "@/components/Nav";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ShieldCheck, KeyRound, Trash2 } from "lucide-react";

export const Route = createFileRoute("/account/security")({
  head: () => ({ meta: [{ title: "Security — TasteLedger" }] }),
  component: SecurityPage,
});

type Factor = { id: string; status: string; friendly_name?: string | null };

function SecurityPage() {
  const { user, loading, roles } = useAuth();
  const isPrivileged = useMemo(
    () => roles.includes("admin") || roles.includes("restaurateur"),
    [roles],
  );
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [pending, setPending] = useState<{
    factorId: string;
    qr: string;
    secret: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    void refresh();
  }, [user]);

  async function refresh() {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      toast.error(error.message);
      return;
    }
    setFactors(data.totp.map((f) => ({ id: f.id, status: f.status, friendly_name: f.friendly_name })));
  }

  async function startEnroll() {
    setEnrolling(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
      });
      if (error) throw error;
      setPending({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start enrollment.");
    } finally {
      setEnrolling(false);
    }
  }

  async function confirmEnroll() {
    if (!pending) return;
    setBusy(true);
    try {
      const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({
        factorId: pending.factorId,
      });
      if (cErr) throw cErr;
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: pending.factorId,
        challengeId: challenge.id,
        code,
      });
      if (vErr) throw vErr;
      toast.success("MFA enabled.");
      setPending(null);
      setCode("");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  async function unenroll(factorId: string) {
    if (!confirm("Remove this authenticator?")) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) toast.error(error.message);
    else {
      toast.success("Authenticator removed.");
      await refresh();
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cream">
        <Nav />
        <div className="max-w-2xl mx-auto px-6 py-12">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-32 mt-6 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-cream">
        <Nav />
        <div className="max-w-md mx-auto px-6 py-24 text-center">
          <h1 className="font-serif text-3xl text-forest">Sign in required</h1>
          <Link
            to="/login"
            className="mt-4 inline-block bg-forest text-cream rounded-full px-6 py-2 text-sm"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  const verified = (factors ?? []).filter((f) => f.status === "verified");
  const unverified = (factors ?? []).filter((f) => f.status !== "verified");

  return (
    <div className="min-h-screen bg-cream">
      <Nav />
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-10 md:py-14">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-[0.3em] text-clay">Account security</p>
          <h1 className="font-serif text-4xl text-forest mt-2">Two-factor authentication</h1>
        </header>

        {isPrivileged && verified.length === 0 && (
          <aside
            role="alert"
            className="mb-6 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
          >
            <strong>Strongly recommended.</strong> Your account has elevated
            privileges (admin or restaurateur). Enable an authenticator below.
          </aside>
        )}

        <section className="rounded-2xl border border-forest/15 bg-card p-6">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-clay mt-1" />
            <div className="flex-1">
              <h2 className="font-serif text-xl text-forest">Authenticator app (TOTP)</h2>
              <p className="text-sm text-forest/70 mt-1">
                Use Google Authenticator, 1Password, Authy, or any TOTP-compatible app.
              </p>

              {factors === null ? (
                <Skeleton className="h-12 mt-4 rounded" />
              ) : verified.length > 0 ? (
                <ul className="mt-4 space-y-2">
                  {verified.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center justify-between border border-forest/10 rounded-lg px-4 py-3 bg-muted/40"
                    >
                      <div className="flex items-center gap-2 text-sm text-forest">
                        <KeyRound className="w-4 h-4 text-forest/60" />
                        {f.friendly_name ?? "Authenticator"}{" "}
                        <span className="text-xs text-forest/50">enabled</span>
                      </div>
                      <button
                        onClick={() => unenroll(f.id)}
                        className="text-xs text-destructive hover:underline flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" /> Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm italic text-forest/60">
                  No authenticator enrolled.
                </p>
              )}

              {unverified.length > 0 && !pending && (
                <p className="mt-3 text-xs text-forest/50">
                  Pending enrollments will be cleaned up automatically after 24 hours.
                </p>
              )}

              {!pending && (
                <button
                  onClick={startEnroll}
                  disabled={enrolling}
                  className="mt-4 bg-forest text-cream rounded-full px-5 py-2 text-xs uppercase tracking-widest disabled:opacity-50"
                >
                  {enrolling ? "Starting…" : "Add authenticator"}
                </button>
              )}
            </div>
          </div>
        </section>

        {pending && (
          <section className="mt-6 rounded-2xl border border-clay/40 bg-card p-6">
            <h3 className="font-serif text-lg text-forest">Scan and verify</h3>
            <p className="text-sm text-forest/70 mt-1">
              Scan this QR code with your authenticator app, then enter the 6-digit code.
            </p>
            <div
              className="mt-4 inline-block bg-white p-3 rounded"
              dangerouslySetInnerHTML={{ __html: pending.qr }}
            />
            <p className="mt-3 text-xs text-forest/60">
              Or paste this secret manually:{" "}
              <code className="font-mono text-forest">{pending.secret}</code>
            </p>
            <div className="mt-4 flex gap-2">
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className="bg-card border border-forest/15 rounded-lg px-4 py-2 text-sm w-32 font-mono tracking-widest"
              />
              <button
                onClick={confirmEnroll}
                disabled={busy || code.length !== 6}
                className="bg-clay text-cream rounded-full px-5 py-2 text-xs uppercase tracking-widest disabled:opacity-50"
              >
                {busy ? "Verifying…" : "Verify & enable"}
              </button>
              <button
                onClick={() => {
                  setPending(null);
                  setCode("");
                }}
                className="text-xs text-forest/60 underline"
              >
                Cancel
              </button>
            </div>
          </section>
        )}

        <p className="mt-8 text-xs text-forest/50">
          You will be prompted for your code on every new sign-in. Existing sessions stay valid.
        </p>
      </div>
    </div>
  );
}