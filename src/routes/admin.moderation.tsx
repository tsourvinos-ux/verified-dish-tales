import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { Nav } from "@/components/Nav";
import { AccessDenied } from "@/components/AccessDenied";
import { Skeleton } from "@/components/ui/skeleton";
import { listModerationQueue, setVisibility } from "@/lib/ledger-read.functions";
import { toast } from "sonner";
import { ShieldOff, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/admin/moderation")({
  head: () => ({ meta: [{ title: "Moderation — TasteLedger" }] }),
  component: ModerationPage,
});

function ModerationPage() {
  const { user, roles, loading } = useAuth();
  const isAdmin = roles.includes("admin");
  const qc = useQueryClient();
  const fetchQueue = useServerFn(listModerationQueue);
  const toggle = useServerFn(setVisibility);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "moderation-queue"],
    enabled: isAdmin,
    queryFn: () => fetchQueue(),
  });

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
        <AccessDenied message="Moderation tools are reserved for administrators." />
      </div>
    );
  }

  async function setVis(
    table: "reviews" | "owner_responses",
    id: string,
    visible: boolean,
  ) {
    try {
      await toggle({ data: { target_table: table, target_id: id, is_visible: visible } });
      toast.success(visible ? "Restored to ledger." : "Hidden from ledger.");
      qc.invalidateQueries({ queryKey: ["admin", "moderation-queue"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed.");
    }
  }

  return (
    <div className="min-h-screen bg-cream">
      <Nav />
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-10">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-[0.3em] text-clay">Moderation</p>
          <h1 className="font-serif text-4xl text-forest mt-2">Hidden ledger entries</h1>
          <p className="text-sm text-forest/60 mt-2">
            Content is immutable. You can only toggle visibility — the original text is preserved on the ledger.
          </p>
        </header>

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
        ) : (
          <div className="space-y-8">
            <Section title={`Hidden reviews (${data?.hiddenReviews.length ?? 0})`}>
              {!data?.hiddenReviews.length ? (
                <Empty />
              ) : (
                data.hiddenReviews.map((r) => (
                  <Card
                    key={r.id}
                    body={r.content}
                    reason={r.moderation_reason}
                    createdAt={r.created_at}
                    onShow={() => setVis("reviews", r.id, true)}
                    onHide={() => setVis("reviews", r.id, false)}
                    visible={false}
                    badge={`★ ${r.rating}`}
                  />
                ))
              )}
            </Section>
            <Section title={`Hidden owner responses (${data?.hiddenResponses.length ?? 0})`}>
              {!data?.hiddenResponses.length ? (
                <Empty />
              ) : (
                data.hiddenResponses.map((r) => (
                  <Card
                    key={r.id}
                    body={r.content}
                    reason={r.moderation_reason}
                    createdAt={r.created_at}
                    onShow={() => setVis("owner_responses", r.id, true)}
                    onHide={() => setVis("owner_responses", r.id, false)}
                    visible={false}
                  />
                ))
              )}
            </Section>
            <Section title={`Recent flags (${data?.flags.length ?? 0})`}>
              {!data?.flags.length ? (
                <Empty />
              ) : (
                <ul className="text-xs font-mono space-y-1">
                  {data.flags.map((f) => (
                    <li key={f.id} className="flex justify-between border-b border-forest/10 py-1">
                      <span>{f.target_table} · {f.target_id.slice(0, 8)}</span>
                      <span className="text-clay">{f.severity} · {f.reason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-serif text-xl text-forest mb-3 border-b border-forest/15 pb-2">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Empty() {
  return <p className="text-sm text-forest/50 italic">Nothing here.</p>;
}

function Card({
  body,
  reason,
  createdAt,
  onShow,
  onHide,
  visible,
  badge,
}: {
  body: string;
  reason: string | null;
  createdAt: string;
  onShow: () => void;
  onHide: () => void;
  visible: boolean;
  badge?: string;
}) {
  return (
    <div className="rounded-2xl border border-forest/15 bg-card p-4">
      <div className="flex items-center justify-between text-xs uppercase tracking-widest text-forest/60">
        <span>{new Date(createdAt).toLocaleString()}{badge ? ` · ${badge}` : ""}</span>
        {reason && <span className="text-clay normal-case tracking-normal">{reason}</span>}
      </div>
      <p className="mt-2 text-sm text-forest whitespace-pre-wrap font-serif">{body}</p>
      <div className="mt-3 flex gap-2 justify-end">
        {visible ? (
          <button
            onClick={onHide}
            className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-destructive border border-destructive/40 rounded-full px-3 py-1.5"
          >
            <ShieldOff className="w-3.5 h-3.5" /> Hide
          </button>
        ) : (
          <button
            onClick={onShow}
            className="flex items-center gap-1.5 text-xs uppercase tracking-widest bg-forest text-cream rounded-full px-3 py-1.5"
          >
            <ShieldCheck className="w-3.5 h-3.5" /> Restore
          </button>
        )}
      </div>
    </div>
  );
}