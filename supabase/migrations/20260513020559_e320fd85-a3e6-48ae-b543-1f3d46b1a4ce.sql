-- 1. Visibility + moderation reason
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS is_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS moderation_reason text;

ALTER TABLE public.owner_responses
  ADD COLUMN IF NOT EXISTS is_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS moderation_reason text;

-- 2. Replace public-read policies to hide non-visible rows from non-admins
DROP POLICY IF EXISTS "Reviews public read" ON public.reviews;
CREATE POLICY "Reviews public read"
  ON public.reviews FOR SELECT
  USING (is_visible OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Owner responses public read" ON public.owner_responses;
CREATE POLICY "Owner responses public read"
  ON public.owner_responses FOR SELECT
  USING (is_visible OR public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Admin-only UPDATE of is_visible / moderation_reason. Content stays immutable.
CREATE POLICY "Admins can toggle review visibility"
  ON public.reviews FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can toggle response visibility"
  ON public.owner_responses FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 4. Trigger: prevent UPDATE from touching anything other than is_visible / moderation_reason
CREATE OR REPLACE FUNCTION public.prevent_review_content_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.id <> OLD.id
    OR NEW.user_id <> OLD.user_id
    OR NEW.business_id <> OLD.business_id
    OR NEW.rating <> OLD.rating
    OR NEW.content <> OLD.content
    OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Review fields are immutable except is_visible and moderation_reason';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reviews_content_immutable ON public.reviews;
CREATE TRIGGER trg_reviews_content_immutable
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.prevent_review_content_mutation();

CREATE OR REPLACE FUNCTION public.prevent_response_content_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.id <> OLD.id
    OR NEW.review_id <> OLD.review_id
    OR NEW.business_id <> OLD.business_id
    OR NEW.author_id <> OLD.author_id
    OR NEW.content <> OLD.content
    OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Owner response fields are immutable except is_visible and moderation_reason';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_responses_content_immutable ON public.owner_responses;
CREATE TRIGGER trg_responses_content_immutable
  BEFORE UPDATE ON public.owner_responses
  FOR EACH ROW EXECUTE FUNCTION public.prevent_response_content_mutation();

-- 5. Moderation flags (audit log of auto/manual flags)
CREATE TABLE IF NOT EXISTS public.moderation_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_table text NOT NULL CHECK (target_table IN ('reviews', 'owner_responses')),
  target_id uuid NOT NULL,
  reason text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'high')),
  auto boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.moderation_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage moderation flags"
  ON public.moderation_flags FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_reviews_business_created
  ON public.reviews (business_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_rewards_user_active
  ON public.verified_rewards (user_id) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_moderation_flags_target
  ON public.moderation_flags (target_table, target_id);