import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  reviewSchema,
  ownerResponseSchema,
  redeemRewardSchema,
  mintRewardSchema,
} from "./schemas";

// @business-logic: Submits a patron review. Immutable once written (no UPDATE/DELETE policies).
export const submitReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reviewSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error, data: row } = await supabase
      .from("reviews")
      .insert({
        business_id: data.business_id,
        rating: data.rating,
        content: data.content,
        user_id: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // @business-logic: 5-star reviews mint a single-use 14-day Verified Reward.
    if (data.rating === 5) {
      const expiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      await supabase.from("verified_rewards").insert({
        user_id: userId,
        business_id: data.business_id,
        title: "10% off your next visit",
        expiry_date: expiry,
      });
    }
    return { id: row.id };
  });

// @business-logic: One immutable response per review, restricted to verified members.
export const submitOwnerResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ownerResponseSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("owner_responses").insert({
      review_id: data.review_id,
      business_id: data.business_id,
      content: data.content,
      author_id: userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// @business-logic: Atomic single-use redemption. RLS only permits used_at to flip from null.
export const redeemReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => redeemRewardSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const now = new Date().toISOString();
    const { data: rows, error } = await supabase
      .from("verified_rewards")
      .update({ used_at: now })
      .eq("id", data.reward_id)
      .eq("user_id", userId)
      .is("used_at", null)
      .gt("expiry_date", now)
      .select("id, code, used_at");
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) {
      throw new Error("Reward already redeemed, expired, or not yours.");
    }
    return rows[0];
  });

// @business-logic: Admin-only reward minting (provisions a patron a reward by email).
export const mintReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => mintRewardSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Admin only.");

    // Look up target user by email via admin API would need service role; we use profiles.display_name fallback.
    // For demo we accept user_email and resolve via profiles seeded display_name. In production this would
    // call an admin edge function. Here we expect admin to pass an existing user UUID via a query—simplified:
    throw new Error("Use the admin panel reward composer (UUID-based) to mint rewards.");
  });

// @business-logic: Admin-only reward minting by patron user id.
export const mintRewardForUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const { z } = require("zod") as typeof import("zod");
    return z
      .object({
        user_id: z.string().uuid(),
        business_id: z.string().uuid(),
        title: z.string().min(3).max(80),
        expiry_days: z.number().int().min(1).max(365),
      })
      .parse(input);
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Admin only.");
    const expiry = new Date(Date.now() + data.expiry_days * 86400000).toISOString();
    const { error } = await supabase.from("verified_rewards").insert({
      user_id: data.user_id,
      business_id: data.business_id,
      title: data.title,
      expiry_date: expiry,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });