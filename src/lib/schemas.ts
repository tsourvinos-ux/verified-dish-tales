import { z } from "zod";

// Strip script tags / control chars to prevent XSS at storage layer
const sanitize = (s: string): string =>
  s
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/?[a-z][\s\S]*?>/gi, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim();

export const reviewSchema = z.object({
  business_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  content: z.string().transform(sanitize).pipe(z.string().min(10).max(1000)),
});
export type ReviewInput = z.infer<typeof reviewSchema>;

export const ownerResponseSchema = z.object({
  review_id: z.string().uuid(),
  business_id: z.string().uuid(),
  content: z.string().transform(sanitize).pipe(z.string().min(10).max(500)),
});
export type OwnerResponseInput = z.infer<typeof ownerResponseSchema>;

export const redeemRewardSchema = z.object({
  reward_id: z.string().uuid(),
});

export const mintRewardSchema = z.object({
  user_email: z.string().email(),
  business_id: z.string().uuid(),
  title: z.string().min(3).max(80),
  expiry_days: z.number().int().min(1).max(365),
});

// UI-only schemas (form-side, no transform so we can show live char count)
export const reviewFormSchema = z.object({
  rating: z.number().int().min(1).max(5),
  content: z.string().min(10, "At least 10 characters").max(1000, "Max 1000 characters"),
});
export const responseFormSchema = z.object({
  content: z.string().min(10, "At least 10 characters").max(500, "Max 500 characters"),
});