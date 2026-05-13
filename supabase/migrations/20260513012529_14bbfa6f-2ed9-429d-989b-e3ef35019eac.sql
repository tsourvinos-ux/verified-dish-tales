CREATE INDEX IF NOT EXISTS idx_user_roles_lookup ON public.user_roles(user_id, role);
CREATE INDEX IF NOT EXISTS idx_business_membership_lookup ON public.business_profile_membership(user_id, business_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON public.reviews(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_responses_author ON public.owner_responses(author_id);
CREATE INDEX IF NOT EXISTS idx_rewards_business ON public.verified_rewards(business_id, expiry_date DESC);