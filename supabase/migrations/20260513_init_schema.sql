-- Verified Dish Tales: Core Schema with RLS Policies
-- Migration: 20260513_init_schema.sql
-- Purpose: Establish immutable ledger tables, verified rewards system, and zero-trust RLS policies

-- ============================================================================
-- TABLE: profiles
-- Purpose: User identity and verification status
-- ============================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for email lookups
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- RLS: Profiles are public readable, users can only update their own
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are publicly readable" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update only their own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- ============================================================================
-- TABLE: businesses
-- Purpose: Restaurant metadata (immutable after creation)
-- ============================================================================
CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  cuisine VARCHAR(100),
  neighborhood VARCHAR(255),
  established INTEGER,
  cover_url VARCHAR(1024),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for slug lookups
CREATE INDEX IF NOT EXISTS idx_businesses_slug ON businesses(slug);

-- RLS: Businesses are publicly readable
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Businesses are publicly readable" ON businesses
  FOR SELECT USING (true);

CREATE POLICY "Only authenticated users can insert businesses" ON businesses
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ============================================================================
-- TABLE: business_profile_membership
-- Purpose: Link users to businesses they manage (zero-trust ownership join)
-- ============================================================================
CREATE TABLE IF NOT EXISTS business_profile_membership (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'owner', -- owner, manager, staff
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, business_id)
);

-- Create indexes for fast ownership lookups
CREATE INDEX IF NOT EXISTS idx_membership_user_business ON business_profile_membership(user_id, business_id);
CREATE INDEX IF NOT EXISTS idx_membership_business ON business_profile_membership(business_id);

-- RLS: Users can only see their own memberships
ALTER TABLE business_profile_membership ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own memberships" ON business_profile_membership
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Only authenticated users can insert memberships" ON business_profile_membership
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ============================================================================
-- TABLE: reviews (IMMUTABLE)
-- Purpose: Patron reviews - permanent, tamper-proof ledger entries
-- ============================================================================
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints: Enforce at storage layer
  CHECK (rating >= 1 AND rating <= 5),
  CHECK (char_length(content) >= 10 AND char_length(content) <= 1000)
);

-- Create indexes for queries
CREATE INDEX IF NOT EXISTS idx_reviews_business ON reviews(business_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_created ON reviews(created_at DESC);

-- RLS: Reviews are publicly readable; users can only insert their own
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviews are publicly readable" ON reviews
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert their own reviews" ON reviews
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND auth.role() = 'authenticated'
  );

-- NO UPDATE or DELETE policies: Reviews are immutable once written
-- Attempting to UPDATE or DELETE will result in a 42501 permission denied error

-- Trigger to automatically mint 5-star rewards
CREATE OR REPLACE FUNCTION mint_reward_on_5_star_review()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.rating = 5 THEN
    INSERT INTO verified_rewards (
      user_id,
      business_id,
      title,
      expiry_date
    ) VALUES (
      NEW.user_id,
      NEW.business_id,
      '10% off your next visit',
      CURRENT_TIMESTAMP + INTERVAL '14 days'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_mint_reward_on_5_star
AFTER INSERT ON reviews
FOR EACH ROW
EXECUTE FUNCTION mint_reward_on_5_star_review();

-- ============================================================================
-- TABLE: owner_responses (IMMUTABLE)
-- Purpose: One immutable response per review, restricted to verified restaurateurs
-- ============================================================================
CREATE TABLE IF NOT EXISTS owner_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints: One response per review
  UNIQUE(review_id),
  
  -- Constraints: Enforce length at storage layer
  CHECK (char_length(content) >= 10 AND char_length(content) <= 500)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_owner_responses_review ON owner_responses(review_id);
CREATE INDEX IF NOT EXISTS idx_owner_responses_business ON owner_responses(business_id);
CREATE INDEX IF NOT EXISTS idx_owner_responses_author ON owner_responses(author_id);

-- RLS: Responses are publicly readable; only business owners can insert
ALTER TABLE owner_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner responses are publicly readable" ON owner_responses
  FOR SELECT USING (true);

CREATE POLICY "Only business members can insert responses" ON owner_responses
  FOR INSERT WITH CHECK (
    auth.uid() = author_id AND
    EXISTS (
      SELECT 1 FROM business_profile_membership
      WHERE user_id = auth.uid()
      AND business_id = owner_responses.business_id
    )
  );

-- NO UPDATE or DELETE policies: Responses are immutable once written

-- ============================================================================
-- TABLE: verified_rewards (SINGLE-USE STATE MACHINE)
-- Purpose: Verified rewards with strict single-use lifecycle
-- ============================================================================
CREATE TABLE IF NOT EXISTS verified_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  code VARCHAR(50),
  expiry_date TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints: Title length
  CHECK (char_length(title) >= 3 AND char_length(title) <= 80),
  
  -- CRITICAL: Prevent double-tap redemption via immutable used_at
  -- Once used_at is set, it cannot be changed (enforced via RLS UPDATE policy)
  CHECK (used_at IS NULL OR used_at >= created_at)
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_rewards_user ON verified_rewards(user_id);
CREATE INDEX IF NOT EXISTS idx_rewards_business ON verified_rewards(business_id);
CREATE INDEX IF NOT EXISTS idx_rewards_used_at ON verified_rewards(used_at) WHERE used_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rewards_expiry ON verified_rewards(expiry_date);

-- RLS: Users can only see their own rewards; only update via Edge Function
ALTER TABLE verified_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own rewards" ON verified_rewards
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can only redeem their own active rewards" ON verified_rewards
  FOR UPDATE USING (
    auth.uid() = user_id AND
    used_at IS NULL AND
    CURRENT_TIMESTAMP < expiry_date
  )
  WITH CHECK (
    auth.uid() = user_id AND
    used_at IS NOT NULL
  );

-- NO INSERT or DELETE policies via RLS (controlled by server functions)

-- ============================================================================
-- HELPER FUNCTION: has_role
-- Purpose: Check if user has a specific role (used in business operations)
-- ============================================================================
CREATE OR REPLACE FUNCTION has_role(
  _user_id UUID,
  _role VARCHAR
)
RETURNS BOOLEAN AS $$
DECLARE
  role_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO role_count
  FROM business_profile_membership
  WHERE user_id = _user_id AND role = _role;
  
  RETURN role_count > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANTS: Ensure proper permissions
-- ============================================================================
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT ON profiles TO authenticated;
GRANT SELECT ON businesses TO authenticated;
GRANT SELECT ON business_profile_membership TO authenticated;
GRANT SELECT, INSERT ON reviews TO authenticated;
GRANT SELECT, INSERT ON owner_responses TO authenticated;
GRANT SELECT, UPDATE ON verified_rewards TO authenticated;
