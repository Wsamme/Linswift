-- V5: Leaderboard profile visibility for authenticated users
-- Purpose: allow leaderboard to show username/avatar for other users.

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Keep existing personal policy, and add a read policy for authenticated users.
DROP POLICY IF EXISTS "Authenticated users can view basic profiles" ON profiles;
CREATE POLICY "Authenticated users can view basic profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);
