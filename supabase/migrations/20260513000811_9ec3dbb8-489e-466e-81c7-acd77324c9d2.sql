
DROP POLICY IF EXISTS "Membership public read" ON public.business_profile_membership;

CREATE POLICY "Members read own membership"
ON public.business_profile_membership
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
