import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Cursor: base64("<created_at_iso>|<id>"). Returns rows strictly OLDER than cursor.
function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, "utf8").toString("base64url");
}
function decodeCursor(c: string): { createdAt: string; id: string } | null {
  try {
    const raw = Buffer.from(c, "base64url").toString("utf8");
    const [createdAt, id] = raw.split("|");
    if (!createdAt || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

const PAGE_SIZE = 20;

export type LedgerEntry = {
  id: string;
  user_id: string;
  rating: number;
  content: string;
  created_at: string;
  is_visible: boolean;
  profile: { display_name: string; is_verified: boolean } | null;
  response: {
    id: string;
    content: string;
    created_at: string;
    author: { display_name: string } | null;
  } | null;
};

// @business-logic: Public read of a business ledger, newest-first, cursor-paginated.
// No auth required (RLS allows public SELECT, hidden rows already filtered out).
export const getBusinessLedger = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        business_id: z.string().uuid(),
        cursor: z.string().nullable().optional(),
      })
      .parse(input)
  )
  .handler(async ({ data }) => {
    const url = process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const supabase = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let q = supabase
      .from("reviews")
      .select("id, user_id, rating, content, created_at, is_visible")
      .eq("business_id", data.business_id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE_SIZE + 1);

    if (data.cursor) {
      const c = decodeCursor(data.cursor);
      if (c) {
        // (created_at, id) < (cursor.createdAt, cursor.id) lexicographically
        q = q.or(
          `created_at.lt.${c.createdAt},and(created_at.eq.${c.createdAt},id.lt.${c.id})`
        );
      }
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const hasMore = (rows ?? []).length > PAGE_SIZE;
    const page = (rows ?? []).slice(0, PAGE_SIZE);

    const userIds = Array.from(new Set(page.map((r) => r.user_id)));
    const reviewIds = page.map((r) => r.id);

    const [{ data: profiles }, { data: responses }] = await Promise.all([
      userIds.length
        ? supabase
            .from("profiles")
            .select("id, display_name, is_verified")
            .in("id", userIds)
        : Promise.resolve({ data: [] }),
      reviewIds.length
        ? supabase
            .from("owner_responses")
            .select("id, review_id, content, created_at, author_id")
            .in("review_id", reviewIds)
        : Promise.resolve({ data: [] }),
    ]);

    const profileMap = new Map(
      (profiles ?? []).map((p) => [p.id, p as { id: string; display_name: string; is_verified: boolean }])
    );
    const respMap = new Map(
      (responses ?? []).map((r) => [
        (r as { review_id: string }).review_id,
        r as { id: string; review_id: string; content: string; created_at: string; author_id: string },
      ])
    );

    const items: LedgerEntry[] = page.map((r) => {
      const resp = respMap.get(r.id);
      const profile = profileMap.get(r.user_id);
      return {
        id: r.id,
        user_id: r.user_id,
        rating: r.rating,
        content: r.content,
        created_at: r.created_at,
        is_visible: r.is_visible,
        profile: profile
          ? { display_name: profile.display_name, is_verified: profile.is_verified }
          : null,
        response: resp
          ? {
              id: resp.id,
              content: resp.content,
              created_at: resp.created_at,
              author: profileMap.get(resp.author_id)
                ? { display_name: profileMap.get(resp.author_id)!.display_name }
                : null,
            }
          : null,
      };
    });

    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.created_at, last.id) : null;

    return { items, nextCursor };
  });

// @business-logic: Admin-only visibility toggle. Content stays immutable; the
// trigger blocks any UPDATE that touches anything other than is_visible /
// moderation_reason, and the RLS policy gates this to admins.
export const setVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        target_table: z.enum(["reviews", "owner_responses"]),
        target_id: z.string().uuid(),
        is_visible: z.boolean(),
        reason: z.string().max(200).optional(),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Admin only.");
    const { error } = await supabase
      .from(data.target_table)
      .update({ is_visible: data.is_visible, moderation_reason: data.reason ?? null })
      .eq("id", data.target_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Admin moderation queue: hidden + flagged rows.
export const listModerationQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Admin only.");
    const [hiddenReviews, hiddenResponses, flags] = await Promise.all([
      supabase
        .from("reviews")
        .select("id, content, rating, business_id, created_at, moderation_reason")
        .eq("is_visible", false)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("owner_responses")
        .select("id, content, business_id, created_at, moderation_reason")
        .eq("is_visible", false)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("moderation_flags")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    return {
      hiddenReviews: hiddenReviews.data ?? [],
      hiddenResponses: hiddenResponses.data ?? [],
      flags: flags.data ?? [],
    };
  });