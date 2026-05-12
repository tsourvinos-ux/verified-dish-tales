
CREATE TYPE public.app_role AS ENUM ('admin', 'restaurateur', 'patron');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT 'Patron',
  is_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles readable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'patron');
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  cuisine TEXT NOT NULL,
  neighborhood TEXT NOT NULL,
  description TEXT,
  cover_url TEXT,
  established TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Businesses public read" ON public.businesses FOR SELECT USING (true);
CREATE POLICY "Admins manage businesses" ON public.businesses FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.business_profile_membership (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, user_id)
);
ALTER TABLE public.business_profile_membership ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membership public read" ON public.business_profile_membership FOR SELECT USING (true);
CREATE POLICY "Admins manage memberships" ON public.business_profile_membership FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.is_business_member(_user_id UUID, _business_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.business_profile_membership WHERE user_id = _user_id AND business_id = _business_id);
$$;

CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 10 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_reviews_business ON public.reviews(business_id, created_at DESC);
CREATE POLICY "Reviews public read" ON public.reviews FOR SELECT USING (true);
CREATE POLICY "Patrons insert own reviews" ON public.reviews FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.owner_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL UNIQUE REFERENCES public.reviews(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 10 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.owner_responses ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_responses_business ON public.owner_responses(business_id);
CREATE POLICY "Owner responses public read" ON public.owner_responses FOR SELECT USING (true);
CREATE POLICY "Restaurateur insert response" ON public.owner_responses FOR INSERT
  WITH CHECK (auth.uid() = author_id AND public.is_business_member(auth.uid(), business_id));

CREATE TABLE public.verified_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  code TEXT NOT NULL DEFAULT upper(substr(md5(random()::text), 1, 9)),
  expiry_date TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.verified_rewards ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_rewards_user ON public.verified_rewards(user_id);

CREATE OR REPLACE FUNCTION public.prevent_used_at_overwrite()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.used_at IS NOT NULL AND NEW.used_at IS DISTINCT FROM OLD.used_at THEN
    RAISE EXCEPTION 'Reward already redeemed; used_at is immutable';
  END IF;
  IF NEW.user_id <> OLD.user_id OR NEW.business_id <> OLD.business_id
     OR NEW.title <> OLD.title OR NEW.code <> OLD.code
     OR NEW.expiry_date <> OLD.expiry_date OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Reward fields are immutable except used_at';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_rewards_immutable BEFORE UPDATE ON public.verified_rewards
  FOR EACH ROW EXECUTE FUNCTION public.prevent_used_at_overwrite();

CREATE POLICY "Patrons read own rewards" ON public.verified_rewards FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Patrons redeem own rewards" ON public.verified_rewards FOR UPDATE
  USING (auth.uid() = user_id AND used_at IS NULL AND expiry_date > now())
  WITH CHECK (auth.uid() = user_id AND used_at IS NOT NULL);
CREATE POLICY "Admins manage rewards" ON public.verified_rewards FOR ALL
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.businesses (slug, name, cuisine, neighborhood, description, established) VALUES
  ('lavenue-brasserie', 'L''Avenue Brasserie', 'Modern French', 'West Village', 'A modern French brasserie focused on heritage produce and a quiet bar.', '2018'),
  ('omiya-sushi', 'Omiya Sushi', 'Japanese Omakase', 'Lower East Side', 'Eight-seat omakase counter sourcing daily from Toyosu and local fishers.', '2021'),
  ('hearth-and-ember', 'Hearth & Ember', 'Artisan Pizza', 'Brooklyn Heights', 'Wood-fired sourdough pizza with a tight natural-wine list.', '2020'),
  ('grain-and-mill', 'Grain & Mill', 'Bakery & Café', 'Park Slope', 'Single-origin grain bakery and all-day café with seasonal pastries.', '2019'),
  ('the-hearth-vine', 'The Hearth & Vine', 'Modern European', 'Tribeca', 'A wood-fired tasting room rooted in fermentation and root vegetables.', '2017');
