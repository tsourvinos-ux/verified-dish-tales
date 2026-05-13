import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { submitReview, submitOwnerResponse } from "@/lib/ledger.functions";
import { getBusinessLedger, type LedgerEntry } from "@/lib/ledger-read.functions";
import { reviewFormSchema, responseFormSchema } from "@/lib/schemas";
import { Nav } from "@/components/Nav";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Star, ShieldCheck, Sparkles, Square } from "lucide-react";

export const Route = createFileRoute("/restaurants/$slug")({
  loader: async ({ params }) => {
    const { data, error } = await supabase
      .from("businesses")
      .select("*")
      .eq("slug", params.slug)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.name ?? "Restaurant"} — TasteLedger` },
      {
        name: "description",
        content: loaderData?.description ?? "Verified review ledger.",
      },
      ...(loaderData?.cover_url
        ? [{ property: "og:image" as const, content: loaderData.cover_url }]
        : []),
    ],
  }),
  component: RestaurantPage,
  notFoundComponent: () => (
    <div className="min-h-screen bg-cream">
      <Nav />
      <div className="max-w-md mx-auto text-center px-6 py-24">
        <h1 className="font-serif text-3xl text-forest">Restaurant not found</h1>
        <Link to="/" className="mt-4 inline-block text-clay underline">Browse the ledger</Link>
      </div>
    </div>
  ),
});

type Review = LedgerEntry;

function RestaurantPage() {
  const business = Route.useLoaderData();
  const { user, memberships } = useAuth();
  const queryClient = useQueryClient();
  const isOwner = memberships.includes(business.id);
  const fetchLedger = useServerFn(getBusinessLedger);

  const reviewsKey = ["reviews", business.id] as const;
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: reviewsKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      fetchLedger({ data: { business_id: business.id, cursor: pageParam } }),
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 30_000,
  });

  // Newest-first server response → oldest-first display so the conversation reads top-down.
  const reviews: Review[] = (data?.pages.flatMap((p) => p.items) ?? []).slice().reverse();

  // Intersection-observer sentinel for infinite scroll (loads OLDER entries).
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sentinelRef.current || !hasNextPage) return;
    const el = sentinelRef.current;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) {
        void fetchNextPage();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="min-h-screen bg-cream">
      <Nav />
      <article className="max-w-2xl mx-auto px-4 md:px-6 py-8 md:py-12">
        <RestaurantHeader business={business} />
        <AISummaryPanel business={business} reviews={reviews ?? []} />
        <div className="mt-10 mb-6 flex items-baseline justify-between border-b border-forest/15 pb-2">
          <h2 className="font-serif text-2xl text-forest">The ledger</h2>
          <span className="text-xs uppercase tracking-widest text-forest/50">
            {reviews?.length ?? 0} entries
          </span>
        </div>
        {isLoading ? (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        ) : reviews && reviews.length > 0 ? (
          <>
            {hasNextPage && (
              <div ref={sentinelRef} className="flex justify-center py-2">
                <button
                  onClick={() => void fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="text-xs uppercase tracking-widest text-clay disabled:opacity-50"
                >
                  {isFetchingNextPage ? "Loading older…" : "Load older entries"}
                </button>
              </div>
            )}
            <ul className="space-y-6">
              {reviews.map((r) => (
                <div key={r.id} id={`review-${r.id.slice(0, 8)}`}>
                  <LedgerEntry
                    review={r}
                    businessId={business.id}
                    canRespond={isOwner}
                    onResponded={() => queryClient.invalidateQueries({ queryKey: reviewsKey })}
                  />
                </div>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-forest/60 italic">
            The ledger is empty. Be the first to write the record.
          </p>
        )}
        <div className="mt-12">
          {user ? (
            <ReviewComposer
              businessId={business.id}
              onPosted={() => queryClient.invalidateQueries({ queryKey: reviewsKey })}
            />
          ) : (
            <div className="rounded-2xl border border-forest/15 bg-card p-6 text-center">
              <p className="text-sm text-forest/70">
                <Link to="/login" className="text-clay underline">
                  Sign in
                </Link>{" "}
                to add a verified review to this ledger.
              </p>
            </div>
          )}
        </div>
      </article>
    </div>
  );
}

function RestaurantHeader({ business }: { business: ReturnType<typeof Route.useLoaderData> }) {
  return (
    <header className="rounded-2xl overflow-hidden border border-forest/10 bg-card mb-8">
      {business.cover_url && (
        <div className="aspect-[16/9] bg-muted overflow-hidden">
          <img src={business.cover_url} alt={business.name} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="p-6">
        <p className="text-xs uppercase tracking-[0.25em] text-clay">
          {business.cuisine} · {business.neighborhood}
        </p>
        <h1 className="font-serif text-4xl md:text-5xl text-forest mt-2">{business.name}</h1>
        <p className="mt-3 text-sm text-forest/70 leading-relaxed">{business.description}</p>
        <p className="mt-3 text-xs uppercase tracking-widest text-forest/50">
          Established {business.established}
        </p>
      </div>
    </header>
  );
}

function LedgerEntry({
  review,
  businessId,
  canRespond,
  onResponded,
}: {
  review: Review;
  businessId: string;
  canRespond: boolean;
  onResponded: () => void;
}) {
  return (
    <li className="space-y-3">
      {/* Patron review: right-aligned, branded */}
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-forest text-cream p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest opacity-80">
            <span>{review.profile?.display_name ?? "Patron"}</span>
            {review.profile?.is_verified && <ShieldCheck className="w-3.5 h-3.5 text-clay" />}
            <span className="opacity-60">· {timeAgo(review.created_at)}</span>
          </div>
          <div className="flex gap-0.5 mt-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={`w-3.5 h-3.5 ${i < review.rating ? "fill-clay text-clay" : "text-cream/30"}`}
              />
            ))}
          </div>
          <p className="font-serif text-base leading-relaxed mt-2 whitespace-pre-wrap">
            {review.content}
          </p>
        </div>
      </div>
      {/* Owner response: left-aligned, gray */}
      {review.response ? (
        <div className="flex justify-start">
          <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-muted text-forest p-4 border border-forest/10">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-forest/70">
              <span className="font-semibold">{review.response.author?.display_name ?? "Owner"}</span>
              <span className="bg-clay text-cream px-1.5 py-0.5 rounded text-[10px]">Verified</span>
              <span className="opacity-60">· {timeAgo(review.response.created_at)}</span>
            </div>
            <p className="text-sm leading-relaxed mt-2 whitespace-pre-wrap">{review.response.content}</p>
          </div>
        </div>
      ) : (
        canRespond && (
          <ResponseComposer
            reviewId={review.id}
            businessId={businessId}
            onPosted={onResponded}
          />
        )
      )}
    </li>
  );
}

function ReviewComposer({ businessId, onPosted }: { businessId: string; onPosted: () => void }) {
  const submit = useServerFn(submitReview);
  const [content, setContent] = useState("");
  const [rating, setRating] = useState(5);
  const [busy, setBusy] = useState(false);

  const parsed = reviewFormSchema.safeParse({ rating, content });
  const valid = parsed.success;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        setBusy(true);
        try {
          await submit({ data: { business_id: businessId, rating, content } });
          toast.success(rating === 5 ? "Review posted. A reward was minted to your wallet." : "Review posted to the ledger.");
          setContent("");
          onPosted();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not post review.");
        } finally {
          setBusy(false);
        }
      }}
      className="rounded-2xl border border-forest/15 bg-card p-5"
    >
      <p className="text-xs uppercase tracking-widest text-clay">Add to the ledger</p>
      <p className="text-[11px] text-forest/60 mt-1">
        Reviews are immutable. Once written they cannot be edited or deleted.
      </p>
      <div className="flex gap-1 mt-3">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            type="button"
            key={n}
            onClick={() => setRating(n)}
            className="p-1"
            aria-label={`${n} stars`}
          >
            <Star
              className={`w-6 h-6 ${n <= rating ? "fill-clay text-clay" : "text-forest/20"}`}
            />
          </button>
        ))}
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="What did you eat? How was the service? Be specific."
        rows={4}
        className="mt-3 w-full bg-cream border border-forest/15 rounded-lg p-3 text-sm font-serif resize-none"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className={`text-xs ${content.length > 1000 ? "text-destructive" : "text-forest/50"}`}>
          {content.length}/1000 (min 10)
        </span>
        <button
          type="submit"
          disabled={!valid || busy}
          className="bg-forest text-cream px-5 py-2 rounded-full text-xs uppercase tracking-widest disabled:opacity-40"
        >
          {busy ? "Sealing…" : "Seal on ledger"}
        </button>
      </div>
    </form>
  );
}

function ResponseComposer({
  reviewId,
  businessId,
  onPosted,
}: {
  reviewId: string;
  businessId: string;
  onPosted: () => void;
}) {
  const submit = useServerFn(submitOwnerResponse);
  const [content, setContent] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const valid = responseFormSchema.safeParse({ content }).success;

  if (!open) {
    return (
      <div className="flex justify-start">
        <button
          onClick={() => setOpen(true)}
          className="text-xs text-clay underline underline-offset-4 ml-1"
        >
          Respond as the restaurant
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        setBusy(true);
        try {
          await submit({ data: { review_id: reviewId, business_id: businessId, content } });
          toast.success("Response sealed.");
          setContent("");
          setOpen(false);
          onPosted();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not post response.");
        } finally {
          setBusy(false);
        }
      }}
      className="flex justify-start"
    >
      <div className="max-w-[85%] w-full rounded-2xl bg-muted border border-forest/15 p-3">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="A measured, sincere response (10–500 chars). Permanent."
          rows={3}
          className="w-full bg-cream border border-forest/10 rounded p-2 text-sm resize-none"
        />
        <div className="flex items-center justify-between mt-2">
          <span className={`text-[11px] ${content.length > 500 ? "text-destructive" : "text-forest/50"}`}>
            {content.length}/500
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-forest/60 px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!valid || busy}
              className="bg-clay text-cream px-4 py-1.5 rounded-full text-xs uppercase tracking-widest disabled:opacity-40"
            >
              {busy ? "Sealing…" : "Seal response"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

function AISummaryPanel({
  business,
  reviews,
}: {
  business: { id: string; name: string };
  reviews: Review[];
}) {
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [locale, setLocale] = useState<string>("en");
  const abortRef = useRef<AbortController | null>(null);
  const { session } = useAuth();

  async function run() {
    if (streaming) return;
    if (!session) {
      toast.error("Sign in to generate a summary.");
      return;
    }
    setText("");
    setStreaming(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ business_id: business.id, locale }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.text().catch(() => "");
        throw new Error(err || `Status ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setText((t) => t + decoder.decode(value, { stream: true }));
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        toast.error("Could not summarize the ledger.");
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  if (reviews.length === 0) return null;

  return (
    <div className="rounded-2xl border border-clay/30 bg-clay/5 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-clay" />
          <h3 className="font-serif text-lg text-forest">Ledger summary</h3>
        </div>
        <div className="flex items-center gap-2">
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value)}
          disabled={streaming}
          aria-label="Summary language"
          className="text-[11px] uppercase tracking-widest bg-card border border-forest/15 rounded-full px-2 py-1 text-forest/70"
        >
          <option value="en">EN</option>
          <option value="es">ES</option>
          <option value="fr">FR</option>
          <option value="de">DE</option>
          <option value="it">IT</option>
          <option value="pt">PT</option>
          <option value="zh">ZH</option>
          <option value="ja">JA</option>
        </select>
        {streaming ? (
          <button
            onClick={stop}
            className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-clay"
          >
            <Square className="w-3 h-3 fill-clay" /> Stop
          </button>
        ) : session ? (
          <button
            onClick={run}
            className="text-xs uppercase tracking-widest bg-forest text-cream px-3 py-1.5 rounded-full"
          >
            {text ? "Regenerate" : "Generate"}
          </button>
        ) : (
          <span className="text-[11px] uppercase tracking-widest text-forest/50">
            Sign in to generate
          </span>
        )}
        </div>
      </div>
      {text ? (
        <p className="mt-3 text-sm text-forest/85 leading-relaxed whitespace-pre-wrap">
          {renderWithCitations(text, reviews)}
          {streaming && <span className="inline-block w-2 h-3 bg-clay align-middle ml-0.5 animate-pulse" />}
        </p>
      ) : (
        <p className="mt-3 text-xs text-forest/55 italic">
          A streamed AI synthesis of {reviews.length} verified review{reviews.length === 1 ? "" : "s"}.
        </p>
      )}
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

// @complexity-explanation: Replace [#abcd1234] markers in the streamed summary
// with anchor links to the source review element. Falls back to plain text if
// the cited id doesn't match any visible review (e.g. mid-stream truncation).
function renderWithCitations(text: string, reviews: Review[]): React.ReactNode[] {
  const ids = new Set(reviews.map((r) => r.id.slice(0, 8)));
  const parts: React.ReactNode[] = [];
  const re = /\[#([a-f0-9]{8})\]/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  let counter = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const short = m[1].toLowerCase();
    if (ids.has(short)) {
      parts.push(
        <a
          key={`cite-${counter++}`}
          href={`#review-${short}`}
          className="text-clay underline underline-offset-2 hover:text-forest"
          aria-label={`Source review ${short}`}
        >
          [src]
        </a>,
      );
    } else {
      parts.push(m[0]);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}