import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { mintRewardForUser } from "@/lib/ledger.functions";
import { Nav } from "@/components/Nav";
import { AccessDenied } from "@/components/AccessDenied";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — TasteLedger" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { user, roles, loading } = useAuth();
  const isAdmin = roles.includes("admin");
  const qc = useQueryClient();
  const mint = useServerFn(mintRewardForUser);

  const { data: businesses } = useQuery({
    queryKey: ["admin", "businesses"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("businesses")
        .select("id, name, slug")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: members } = useQuery({
    queryKey: ["admin", "members"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_profile_membership")
        .select("id, user_id, business_id");
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["admin", "profiles"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, is_verified")
        .order("display_name");
      if (error) throw error;
      return data;
    },
  });

  const [businessId, setBusinessId] = useState("");
  const [userId, setUserId] = useState("");
  const [memberBizId, setMemberBizId] = useState("");
  const [memberUserId, setMemberUserId] = useState("");
  const [rewardTitle, setRewardTitle] = useState("Complimentary aperitif");
  const [rewardDays, setRewardDays] = useState(30);
  const [rewardBiz, setRewardBiz] = useState("");
  const [rewardUser, setRewardUser] = useState("");

  if (loading) {
    return (
      <div className="min-h-screen bg-cream">
        <Nav />
        <div className="max-w-3xl mx-auto px-6 py-12">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-40 mt-6 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen bg-cream">
        <Nav />
        <AccessDenied message="This area is reserved for platform administrators." />
      </div>
    );
  }

  async function addMembership(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("business_profile_membership").insert({
      business_id: memberBizId,
      user_id: memberUserId,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Restaurateur linked to business.");
      qc.invalidateQueries({ queryKey: ["admin", "members"] });
    }
  }

  async function makeRestaurateur(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("user_roles").insert({
      user_id: userId,
      role: "restaurateur",
    });
    if (error) toast.error(error.message);
    else toast.success("Role granted.");
  }

  async function onMint(e: React.FormEvent) {
    e.preventDefault();
    try {
      await mint({
        data: {
          user_id: rewardUser,
          business_id: rewardBiz,
          title: rewardTitle,
          expiry_days: rewardDays,
        },
      });
      toast.success("Reward minted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not mint.");
    }
  }

  const inputCls =
    "w-full bg-cream border border-forest/15 rounded-lg px-3 py-2 text-sm";

  return (
    <div className="min-h-screen bg-cream">
      <Nav />
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-10">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-[0.3em] text-clay">Administration</p>
          <h1 className="font-serif text-4xl text-forest mt-2">Ledger console</h1>
        </header>

        <div className="grid md:grid-cols-2 gap-5">
          <Card title="Grant restaurateur role">
            <form onSubmit={makeRestaurateur} className="space-y-3">
              <select className={inputCls} value={userId} onChange={(e) => setUserId(e.target.value)} required>
                <option value="">Select user…</option>
                {profiles?.map((p) => (
                  <option key={p.id} value={p.id}>{p.display_name} ({p.id.slice(0, 8)})</option>
                ))}
              </select>
              <button className="bg-forest text-cream rounded-full px-4 py-2 text-xs uppercase tracking-widest">
                Grant role
              </button>
            </form>
          </Card>

          <Card title="Link restaurateur to business">
            <form onSubmit={addMembership} className="space-y-3">
              <select className={inputCls} value={memberUserId} onChange={(e) => setMemberUserId(e.target.value)} required>
                <option value="">Select user…</option>
                {profiles?.map((p) => (
                  <option key={p.id} value={p.id}>{p.display_name}</option>
                ))}
              </select>
              <select className={inputCls} value={memberBizId} onChange={(e) => setMemberBizId(e.target.value)} required>
                <option value="">Select business…</option>
                {businesses?.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <button className="bg-forest text-cream rounded-full px-4 py-2 text-xs uppercase tracking-widest">
                Create link
              </button>
            </form>
          </Card>

          <Card title="Mint verified reward" className="md:col-span-2">
            <form onSubmit={onMint} className="grid md:grid-cols-2 gap-3">
              <select className={inputCls} value={rewardUser} onChange={(e) => setRewardUser(e.target.value)} required>
                <option value="">Patron…</option>
                {profiles?.map((p) => (
                  <option key={p.id} value={p.id}>{p.display_name}</option>
                ))}
              </select>
              <select className={inputCls} value={rewardBiz} onChange={(e) => setRewardBiz(e.target.value)} required>
                <option value="">Business…</option>
                {businesses?.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <input
                className={inputCls}
                value={rewardTitle}
                onChange={(e) => setRewardTitle(e.target.value)}
                placeholder="Title"
                required
              />
              <input
                className={inputCls}
                type="number"
                min={1}
                max={365}
                value={rewardDays}
                onChange={(e) => setRewardDays(parseInt(e.target.value, 10))}
                placeholder="Expires in N days"
                required
              />
              <button className="md:col-span-2 bg-clay text-cream rounded-full px-4 py-2 text-xs uppercase tracking-widest">
                Mint reward
              </button>
            </form>
          </Card>

          <Card title="Existing restaurateur memberships" className="md:col-span-2">
            {!members?.length ? (
              <p className="text-sm text-forest/60 italic">No memberships yet.</p>
            ) : (
              <ul className="text-xs font-mono space-y-1">
                {members.map((m) => {
                  const biz = businesses?.find((b) => b.id === m.business_id);
                  const prof = profiles?.find((p) => p.id === m.user_id);
                  return (
                    <li key={m.id} className="flex justify-between border-b border-forest/10 py-1">
                      <span>{prof?.display_name ?? m.user_id.slice(0, 8)}</span>
                      <span className="text-clay">{biz?.name ?? m.business_id.slice(0, 8)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-forest/15 bg-card p-5 ${className}`}>
      <h3 className="font-serif text-lg text-forest mb-3">{title}</h3>
      {children}
    </div>
  );
}