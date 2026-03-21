-- V7: allow writing game_scores by authenticated user

ALTER TABLE game_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own game scores" ON game_scores;
CREATE POLICY "Users can insert own game scores"
  ON game_scores FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
