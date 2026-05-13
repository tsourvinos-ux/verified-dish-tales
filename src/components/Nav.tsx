import { Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";

export function Nav() {
  const { user, roles, signOut } = useAuth();
  const navigate = useNavigate();
  const isAdmin = roles.includes("admin");

  return (
    <nav className="sticky top-0 z-50 bg-cream/85 backdrop-blur-md border-b border-forest/10 px-6 md:px-8 py-4 flex justify-between items-center">
      <Link to="/" className="font-serif italic text-2xl font-bold tracking-tight text-forest">
        TasteLedger.
      </Link>
      <div className="flex gap-3 md:gap-6 items-center text-xs md:text-sm font-medium uppercase tracking-widest">
        <Link to="/" className="text-forest hidden sm:inline" activeProps={{ className: "text-clay" }}>
          Explore
        </Link>
        {user ? (
          <>
            <Link to="/account" className="text-forest" activeProps={{ className: "text-clay" }}>
              Wallet
            </Link>
            {isAdmin && (
              <>
                <Link to="/admin" className="text-clay" activeProps={{ className: "underline underline-offset-4" }}>
                  Admin
                </Link>
                <Link to="/admin/moderation" className="text-clay/80 hidden sm:inline" activeProps={{ className: "underline underline-offset-4" }}>
                  Moderation
                </Link>
              </>
            )}
            <button
              onClick={async () => {
                await signOut();
                navigate({ to: "/" });
              }}
              className="text-forest/60 hover:text-forest"
            >
              Sign out
            </button>
          </>
        ) : (
          <Link to="/login" className="bg-forest text-cream px-4 md:px-5 py-2 rounded-full">
            Sign in
          </Link>
        )}
      </div>
    </nav>
  );
}