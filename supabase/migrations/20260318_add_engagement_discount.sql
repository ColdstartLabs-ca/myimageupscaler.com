-- Migration: Add engagement discount columns to profiles table
-- PRD: Engagement-Based First-Purchase Discount (Issue #41)
--
-- Adds two columns to track when a user was offered the engagement-based
-- discount and when it expires. This ensures each user can only be offered
-- the discount once.

-- Add engagement_discount_offered_at column
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS engagement_discount_offered_at TIMESTAMPTZ DEFAULT NULL;

-- Add engagement_discount_expires_at column
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS engagement_discount_expires_at TIMESTAMPTZ DEFAULT NULL;

-- Add comment describing the feature
COMMENT ON COLUMN profiles.engagement_discount_offered_at IS
  'When the engagement-based first-purchase discount was offered to this user (null if never offered). One-time per user.';

COMMENT ON COLUMN profiles.engagement_discount_expires_at IS
  'When the engagement discount expires (30 minutes after offered_at). null if never offered or already redeemed.';

-- Create an index for quick lookup of users who have been offered the discount
-- Note: We index on offered_at IS NOT NULL only (no NOW() - non-immutable functions
-- are not allowed in partial index predicates in PostgreSQL).
-- The expires_at check happens at query time in the application layer.
CREATE INDEX IF NOT EXISTS idx_profiles_engagement_discount_offered
ON profiles (id)
WHERE engagement_discount_offered_at IS NOT NULL;

-- Grant access to authenticated users (they can read their own profile via RLS)
GRANT SELECT (engagement_discount_offered_at, engagement_discount_expires_at)
ON profiles TO authenticated;

-- Service role already has full access via existing grants
