import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Nav } from "@/components/Nav";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TasteLedger — Verified Dining Reviews" },
      {
        name: "description",
        content:
          "An immutable, zero-trust review ledger for restaurants. Every patron review and owner response is permanent and verifiable.",
      },
      { property: "og:title", content: "TasteLedger — Verified Dining Reviews" },
      {
        property: "og:description",
        content: "An immutable ledger of verified restaurant reviews and responses.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { data: restaurants, isLoading } = useQuery({
    queryKey: ["restaurants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("businesses")
        .select("id, slug, name, cuisine, neighborhood, established, description, cover_url")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="min-h-screen bg-cream text-forest">
      <Nav />
      <header className="px-6 md:px-12 pt-16 pb-12 md:pt-24 md:pb-20 max-w-5xl mx-auto">
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-clay">
          The verified dining ledger
        </p>
        <h1 className="font-serif text-5xl md:text-7xl leading-[1.05] mt-4 text-forest">
          Reviews you can <em className="not-italic underline decoration-clay decoration-2 underline-offset-[6px]">trust</em>,
          permanently bound to the restaurants that earn them.
        </h1>
        <p className="mt-6 max-w-xl text-base md:text-lg text-forest/70 leading-relaxed">
          TasteLedger is an immutable record of patron reviews and verified owner responses.
          Once written, nothing is altered, deleted, or quietly buried.
        </p>
      </header>

      <section className="px-6 md:px-12 max-w-5xl mx-auto pb-24">
        <div className="flex items-baseline justify-between border-b border-forest/15 pb-3 mb-8">
          <h2 className="font-serif text-2xl">Featured ledgers</h2>
          <span className="text-xs uppercase tracking-widest text-forest/50">
            {restaurants?.length ?? "—"} restaurants
          </span>
        </div>
        {isLoading ? (
          <div className="grid md:grid-cols-2 gap-6">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-64 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {restaurants?.map((r) => (
              <Link
                key={r.id}
                to="/restaurants/$slug"
                params={{ slug: r.slug }}
                className="group rounded-2xl overflow-hidden bg-card border border-forest/10 hover:shadow-xl hover:-translate-y-0.5 transition-all"
              >
                <div className="aspect-[16/10] overflow-hidden bg-muted">
                  {r.cover_url && (
                    <img
                      src={r.cover_url}
                      alt={r.name}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                  )}
                </div>
                <div className="p-6">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-serif text-2xl">{r.name}</h3>
                    <span className="text-xs uppercase tracking-widest text-clay shrink-0">
                      Est. {r.established}
                    </span>
                  </div>
                  <p className="text-xs uppercase tracking-widest text-forest/50 mt-1">
                    {r.cuisine} · {r.neighborhood}
                  </p>
                  <p className="mt-3 text-sm text-forest/75 leading-relaxed line-clamp-2">
                    {r.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
