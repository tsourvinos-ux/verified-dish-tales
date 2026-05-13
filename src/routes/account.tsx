import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { redeemReward } from "@/lib/ledger.functions";
import { Nav } from "@/components/Nav";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ShieldCheck, Ticket } from "lucide-react";

export const Route = createFileRoute("/account")({
  head: () => ({ meta: [{ title: "Wallet — TasteLedger" }] }),
  component: AccountPage,
});

type Reward = {
  id: string;
  title: string;
  code: string;
  expiry_date: string;
  used_at: string | null;
  created_at: string;
  business_id: string;
  business?: { name: string; slug: string } | null;
};

function AccountPage() {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const redeem = useServerFn(redeemReward);

  const { data: rewards, isLoading } = useQuery({
    queryKey: ["rewards", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Reward[]> => {
      const { data, error } = await supabase
        .from("verified_rewards")
        .select("id, title, code, expiry_date, used_at, created_at, business_id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = Array.from(new Set(data.map((r) => r.business_id)));
      const { data: biz } = ids.length
        ? await supabase.from("businesses").select("id, name, slug").in("id", ids)
        : { data: [] as { id: string; name: string; slug: string }[] };
      const map = new Map((biz ?? []).map((b) => [b.id, b]));
      return data.map((r) => ({ ...r, business: map.get(r.business_id) ?? null }));
    },
  });

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
          <Link to="/login" className="mt-4 inline-block bg-forest text-cream rounded-full px-6 py-2 text-sm">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  const now = Date.now();
  const active = (rewards ?? []).filter(
    (r) => !r.used_at && new Date(r.expiry_date).getTime() > now
  );
  const inactive = (rewards ?? []).filter(
    (r) => r.used_at || new Date(r.expiry_date).getTime() <= now
  );

  async function onRedeem(id: string) {
    try {
      await redeem({ data: { reward_id: id } });
      toast.success("Reward redeemed. Show this screen at the restaurant.");
      qc.invalidateQueries({ queryKey: ["rewards", user!.id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not redeem.");
    }
  }

  return (
    <div className="min-h-screen bg-cream">
      <Nav />
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-10 md:py-14">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-[0.3em] text-clay">Verified rewards wallet</p>
          <h1 className="font-serif text-4xl text-forest mt-2">My ledger</h1>
        </header>

        <section>
          <h2 className="font-serif text-xl text-forest mb-4">Active</h2>
          {isLoading ? (
            <Skeleton className="h-40 rounded-2xl" />
          ) : active.length === 0 ? (
            <p className="text-sm text-forest/60 italic">
              No active rewards yet. Post a 5-star review to earn one.
            </p>
          ) : (
            <ul className="space-y-4">
              {active.map((r) => (
                <RewardCard key={r.id} reward={r} onRedeem={() => onRedeem(r.id)} />
              ))}
            </ul>
          )}
        </section>

        {inactive.length > 0 && (
          <section className="mt-12">
            <h2 className="font-serif text-xl text-forest/70 mb-4">Used &amp; expired</h2>
            <ul className="space-y-3">
              {inactive.map((r) => (
                <RewardCard key={r.id} reward={r} onRedeem={() => {}} disabled />
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function RewardCard({
  reward,
  onRedeem,
  disabled,
}: {
  reward: Reward;
  onRedeem: () => void;
  disabled?: boolean;
}) {
  const used = !!reward.used_at;
  const expired = !used && new Date(reward.expiry_date).getTime() <= Date.now();
  const status = used ? "Redeemed" : expired ? "Expired" : "Active";

  return (
    <li
      className={`rounded-2xl border p-5 relative overflow-hidden ${
        disabled
          ? "border-forest/10 bg-muted text-forest/60"
          : "border-clay/30 bg-card shadow-sm"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Ticket className="w-4 h-4 text-clay" />
            <p className="text-xs uppercase tracking-widest text-clay">
              {reward.business?.name ?? "Restaurant"}
            </p>
          </div>
          <h3 className="font-serif text-2xl text-forest mt-1">{reward.title}</h3>
          <p className="text-xs text-forest/60 mt-1">
            Expires {new Date(reward.expiry_date).toLocaleDateString()}
          </p>
        </div>
        <span
          className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded ${
            used
              ? "bg-forest/10 text-forest/60"
              : expired
                ? "bg-destructive/10 text-destructive"
                : "bg-forest text-cream"
          }`}
        >
          {status}
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-dashed border-forest/20 pt-3">
        <code className="font-mono text-sm tracking-widest text-forest">{reward.code}</code>
        {!disabled && !used && !expired && (
          <button
            onClick={onRedeem}
            className="bg-clay text-cream px-4 py-1.5 rounded-full text-xs uppercase tracking-widest"
          >
            <ShieldCheck className="inline w-3 h-3 mr-1" /> Redeem
          </button>
        )}
      </div>
    </li>
  );
}