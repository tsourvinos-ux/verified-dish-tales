import { Link } from "@tanstack/react-router";

export function AccessDenied({ message = "You do not have access to this page." }: { message?: string }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h2 className="font-serif text-3xl text-forest">Access denied</h2>
        <p className="mt-2 text-sm text-forest/70">{message}</p>
        <Link to="/" className="mt-6 inline-block bg-forest text-cream px-5 py-2 rounded-full text-sm">
          Return home
        </Link>
      </div>
    </div>
  );
}